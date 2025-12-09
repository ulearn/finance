// data.js - Financial data aggregator
// Pulls actuals from Xero and stores in financial_actuals table

const mysql = require('mysql2/promise');
const XeroAPIClient = require('../xero/xero-client');
const dayjs = require('dayjs');

class FinancialDataAggregator {
    constructor() {
        this.xeroClient = new XeroAPIClient();
        this.dbConfig = {
            host: process.env.MODEL_DB_HOST || 'localhost',
            user: process.env.MODEL_DB_USER,
            password: process.env.MODEL_DB_PASSWORD,
            database: process.env.MODEL_DB_NAME || 'hub_model',
            port: process.env.MODEL_DB_PORT || 3306
        };
    }

    async getConnection() {
        return await mysql.createConnection(this.dbConfig);
    }

    /**
     * Sync historical actuals from Xero to database
     * @param {string} startDate - Format: YYYY-MM-DD
     * @param {string} endDate - Format: YYYY-MM-DD
     */
    async syncXeroActuals(startDate, endDate) {
        const connection = await this.getConnection();

        try {
            console.log(`Syncing Xero data from ${startDate} to ${endDate}...`);

            // Get P&L report from Xero
            const profitLoss = await this.xeroClient.getReport('ProfitAndLoss', {
                fromDate: startDate,
                toDate: endDate,
                periods: 1,
                timeframe: 'MONTH'
            });

            // Get Balance Sheet for cash on hand
            const balanceSheet = await this.xeroClient.getReport('BalanceSheet', {
                date: endDate
            });

            // Parse Xero reports and insert into database
            const months = this.parseMonthlyData(profitLoss, balanceSheet);

            for (const monthData of months) {
                await this.insertOrUpdateActuals(connection, monthData);
            }

            console.log(`✓ Successfully synced ${months.length} months of data`);

            return {
                success: true,
                months_synced: months.length
            };

        } catch (error) {
            console.error('Error syncing Xero actuals:', error);
            throw error;
        } finally {
            await connection.end();
        }
    }

    /**
     * Parse Xero P&L report into monthly data structure
     */
    parseMonthlyData(profitLoss, balanceSheet) {
        // This will need customization based on your Xero chart of accounts
        // For now, returning structure based on your forecast doc

        const months = [];

        // Extract rows from Xero report
        const rows = profitLoss?.Reports?.[0]?.Rows || [];

        // Map Xero accounts to our structure
        // You'll need to adjust these account names based on your actual Xero setup

        for (const row of rows) {
            if (row.RowType === 'Row' && row.Cells) {
                const accountName = row.Cells[0]?.Value || '';
                const value = parseFloat(row.Cells[1]?.Value || 0);

                // Build monthly data structure
                // This is a simplified version - you'll customize based on your accounts
            }
        }

        return months;
    }

    /**
     * Get Xero reports available via API
     */
    async getAvailableXeroReports() {
        try {
            const reports = await this.xeroClient.getReports();
            return reports;
        } catch (error) {
            console.error('Error fetching Xero reports:', error);
            throw error;
        }
    }

    /**
     * Insert or update financial actuals
     */
    async insertOrUpdateActuals(connection, data) {
        const query = `
            INSERT INTO financial_actuals (
                period_date,
                revenue_b2b, revenue_b2c, revenue_accommodation, revenue_other, revenue_total,
                cos_accommodation, cos_transport, cos_insurance, cos_partner_payments,
                cos_exam_fees, cos_social, cos_total,
                expense_rent, expense_utilities, expense_software, expense_fixed_total,
                expense_wages, expense_marketing, expense_variable_total,
                gross_profit, operating_profit, net_income,
                cash_on_hand,
                source, last_synced
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                revenue_b2b = VALUES(revenue_b2b),
                revenue_b2c = VALUES(revenue_b2c),
                revenue_accommodation = VALUES(revenue_accommodation),
                revenue_other = VALUES(revenue_other),
                revenue_total = VALUES(revenue_total),
                cos_accommodation = VALUES(cos_accommodation),
                cos_transport = VALUES(cos_transport),
                cos_insurance = VALUES(cos_insurance),
                cos_partner_payments = VALUES(cos_partner_payments),
                cos_exam_fees = VALUES(cos_exam_fees),
                cos_social = VALUES(cos_social),
                cos_total = VALUES(cos_total),
                expense_rent = VALUES(expense_rent),
                expense_utilities = VALUES(expense_utilities),
                expense_software = VALUES(expense_software),
                expense_fixed_total = VALUES(expense_fixed_total),
                expense_wages = VALUES(expense_wages),
                expense_marketing = VALUES(expense_marketing),
                expense_variable_total = VALUES(expense_variable_total),
                gross_profit = VALUES(gross_profit),
                operating_profit = VALUES(operating_profit),
                net_income = VALUES(net_income),
                cash_on_hand = VALUES(cash_on_hand),
                last_synced = NOW()
        `;

        await connection.execute(query, [
            data.period_date,
            data.revenue_b2b || 0,
            data.revenue_b2c || 0,
            data.revenue_accommodation || 0,
            data.revenue_other || 0,
            data.revenue_total || 0,
            data.cos_accommodation || 0,
            data.cos_transport || 0,
            data.cos_insurance || 0,
            data.cos_partner_payments || 0,
            data.cos_exam_fees || 0,
            data.cos_social || 0,
            data.cos_total || 0,
            data.expense_rent || 0,
            data.expense_utilities || 0,
            data.expense_software || 0,
            data.expense_fixed_total || 0,
            data.expense_wages || 0,
            data.expense_marketing || 0,
            data.expense_variable_total || 0,
            data.gross_profit || 0,
            data.operating_profit || 0,
            data.net_income || 0,
            data.cash_on_hand || 0,
            'xero'
        ]);
    }

    /**
     * Calculate historical revenue/cost ratios
     * This is KEY - the thing Fathom couldn't do!
     */
    async calculateHistoricalRatios(months = 24) {
        const connection = await this.getConnection();

        try {
            // Get historical actuals
            const [rows] = await connection.execute(`
                SELECT
                    period_date,
                    revenue_total,
                    expense_variable_total,
                    cos_total,
                    expense_marketing,
                    expense_wages
                FROM financial_actuals
                WHERE period_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
                    AND revenue_total > 0
                ORDER BY period_date ASC
            `, [months]);

            // Calculate ratios for each month
            const ratios = [];
            for (const row of rows) {
                const variableCostRatio = row.expense_variable_total / row.revenue_total;
                const cosRatio = row.cos_total / row.revenue_total;
                const marketingRatio = row.expense_marketing / row.revenue_total;
                const wageRatio = row.expense_wages / row.revenue_total;

                ratios.push({
                    period_date: row.period_date,
                    variable_cost_ratio: variableCostRatio,
                    cos_ratio: cosRatio,
                    marketing_ratio: marketingRatio,
                    wage_ratio: wageRatio
                });
            }

            // Calculate moving averages
            for (let i = 0; i < ratios.length; i++) {
                const ratio = ratios[i];

                // 3-month average
                if (i >= 2) {
                    ratio.variable_cost_ratio_3m_avg =
                        (ratios[i].variable_cost_ratio +
                         ratios[i-1].variable_cost_ratio +
                         ratios[i-2].variable_cost_ratio) / 3;
                }

                // 6-month average
                if (i >= 5) {
                    let sum = 0;
                    for (let j = 0; j < 6; j++) {
                        sum += ratios[i-j].variable_cost_ratio;
                    }
                    ratio.variable_cost_ratio_6m_avg = sum / 6;
                }

                // 12-month average
                if (i >= 11) {
                    let sum = 0;
                    for (let j = 0; j < 12; j++) {
                        sum += ratios[i-j].variable_cost_ratio;
                    }
                    ratio.variable_cost_ratio_12m_avg = sum / 12;
                }

                // Insert into database
                await this.insertOrUpdateRatio(connection, ratio);
            }

            console.log(`✓ Calculated ratios for ${ratios.length} months`);

            return {
                success: true,
                ratios: ratios
            };

        } catch (error) {
            console.error('Error calculating ratios:', error);
            throw error;
        } finally {
            await connection.end();
        }
    }

    /**
     * Insert or update ratio data
     */
    async insertOrUpdateRatio(connection, data) {
        const query = `
            INSERT INTO revenue_cost_ratios (
                period_date,
                variable_cost_ratio,
                cos_ratio,
                marketing_ratio,
                wage_ratio,
                variable_cost_ratio_3m_avg,
                variable_cost_ratio_6m_avg,
                variable_cost_ratio_12m_avg,
                computed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                variable_cost_ratio = VALUES(variable_cost_ratio),
                cos_ratio = VALUES(cos_ratio),
                marketing_ratio = VALUES(marketing_ratio),
                wage_ratio = VALUES(wage_ratio),
                variable_cost_ratio_3m_avg = VALUES(variable_cost_ratio_3m_avg),
                variable_cost_ratio_6m_avg = VALUES(variable_cost_ratio_6m_avg),
                variable_cost_ratio_12m_avg = VALUES(variable_cost_ratio_12m_avg),
                computed_at = NOW()
        `;

        await connection.execute(query, [
            data.period_date,
            data.variable_cost_ratio,
            data.cos_ratio,
            data.marketing_ratio,
            data.wage_ratio,
            data.variable_cost_ratio_3m_avg || null,
            data.variable_cost_ratio_6m_avg || null,
            data.variable_cost_ratio_12m_avg || null
        ]);
    }

    /**
     * Get latest variable cost ratio (for forecasting)
     */
    async getLatestCostRatio(avgPeriod = '12m') {
        const connection = await this.getConnection();

        try {
            const column = avgPeriod === '3m' ? 'variable_cost_ratio_3m_avg' :
                          avgPeriod === '6m' ? 'variable_cost_ratio_6m_avg' :
                          'variable_cost_ratio_12m_avg';

            const [rows] = await connection.execute(`
                SELECT ${column} as ratio
                FROM revenue_cost_ratios
                WHERE ${column} IS NOT NULL
                ORDER BY period_date DESC
                LIMIT 1
            `);

            if (rows.length === 0) {
                throw new Error('No historical ratio data available');
            }

            return rows[0].ratio;

        } finally {
            await connection.end();
        }
    }

    /**
     * Get historical actuals for a date range
     */
    async getActuals(startDate, endDate) {
        const connection = await this.getConnection();

        try {
            const [rows] = await connection.execute(`
                SELECT *
                FROM financial_actuals
                WHERE period_date BETWEEN ? AND ?
                ORDER BY period_date ASC
            `, [startDate, endDate]);

            return rows;

        } finally {
            await connection.end();
        }
    }
}

module.exports = FinancialDataAggregator;
