// Get full detail of our recently reconciled transaction
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const XeroAPIClient = require('../../scripts/xero/xero-client');

async function getReconciledDetail() {
    const xero = new XeroAPIClient();

    try {
        console.log('🔍 Getting details of recently reconciled transaction...\n');

        // First, find the transaction we just reconciled
        const where = `IsReconciled==true&&UpdatedDateUTC>=DateTime(2025,11,21,13,0,0)&&Date==DateTime(2025,1,6)&&Total==12.5`;

        console.log(`Query: ${where}\n`);

        const response = await xero.getBankTransactions({ where });

        if (!response.bankTransactions || response.bankTransactions.length === 0) {
            console.log('❌ Transaction not found');
            return;
        }

        const tx = response.bankTransactions[0];
        console.log('✅ Found transaction!\n');
        console.log('='.repeat(80));
        console.log('\n📋 Full Transaction Details:\n');
        console.log(JSON.stringify(tx, null, 2));
        console.log('\n' + '='.repeat(80));

        console.log('\n\n📊 Summary:');
        console.log(`   Date: ${new Date(tx.date).toISOString().split('T')[0]}`);
        console.log(`   Type: ${tx.type}`);
        console.log(`   Amount: €${tx.total}`);
        console.log(`   Contact: ${tx.contact?.name || 'N/A'}`);
        console.log(`   Reference: ${tx.reference || 'N/A'}`);
        console.log(`   Status: ${tx.status}`);
        console.log(`   Is Reconciled: ${tx.isReconciled}`);
        console.log(`\n   Line Items (${tx.lineItems?.length || 0}):`);

        if (tx.lineItems && tx.lineItems.length > 0) {
            tx.lineItems.forEach((li, idx) => {
                console.log(`\n   ${idx + 1}.`);
                console.log(`      Account Code: ${li.accountCode || 'N/A'}`);
                console.log(`      Account Name: ${li.accountName || 'N/A'}`);
                console.log(`      Description: ${li.description || 'N/A'}`);
                console.log(`      Amount: €${li.lineAmount || 0}`);
                console.log(`      Tax Type: ${li.taxType || 'N/A'}`);
                console.log(`      Tax Amount: €${li.taxAmount || 0}`);
            });
        } else {
            console.log('      No line items found (this is unexpected!)');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
    }
}

getReconciledDetail();
