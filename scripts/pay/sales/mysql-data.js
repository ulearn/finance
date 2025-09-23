const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

class MySQLDataProvider {
    constructor() {
        this.connection = null;
        this.config = {
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306
        };
    }

    async connect() {
        try {
            if (!this.connection) {
                this.connection = await mysql.createConnection(this.config);
                console.log('MySQL connected successfully');
            }
            return this.connection;
        } catch (error) {
            console.error('MySQL connection failed:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.connection) {
            await this.connection.end();
            this.connection = null;
        }
    }

    async getDashboardData() {
        try {
            const connection = await this.connect();

            // Get data from commission_calculations table which has pre-aggregated monthly data
            const query = `
                SELECT
                    month_year,
                    channel,
                    total_amount,
                    total_course_fees,
                    record_count,
                    commission_amount,
                    yoy_course_growth,
                    yoy_course_growth_percent
                FROM commission_calculations
                WHERE month_year >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 24 MONTH), '%Y-%m')
                ORDER BY month_year, channel
            `;

            const [rows] = await connection.execute(query);

            // Process data for dashboard display
            const processedData = this.processMonthlyData(rows);

            return {
                success: true,
                data: processedData
            };

        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            return {
                success: false,
                error: error.message,
                data: this.getFallbackData()
            };
        }
    }

    async getB2BData() {
        try {
            const connection = await this.connect();

            // Get B2B data from commission_calculations table
            const query = `
                SELECT
                    month_year,
                    total_amount,
                    total_course_fees,
                    net_course_fees,
                    previous_year_course_fees,
                    yoy_course_growth,
                    yoy_course_growth_percent,
                    commission_amount,
                    commission_base,
                    record_count
                FROM commission_calculations
                WHERE channel = 'B2B'
                AND month_year >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 24 MONTH), '%Y-%m')
                ORDER BY month_year
            `;

            const [rows] = await connection.execute(query);

            return {
                success: true,
                data: rows
            };

        } catch (error) {
            console.error('Error fetching B2B data:', error);
            return {
                success: false,
                error: error.message,
                data: []
            };
        }
    }

    async getB2CData() {
        try {
            const connection = await this.connect();

            // Get B2C data from commission_calculations table
            const query = `
                SELECT
                    month_year,
                    total_amount,
                    total_course_fees,
                    commission_amount,
                    commission_base,
                    record_count
                FROM commission_calculations
                WHERE channel = 'B2C'
                AND month_year >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 24 MONTH), '%Y-%m')
                ORDER BY month_year
            `;

            const [rows] = await connection.execute(query);

            return {
                success: true,
                data: rows
            };

        } catch (error) {
            console.error('Error fetching B2C data:', error);
            return {
                success: false,
                error: error.message,
                data: []
            };
        }
    }

    processMonthlyData(rows) {
        const monthlyData = {};

        rows.forEach(row => {
            const monthKey = row.month_year;

            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = {
                    month: monthKey,
                    B2C: { revenue: 0, bookings: 0, commission: 0 },
                    B2B: { revenue: 0, bookings: 0, commission: 0, yoy_growth: 0 }
                };
            }

            monthlyData[monthKey][row.channel] = {
                revenue: parseFloat(row.total_amount) || 0,
                bookings: parseInt(row.record_count) || 0,
                commission: parseFloat(row.commission_amount) || 0,
                ...(row.channel === 'B2B' && {
                    yoy_growth: parseFloat(row.yoy_course_growth) || 0,
                    yoy_growth_percent: parseFloat(row.yoy_course_growth_percent) || 0
                })
            };
        });

        return Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));
    }

    getFallbackData() {
        // Return zeros for all months in case of DB failure
        const fallbackData = [];
        const currentDate = new Date();

        for (let i = 23; i >= 0; i--) {
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            fallbackData.push({
                month: monthKey,
                B2C: { revenue: 0, bookings: 0, commission: 0 },
                B2B: { revenue: 0, bookings: 0, commission: 0, yoy_growth: 0 }
            });
        }

        return fallbackData;
    }

    async insertSalesData(data) {
        try {
            const connection = await this.connect();

            const query = `
                INSERT INTO sales_data (
                    surname, first_name, invoice_numbers, student_id, payment_method,
                    salesperson, group_name, student_status, agent, agency_category,
                    agency_number, course, course_end, course_start, course_absolute_weeks,
                    accommodation, accommodation_start_date, accommodation_end_date,
                    note, receipt_number, amount, course_fee, accommodation_fee,
                    transfer_fee, insurance_fee, additional_course_fees,
                    additional_accommodation_fees, general_additional_fees,
                    manually_entered_positions, overpayment, payment_date,
                    data_source, channel, month_year
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                amount = VALUES(amount),
                course_fee = VALUES(course_fee),
                accommodation_fee = VALUES(accommodation_fee),
                updated_at = CURRENT_TIMESTAMP
            `;

            const results = [];
            for (const record of data) {
                const [result] = await connection.execute(query, [
                    record.surname, record.first_name, record.invoice_numbers,
                    record.student_id, record.payment_method, record.salesperson,
                    record.group_name, record.student_status, record.agent,
                    record.agency_category, record.agency_number, record.course,
                    record.course_end, record.course_start, record.course_absolute_weeks,
                    record.accommodation, record.accommodation_start_date,
                    record.accommodation_end_date, record.note, record.receipt_number,
                    record.amount, record.course_fee, record.accommodation_fee,
                    record.transfer_fee, record.insurance_fee, record.additional_course_fees,
                    record.additional_accommodation_fees, record.general_additional_fees,
                    record.manually_entered_positions, record.overpayment,
                    record.payment_date, record.data_source, record.channel, record.month_year
                ]);
                results.push(result);
            }

            return {
                success: true,
                inserted: results.length,
                message: `Successfully processed ${results.length} records`
            };

        } catch (error) {
            console.error('Error inserting sales data:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = MySQLDataProvider;