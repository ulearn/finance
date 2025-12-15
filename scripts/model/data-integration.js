/**
 * Data Integration for Hormozi Sales Model
 *
 * Pulls real data from:
 * - MySQL: Sales staff salaries & commissions
 * - Xero: Software subscriptions, Printing, Events, Travel costs
 * - Manual: Advertising spend (needs source configuration)
 */

const mysql = require('mysql2/promise');
const path = require('path');
const XeroAPIClient = require('../xero/xero-client');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

class ModelDataIntegration {
    constructor() {
        this.dbConfig = {
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306
        };

        this.xeroClient = new XeroAPIClient();

        // Base salaries from payroll system
        this.BASE_SALARIES = {
            b2c: 2550,  // Diego (monthly)
            b2b: 3550   // Cenker (monthly)
        };
    }

    /**
     * Get sales staff salaries and commissions from MySQL
     * Returns monthly data for the year
     */
    async getSalesPayrollData(year = 2025) {
        let connection;
        try {
            connection = await mysql.createConnection(this.dbConfig);

            // Get commissions data from payment_detail table
            const commissionsQuery = `
                SELECT
                    MONTH(date) as month,
                    SUM(
                        CASE
                            WHEN agent IS NULL OR agent = '' THEN
                                CAST(REPLACE(SUBSTRING(course, 2), ',', '') AS DECIMAL(10,2)) * 0.01
                            ELSE 0
                        END
                    ) as b2c_commission,
                    SUM(
                        CASE
                            WHEN agent IS NOT NULL AND agent != '' THEN
                                CAST(REPLACE(SUBSTRING(course, 2), ',', '') AS DECIMAL(10,2)) * 0.10
                            ELSE 0
                        END
                    ) as b2b_commission
                FROM payment_detail
                WHERE YEAR(date) = ?
                    AND method NOT IN ('REFUND', 'TransferMate Escrow')
                GROUP BY MONTH(date)
                ORDER BY month
            `;

            const [commissions] = await connection.execute(commissionsQuery, [year]);

            // Build monthly array (1-12) with salaries + commissions
            const monthlyData = [];
            for (let month = 1; month <= 12; month++) {
                const monthData = commissions.find(c => c.month === month) || {
                    b2c_commission: 0,
                    b2b_commission: 0
                };

                monthlyData.push({
                    month: month,
                    salaries: this.BASE_SALARIES.b2c + this.BASE_SALARIES.b2b,
                    b2c_salary: this.BASE_SALARIES.b2c,
                    b2b_salary: this.BASE_SALARIES.b2b,
                    commissions: parseFloat(monthData.b2c_commission) + parseFloat(monthData.b2b_commission),
                    b2c_commission: parseFloat(monthData.b2c_commission),
                    b2b_commission: parseFloat(monthData.b2b_commission)
                });
            }

            return monthlyData;

        } catch (error) {
            console.error('Error fetching sales payroll data:', error);
            throw error;
        } finally {
            if (connection) await connection.end();
        }
    }

    /**
     * Get expense data from Xero
     * Categories: Software, Printing, Events, Travel & Subsistence
     */
    async getXeroExpenses(year = 2025) {
        try {
            // Load tokens
            await this.xeroClient.loadTokens();

            // Get bank transactions for expense categories
            const startDate = `${year}-01-01`;
            const endDate = `${year}-12-31`;

            // Define account codes for each expense category
            // You'll need to map these to your actual Xero account codes
            const expenseCategories = {
                software: ['Software', 'Subscriptions', 'SaaS'], // Partial match on account names
                printing: ['Printing', 'Brochures', 'Marketing Materials'],
                events: ['Events', 'Exhibitions', 'Trade Shows'],
                travel: ['Travel', 'Subsistence', 'Accommodation']
            };

            const monthlyExpenses = Array.from({ length: 12 }, (_, i) => ({
                month: i + 1,
                software: 0,
                printing: 0,
                events: 0,
                travel: 0
            }));

            // Fetch bank transactions (expenses)
            const response = await this.xeroClient.xero.accountingApi.getBankTransactions(
                this.xeroClient.tenantId,
                null, // ifModifiedSince
                `Date >= DateTime(${year},1,1) && Date <= DateTime(${year},12,31)`,
                null, // order
                null, // page
                null  // unitdp
            );

            const transactions = response.body.bankTransactions || [];

            // Process transactions and categorize by month
            transactions.forEach(tx => {
                if (tx.type === 'SPEND' || tx.type === 'SPEND-OVERPAYMENT') {
                    const month = new Date(tx.date).getMonth() + 1;
                    const amount = Math.abs(tx.total || 0);

                    // Match account name to category
                    const accountName = tx.bankAccount?.name || '';

                    if (this.matchesCategory(accountName, expenseCategories.software)) {
                        monthlyExpenses[month - 1].software += amount;
                    } else if (this.matchesCategory(accountName, expenseCategories.printing)) {
                        monthlyExpenses[month - 1].printing += amount;
                    } else if (this.matchesCategory(accountName, expenseCategories.events)) {
                        monthlyExpenses[month - 1].events += amount;
                    } else if (this.matchesCategory(accountName, expenseCategories.travel)) {
                        monthlyExpenses[month - 1].travel += amount;
                    }
                }
            });

            return monthlyExpenses;

        } catch (error) {
            console.error('Error fetching Xero expenses:', error);
            // Return zeros if Xero fails
            return Array.from({ length: 12 }, (_, i) => ({
                month: i + 1,
                software: 0,
                printing: 0,
                events: 0,
                travel: 0
            }));
        }
    }

    /**
     * Helper to match account names to category keywords
     */
    matchesCategory(accountName, keywords) {
        const name = accountName.toLowerCase();
        return keywords.some(keyword => name.includes(keyword.toLowerCase()));
    }

    /**
     * Get complete monthly data for Hormozi model
     * Combines payroll, Xero expenses, and ad spend
     *
     * @param {number} year
     * @param {Array} adSpend - Monthly ad spend array [jan, feb, mar, ...]
     */
    async getCompleteModelData(year = 2025, adSpend = []) {
        try {
            // Fetch payroll data
            const payrollData = await this.getSalesPayrollData(year);

            // Fetch Xero expenses
            const xeroExpenses = await this.getXeroExpenses(year);

            // Combine all data
            const completeData = payrollData.map((payroll, idx) => {
                const xero = xeroExpenses[idx];
                const ads = adSpend[idx] || 0;

                return {
                    month: payroll.month,
                    // CAC Components
                    ads: ads,
                    software: xero.software,
                    printing: xero.printing,
                    events: xero.events,
                    travel: xero.travel,
                    salaries: payroll.salaries,
                    commissions: payroll.commissions,
                    // Breakdowns
                    b2c_salary: payroll.b2c_salary,
                    b2b_salary: payroll.b2b_salary,
                    b2c_commission: payroll.b2c_commission,
                    b2b_commission: payroll.b2b_commission,
                    // Calculated
                    mediaCAC: ads + xero.software,
                    prospectingCAC: xero.printing + xero.events + xero.travel,
                    fullyLoadedCAC: ads + xero.software + xero.printing + xero.events + xero.travel + payroll.salaries + payroll.commissions
                };
            });

            return completeData;

        } catch (error) {
            console.error('Error getting complete model data:', error);
            throw error;
        }
    }

    /**
     * Get sales won data from MySQL
     * Returns number of students won each month
     */
    async getSalesWonData(year = 2025) {
        let connection;
        try {
            connection = await mysql.createConnection(this.dbConfig);

            const query = `
                SELECT
                    MONTH(date) as month,
                    COUNT(DISTINCT booking_id) as sales_won,
                    SUM(
                        CASE
                            WHEN agent IS NULL OR agent = '' THEN 1
                            ELSE 0
                        END
                    ) as b2c_sales,
                    SUM(
                        CASE
                            WHEN agent IS NOT NULL AND agent != '' THEN 1
                            ELSE 0
                        END
                    ) as b2b_sales
                FROM payment_detail
                WHERE YEAR(date) = ?
                    AND method NOT IN ('REFUND', 'TransferMate Escrow')
                GROUP BY MONTH(date)
                ORDER BY month
            `;

            const [results] = await connection.execute(query, [year]);

            // Build monthly array
            const monthlyData = [];
            for (let month = 1; month <= 12; month++) {
                const monthData = results.find(r => r.month === month) || {
                    sales_won: 0,
                    b2c_sales: 0,
                    b2b_sales: 0
                };

                monthlyData.push({
                    month: month,
                    salesWon: parseInt(monthData.sales_won),
                    b2cSales: parseInt(monthData.b2c_sales),
                    b2bSales: parseInt(monthData.b2b_sales)
                });
            }

            return monthlyData;

        } catch (error) {
            console.error('Error fetching sales won data:', error);
            throw error;
        } finally {
            if (connection) await connection.end();
        }
    }
}

module.exports = ModelDataIntegration;
