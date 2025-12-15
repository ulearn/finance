/**
 * View detailed account breakdown for Software/Hosting
 * Using Account Transactions report or Trial Balance detail
 */

const XeroAPIClient = require('./xero-client.js');

async function viewAccountDetail(year) {
    const xero = new XeroAPIClient();

    try {
        console.log(`\n================================================================================`);
        console.log(`ACCOUNT DETAIL REPORT - SOFTWARE/HOSTING - ${year}`);
        console.log(`================================================================================\n`);

        const fromDate = `${year}-01-01`;
        const toDate = `${year}-12-31`;

        // Try getting TrialBalance with detail
        console.log('Fetching Trial Balance...\n');

        const trialBalance = await xero.getReport('TrialBalance', {
            date: toDate
        });

        if (trialBalance && trialBalance.reports && trialBalance.reports.length > 0) {
            const tb = trialBalance.reports[0];
            console.log('Trial Balance structure:');
            findSoftwareAccounts(tb.rows, 0);
        }

        // Try Account Transactions report specifically for Software/Hosting
        console.log('\n\nFetching Account Transactions report...\n');

        const accountTxns = await xero.getReport('AccountTransactions', {
            fromDate,
            toDate,
            accountID: null  // We'll need to find the account ID
        });

        console.log('Account Transactions:', JSON.stringify(accountTxns, null, 2).substring(0, 1000));

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response:', JSON.stringify(error.response.body, null, 2).substring(0, 500));
        }
    }
}

function findSoftwareAccounts(rows, depth) {
    if (!rows) return;

    rows.forEach(row => {
        const indent = '  '.repeat(depth);

        if (row.rowType === 'Section' && row.title) {
            const lower = (row.title || '').toLowerCase();
            if (lower.includes('expense') || lower.includes('operating')) {
                console.log(`${indent}[SECTION] ${row.title}`);
                if (row.rows) {
                    findSoftwareAccounts(row.rows, depth + 1);
                }
            }
        }

        if (row.rowType === 'Row' && row.cells && row.cells.length > 0) {
            const accountName = row.cells[0].value || '';
            const lowerName = accountName.toLowerCase();

            if (lowerName.includes('software') || lowerName.includes('hosting')) {
                console.log(`${indent}[ACCOUNT] ${accountName}`);

                // Show all cell values
                if (row.cells.length > 1) {
                    row.cells.forEach((cell, i) => {
                        if (i > 0 && cell.value) {
                            console.log(`${indent}  Cell ${i}: ${cell.value}`);
                        }
                    });
                }

                // Check for sub-rows
                if (row.rows && row.rows.length > 0) {
                    console.log(`${indent}  Has ${row.rows.length} sub-rows:`);
                    findSoftwareAccounts(row.rows, depth + 2);
                }
            }
        }
    });
}

// Run
const year = process.argv[2] || '2024';
viewAccountDetail(year).catch(error => {
    console.error('Failed:', error.message);
    process.exit(1);
});
