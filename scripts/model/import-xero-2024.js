// import-xero-2024.js - Import 2024 actuals directly from Xero
// Run this to populate historical data for forecasting

const FinancialDataAggregator = require('./data');
const mysql = require('mysql2/promise');
const XeroAPIClient = require('../xero/xero-client');
const dayjs = require('dayjs');

class XeroImporter {
    constructor() {
        this.xeroClient = new XeroAPIClient();
        this.dataAggregator = new FinancialDataAggregator();
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
     * Import full year 2024 from Xero
     */
    async import2024Data() {
        console.log('🔄 Starting Xero import for 2024...\n');

        try {
            // Get P&L for each month of 2024 (need separate API calls)
            console.log('📊 Fetching monthly P&L reports from Xero (12 calls)...\n');
            const months = [];

            for (let month = 1; month <= 12; month++) {
                const monthStr = month.toString().padStart(2, '0');
                const startDate = `2024-${monthStr}-01`;
                const endDate = dayjs(startDate).endOf('month').format('YYYY-MM-DD');

                console.log(`   ${monthStr}/2024...`);

                const profitLoss = await this.xeroClient.getReport('ProfitAndLoss', {
                    fromDate: startDate,
                    toDate: endDate
                });

                const monthData = this.parseMonthReport(profitLoss, startDate);
                months.push(monthData);
            }

            console.log('\n✓ All monthly reports retrieved\n');
            console.log(`📝 Importing ${months.length} months of data...\n`);

            const connection = await this.getConnection();

            try {
                for (const monthData of months) {
                    await this.insertMonthData(connection, monthData);
                    console.log(`✓ Imported ${monthData.period_date}`);
                }

                console.log('\n🎉 Import complete!');
                console.log(`\nImported data for ${months.length} months`);

                // Calculate totals
                const totals = months.reduce((acc, m) => {
                    acc.revenue += m.revenue_total;
                    acc.gross_profit += m.gross_profit;
                    acc.operating_profit += m.operating_profit;
                    return acc;
                }, { revenue: 0, gross_profit: 0, operating_profit: 0 });

                console.log('\n📈 2024 Summary:');
                console.log(`  Total Revenue: €${totals.revenue.toLocaleString()}`);
                console.log(`  Gross Profit: €${totals.gross_profit.toLocaleString()}`);
                console.log(`  Operating Profit: €${totals.operating_profit.toLocaleString()}`);

                // Now calculate cost ratios
                console.log('\n🔢 Calculating cost ratios...');
                await this.dataAggregator.calculateHistoricalRatios(12);

                console.log('\n✅ All done! Ready to create forecasts.');

            } finally {
                await connection.end();
            }

        } catch (error) {
            console.error('\n❌ Error during import:', error.message);
            throw error;
        }
    }

    /**
     * Parse single month P&L report into our data structure
     */
    parseMonthReport(profitLoss, periodDate) {
        const report = profitLoss.reports?.[0];
        if (!report) {
            throw new Error('No report found in Xero response');
        }

        const monthData = {
            period_date: periodDate,
            // Revenue
            revenue_b2b: 0,
            revenue_b2c: 0,
            revenue_accommodation: 0,
            revenue_other: 0,
            revenue_total: 0,
            // Cost of Sales
            cos_accommodation: 0,
            cos_transport: 0,
            cos_insurance: 0,
            cos_partner_payments: 0,
            cos_exam_fees: 0,
            cos_social: 0,
            cos_total: 0,
            // Fixed Expenses
            expense_rent: 0,
            expense_utilities: 0,
            expense_software: 0,
            expense_fixed_total: 0,
            // Variable Expenses
            expense_wages: 0,
            expense_marketing: 0,
            expense_variable_total: 0,
            // Derived
            gross_profit: 0,
            operating_profit: 0,
            net_income: 0,
            cash_on_hand: 0
        };

        // Parse rows recursively
        const processRows = (rows) => {
            for (const row of rows) {
                if (row.rowType === 'Section' && row.rows) {
                    processRows(row.rows);
                } else if (row.rowType === 'Row' && row.cells && row.cells[0]) {
                    const accountName = (row.cells[0].value || '').toLowerCase();
                    const value = parseFloat(row.cells[1]?.value || 0);

                    // Revenue mapping (using exact account names from dump)
                    if (accountName === 'general course sales') {
                        // For now put all course sales in B2C - we'll split later based on Fidelo data
                        monthData.revenue_b2c += value;
                    } else if (accountName === 'accomm & rental revenue') {
                        monthData.revenue_accommodation += value;
                    }

                    // Cost of Sales mapping
                    else if (accountName.includes('host pay')) {
                        monthData.cos_accommodation += value;
                    } else if (accountName.includes('apartment')) {
                        monthData.cos_accommodation += value;
                    } else if (accountName === 'transport') {
                        monthData.cos_transport += value;
                    } else if (accountName === 'student insurance') {
                        monthData.cos_insurance += value;
                    } else if (accountName === 'partner payments' || accountName === 'partner group social') {
                        monthData.cos_partner_payments += value;
                    } else if (accountName === 'exam fees') {
                        monthData.cos_exam_fees += value;
                    } else if (accountName === 'ulearn social' || accountName === 'social supplies') {
                        monthData.cos_social += value;
                    }

                    // Fixed Expenses
                    else if (accountName === 'rent') {
                        monthData.expense_rent += value;
                    } else if (accountName.includes('utils') || accountName.includes('power') || accountName.includes('light')) {
                        monthData.expense_utilities += value;
                    } else if (accountName === 'software / hosting') {
                        monthData.expense_software += value;
                    }

                    // Variable Expenses
                    else if (accountName === 'wages and salaries' || accountName === 'director salary') {
                        monthData.expense_wages += value;
                    } else if (accountName.includes('google ad') || accountName.includes('marketing') || accountName.includes('seo')) {
                        monthData.expense_marketing += value;
                    }
                }
            }
        };

        processRows(report.rows || []);

        // Calculate totals
        monthData.revenue_total = monthData.revenue_b2b + monthData.revenue_b2c +
                                  monthData.revenue_accommodation + monthData.revenue_other;

        monthData.cos_total = monthData.cos_accommodation + monthData.cos_transport +
                             monthData.cos_insurance + monthData.cos_partner_payments +
                             monthData.cos_exam_fees + monthData.cos_social;

        monthData.expense_fixed_total = monthData.expense_rent + monthData.expense_utilities +
                                       monthData.expense_software;

        monthData.expense_variable_total = monthData.expense_wages + monthData.expense_marketing;

        monthData.gross_profit = monthData.revenue_total - monthData.cos_total;
        monthData.operating_profit = monthData.gross_profit - monthData.expense_fixed_total -
                                    monthData.expense_variable_total;
        monthData.net_income = monthData.operating_profit;

        return monthData;
    }

    /**
     * Parse month date from Xero format
     */
    parseMonthDate(dateString) {
        // Xero returns dates like "January 2024" or "2024-01"
        const date = dayjs(dateString);
        if (date.isValid()) {
            return date.format('YYYY-MM-01');
        }

        // Try parsing month name
        const match = dateString.match(/(\w+)\s+(\d{4})/);
        if (match) {
            const monthName = match[1];
            const year = match[2];
            const date = dayjs(`${monthName} 1, ${year}`);
            return date.format('YYYY-MM-01');
        }

        throw new Error(`Could not parse date: ${dateString}`);
    }

    /**
     * Insert month data into database
     */
    async insertMonthData(connection, data) {
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
            data.revenue_b2b,
            data.revenue_b2c,
            data.revenue_accommodation,
            data.revenue_other,
            data.revenue_total,
            data.cos_accommodation,
            data.cos_transport,
            data.cos_insurance,
            data.cos_partner_payments,
            data.cos_exam_fees,
            data.cos_social,
            data.cos_total,
            data.expense_rent,
            data.expense_utilities,
            data.expense_software,
            data.expense_fixed_total,
            data.expense_wages,
            data.expense_marketing,
            data.expense_variable_total,
            data.gross_profit,
            data.operating_profit,
            data.net_income,
            data.cash_on_hand,
            'xero'
        ]);
    }
}

// Run if called directly
if (require.main === module) {
    const importer = new XeroImporter();
    importer.import2024Data()
        .then(() => {
            console.log('\n🚀 Next steps:');
            console.log('1. Go to: https://hub.ulearnschool.com/fins/scripts/model/dashboard.html');
            console.log('2. Create a scenario');
            console.log('3. Add drivers (hires, price changes, LTO discounts)');
            console.log('4. Generate forecast');
            console.log('5. Run LTO simulations\n');
            process.exit(0);
        })
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = XeroImporter;
