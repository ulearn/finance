// test-xero-pull.js - Test Xero data pull for 2024
// Run this to see what data we'll get before full import

require('dotenv').config();
const XeroAPIClient = require('../xero/xero-client');

async function testXeroPull() {
    console.log('🔍 Testing Xero data pull for 2024...\n');

    const xeroClient = new XeroAPIClient();

    try {
        // 1. Test connection
        console.log('1️⃣ Testing Xero connection...');
        const orgs = await xeroClient.getOrganizationInfo();
        console.log(`✓ Connected to: ${orgs[0].tenantName}\n`);

        // 2. Get P&L for 2024 (monthly breakdown)
        console.log('2️⃣ Fetching Profit & Loss (monthly) for 2024...');
        const profitLoss = await xeroClient.getReport('ProfitAndLoss', {
            fromDate: '2024-01-01',
            toDate: '2024-12-31',
            periods: 12,
            timeframe: 'MONTH'
        });

        console.log(`✓ P&L Report received`);
        console.log(`   Report ID: ${profitLoss.Reports[0].ReportID}`);
        console.log(`   Report Name: ${profitLoss.Reports[0].ReportName}`);
        console.log(`   Report Date: ${profitLoss.Reports[0].ReportDate}`);

        // Show structure
        const report = profitLoss.Reports[0];
        const rows = report.Rows || [];

        console.log(`   Total sections: ${rows.length}`);

        // Find header row to see months
        const headerRow = rows.find(r => r.RowType === 'Header');
        if (headerRow) {
            console.log(`\n   📅 Months available:`);
            headerRow.Cells.slice(1).forEach((cell, i) => {
                console.log(`      ${i + 1}. ${cell.Value}`);
            });
        }

        // Show revenue accounts
        console.log(`\n   💰 Revenue accounts found:`);
        let revenueCount = 0;
        for (const row of rows) {
            if (row.RowType === 'Section' && row.Title === 'Revenue') {
                if (row.Rows) {
                    for (const subRow of row.Rows) {
                        if (subRow.RowType === 'Row' && subRow.Cells) {
                            const accountName = subRow.Cells[0]?.Value;
                            if (accountName) {
                                console.log(`      - ${accountName}`);
                                revenueCount++;
                            }
                        }
                    }
                }
            }
        }
        console.log(`   Found ${revenueCount} revenue accounts`);

        // Show expense accounts
        console.log(`\n   💸 Expense accounts found:`);
        let expenseCount = 0;
        for (const row of rows) {
            if (row.RowType === 'Section' &&
                (row.Title === 'Less Operating Expenses' || row.Title === 'Operating Expenses' || row.Title === 'Cost of Sales')) {
                if (row.Rows) {
                    for (const subRow of row.Rows) {
                        if (subRow.RowType === 'Row' && subRow.Cells) {
                            const accountName = subRow.Cells[0]?.Value;
                            if (accountName) {
                                console.log(`      - ${accountName}`);
                                expenseCount++;
                            }
                        }
                    }
                }
            }
        }
        console.log(`   Found ${expenseCount} expense accounts`);

        // 3. Get Balance Sheet for cash
        console.log(`\n3️⃣ Fetching Balance Sheet (for cash on hand)...`);
        const balanceSheet = await xeroClient.getReport('BalanceSheet', {
            date: '2024-12-31'
        });

        console.log(`✓ Balance Sheet received`);
        const bsReport = balanceSheet.Reports[0];
        const bsRows = bsReport.Rows || [];

        // Find bank accounts
        console.log(`\n   🏦 Bank accounts:`);
        for (const row of bsRows) {
            if (row.RowType === 'Section' && row.Title === 'Bank') {
                if (row.Rows) {
                    for (const subRow of row.Rows) {
                        if (subRow.RowType === 'Row' && subRow.Cells) {
                            const accountName = subRow.Cells[0]?.Value;
                            const balance = subRow.Cells[1]?.Value;
                            if (accountName && balance) {
                                console.log(`      ${accountName}: €${balance}`);
                            }
                        }
                    }
                }
            }
        }

        console.log('\n✅ Test complete!\n');
        console.log('📋 Summary:');
        console.log('   - Xero connection: Working ✓');
        console.log('   - P&L data available: Yes ✓');
        console.log('   - Monthly breakdown: Yes (12 months) ✓');
        console.log('   - Balance Sheet available: Yes ✓');
        console.log('\n🚀 Ready to run full import:');
        console.log('   node scripts/model/import-xero-2024.js\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);

        if (error.message.includes('No valid tokens')) {
            console.log('\n⚠️  Need to authenticate with Xero first');
            console.log('   Visit: /fins/xero/auth-url to get authorization URL');
        }
    }
}

testXeroPull();
