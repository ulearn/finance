/**
 * DRY-RUN Test - Shows what would happen without creating payments
 */

const PaymentAssignmentWorkflow = require('../../scripts/assign/workflow');

async function runDryRun() {
    console.log('═══════════════════════════════════════════');
    console.log('DRY-RUN TEST - REFACTORED WORKFLOW');
    console.log('═══════════════════════════════════════════\n');

    const workflow = new PaymentAssignmentWorkflow({
        dryRun: true,  // SAFE - won't create payments
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

    console.log(`Processing ${transactions.length} transaction(s) in DRY-RUN mode...\n`);

    const results = await workflow.processTransactions(transactions);

    console.log('\n✅ Dry-run complete - No payments were created');
    console.log('\nIf this looks correct, run LIVE mode with:');
    console.log('  node .claude/tmp/run-live-confirmed.js');
}

runDryRun()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
