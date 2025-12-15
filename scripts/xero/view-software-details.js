/**
 * View detailed breakdown of Software/Hosting account
 */

const XeroAPIClient = require('./xero-client.js');

async function viewSoftwareDetails(year) {
    const xero = new XeroAPIClient();

    try {
        console.log(`\n================================================================================`);
        console.log(`SOFTWARE/HOSTING ACCOUNT DETAILS - ${year}`);
        console.log(`================================================================================\n`);

        const fromDate = `${year}-01-01`;
        const toDate = `${year}-12-31`;

        // Get P&L with tracking categories to see breakdown
        const report = await xero.getReport('ProfitAndLoss', {
            fromDate,
            toDate,
            periods: 11,
            timeframe: 'MONTH',
            standardLayout: false,
            trackingCategoryID: null,
            trackingOptionID: null
        });

        if (report && report.reports && report.reports.length > 0) {
            const pl = report.reports[0];

            // Find Software/Hosting and show all sub-items
            findAndDisplaySoftware(pl.rows, 0);
        }

        console.log('\n\nNow fetching account details...\n');

        // Get the account details
        const accounts = await xero.getAccounts({
            where: 'Name.Contains("Software")'
        });

        if (accounts && accounts.accounts) {
            console.log(`Found ${accounts.accounts.length} matching accounts:`);
            accounts.accounts.forEach(acc => {
                console.log(`  - ${acc.name} (Code: ${acc.code}, Type: ${acc.type})`);
                if (acc.hasAttachments) console.log(`    Has attachments`);
            });
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response:', JSON.stringify(error.response.body, null, 2));
        }
    }
}

function findAndDisplaySoftware(rows, depth) {
    if (!rows) return;

    rows.forEach(row => {
        const indent = '  '.repeat(depth);

        if (row.rowType === 'Section' && row.title) {
            console.log(`${indent}[SECTION] ${row.title}`);
        }

        if (row.rowType === 'Row' && row.cells && row.cells.length > 0) {
            const accountName = row.cells[0].value || '';
            const lowerName = accountName.toLowerCase();

            // Show software-related items
            if (lowerName.includes('software') || lowerName.includes('hosting') ||
                lowerName.includes('zoho') || lowerName.includes('hubspot') ||
                lowerName.includes('xero') || lowerName.includes('fidelo')) {

                console.log(`${indent}[ACCOUNT] ${accountName}`);

                // Show monthly values
                if (row.cells.length > 1) {
                    const values = [];
                    for (let i = 1; i <= 12 && i < row.cells.length; i++) {
                        const val = row.cells[i].value || 0;
                        if (val !== 0) {
                            values.push(`Month ${i}: €${val}`);
                        }
                    }
                    if (values.length > 0) {
                        console.log(`${indent}  ${values.join(', ')}`);
                    }
                }
            }
        }

        if (row.rows) {
            findAndDisplaySoftware(row.rows, depth + 1);
        }
    });
}

// Run
const year = process.argv[2] || '2024';
viewSoftwareDetails(year).catch(error => {
    console.error('Failed:', error.message);
    process.exit(1);
});
