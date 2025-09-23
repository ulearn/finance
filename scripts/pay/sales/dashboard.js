const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const router = express.Router();

// Shared MySQL connection config
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
};

// Central data fetching and calculation function
async function getMonthlyData() {
    let connection;
    try {
        console.log('Attempting to connect to MySQL...');
        connection = await mysql.createConnection(dbConfig);
        console.log('MySQL connected successfully');
        
        // Get all sales data grouped by month and channel
        const query = `
            SELECT 
                DATE_FORMAT(payment_date, '%Y') as year,
                DATE_FORMAT(payment_date, '%m') as month,
                DATE_FORMAT(payment_date, '%Y-%m') as month_year,
                channel,
                SUM(amount) as total_amount,
                SUM(course_fee) as total_course_fees,
                COUNT(*) as record_count
            FROM sales_data
            WHERE payment_date >= DATE_SUB(NOW(), INTERVAL 2 YEAR)
            GROUP BY year, month, channel
            ORDER BY year, month, channel
        `;
        
        const [rows] = await connection.execute(query);
        console.log(`Query returned ${rows.length} rows`);
        
        // Process data into structured format
        const processedData = processDataForDashboards(rows);
        
        return {
            success: true,
            data: processedData
        };
        
    } catch (error) {
        console.error('Database query error:', error);
        throw error; // Let it fail - no mock data
    } finally {
        if (connection) await connection.end();
    }
}

function processDataForDashboards(rows) {
    // Initialize data structure
    const dataByYear = {};
    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;
    
    // Initialize years
    [lastYear, currentYear].forEach(year => {
        dataByYear[year] = {
            year: year,
            months: {}
        };
        
        // Initialize all months
        for (let m = 1; m <= 12; m++) {
            const monthKey = String(m).padStart(2, '0');
            dataByYear[year].months[monthKey] = {
                b2c: { amount: 0, course_fees: 0, count: 0 },
                b2b: { amount: 0, course_fees: 0, count: 0 },
                total: { amount: 0, course_fees: 0, count: 0 }
            };
        }
    });
    
    // Populate with actual data
    rows.forEach(row => {
        const year = parseInt(row.year);
        const month = row.month;
        
        if (dataByYear[year] && dataByYear[year].months[month]) {
            // Handle null or undefined channel
            const channel = row.channel ? row.channel.toLowerCase() : '';
            if (channel === 'b2c' || channel === 'b2b') {
                dataByYear[year].months[month][channel] = {
                    amount: parseFloat(row.total_amount) || 0,
                    course_fees: parseFloat(row.total_course_fees) || 0,
                    count: parseInt(row.record_count) || 0
                };
                
                // Update totals
                dataByYear[year].months[month].total.amount += parseFloat(row.total_amount) || 0;
                dataByYear[year].months[month].total.course_fees += parseFloat(row.total_course_fees) || 0;
                dataByYear[year].months[month].total.count += parseInt(row.record_count) || 0;
            }
        }
    });
    
    // Calculate YoY growth and commissions
    const result = calculateMetrics(dataByYear, lastYear, currentYear);
    
    return result;
}

function calculateMetrics(dataByYear, lastYear, currentYear) {
    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    
    const result = {
        lastYear: { year: lastYear, months: {} },
        currentYear: { year: currentYear, months: {} },
        yoyGrowth: { months: {} },
        yoyPercent: { months: {} },
        commissions: {
            b2c: { months: {}, total: 0 },
            b2b: { months: {}, total: 0 }
        }
    };
    
    months.forEach((month, idx) => {
        const lastYearData = dataByYear[lastYear].months[month];
        const currentYearData = dataByYear[currentYear].months[month];
        
        // Store monthly data
        result.lastYear.months[monthNames[idx]] = {
            b2c: lastYearData.b2c.amount,
            b2b: lastYearData.b2b.amount,
            total: lastYearData.total.amount,
            b2c_course: lastYearData.b2c.course_fees,
            b2b_course: lastYearData.b2b.course_fees
        };
        
        result.currentYear.months[monthNames[idx]] = {
            b2c: currentYearData.b2c.amount,
            b2b: currentYearData.b2b.amount,
            total: currentYearData.total.amount,
            b2c_course: currentYearData.b2c.course_fees,
            b2b_course: currentYearData.b2b.course_fees
        };
        
        // Calculate YoY growth (absolute)
        result.yoyGrowth.months[monthNames[idx]] = {
            b2c: currentYearData.b2c.amount - lastYearData.b2c.amount,
            b2b: currentYearData.b2b.amount - lastYearData.b2b.amount,
            total: currentYearData.total.amount - lastYearData.total.amount,
            b2b_course: currentYearData.b2b.course_fees - lastYearData.b2b.course_fees
        };
        
        // Calculate YoY growth (percentage)
        result.yoyPercent.months[monthNames[idx]] = {
            b2c: lastYearData.b2c.amount > 0 ? 
                ((currentYearData.b2c.amount - lastYearData.b2c.amount) / lastYearData.b2c.amount * 100) : 0,
            b2b: lastYearData.b2b.amount > 0 ? 
                ((currentYearData.b2b.amount - lastYearData.b2b.amount) / lastYearData.b2b.amount * 100) : 0,
            total: lastYearData.total.amount > 0 ? 
                ((currentYearData.total.amount - lastYearData.total.amount) / lastYearData.total.amount * 100) : 0
        };
        
        // Calculate commissions
        // Diego (B2C): 1% of total B2C revenue
        result.commissions.b2c.months[monthNames[idx]] = currentYearData.b2c.amount * 0.01;
        result.commissions.b2c.total += result.commissions.b2c.months[monthNames[idx]];
        
        // Cenker (B2B): 10% of YoY course fee growth (only if positive)
        const b2bCourseGrowth = currentYearData.b2b.course_fees - lastYearData.b2b.course_fees;
        result.commissions.b2b.months[monthNames[idx]] = b2bCourseGrowth > 0 ? b2bCourseGrowth * 0.10 : 0;
        result.commissions.b2b.total += result.commissions.b2b.months[monthNames[idx]];
    });
    
    // Calculate totals for the year
    result.lastYear.total = Object.values(result.lastYear.months).reduce((sum, m) => ({
        b2c: sum.b2c + m.b2c,
        b2b: sum.b2b + m.b2b,
        total: sum.total + m.total
    }), { b2c: 0, b2b: 0, total: 0 });
    
    result.currentYear.total = Object.values(result.currentYear.months).reduce((sum, m) => ({
        b2c: sum.b2c + m.b2c,
        b2b: sum.b2b + m.b2b,
        total: sum.total + m.total
    }), { b2c: 0, b2b: 0, total: 0 });
    
    result.yoyGrowth.total = {
        b2c: result.currentYear.total.b2c - result.lastYear.total.b2c,
        b2b: result.currentYear.total.b2b - result.lastYear.total.b2b,
        total: result.currentYear.total.total - result.lastYear.total.total
    };
    
    result.yoyPercent.total = {
        b2c: result.lastYear.total.b2c > 0 ? 
            ((result.currentYear.total.b2c - result.lastYear.total.b2c) / result.lastYear.total.b2c * 100) : 0,
        b2b: result.lastYear.total.b2b > 0 ? 
            ((result.currentYear.total.b2b - result.lastYear.total.b2b) / result.lastYear.total.b2b * 100) : 0,
        total: result.lastYear.total.total > 0 ? 
            ((result.currentYear.total.total - result.lastYear.total.total) / result.lastYear.total.total * 100) : 0
    };
    
    return result;
}

// Management Dashboard endpoint
router.get('/', async (req, res) => {
    try {
        const result = await getMonthlyData();
        res.json(result);
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// B2C Dashboard endpoint (Diego)
router.get('/b2c', async (req, res) => {
    try {
        const result = await getMonthlyData();
        const currentMonth = new Date().getMonth(); // 0-11
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        
        // Extract B2C specific data
        const b2cData = {
            success: result.success,
            employee: {
                name: 'Diego',
                baseSalary: 2500,
                commissionRate: '1%'
            },
            lastMonthCommission: result.data.commissions.b2c.months[monthNames[lastMonth]] || 0,
            currentMonthGrossPay: 2500 + (result.data.commissions.b2c.months[monthNames[lastMonth]] || 0),
            monthlyData: result.data.currentYear.months,
            commissions: result.data.commissions.b2c,
            yearTotal: result.data.currentYear.total.b2c,
            yoyGrowth: result.data.yoyGrowth.total.b2c,
            yoyPercent: result.data.yoyPercent.total.b2c
        };
        
        res.json(b2cData);
    } catch (error) {
        console.error('B2C Dashboard error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// B2B Dashboard endpoint (Cenker)
router.get('/b2b', async (req, res) => {
    try {
        const result = await getMonthlyData();
        const currentMonth = new Date().getMonth(); // 0-11
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        
        // Extract B2B specific data
        const b2bData = {
            success: result.success,
            employee: {
                name: 'Cenker',
                baseSalary: 3550,
                commissionRate: '10% of YoY course fee growth'
            },
            lastMonthCommission: result.data.commissions.b2b.months[monthNames[lastMonth]] || 0,
            currentMonthGrossPay: 3550 + (result.data.commissions.b2b.months[monthNames[lastMonth]] || 0),
            monthlyData: result.data.currentYear.months,
            commissions: result.data.commissions.b2b,
            yearTotal: result.data.currentYear.total.b2b,
            yoyGrowth: result.data.yoyGrowth.total.b2b,
            yoyPercent: result.data.yoyPercent.total.b2b
        };
        
        res.json(b2bData);
    } catch (error) {
        console.error('B2B Dashboard error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Export the centralized data function for use by other modules if needed
router.getMonthlyData = getMonthlyData;

// Test endpoint to verify database connection
router.get('/test', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT COUNT(*) as count FROM sales_data');
        res.json({
            success: true,
            message: 'Database connected',
            recordCount: rows[0].count,
            config: {
                host: dbConfig.host,
                database: dbConfig.database,
                user: dbConfig.user,
                port: dbConfig.port
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            config: {
                host: dbConfig.host || 'NOT SET',
                database: dbConfig.database || 'NOT SET',
                user: dbConfig.user || 'NOT SET',
                port: dbConfig.port || 'NOT SET'
            }
        });
    } finally {
        if (connection) await connection.end();
    }
});

module.exports = router;