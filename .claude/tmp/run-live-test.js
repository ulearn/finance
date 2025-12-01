/**
 * Live Test - Refactored Workflow
 *
 * SAFETY FEATURES:
 * - Processes only 1-2 recent transactions
 * - Shows what will happen before creating payments
 * - Confirms before proceeding
 */

const PaymentAssignmentWorkflow = require('../../scripts/assign/workflow');
const StripeIntegration = require('../../scripts/stripe/api');
const RevolutIntegration = require('../../scripts/revolut/api');

async function runLiveTest() {
    console.log('═══════════════════════════════════════════');
    console.log('LIVE TEST - REFACTORED WORKFLOW');
    console.log('═══════════════════════════════════════════\n');

    // Fetch recent transactions (last 3 days)
    const startDate = '2025-11-27'; // 3 days ago
    const endDate = '2025-11-30';   // Today

    console.log(`📅 Fetching transactions from ${startDate} to ${endDate}...\n`);

    try {
        // Fetch from Stripe and Revolut
        const stripe = new StripeIntegration();
        const revolut = new RevolutIntegration();

        const [stripeTransactions, revolutTransactions] = await Promise.all([
            stripe.getTransactionsFromAllAccounts(startDate, endDate).catch(() => []),
            revolut.getTransactions(startDate, endDate).catch(() => [])
        ]);

        const allTransactions = [...stripeTransactions, ...revolutTransactions];

        console.log(`Found ${allTransactions.length} transaction(s):\n`);

        if (allTransactions.length === 0) {
            console.log('⚠️  No transactions found in date range');
            console.log('   Try expanding the date range or checking API connections');
            return;
        }

        // Show transactions
        allTransactions.forEach((txn, i) => {
            console.log(`${i + 1}. €${txn.amount} - ${txn.description}`);
            console.log(`   Date: ${txn.date} | Source: ${txn.source}`);
        });

        console.log('\n' + '─'.repeat(70));
        console.log('\n⚠️  LIVE MODE - This will CREATE real payments in Fidelo!');
        console.log('\nWhat the workflow will do:');
        console.log('  1. Try to match each transaction (Slack/Fidelo/HubSpot)');
        console.log('  2. Check for duplicates across ALL invoices for Student ID');
        console.log('  3. If duplicate found → SKIP (status: already_assigned)');
        console.log('  4. If no duplicate → CREATE payment in Fidelo');
        console.log('\n⚠️  Expected behavior:');
        console.log('  - Lu, Enshi €785 → Should be detected as DUPLICATE');
        console.log('  - New payments → Should be created successfully');
        console.log('\n' + '─'.repeat(70));
        console.log('\nTo proceed with LIVE mode, run:');
        console.log('  node .claude/tmp/run-live-confirmed.js');
        console.log('\nOr to run in DRY-RUN mode first, run:');
        console.log('  node .claude/tmp/run-dry-run.js');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    }
}

// Run
runLiveTest()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
