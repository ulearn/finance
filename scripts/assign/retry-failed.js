#!/usr/bin/env node
/**
 * Retry Failed Payment Assignments
 *
 * Reads tracker file and retries transactions with status='failed'
 */

const PaymentWorkflow = require('./workflow');
const fs = require('fs').promises;
const path = require('path');

async function main() {
    console.log('🔄 RETRY FAILED PAYMENTS');
    console.log('═'.repeat(70));

    // Load tracker file
    const trackerFile = path.join(__dirname, '2025/12-dec-tracker.json');
    const data = JSON.parse(await fs.readFile(trackerFile, 'utf8'));

    // Find all failed transactions
    const allTxns = [...data.transactions.boi, ...data.transactions.stripe, ...data.transactions.revolut];
    const failed = allTxns.filter(t => t.assignStatus === 'failed');

    console.log(`\nFound ${failed.length} failed transaction(s) to retry\n`);

    if (failed.length === 0) {
        console.log('✅ No failed transactions to retry');
        process.exit(0);
    }

    // Show what will be retried
    failed.forEach((t, i) => {
        console.log(`${i+1}. €${t.amount} - ${t.description || t.customerName} (Student ${t.fideloStudentId})`);
    });

    console.log('\n⏳ Starting in 3 seconds...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Create workflow with rate limiting
    const workflow = new PaymentWorkflow({
        dryRun: false,
        slackChannel: '#financial',
        apiDelay: 2000  // 2 seconds between requests
    });

    // Fetch all transactions again to get fresh data
    const startDate = '2025-11-01';
    const endDate = '2025-11-30';

    // Load BOI transactions
    const xeroReconFile = path.join(__dirname, '../xero/recon/2025/11-nov-txns.json');
    const xeroData = JSON.parse(await fs.readFile(xeroReconFile, 'utf8'));
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

    // Fetch all transactions
    const allTransactions = await workflow.fetchAllTransactions(startDate, endDate, xeroTransactions);

    // Filter to only retry failed ones
    const toRetry = allTransactions.filter(txn =>
        failed.some(f => f.id === txn.id && f.source === txn.source)
    );

    console.log(`\n📋 Retrying ${toRetry.length} transactions with 2s delay...\n`);

    let retryResults = { success: 0, failed: 0, other: 0 };

    for (const txn of toRetry) {
        console.log(`\n${'─'.repeat(70)}`);
        console.log(`Retrying: "${txn.description}" (€${txn.amount})`);
        console.log('─'.repeat(70));

        try {
            const result = await workflow.processTransaction(txn);

            // Update tracker
            if (txn.id && txn.source) {
                const statusMap = {
                    'success': 'assigned',
                    'already_assigned': 'duplicate',
                    'manual_review': 'review',
                    'underpayment': 'assigned',
                    'error': 'failed',
                    'failed': 'failed'
                };
                const trackerStatus = statusMap[result.status] || 'failed';

                await workflow.tracker.updateStatus(txn.source, txn.id, trackerStatus, {
                    fideloPaymentId: result.payment?.paymentId,
                    fideloStudentId: result.booking?.customerNumber || result.booking?.customer_number,
                    fideloInvoice: result.booking?.documentNumber || result.booking?.document_number,
                    notes: result.notification || result.error
                });
            }

            if (result.status === 'success' || result.status === 'underpayment') {
                retryResults.success++;
            } else if (result.status === 'error' || result.status === 'failed') {
                retryResults.failed++;
            } else {
                retryResults.other++;
            }

            // Wait 2s before next
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            retryResults.failed++;
        }
    }

    console.log('\n' + '═'.repeat(70));
    console.log('RETRY SUMMARY');
    console.log('═'.repeat(70));
    console.log(`✅ Success: ${retryResults.success}`);
    console.log(`❌ Failed: ${retryResults.failed}`);
    console.log(`ℹ️  Other: ${retryResults.other}`);
}

main()
    .then(() => {
        console.log('\n✅ Retry completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Retry failed:', error);
        console.error(error.stack);
        process.exit(1);
    });
