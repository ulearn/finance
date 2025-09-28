// dashboard.js v12 - Updated to use date_tmp field in proper date format
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const router = express.Router();

// Shared MySQL connection config
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
};

// Base salaries
const BASE_SALARIES = {
    b2c: 2550,  // Diego
    b2b: 3550   // Cenker
};

// December 2024 commission for B2C (carried into January 2025)
const DECEMBER_2024_B2C_COMMISSION = 179.73;  // €17,973.02 @ 1%

// Central data fetching and calculation function
async function getMonthlyData() {
    let connection;
    try {
        console.log('Attempting to connect to MySQL...');
        connection = await mysql.createConnection(dbConfig);
        console.log('MySQL connected successfully');
        
        // Using date_tmp field which is already in proper date format
        console.log('Using date_tmp field in proper date format');
        
        // Get the latest date in the database to determine YTD cutoff
        const maxDateQuery = `
            SELECT MAX(date_tmp) as max_date
            FROM sales_data
            WHERE date_tmp IS NOT NULL
        `;
        
        const [maxDateResult] = await connection.execute(maxDateQuery);
        
        const latestDate = maxDateResult[0].max_date;
        const currentMonth = latestDate ? latestDate.getMonth() + 1 : new Date().getMonth() + 1;
        const currentDay = latestDate ? latestDate.getDate() : new Date().getDate();
        
        console.log(`Latest data through: ${latestDate}, YTD through month ${currentMonth}`);
        
        // Main query for all monthly revenue data - EXCLUDING TransferMate Escrow
        const revenueQuery = `
            SELECT
                YEAR(date_tmp) as year,
                MONTH(date_tmp) as month,
                DATE_FORMAT(date_tmp, '%Y-%m') as month_year,
                CASE
                    WHEN agent IS NOT NULL AND agent != '' THEN 'B2B'
                    ELSE 'B2C'
                END as channel,
                SUM(
                    CAST(
                        REPLACE(SUBSTRING(amount, 2), ',', '')
                        AS DECIMAL(10,2)
                    )
                ) as total_amount,
                SUM(
                    CASE
                        WHEN course IS NOT NULL AND course != '' THEN
                            CAST(
                                REPLACE(SUBSTRING(course, 2), ',', '')
                                AS DECIMAL(10,2)
                            )
                        ELSE 0
                    END
                ) as total_course_fees,
                COUNT(*) as record_count
            FROM sales_data
            WHERE date_tmp IS NOT NULL
            AND amount IS NOT NULL
            AND amount != ''
            AND (visa_status != 'Pending' OR visa_status IS NULL)
            GROUP BY year, month, channel
            ORDER BY year, month, channel
        `;
        
        // Query for refunds in 2025
        const refundsQuery = `
            SELECT
                MONTH(refund_date) as month,
                CASE
                    WHEN agent IS NOT NULL AND agent != '' THEN 'B2B'
                    ELSE 'B2C'
                END as channel,
                SUM(CAST(REPLACE(SUBSTRING(amount, 2), ',', '') AS DECIMAL(10,2))) as refunded_amount,
                SUM(
                    CASE
                        WHEN course IS NOT NULL AND course != '' THEN
                            CAST(REPLACE(SUBSTRING(course, 2), ',', '') AS DECIMAL(10,2))
                        ELSE 0
                    END
                ) as refunded_course_fees,
                COUNT(*) as refund_count
            FROM sales_data
            WHERE refunded = 'Yes'
            AND refund_date IS NOT NULL
            AND refund_date > '0000-00-00'
            AND YEAR(refund_date) = 2025
            AND (visa_status != 'Pending' OR visa_status IS NULL)
            GROUP BY month, channel
            HAVING month IS NOT NULL
            ORDER BY month, channel
        `;
        
        const [revenueRows] = await connection.execute(revenueQuery);
        const [refundRows] = await connection.execute(refundsQuery);
        
        console.log(`Revenue query returned ${revenueRows.length} rows`);
        console.log(`Refunds query returned ${refundRows.length} rows`);
        console.log('Refunds by month:', refundRows.map(r => `Month ${r.month}: ${r.channel} = €${r.refunded_amount}`));
        
        // Process data with refunds
        const processedData = processDataForDashboards(revenueRows, refundRows, currentMonth, currentDay);
        
        return {
            success: true,
            data: processedData,
            metadata: {
                lastDataDate: latestDate,
                ytdMonth: currentMonth,
                ytdDay: currentDay
            }
        };
        
    } catch (error) {
        console.error('Database query error:', error);
        return {
            success: false,
            error: error.message,
            data: getEmptyDataStructure()
        };
    } finally {
        if (connection) await connection.end();
    }
}

function processDataForDashboards(revenueRows, refundRows, ytdMonth, ytdDay) {
    // Initialize data structure
    const dataByYear = {};
    
    // Initialize years
    [2024, 2025].forEach(year => {
        dataByYear[year] = {
            year: year,
            months: {},
            refunds: {},  // Monthly refunds for 2025
            quarters: {
                Q1: { b2c: { amount: 0, course_fees: 0 }, b2b: { amount: 0, course_fees: 0 }, total: { amount: 0, course_fees: 0 } },
                Q2: { b2c: { amount: 0, course_fees: 0 }, b2b: { amount: 0, course_fees: 0 }, total: { amount: 0, course_fees: 0 } },
                Q3: { b2c: { amount: 0, course_fees: 0 }, b2b: { amount: 0, course_fees: 0 }, total: { amount: 0, course_fees: 0 } },
                Q4: { b2c: { amount: 0, course_fees: 0 }, b2b: { amount: 0, course_fees: 0 }, total: { amount: 0, course_fees: 0 } }
            },
            ytd: {
                b2c: { amount: 0, course_fees: 0, count: 0 },
                b2b: { amount: 0, course_fees: 0, count: 0 },
                total: { amount: 0, course_fees: 0, count: 0 }
            },
            ytdRefunds: {  // YTD refunds for 2025
                b2c: { amount: 0, course_fees: 0, count: 0 },
                b2b: { amount: 0, course_fees: 0, count: 0 },
                total: { amount: 0, course_fees: 0, count: 0 }
            }
        };
        
        // Initialize all months
        for (let m = 1; m <= 12; m++) {
            const monthKey = String(m).padStart(2, '0');
            dataByYear[year].months[monthKey] = {
                b2c: { amount: 0, course_fees: 0, count: 0 },
                b2b: { amount: 0, course_fees: 0, count: 0 },
                total: { amount: 0, course_fees: 0, count: 0 }
            };
            dataByYear[year].refunds[monthKey] = {
                b2c: { amount: 0, course_fees: 0, count: 0 },
                b2b: { amount: 0, course_fees: 0, count: 0 },
                total: { amount: 0, course_fees: 0, count: 0 }
            };
        }
    });
    
    // Populate with revenue data
    revenueRows.forEach(row => {
        const year = parseInt(row.year);
        const month = String(row.month).padStart(2, '0');
        const monthNum = parseInt(row.month);
        const quarter = `Q${Math.ceil(monthNum / 3)}`;
        
        if (dataByYear[year] && dataByYear[year].months[month]) {
            const channel = row.channel.toLowerCase();
            const amount = parseFloat(row.total_amount) || 0;
            const courseFees = parseFloat(row.total_course_fees) || 0;
            const count = parseInt(row.record_count) || 0;
            
            // Store monthly data
            dataByYear[year].months[month][channel] = {
                amount: amount,
                course_fees: courseFees,
                count: count
            };
            
            // Update monthly totals
            dataByYear[year].months[month].total.amount += amount;
            dataByYear[year].months[month].total.course_fees += courseFees;
            dataByYear[year].months[month].total.count += count;
            
            // Add to quarterly totals
            dataByYear[year].quarters[quarter][channel].amount += amount;
            dataByYear[year].quarters[quarter][channel].course_fees += courseFees;
            dataByYear[year].quarters[quarter].total.amount += amount;
            dataByYear[year].quarters[quarter].total.course_fees += courseFees;
            
            // Add to YTD if within YTD period
            if (monthNum <= ytdMonth) {
                dataByYear[year].ytd[channel].amount += amount;
                dataByYear[year].ytd[channel].course_fees += courseFees;
                dataByYear[year].ytd[channel].count += count;
                
                dataByYear[year].ytd.total.amount += amount;
                dataByYear[year].ytd.total.course_fees += courseFees;
                dataByYear[year].ytd.total.count += count;
            }
        }
    });
    
    // Populate refunds data for 2025
    refundRows.forEach(row => {
        const month = String(row.month).padStart(2, '0');
        const monthNum = parseInt(row.month);
        const channel = row.channel.toLowerCase();
        const amount = parseFloat(row.refunded_amount) || 0;
        const courseFees = parseFloat(row.refunded_course_fees) || 0;
        const count = parseInt(row.refund_count) || 0;
        
        // Store monthly refunds
        dataByYear[2025].refunds[month][channel] = {
            amount: amount,
            course_fees: courseFees,
            count: count
        };
        
        // Update monthly refund totals
        dataByYear[2025].refunds[month].total.amount += amount;
        dataByYear[2025].refunds[month].total.course_fees += courseFees;
        dataByYear[2025].refunds[month].total.count += count;
        
        // Add to YTD refunds if within YTD period
        if (monthNum <= ytdMonth) {
            dataByYear[2025].ytdRefunds[channel].amount += amount;
            dataByYear[2025].ytdRefunds[channel].course_fees += courseFees;
            dataByYear[2025].ytdRefunds[channel].count += count;
            
            dataByYear[2025].ytdRefunds.total.amount += amount;
            dataByYear[2025].ytdRefunds.total.course_fees += courseFees;
            dataByYear[2025].ytdRefunds.total.count += count;
        }
    });
    
    // Calculate metrics with refunds considered
    const result = calculateMetrics(dataByYear, 2024, 2025, ytdMonth);
    
    return result;
}

function calculateMetrics(dataByYear, lastYear, currentYear, ytdMonth) {
    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    
    const result = {
        lastYear: { 
            year: lastYear, 
            months: {},
            quarters: dataByYear[lastYear].quarters,
            ytd: dataByYear[lastYear].ytd,
            total: { b2c: 0, b2b: 0, total: 0, b2c_course: 0, b2b_course: 0 }
        },
        currentYear: { 
            year: currentYear, 
            months: {},
            refunds: {},  // Monthly refunds
            quarters: dataByYear[currentYear].quarters,
            ytd: dataByYear[currentYear].ytd,
            ytdRefunds: dataByYear[currentYear].ytdRefunds,  // YTD refunds
            ytdNet: {  // Net YTD (YTD - Refunds)
                b2c: { 
                    amount: dataByYear[currentYear].ytd.b2c.amount - dataByYear[currentYear].ytdRefunds.b2c.amount,
                    course_fees: dataByYear[currentYear].ytd.b2c.course_fees - dataByYear[currentYear].ytdRefunds.b2c.course_fees
                },
                b2b: { 
                    amount: dataByYear[currentYear].ytd.b2b.amount - dataByYear[currentYear].ytdRefunds.b2b.amount,
                    course_fees: dataByYear[currentYear].ytd.b2b.course_fees - dataByYear[currentYear].ytdRefunds.b2b.course_fees
                },
                total: { 
                    amount: dataByYear[currentYear].ytd.total.amount - dataByYear[currentYear].ytdRefunds.total.amount,
                    course_fees: dataByYear[currentYear].ytd.total.course_fees - dataByYear[currentYear].ytdRefunds.total.course_fees
                }
            },
            total: { b2c: 0, b2b: 0, total: 0, b2c_course: 0, b2b_course: 0 }
        },
        yoyGrowth: { 
            months: {},
            quarters: {
                Q1: { b2c: 0, b2b: 0, total: 0 },
                Q2: { b2c: 0, b2b: 0, total: 0 },
                Q3: { b2c: 0, b2b: 0, total: 0 },
                Q4: { b2c: 0, b2b: 0, total: 0 }
            },
            ytd: {
                b2c: dataByYear[currentYear].ytd.b2c.amount - dataByYear[lastYear].ytd.b2c.amount,
                b2b: dataByYear[currentYear].ytd.b2b.amount - dataByYear[lastYear].ytd.b2b.amount,
                total: dataByYear[currentYear].ytd.total.amount - dataByYear[lastYear].ytd.total.amount,
                b2b_course: dataByYear[currentYear].ytd.b2b.course_fees - dataByYear[lastYear].ytd.b2b.course_fees
            },
            ytdNet: {  // YoY based on net amounts
                b2c: (dataByYear[currentYear].ytd.b2c.amount - dataByYear[currentYear].ytdRefunds.b2c.amount) - dataByYear[lastYear].ytd.b2c.amount,
                b2b: (dataByYear[currentYear].ytd.b2b.amount - dataByYear[currentYear].ytdRefunds.b2b.amount) - dataByYear[lastYear].ytd.b2b.amount,
                total: (dataByYear[currentYear].ytd.total.amount - dataByYear[currentYear].ytdRefunds.total.amount) - dataByYear[lastYear].ytd.total.amount,
                b2b_course: (dataByYear[currentYear].ytd.b2b.course_fees - dataByYear[currentYear].ytdRefunds.b2b.course_fees) - dataByYear[lastYear].ytd.b2b.course_fees
            },
            total: { b2c: 0, b2b: 0, total: 0 }
        },
        yoyPercent: { 
            months: {},
            ytd: {
                b2c: dataByYear[lastYear].ytd.b2c.amount > 0 ? 
                    ((dataByYear[currentYear].ytd.b2c.amount - dataByYear[lastYear].ytd.b2c.amount) / dataByYear[lastYear].ytd.b2c.amount * 100) : 0,
                b2b: dataByYear[lastYear].ytd.b2b.amount > 0 ? 
                    ((dataByYear[currentYear].ytd.b2b.amount - dataByYear[lastYear].ytd.b2b.amount) / dataByYear[lastYear].ytd.b2b.amount * 100) : 0,
                total: dataByYear[lastYear].ytd.total.amount > 0 ? 
                    ((dataByYear[currentYear].ytd.total.amount - dataByYear[lastYear].ytd.total.amount) / dataByYear[lastYear].ytd.total.amount * 100) : 0
            },
            ytdNet: {  // YoY % based on net amounts
                b2c: dataByYear[lastYear].ytd.b2c.amount > 0 ? 
                    (((dataByYear[currentYear].ytd.b2c.amount - dataByYear[currentYear].ytdRefunds.b2c.amount) - dataByYear[lastYear].ytd.b2c.amount) / dataByYear[lastYear].ytd.b2c.amount * 100) : 0,
                b2b: dataByYear[lastYear].ytd.b2b.amount > 0 ? 
                    (((dataByYear[currentYear].ytd.b2b.amount - dataByYear[currentYear].ytdRefunds.b2b.amount) - dataByYear[lastYear].ytd.b2b.amount) / dataByYear[lastYear].ytd.b2b.amount * 100) : 0,
                total: dataByYear[lastYear].ytd.total.amount > 0 ? 
                    (((dataByYear[currentYear].ytd.total.amount - dataByYear[currentYear].ytdRefunds.total.amount) - dataByYear[lastYear].ytd.total.amount) / dataByYear[lastYear].ytd.total.amount * 100) : 0
            },
            total: { b2c: 0, b2b: 0, total: 0 }
        },
        commissions: {
            b2c: { 
                months: {}, 
                monthsNet: {},  // Net commissions after refunds
                quarters: { Q1: 0, Q2: 0, Q3: 0, Q4: 0 },
                ytd: 0,
                ytdNet: 0,  // Net YTD commission
                total: 0,
                december2024: DECEMBER_2024_B2C_COMMISSION
            },
            b2b: { 
                months: {}, 
                monthsNet: {},  // Net commissions after refunds
                quarters: { Q1: 0, Q2: 0, Q3: 0, Q4: 0 },
                ytd: 0,
                ytdNet: 0,  // Net YTD commission
                total: 0 
            }
        },
        baseSalary: {
            b2c: {
                monthly: BASE_SALARIES.b2c,
                quarterly: BASE_SALARIES.b2c * 3,
                ytd: BASE_SALARIES.b2c * ytdMonth,
                annual: BASE_SALARIES.b2c * 12
            },
            b2b: {
                monthly: BASE_SALARIES.b2b,
                quarterly: BASE_SALARIES.b2b * 3,
                ytd: BASE_SALARIES.b2b * ytdMonth,
                annual: BASE_SALARIES.b2b * 12
            }
        },
        ytdMonthCount: ytdMonth
    };
    
    // Calculate quarterly differences for YoY growth
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => {
        result.yoyGrowth.quarters[q].b2c = dataByYear[currentYear].quarters[q].b2c.amount - dataByYear[lastYear].quarters[q].b2c.amount;
        result.yoyGrowth.quarters[q].b2b = dataByYear[currentYear].quarters[q].b2b.amount - dataByYear[lastYear].quarters[q].b2b.amount;
        result.yoyGrowth.quarters[q].total = dataByYear[currentYear].quarters[q].total.amount - dataByYear[lastYear].quarters[q].total.amount;
    });
    
    // Process monthly data and calculate commissions
    months.forEach((month, idx) => {
        const lastYearData = dataByYear[lastYear].months[month];
        const currentYearData = dataByYear[currentYear].months[month];
        const refundsData = dataByYear[currentYear].refunds[month];
        const quarter = `Q${Math.ceil((idx + 1) / 3)}`;
        
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
        
        result.currentYear.refunds[monthNames[idx]] = {
            b2c: refundsData.b2c.amount,
            b2b: refundsData.b2b.amount,
            total: refundsData.total.amount,
            b2c_course: refundsData.b2c.course_fees,
            b2b_course: refundsData.b2b.course_fees
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
        
        // Calculate commissions based on NET amounts (revenue - refunds)
        // Diego (B2C): 1% of NET B2C revenue
        const netB2cRevenue = currentYearData.b2c.amount - refundsData.b2c.amount;
        const b2cCommissionNet = netB2cRevenue * 0.01;
        const b2cCommissionGross = currentYearData.b2c.amount * 0.01;
        
        result.commissions.b2c.monthsNet[monthNames[idx]] = b2cCommissionNet;
        result.commissions.b2c.months[monthNames[idx]] = b2cCommissionGross;
        result.commissions.b2c.quarters[quarter] += b2cCommissionNet;
        result.commissions.b2c.total += b2cCommissionNet;
        
        // Add to YTD commissions if within YTD period
        if (idx + 1 <= ytdMonth) {
            result.commissions.b2c.ytd += b2cCommissionGross;
            result.commissions.b2c.ytdNet += b2cCommissionNet;
        }
        
        // Cenker (B2B): 10% of YoY NET course fee growth (only if positive)
        const netB2bCourseFees = currentYearData.b2b.course_fees - refundsData.b2b.course_fees;
        const b2bCourseGrowthNet = netB2bCourseFees - lastYearData.b2b.course_fees;
        const b2bCommissionNet = b2bCourseGrowthNet > 0 ? b2bCourseGrowthNet * 0.10 : 0;
        
        const b2bCourseGrowthGross = currentYearData.b2b.course_fees - lastYearData.b2b.course_fees;
        const b2bCommissionGross = b2bCourseGrowthGross > 0 ? b2bCourseGrowthGross * 0.10 : 0;
        
        result.commissions.b2b.monthsNet[monthNames[idx]] = b2bCommissionNet;
        result.commissions.b2b.months[monthNames[idx]] = b2bCommissionGross;
        result.commissions.b2b.quarters[quarter] += b2bCommissionNet;
        result.commissions.b2b.total += b2bCommissionNet;
        
        // Add to YTD commissions if within YTD period
        if (idx + 1 <= ytdMonth) {
            result.commissions.b2b.ytd += b2bCommissionGross;
            result.commissions.b2b.ytdNet += b2bCommissionNet;
        }
        
        // Add to annual totals
        result.lastYear.total.b2c += lastYearData.b2c.amount;
        result.lastYear.total.b2b += lastYearData.b2b.amount;
        result.lastYear.total.total += lastYearData.total.amount;
        result.lastYear.total.b2c_course += lastYearData.b2c.course_fees;
        result.lastYear.total.b2b_course += lastYearData.b2b.course_fees;
        
        result.currentYear.total.b2c += currentYearData.b2c.amount;
        result.currentYear.total.b2b += currentYearData.b2b.amount;
        result.currentYear.total.total += currentYearData.total.amount;
        result.currentYear.total.b2c_course += currentYearData.b2c.course_fees;
        result.currentYear.total.b2b_course += currentYearData.b2b.course_fees;
    });
    
    // Calculate full year YoY growth
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

function getEmptyDataStructure() {
    const emptyMonths = {};
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    monthNames.forEach(month => {
        emptyMonths[month] = { b2c: 0, b2b: 0, total: 0, b2c_course: 0, b2b_course: 0 };
    });
    
    return {
        lastYear: { 
            year: 2024, 
            months: emptyMonths,
            quarters: {
                Q1: { b2c: { amount: 0, course_fees: 0 }, b2b: { amount: 0, course_fees: 0 }, total: { amount: 0, course_fees: 0 } },
                Q2: { b2c: { amount: 0, course_fees: 0 }, b2b: { amount: 0, course_fees: 0 }, total: { amount: 0, course_fees: 0 } },
                Q3: { b2c: { amount: 0, course_fees: 0 }, b2b: { amount: 0, course_fees: 0 }, total: { amount: 0, course_fees: 0 } },
                Q4: { b2c: { amount: 0, course_fees: 0 }, b2b: { amount: 0, course_fees: 0 }, total: { amount: 0, course_fees: 0 } }
            },
            ytd: { b2c: { amount: 0 }, b2b: { amount: 0 }, total: { amount: 0 } },
            total: { b2c: 0, b2b: 0, total: 0 }
        },
        currentYear: { 
            year: 2025, 
            months: emptyMonths,
            refunds: emptyMonths,
            quarters: {
                Q1: { b2c: { amount: 0, course_fees: 0 }, b2b: { amount: 0, course_fees: 0 }, total: { amount: 0, course_fees: 0 } },
                Q2: { b2c: { amount: 0, course_fees: 0 }, b2b: { amount: 0, course_fees: 0 }, total: { amount: 0, course_fees: 0 } },
                Q3: { b2c: { amount: 0, course_fees: 0 }, b2b: { amount: 0, course_fees: 0 }, total: { amount: 0, course_fees: 0 } },
                Q4: { b2c: { amount: 0, course_fees: 0 }, b2b: { amount: 0, course_fees: 0 }, total: { amount: 0, course_fees: 0 } }
            },
            ytd: { b2c: { amount: 0 }, b2b: { amount: 0 }, total: { amount: 0 } },
            ytdRefunds: { b2c: { amount: 0 }, b2b: { amount: 0 }, total: { amount: 0 } },
            ytdNet: { b2c: { amount: 0 }, b2b: { amount: 0 }, total: { amount: 0 } },
            total: { b2c: 0, b2b: 0, total: 0 }
        },
        yoyGrowth: { 
            months: emptyMonths, 
            quarters: {
                Q1: { b2c: 0, b2b: 0, total: 0 },
                Q2: { b2c: 0, b2b: 0, total: 0 },
                Q3: { b2c: 0, b2b: 0, total: 0 },
                Q4: { b2c: 0, b2b: 0, total: 0 }
            },
            ytd: { b2c: 0, b2b: 0, total: 0 }, 
            ytdNet: { b2c: 0, b2b: 0, total: 0 },
            total: { b2c: 0, b2b: 0, total: 0 } 
        },
        yoyPercent: { 
            months: emptyMonths, 
            ytd: { b2c: 0, b2b: 0, total: 0 }, 
            ytdNet: { b2c: 0, b2b: 0, total: 0 },
            total: { b2c: 0, b2b: 0, total: 0 } 
        },
        commissions: {
            b2c: { 
                months: emptyMonths, 
                monthsNet: emptyMonths,
                quarters: { Q1: 0, Q2: 0, Q3: 0, Q4: 0 },
                ytd: 0,
                ytdNet: 0,
                total: 0,
                december2024: DECEMBER_2024_B2C_COMMISSION
            },
            b2b: { 
                months: emptyMonths, 
                monthsNet: emptyMonths,
                quarters: { Q1: 0, Q2: 0, Q3: 0, Q4: 0 },
                ytd: 0,
                ytdNet: 0,
                total: 0 
            }
        },
        baseSalary: {
            b2c: {
                monthly: BASE_SALARIES.b2c,
                quarterly: BASE_SALARIES.b2c * 3,
                ytd: BASE_SALARIES.b2c * new Date().getMonth(),
                annual: BASE_SALARIES.b2c * 12
            },
            b2b: {
                monthly: BASE_SALARIES.b2b,
                quarterly: BASE_SALARIES.b2b * 3,
                ytd: BASE_SALARIES.b2b * new Date().getMonth(),
                annual: BASE_SALARIES.b2b * 12
            }
        },
        ytdMonthCount: new Date().getMonth() + 1
    };
}

// Main dashboard endpoint
router.get('/data', async (req, res) => {
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

// Alternative endpoint
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
        
        // Extract B2C specific data with refunds
        const b2cData = {
            success: result.success,
            employee: {
                name: 'Diego',
                baseSalary: BASE_SALARIES.b2c,
                commissionRate: '1%'
            },
            lastMonthCommission: result.data.commissions.b2c.monthsNet[monthNames[lastMonth]] || 0,
            currentMonthGrossPay: BASE_SALARIES.b2c + (result.data.commissions.b2c.monthsNet[monthNames[lastMonth]] || 0),
            monthlyData: result.data.currentYear.months,
            monthlyRefunds: result.data.currentYear.refunds,
            lastYearMonthly: result.data.lastYear.months,
            quarters: {
                lastYear: result.data.lastYear.quarters,
                currentYear: result.data.currentYear.quarters,
                growth: result.data.yoyGrowth.quarters
            },
            commissions: result.data.commissions.b2c,
            baseSalary: result.data.baseSalary.b2c,
            yearTotal: result.data.currentYear.total.b2c,
            ytdTotal: result.data.currentYear.ytd.b2c.amount,
            ytdRefunds: result.data.currentYear.ytdRefunds.b2c.amount,
            ytdNet: result.data.currentYear.ytdNet.b2c.amount,
            lastYearYtd: result.data.lastYear.ytd.b2c.amount,
            yoyGrowth: result.data.yoyGrowth.ytdNet.b2c,
            yoyPercent: result.data.yoyPercent.ytdNet.b2c,
            yoyMonthly: result.data.yoyGrowth.months,
            yoyPercentMonthly: result.data.yoyPercent.months,
            december2024Commission: DECEMBER_2024_B2C_COMMISSION
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
        
        // Extract B2B specific data with refunds
        const b2bData = {
            success: result.success,
            employee: {
                name: 'Cenker',
                baseSalary: BASE_SALARIES.b2b,
                commissionRate: '10% of YoY course fee growth'
            },
            lastMonthCommission: result.data.commissions.b2b.monthsNet[monthNames[lastMonth]] || 0,
            currentMonthGrossPay: BASE_SALARIES.b2b + (result.data.commissions.b2b.monthsNet[monthNames[lastMonth]] || 0),
            monthlyData: result.data.currentYear.months,
            monthlyRefunds: result.data.currentYear.refunds,
            lastYearMonthly: result.data.lastYear.months,
            quarters: {
                lastYear: result.data.lastYear.quarters,
                currentYear: result.data.currentYear.quarters,
                growth: result.data.yoyGrowth.quarters
            },
            commissions: result.data.commissions.b2b,
            baseSalary: result.data.baseSalary.b2b,
            yearTotal: result.data.currentYear.total.b2b,
            ytdTotal: result.data.currentYear.ytd.b2b.amount,
            ytdRefunds: result.data.currentYear.ytdRefunds.b2b.amount,
            ytdNet: result.data.currentYear.ytdNet.b2b.amount,
            lastYearYtd: result.data.lastYear.ytd.b2b.amount,
            yoyGrowth: result.data.yoyGrowth.ytdNet.b2b,
            yoyPercent: result.data.yoyPercent.ytdNet.b2b,
            yoyMonthly: result.data.yoyGrowth.months,
            yoyPercentMonthly: result.data.yoyPercent.months
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

// Test endpoint 
router.get('/test', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        
        // Test database connection and data
        const [dateFormats] = await connection.execute(`
            SELECT
                date_tmp,
                amount,
                course,
                agent,
                refund_date,
                'DATE' as date_format,
                'DATE' as refund_date_format
            FROM sales_data
            WHERE date_tmp IS NOT NULL
            AND amount IS NOT NULL
            AND amount != ''
            LIMIT 10
        `);
        
        // Test for refunds
        const [refundTest] = await connection.execute(`
            SELECT
                COUNT(*) as total_refunds,
                SUM(CAST(REPLACE(REPLACE(amount, '€', ''), ',', '') AS DECIMAL(10,2))) as total_refunded
            FROM sales_data
            WHERE refunded = 'Yes'
            AND refund_date IS NOT NULL
            AND refund_date > '0000-00-00'
        `);
        
        res.json({
            success: true,
            message: 'Date format and refunds test',
            dateFormats: dateFormats,
            refunds: refundTest[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

module.exports = router;