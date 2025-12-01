/**
 * Post example summary to Slack based on the previous live run
 */

const SlackNotifier = require('../../scripts/slack/notify');

async function postExampleSummary() {
    const notifier = new SlackNotifier();

    // Simulate the results from the previous live run
    const results = {
        total: 2,
        success: 1,
        underpayment: 0,
        alreadyAssigned: 1,
        manualReview: 0,
        failed: 0,
        transactions: [
            {
                transaction: { amount: 108, description: 'Stripe: Laia Padros', date: '2025-11-28' },
                status: 'success',
                booking: { studentName: 'Laia Padros', customerNumber: '30737' },
                payment: { paymentId: 37027 }
            },
            {
                transaction: { amount: 250, description: 'Stripe: Giacomo Ferri', date: '2025-11-28' },
                status: 'already_assigned',
                booking: { studentName: 'Chiara Pelliccia', customerNumber: '30779' },
                existingPayment: { invoice: 'P20251016' }
            }
        ]
    };

    console.log('📤 Posting example summary to #financial...\n');

    // Build summary message
    const summaryText = `📊 Incoming Payments Summary\n\n` +
        `Total: ${results.total}\n` +
        `✅ Success: ${results.success}\n` +
        `⚠️ Underpayments: ${results.underpayment}\n` +
        `♻️ Already Assigned: ${results.alreadyAssigned}\n` +
        `🚫 Manual Review: ${results.manualReview}\n` +
        `❌ Failed: ${results.failed}\n\n` +
        `_Detail in Thread =>_`;

    // Post summary
    const summaryResponse = await notifier.sendMessage('#financial', summaryText);
    const summaryTs = summaryResponse?.timestamp;

    if (!summaryTs) {
        console.error('❌ Failed to get summary timestamp');
        return;
    }

    console.log(`✅ Summary posted (ts: ${summaryTs})`);
    console.log('\n📝 Building detailed transaction list...\n');

    // Build detailed transaction list
    let detailText = `📋 *Transaction Details:*\n`;

    results.transactions.forEach((result, index) => {
        const txn = result.transaction;
        const statusEmoji = {
            'success': '✅',
            'underpayment': '⚠️',
            'already_assigned': '♻️',
            'manual_review': '🚫',
            'error': '❌',
            'failed': '❌'
        }[result.status] || '❓';

        const studentName = result.booking?.studentName || 'Unknown';
        const studentId = result.booking?.customerNumber || result.booking?.customer_number || '—';

        detailText += `\n${index + 1}. ${statusEmoji} €${txn.amount} - ${studentName}`;

        // Add status-specific details
        if (result.status === 'success') {
            detailText += `\n   Student ID: ${studentId} | Payment ID: ${result.payment?.paymentId || 'N/A'}`;
        } else if (result.status === 'already_assigned') {
            detailText += `\n   Student ID: ${studentId} | Duplicate (already paid)`;
        } else if (result.status === 'underpayment') {
            const diff = result.discrepancy?.difference?.toFixed(2) || '0.00';
            detailText += `\n   Student ID: ${studentId} | Shortfall: €${diff}`;
        } else if (result.status === 'manual_review') {
            detailText += `\n   Needs review: ${result.discrepancy?.reason || 'Unknown reason'}`;
        } else if (result.status === 'error' || result.status === 'failed') {
            detailText += `\n   Error: ${result.error || 'Unknown error'}`;
        }
    });

    console.log('Detail text to post:\n');
    console.log(detailText);
    console.log('\n📤 Posting as threaded reply...\n');

    // Post detailed list as threaded reply
    await notifier.sendMessage('#financial', detailText, null, summaryTs);

    console.log('\n✅ Example posted to Slack!');
    console.log('Check #financial channel to see the threaded summary.');
}

postExampleSummary()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('Error:', error);
        process.exit(1);
    });
