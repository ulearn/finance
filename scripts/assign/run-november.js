#!/usr/bin/env node
/**
 * Run Incoming Payments Workflow for November 2025
 *
 * Usage:
 *   node scripts/incomings/run-november.js --dry-run    # Test mode
 *   node scripts/incomings/run-november.js --live       # LIVE mode
 */

const PaymentWorkflow = require('./workflow');
const fs = require('fs').promises;
const path = require('path');

async function main() {
    const args = process.argv.slice(2);
    const isDryRun = !args.includes('--live');

    if (isDryRun) {
        console.log('🧪 DRY RUN MODE - No payments will be created');
        console.log('   To go live: node scripts/incomings/run-november.js --live\n');
    } else {
        console.log('🚨 LIVE MODE - Payments will be created in Fidelo!');
        console.log('   Press Ctrl+C within 5 seconds to cancel...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    const startDate = '2025-11-01';
    const endDate = '2025-11-30';

    console.log(`📅 Processing November 2025: ${startDate} to ${endDate}\n`);

    // Load BOI transactions from Xero recon file
    console.log('📥 Loading BOI transactions from Xero recon file...');
    const xeroReconFile = path.join(__dirname, '../xero/recon/2025/11-nov-txns.json');
    const xeroData = JSON.parse(await fs.readFile(xeroReconFile, 'utf8'));

    // Transform to workflow format and filter RECEIVE only
    const xeroTransactions = xeroData.transactions
        .filter(t => t.type === 'RECEIVE')
        .map(t => ({
            date: t.date,
            amount: parseFloat(t.amountReceived.replace(/,/g, '')),
            description: t.description,
            reference: t.reference,
            source: 'boi',
            id: t.dataId
        }));

    console.log(`✅ Loaded ${xeroTransactions.length} BOI RECEIVE transactions\n`);

    // Create workflow
    const workflow = new PaymentWorkflow({
        dryRun: isDryRun,
        slackChannel: '#financial'
    });

    // Fetch transactions from all sources (pass BOI transactions)
    console.log('📥 Fetching Stripe and Revolut transactions...\n');
    const transactions = await workflow.fetchAllTransactions(startDate, endDate, xeroTransactions);

    if (transactions.length === 0) {
        console.log('ℹ️  No transactions found for November');
        process.exit(0);
    }

    console.log(`✅ Found ${transactions.length} transaction(s)\n`);

    // SYNC TO TRACKER FIRST - create records for all transactions
    console.log('💾 Syncing all transactions to tracker...');
    const boiTransactions = transactions.filter(t => t.source === 'boi');
    const stripeTransactions = transactions.filter(t => t.source === 'stripe');
    const revolutTransactions = transactions.filter(t => t.source === 'revolut');

    const syncResults = await workflow.tracker.syncAllSources({
        boiTransactions: boiTransactions,
        stripeTransactions: stripeTransactions,
        revolutTransactions: revolutTransactions
    });

    console.log(`✅ Synced to tracker: BOI=${syncResults.boi}, Stripe=${syncResults.stripe}, Revolut=${syncResults.revolut}\n`);

    // Process transactions
    const results = await workflow.processTransactions(transactions);

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('📊 FINAL SUMMARY - NOVEMBER 2025');
    console.log('═'.repeat(70));
    console.log(`Mode: ${isDryRun ? 'DRY RUN' : '🔴 LIVE'}`);
    console.log(`Date Range: ${startDate} to ${endDate}`);
    console.log(`Total: ${results.total}`);
    console.log(`✅ Success: ${results.success}`);
    console.log(`⚠️  Underpayment: ${results.underpayment}`);
    console.log(`♻️  Already Assigned: ${results.alreadyAssigned}`);
    console.log(`🚫 Manual Review: ${results.manualReview}`);
    console.log(`❌ Failed: ${results.failed}`);

    if (isDryRun) {
        console.log('\n💡 To run in LIVE mode: node scripts/incomings/run-november.js --live');
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
