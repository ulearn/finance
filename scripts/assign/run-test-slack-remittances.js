#!/usr/bin/env node
/**
 * Test Run: Process Slack Remittances (Nov 19-28, 2025)
 *
 * Purpose: Test the incoming payments workflow against the recent Slack remittances
 * posted to #financial channel during Nov 19-28, 2025
 *
 * Usage:
 *   node scripts/incomings/run-test-slack-remittances.js --dry-run    # Test mode (no payments created)
 *   node scripts/incomings/run-test-slack-remittances.js --live       # LIVE mode (creates payments)
 */

const PaymentWorkflow = require('./workflow');

async function main() {
    const args = process.argv.slice(2);
    const isDryRun = !args.includes('--live');

    console.log('═'.repeat(70));
    console.log('TEST RUN: Slack Remittances (Nov 19-28, 2025)');
    console.log('═'.repeat(70));

    if (isDryRun) {
        console.log('🧪 DRY RUN MODE - No payments will be created');
        console.log('   To go live: node scripts/incomings/run-test-slack-remittances.js --live\n');
    } else {
        console.log('🚨 LIVE MODE - Payments will be created in Fidelo!');
        console.log('   Press Ctrl+C within 5 seconds to cancel...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Date range covering Slack remittances
    // Widen slightly to Nov 17-28 to catch any edge cases
    const startDate = '2025-11-17';
    const endDate = '2025-11-28';

    console.log(`📅 Processing payments from ${startDate} to ${endDate}`);
    console.log(`   (Covers Slack remittances posted Nov 19-28)\n`);

    // Create workflow
    const workflow = new PaymentWorkflow({
        dryRun: isDryRun,
        slackChannel: '#financial'
    });

    // Fetch transactions from all DATA SOURCES (Stripe, Revolut, BOI via Xero)
    console.log('📥 Fetching transactions from all DATA SOURCES...');
    console.log('   - Stripe (info@ + neil@ accounts)');
    console.log('   - Revolut Merchant');
    console.log('   - BOI via Xero (if provided)\n');

    const transactions = await workflow.fetchAllTransactions(startDate, endDate, []);

    if (transactions.length === 0) {
        console.log('ℹ️  No transactions found for this date range');
        console.log('   Check if:');
        console.log('   - Stripe API keys are configured (.env)');
        console.log('   - Revolut API key is configured (.env)');
        console.log('   - Date range is correct');
        process.exit(0);
    }

    console.log(`✅ Found ${transactions.length} transaction(s)\n`);

    // Process transactions using CRM/GUIDES (Slack, HubSpot) to match to students
    console.log('🔄 Processing will use CRM/GUIDES for matching:');
    console.log('   Priority 1: Slack #financial remittances');
    console.log('   Priority 2: Fidelo direct search (references, name+amount)');
    console.log('   Priority 3: HubSpot cross-reference\n');

    const results = await workflow.processTransactions(transactions);

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('📊 FINAL SUMMARY - Slack Remittances Test');
    console.log('═'.repeat(70));
    console.log(`Mode: ${isDryRun ? 'DRY RUN' : '🔴 LIVE'}`);
    console.log(`Date Range: ${startDate} to ${endDate}`);
    console.log(`Total: ${results.total}`);
    console.log(`✅ Success: ${results.success}`);
    console.log(`⚠️  Underpayment: ${results.underpayment}`);
    console.log(`♻️  Already Assigned: ${results.alreadyAssigned}`);
    console.log(`🚫 Manual Review: ${results.manualReview}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log('═'.repeat(70));

    // Show breakdown by match method
    console.log('\n📋 Match Method Breakdown:');
    const matchMethods = {
        slack_remittance: 0,
        fidelo_reference: 0,
        fidelo_name_amount: 0,
        hubspot: 0,
        manual_review: 0,
        already_assigned: 0
    };

    results.transactions.forEach(txn => {
        const method = txn.matchMethod || txn.status;
        if (matchMethods.hasOwnProperty(method)) {
            matchMethods[method]++;
        }
    });

    console.log(`   Slack Remittance: ${matchMethods.slack_remittance}`);
    console.log(`   Fidelo Reference: ${matchMethods.fidelo_reference}`);
    console.log(`   Fidelo Name+Amount: ${matchMethods.fidelo_name_amount}`);
    console.log(`   HubSpot: ${matchMethods.hubspot}`);
    console.log(`   Already Assigned: ${matchMethods.already_assigned}`);
    console.log(`   Manual Review: ${matchMethods.manual_review}`);

    if (isDryRun) {
        console.log('\n💡 To run in LIVE mode: node scripts/incomings/run-test-slack-remittances.js --live');
    }

    console.log('\n✅ Test completed successfully');
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Test failed:', error);
        console.error(error.stack);
        process.exit(1);
    });
