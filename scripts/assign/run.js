#!/usr/bin/env node
/**
 * Payment Assignment Runner
 *
 * Run payment assignment for a date range or today (if no dates specified)
 *
 * Usage:
 *   node run.js --live                                    # Process today (LIVE mode)
 *   node run.js                                           # Process today (DRY RUN)
 *   node run.js --start 2025-12-02 --end 2025-12-05      # Date range (DRY RUN)
 *   node run.js --start 2025-12-02 --end 2025-12-05 --live  # Date range (LIVE mode)
 */

const PaymentWorkflow = require('./workflow');
const fs = require('fs').promises;
const path = require('path');

async function main() {
    const args = process.argv.slice(2);

    // Parse arguments
    let startDate = null;
    let endDate = null;
    const isDryRun = !args.includes('--live');

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--start' && args[i + 1]) {
            startDate = args[i + 1];
        }
        if (args[i] === '--end' && args[i + 1]) {
            endDate = args[i + 1];
        }
    }

    // Smart date detection: If no dates specified, process from last tracked date to today
    if (!startDate) {
        const AssignmentTracker = require('./tracker');
        const tracker = new AssignmentTracker();

        // Find the last transaction date across all tracker files
        let lastProcessedDate = null;

        try {
            // Check current month
            const currentData = await tracker.loadAssignments();
            const allTxns = [
                ...currentData.transactions.boi,
                ...currentData.transactions.stripe,
                ...currentData.transactions.revolut
            ];

            // Find most recent transaction date
            if (allTxns.length > 0) {
                const dates = allTxns.map(t => {
                    // Parse date string to comparable format
                    let d = t.date;
                    if (d.match(/\d{1,2}\s+\w{3}\s+\d{4}/)) {
                        d = new Date(d);
                    } else if (d.match(/\d{4}-\d{2}-\d{2}/)) {
                        d = new Date(d);
                    }
                    return d;
                }).filter(d => !isNaN(d.getTime()));

                if (dates.length > 0) {
                    const mostRecent = new Date(Math.max(...dates));
                    lastProcessedDate = mostRecent.toISOString().split('T')[0];
                }
            }

            // Also check previous month
            const now = new Date();
            const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const prevMonthDate = prevMonth.toISOString().split('T')[0];
            const prevData = await tracker.loadAssignments(prevMonthDate);
            const prevTxns = [
                ...prevData.transactions.boi,
                ...prevData.transactions.stripe,
                ...prevData.transactions.revolut
            ];

            if (prevTxns.length > 0) {
                const dates = prevTxns.map(t => {
                    let d = t.date;
                    if (d.match(/\d{1,2}\s+\w{3}\s+\d{4}/)) {
                        d = new Date(d);
                    } else if (d.match(/\d{4}-\d{2}-\d{2}/)) {
                        d = new Date(d);
                    }
                    return d;
                }).filter(d => !isNaN(d.getTime()));

                if (dates.length > 0) {
                    const mostRecent = new Date(Math.max(...dates));
                    const prevDateStr = mostRecent.toISOString().split('T')[0];
                    if (!lastProcessedDate || prevDateStr > lastProcessedDate) {
                        lastProcessedDate = prevDateStr;
                    }
                }
            }
        } catch (error) {
            console.log(`   ℹ️  Could not read tracker history: ${error.message}`);
        }

        if (lastProcessedDate) {
            // Start from day AFTER last processed
            const nextDay = new Date(lastProcessedDate);
            nextDay.setDate(nextDay.getDate() + 1);
            startDate = nextDay.toISOString().split('T')[0];
            console.log(`   📅 Last processed: ${lastProcessedDate}`);
            console.log(`   ▶️  Starting from: ${startDate}\n`);
        } else {
            // No history - start from 7 days ago
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            startDate = weekAgo.toISOString().split('T')[0];
            console.log(`   ℹ️  No tracker history found`);
            console.log(`   ▶️  Starting from 7 days ago: ${startDate}\n`);
        }
    }

    // Default end date to today
    if (!endDate) {
        endDate = new Date().toISOString().split('T')[0];
    }

    console.log('='.repeat(60));
    console.log('Payment Assignment - Date Range');
    console.log('='.repeat(60));

    if (isDryRun) {
        console.log('🧪 DRY RUN MODE - No payments will be created');
        console.log('   To go live: add --live flag\n');
    } else {
        console.log('🚨 LIVE MODE - Payments will be created in Fidelo!');
        console.log('   Press Ctrl+C within 5 seconds to cancel...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    console.log(`📅 Processing payments from ${startDate} to ${endDate}\n`);

    // Create workflow
    const workflow = new PaymentWorkflow({
        dryRun: isDryRun,
        slackChannel: '#financial'
    });

    // Load Xero/BOI transactions from recon files
    let xeroTransactions = [];
    try {
        // Determine which month(s) we need to load based on date range
        const startMonth = new Date(startDate).getMonth() + 1;
        const endMonth = new Date(endDate).getMonth() + 1;
        const year = new Date(startDate).getFullYear();

        // Load all relevant months
        const monthsToLoad = new Set();
        for (let m = startMonth; m <= endMonth; m++) {
            monthsToLoad.add(m);
        }

        const monthNames = ['', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

        for (const month of monthsToLoad) {
            const monthName = monthNames[month];
            const xeroFile = path.join(__dirname, `../xero/recon/${year}/${month}-${monthName}-txns.json`);

            try {
                const xeroData = JSON.parse(await fs.readFile(xeroFile, 'utf8'));
                const monthTransactions = (xeroData.transactions || [])
                    .filter(t => t.type === 'RECEIVE')
                    .map(t => ({
                        date: t.date,
                        amount: parseFloat((t.amountReceived || t.amount || '0').replace(/,/g, '')),
                        description: t.description,
                        reference: t.reference,
                        source: 'boi',
                        id: t.dataId
                    }));

                xeroTransactions.push(...monthTransactions);
                console.log(`   ✅ Loaded ${monthTransactions.length} Xero/BOI transactions from ${monthName}-${year}`);
            } catch (err) {
                console.log(`   ℹ️  No Xero recon file for ${monthName}-${year}`);
            }
        }
    } catch (error) {
        console.log(`   ⚠️  Error loading Xero transactions: ${error.message}`);
    }

    // Fetch transactions from all sources
    console.log('📥 Fetching transactions from all sources...');
    const transactions = await workflow.fetchAllTransactions(startDate, endDate, xeroTransactions);

    if (transactions.length === 0) {
        console.log(`ℹ️  No transactions found for ${startDate} to ${endDate}`);
        process.exit(0);
    }

    console.log(`✅ Found ${transactions.length} transaction(s)\n`);

    // Process transactions (includes summary/Slack notification)
    const results = await workflow.processTransactions(transactions);

    console.log('\n✅ Workflow complete');
    console.log(`Date Range: ${startDate} to ${endDate}`);
    console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log('');
}

main().catch(error => {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
});
