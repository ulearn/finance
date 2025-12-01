/**
 * Test Slack Remittance Matching
 * Test the workflow's ability to match transactions to Slack remittances
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const PaymentWorkflow = require('../../scripts/assign/workflow');

async function testSlackRemittanceMatching() {
    console.log('🧪 Testing Slack Remittance Matching...\n');

    // Create workflow in DRY RUN mode
    const workflow = new PaymentWorkflow({
        dryRun: true,
        slackChannel: '#financial'
    });

    // Test transaction that should match student ID 30737 (Padros, Laia)
    // We'll test different amounts to see what matches
    const testTransactions = [
        {
            date: '2025-11-28',
            amount: 108.00, // Exact amount if mentioned in Slack
            description: 'Test payment - should match 30737',
            source: 'test'
        },
        {
            date: '2025-11-28',
            amount: 100.00, // Different amount
            description: 'Padros payment', // Name in description
            source: 'test'
        },
        {
            date: '2025-11-28',
            amount: 250.00, // Random amount
            description: '30737 Student payment', // Student ID in description
            source: 'test'
        }
    ];

    console.log(`Testing ${testTransactions.length} transactions:\n`);
    testTransactions.forEach((txn, i) => {
        console.log(`${i + 1}. ${txn.description} (€${txn.amount})`);
    });
    console.log('\n' + '═'.repeat(70) + '\n');

    // Process transactions
    const results = await workflow.processTransactions(testTransactions);

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('TEST RESULTS SUMMARY');
    console.log('═'.repeat(70));
    console.log(`Total transactions: ${results.total}`);
    console.log(`Slack matches: ${results.transactions.filter(t => t.matchMethod === 'slack_remittance').length}`);
    console.log(`Success: ${results.success}`);
    console.log(`Manual review: ${results.manualReview}`);
    console.log(`Already assigned: ${results.alreadyAssigned}`);
    console.log(`Failed: ${results.failed}`);

    console.log('\n📋 Detailed Results:');
    results.transactions.forEach((result, i) => {
        console.log(`\n${i + 1}. ${result.transaction.description}`);
        console.log(`   Status: ${result.status}`);
        console.log(`   Match method: ${result.matchMethod || 'none'}`);
        if (result.slackMessageId) {
            console.log(`   Slack message ID: ${result.slackMessageId}`);
            console.log(`   Would post reply to thread: ${result.slackThreadTs}`);
        }
        if (result.booking) {
            console.log(`   Booking ID: ${result.booking.bookingId}`);
            console.log(`   Student: ${result.booking.studentName}`);
        }
    });
}

// Run test
testSlackRemittanceMatching()
    .then(() => {
        console.log('\n✅ Test completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Test failed:', error);
        console.error(error.stack);
        process.exit(1);
    });
