/**
 * Debug monthly P&L structure to see how data is organized
 */

const XeroAPIClient = require('./xero-client.js');
const fs = require('fs');

async function debugMonthlyPL(year) {
    const xero = new XeroAPIClient();

    try {
        const fromDate = `${year}-01-01`;
        const toDate = `${year}-12-31`;

        console.log(`Fetching monthly P&L for ${year}...\n`);

        const report = await xero.getReport('ProfitAndLoss', {
            fromDate,
            toDate,
            periods: 11,
            timeframe: 'MONTH',
            standardLayout: false
        });

        // Save full report to file for inspection
        fs.writeFileSync(`pl-monthly-${year}.json`, JSON.stringify(report, null, 2));
        console.log(`✓ Full report saved to pl-monthly-${year}.json`);

        if (report && report.reports && report.reports.length > 0) {
            const pl = report.reports[0];

            // Find a sample row to see structure
            function findSampleRow(rows, accountName) {
                for (const row of rows) {
                    if (row.rowType === 'Row' && row.cells) {
                        const name = row.cells[0]?.value || '';
                        if (name.toLowerCase().includes(accountName.toLowerCase())) {
                            console.log(`\nFound account: ${name}`);
                            console.log(`Number of cells: ${row.cells.length}`);
                            console.log(`Cells:`, JSON.stringify(row.cells, null, 2));
                            return true;
                        }
                    }
                    if (row.rows && findSampleRow(row.rows, accountName)) {
                        return true;
                    }
                }
                return false;
            }

            console.log('\n\nLooking for Google Ad account...');
            findSampleRow(pl.rows, 'google ad');
        }

    } catch (error) {
        console.error('Error:', error.message);
        throw error;
    }
}

const year = process.argv[2] || '2024';
debugMonthlyPL(year);
