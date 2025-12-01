/**
 * LIVE MODE - Actually creates payments in Fidelo
 *
 * WARNING: This will create real payments!
 */

const PaymentAssignmentWorkflow = require('../../scripts/assign/workflow');

async function runLiveConfirmed() {
    console.log('═══════════════════════════════════════════');
    console.log('⚠️  LIVE MODE - CREATING REAL PAYMENTS ⚠️');
    console.log('═══════════════════════════════════════════\n');

    const workflow = new PaymentAssignmentWorkflow({
        dryRun: false,  // LIVE MODE - will create payments!
        slackChannel: '#financial'
    });

    const startDate = '2025-11-27';
    const endDate = '2025-11-30';

    console.log(`Fetching transactions from ${startDate} to ${endDate}...\n`);

    const transactions = await workflow.fetchAllTransactions(startDate, endDate);

    if (transactions.length === 0) {
        console.log('⚠️  No transactions found');
        return;
    }

    console.log(`Processing ${transactions.length} transaction(s) in LIVE mode...\n`);

    const results = await workflow.processTransactions(transactions);

    console.log('\n✅ Live run complete!');
    console.log('\nPlease verify in Fidelo:');
    console.log('  https://ulearn.fidelo.com/admin');
}

runLiveConfirmed()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
