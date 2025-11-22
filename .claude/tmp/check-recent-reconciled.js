// Check what was just reconciled via API
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const XeroAPIClient = require('../../scripts/xero/xero-client');

async function checkRecentReconciled() {
    const xero = new XeroAPIClient();

    try {
        console.log('🔍 Checking recently reconciled transactions via API...\n');

        // Get bank transactions reconciled in last hour
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
        const dateStr = oneHourAgo.toISOString().split('.')[0]; // Remove milliseconds

        console.log(`Looking for transactions updated since: ${dateStr}`);

        const where = `IsReconciled==true&&UpdatedDateUTC>=DateTime(${oneHourAgo.getFullYear()},${oneHourAgo.getMonth()+1},${oneHourAgo.getDate()},${oneHourAgo.getHours()},${oneHourAgo.getMinutes()},${oneHourAgo.getSeconds()})`;

        console.log(`Query: ${where}\n`);

        const response = await xero.getBankTransactions({ where, order: 'UpdatedDateUTC DESC' });

        if (!response.bankTransactions || response.bankTransactions.length === 0) {
            console.log('❌ No recently reconciled transactions found in last hour');

            // Try just today
            console.log('\n🔍 Trying all of today instead...');
            const today = new Date();
            const whereToday = `IsReconciled==true&&UpdatedDateUTC>=DateTime(${today.getFullYear()},${today.getMonth()+1},${today.getDate()})`;
            console.log(`Query: ${whereToday}\n`);

            const responseToday = await xero.getBankTransactions({ where: whereToday, order: 'UpdatedDateUTC DESC' });

            if (!responseToday.bankTransactions || responseToday.bankTransactions.length === 0) {
                console.log('❌ No reconciled transactions found today either');
                return;
            }

            console.log(`✅ Found ${responseToday.bankTransactions.length} transaction(s) reconciled today\n`);
            printTransactions(responseToday.bankTransactions);
            return;
        }

        console.log(`✅ Found ${response.bankTransactions.length} transaction(s) reconciled in last hour\n`);
        printTransactions(response.bankTransactions);

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
    }
}

function printTransactions(transactions) {
    console.log('='.repeat(80));

    transactions.forEach((tx, idx) => {
        const lineItem = tx.lineItems && tx.lineItems.length > 0 ? tx.lineItems[0] : null;
        const date = tx.date ? new Date(tx.date).toISOString().split('T')[0] : 'N/A';
        const updated = tx.updatedDateUTC ? new Date(tx.updatedDateUTC).toISOString() : 'N/A';

        console.log(`\n${idx + 1}. ${tx.type} Transaction:`);
        console.log(`   📅 Date: ${date}`);
        console.log(`   📝 Reference: ${tx.reference || 'N/A'}`);
        console.log(`   💶 Amount: €${tx.total}`);
        console.log(`   🏦 Bank Account: ${tx.bankAccount?.name || 'N/A'}`);
        console.log(`   \n   Reconciled To:`);
        console.log(`   👤 Contact: ${tx.contact?.name || 'N/A'}`);
        console.log(`   📊 Account Code: ${lineItem?.accountCode || 'N/A'}`);
        console.log(`   📋 Account Name: ${lineItem?.accountName || 'N/A'}`);
        console.log(`   ✍️  Description: ${lineItem?.description || 'N/A'}`);
        console.log(`   \n   ⏰ Last Updated: ${updated}`);
        console.log('-'.repeat(80));
    });

    console.log('\n✅ Check complete\n');
}

checkRecentReconciled();
