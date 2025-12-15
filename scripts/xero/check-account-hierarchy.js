/**
 * Check if Software/Hosting account has sub-accounts or parent/child structure
 */

const XeroAPIClient = require('./xero-client.js');

async function checkAccountHierarchy() {
    const xero = new XeroAPIClient();

    try {
        console.log(`\n================================================================================`);
        console.log(`CHECKING ACCOUNT HIERARCHY - SOFTWARE/HOSTING`);
        console.log(`================================================================================\n`);

        // Get all accounts
        const accounts = await xero.getAccounts();

        if (accounts && accounts.accounts) {
            console.log(`Total accounts: ${accounts.accounts.length}\n`);

            // Find software-related accounts
            const softwareAccounts = accounts.accounts.filter(acc => {
                const name = (acc.name || '').toLowerCase();
                return name.includes('software') || name.includes('hosting') ||
                       name.includes('zoho') || name.includes('hubspot') ||
                       name.includes('xero') || name.includes('fidelo') ||
                       acc.code === 'B106';
            });

            console.log(`Found ${softwareAccounts.length} software-related accounts:\n`);

            softwareAccounts.forEach(acc => {
                console.log(`\n${acc.name} (${acc.code})`);
                console.log(`  Type: ${acc.type}`);
                console.log(`  Class: ${acc.class}`);
                console.log(`  Status: ${acc.status}`);
                console.log(`  Tax Type: ${acc.taxType}`);
                console.log(`  Enable Payments: ${acc.enablePaymentsToAccount}`);
                console.log(`  Show In Expense Claims: ${acc.showInExpenseClaims}`);
                console.log(`  Account ID: ${acc.accountID}`);

                // Check for parent/child relationships
                if (acc.hasAttachments) console.log(`  Has Attachments: true`);
                if (acc.reportingCode) console.log(`  Reporting Code: ${acc.reportingCode}`);
                if (acc.reportingCodeName) console.log(`  Reporting Code Name: ${acc.reportingCodeName}`);

                // Additional fields that might indicate hierarchy
                console.log(`  Updated: ${acc.updatedDateUTC}`);

                // Full object for inspection
                console.log(`\n  Full object:`);
                console.log(JSON.stringify(acc, null, 4));
            });

            // Now check if there are expense accounts that might be children
            console.log(`\n\n=== ALL EXPENSE ACCOUNTS ===\n`);
            const expenseAccounts = accounts.accounts.filter(acc => acc.type === 'EXPENSE');
            console.log(`Total expense accounts: ${expenseAccounts.length}\n`);

            expenseAccounts.forEach(acc => {
                if (acc.code && acc.code.startsWith('B1')) { // B106 area
                    console.log(`${acc.code} - ${acc.name}`);
                }
            });
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response:', JSON.stringify(error.response.body, null, 2));
        }
    }
}

checkAccountHierarchy().catch(error => {
    console.error('Failed:', error.message);
    process.exit(1);
});
