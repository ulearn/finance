// Dump all account names from Xero P&L to see what we need to map
require('dotenv').config();
const XeroAPIClient = require('../xero/xero-client');

async function dumpAccounts() {
    const xeroClient = new XeroAPIClient();

    try {
        console.log('📊 Fetching P&L from Xero...\n');

        const profitLoss = await xeroClient.getReport('ProfitAndLoss', {
            fromDate: '2024-01-01',
            toDate: '2024-12-31'
        });

        const report = profitLoss.reports[0];
        const rows = report.rows || [];

        console.log('=== XERO ACCOUNT NAMES ===\n');

        function processRows(rows, indent = '') {
            for (const row of rows) {
                if (row.rowType === 'Section') {
                    console.log(`${indent}📁 SECTION: ${row.title}`);
                    if (row.rows) {
                        processRows(row.rows, indent + '  ');
                    }
                } else if (row.rowType === 'Row' && row.cells && row.cells[0]) {
                    const accountName = row.cells[0].value;
                    const value = row.cells[1]?.value || '0';
                    console.log(`${indent}  💰 ${accountName} = €${value}`);
                }
            }
        }

        processRows(rows);

        console.log('\n=== END ===\n');

    } catch (error) {
        console.error('Error:', error.message);
    }
}

dumpAccounts();
