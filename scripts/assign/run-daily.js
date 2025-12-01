#!/usr/bin/env node
/**
 * Daily Incoming Payments Workflow
 * Run this script to process today's incoming payments
 *
 * Usage:
 *   node scripts/incomings/run-daily.js --dry-run    # Test mode (no payments created)
 *   node scripts/incomings/run-daily.js --live       # LIVE mode (creates payments)
 */

const PaymentWorkflow = require('./workflow');

async function main() {
    const args = process.argv.slice(2);
    const isDryRun = !args.includes('--live');

    if (isDryRun) {
        console.log('🧪 DRY RUN MODE - No payments will be created');
        console.log('   To go live: node scripts/incomings/run-daily.js --live\n');
    } else {
        console.log('🚨 LIVE MODE - Payments will be created in Fidelo!');
        console.log('   Press Ctrl+C within 5 seconds to cancel...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Calculate date range (today)
    const today = new Date();
    const startDate = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const endDate = startDate;

    console.log(`📅 Processing payments from ${startDate} to ${endDate}\n`);

    // Create workflow
    const workflow = new PaymentWorkflow({
        dryRun: isDryRun,
        slackChannel: '#financial'
    });

    // Fetch transactions from all sources
    console.log('📥 Fetching transactions from all sources...');
    const transactions = await workflow.fetchAllTransactions(startDate, endDate, []);

    if (transactions.length === 0) {
        console.log('ℹ️  No transactions found for today');
        process.exit(0);
    }

    console.log(`✅ Found ${transactions.length} transaction(s)\n`);

    // Process transactions
    const results = await workflow.processTransactions(transactions);

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('📊 FINAL SUMMARY');
    console.log('═'.repeat(70));
    console.log(`Mode: ${isDryRun ? 'DRY RUN' : '🔴 LIVE'}`);
    console.log(`Date: ${startDate}`);
    console.log(`Total: ${results.total}`);
    console.log(`✅ Success: ${results.success}`);
    console.log(`⚠️  Underpayment: ${results.underpayment}`);
    console.log(`♻️  Already Assigned: ${results.alreadyAssigned}`);
    console.log(`🚫 Manual Review: ${results.manualReview}`);
    console.log(`❌ Failed: ${results.failed}`);

    if (isDryRun) {
        console.log('\n💡 To run in LIVE mode: node scripts/incomings/run-daily.js --live');
    }
}

main()
    .then(() => {
        console.log('\n✅ Workflow completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Workflow failed:', error);
        console.error(error.stack);
        process.exit(1);
    });
