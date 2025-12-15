/**
 * View P&L report to identify account names for advertising and software costs
 */

const XeroAPIClient = require('./xero-client.js');

async function viewPLAccounts(year) {
    const xero = new XeroAPIClient();

    try {
        console.log(`\n================================================================================`);
        console.log(`VIEWING PROFIT & LOSS ACCOUNTS - ${year}`);
        console.log(`================================================================================\n`);

        const fromDate = `${year}-01-01`;
        const toDate = `${year}-12-31`;

        console.log(`Fetching P&L from ${fromDate} to ${toDate}...\n`);

        const report = await xero.getReport('ProfitAndLoss', {
            fromDate,
            toDate,
            standardLayout: false
        });

        if (report && report.reports && report.reports.length > 0) {
            const pl = report.reports[0];
            console.log(`Report: ${pl.reportName}`);
            console.log(`Report ID: ${pl.reportID}`);
            console.log(`Report Date: ${pl.updatedDateUTC}\n`);

            // Show all account names
            console.log('ALL ACCOUNTS IN P&L:\n');
            console.log('================================================================================\n');

            extractAllAccounts(pl.rows, 0);
        }

    } catch (error) {
        console.error(`Error:`, error.message);
        if (error.response) {
            console.error('API Response:', JSON.stringify(error.response.body, null, 2));
        }
        throw error;
    }
}

function extractAllAccounts(rows, indent = 0) {
    if (!rows) return;

    rows.forEach(row => {
        const indentStr = '  '.repeat(indent);

        if (row.rowType === 'Section') {
            console.log(`${indentStr}[SECTION] ${row.title || 'Unnamed Section'}`);
            if (row.rows) {
                extractAllAccounts(row.rows, indent + 1);
            }
        } else if (row.rowType === 'Row') {
            const accountName = (row.cells && row.cells[0] && row.cells[0].value) || 'Unnamed';
            const value = (row.cells && row.cells[1] && row.cells[1].value) || '0';
            console.log(`${indentStr}  • ${accountName}: €${value}`);
        } else if (row.rowType === 'SummaryRow') {
            const label = (row.cells && row.cells[0] && row.cells[0].value) || 'Summary';
            const value = (row.cells && row.cells[1] && row.cells[1].value) || '0';
            console.log(`${indentStr}  [TOTAL] ${label}: €${value}`);
        }

        if (row.rows) {
            extractAllAccounts(row.rows, indent + 1);
        }
    });
}

// Run
const year = process.argv[2] || '2024';
viewPLAccounts(year).catch(error => {
    console.error('Failed:', error.message);
    process.exit(1);
});
