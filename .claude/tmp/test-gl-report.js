// Test General Ledger Detail report
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const XeroAPIClient = require('../../scripts/xero/xero-client');

async function testGLReport() {
    const xero = new XeroAPIClient();

    try {
        console.log('🔍 Testing General Ledger Detail report...\n');

        // According to Xero docs, GL Detail report ID needs to be discovered
        // Let's try the generic getReportFromId with common GL report names

        // First, let's try getting bank account transactions report
        console.log('Attempting: Bank Account Transactions report for January 2025\n');

        const method = async () => {
            // Using the generic report endpoint with bank statement parameters
            const response = await xero.xero.accountingApi.getReportFromId(
                xero.tenantId,
                'bank-statement' // Common report ID pattern
            );
            return response.body;
        };

        try {
            const report = await xero.makeApiCall(method);
            console.log('✅ Report structure:');
            console.log(JSON.stringify(report, null, 2));
        } catch (err) {
            console.log('❌ bank-statement failed:', err.message);

            // Try alternative: Use Account Transactions endpoint instead
            console.log('\n🔄 Trying alternative: Get Account Transactions for B127 (Bank Fees)...\n');

            // Get the B127 account first
            const accountsResponse = await xero.getAccounts({ where: 'Code=="B127"' });

            if (accountsResponse.accounts && accountsResponse.accounts.length > 0) {
                const accountId = accountsResponse.accounts[0].accountID;
                console.log(`✅ Found B127 account: ${accountsResponse.accounts[0].name}`);
                console.log(`   Account ID: ${accountId}\n`);

                // Get ALL bank transactions in January where line items include B127
                console.log('🔍 Getting all bank transactions in January 2025...\n');

                const method2 = async () => {
                    const response = await xero.xero.accountingApi.getBankTransactions(
                        xero.tenantId,
                        null, // ifModifiedSince
                        `Date>=DateTime(2025,1,1)&&Date<=DateTime(2025,1,31)`,
                        'Date DESC'
                    );
                    return response.body;
                };

                const txResponse = await xero.makeApiCall(method2);

                // Filter to only show transactions with B127 in line items
                const b127Transactions = txResponse.bankTransactions?.filter(tx =>
                    tx.lineItems?.some(li => li.accountCode === 'B127')
                ) || [];

                if (b127Transactions.length > 0) {
                    console.log(`✅ Found ${b127Transactions.length} transaction(s) coded to B127 in January 2025:\n`);
                    console.log('='.repeat(80));

                    b127Transactions.forEach((tx, idx) => {
                        const lineItem = tx.lineItems?.find(li => li.accountCode === 'B127');
                        console.log(`\n${idx + 1}. ${new Date(tx.date).toISOString().split('T')[0]} - ${tx.type}`);
                        console.log(`   💶 Total Amount: €${tx.total}`);
                        console.log(`   👤 Contact: ${tx.contact?.name || 'N/A'}`);
                        console.log(`   📊 Account: ${lineItem?.accountCode || 'N/A'} - ${lineItem?.accountName || 'N/A'}`);
                        console.log(`   ✍️  Description: ${lineItem?.description || 'N/A'}`);
                        console.log(`   💰 Line Amount: €${lineItem?.lineAmount || 0}`);
                        console.log(`   📋 Tax Type: ${lineItem?.taxType || 'N/A'}`);

                        if (tx.lineItems && tx.lineItems.length > 1) {
                            console.log(`   ℹ️  Note: Transaction has ${tx.lineItems.length} line items`);
                        }
                        console.log('-'.repeat(80));
                    });
                } else {
                    console.log(`❌ No transactions coded to B127 found in January 2025`);
                    console.log(`   Total January transactions: ${txResponse.bankTransactions?.length || 0}`);
                }
            } else {
                console.log('❌ Could not find B127 account');
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
    }
}

testGLReport();
