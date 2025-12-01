/**
 * Test Slack Remittance Matching (Slack-only path)
 * Transaction with NO Fidelo identifiers, should match by Slack amount
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const PaymentWorkflow = require('../../scripts/assign/workflow');

async function testSlackOnlyMatching() {
    console.log('🧪 Testing Slack-Only Remittance Matching...\n');

    // Create workflow in DRY RUN mode
    const workflow = new PaymentWorkflow({
        dryRun: true,
        slackChannel: '#financial'
    });

    // Test transaction with NO Fidelo identifiers
    // Amount €100 should match Slack remittance for student ID 30694 (Nandin)
    const testTransactions = [
        {
            date: '2025-11-28',
            amount: 100.00, // Matches Slack remittance
            description: 'INTERNATIONAL TRANSFER', // Generic description, no student info
            source: 'test'
        },
        {
            date: '2025-11-28',
            amount: 785.00, // Matches student ID 29804 (Lu, Enshi)
            description: 'WIRE TRANSFER FROM ABROAD',
            source: 'test'
        },
        {
            date: '2025-11-28',
            amount: 1575.85, // Matches student ID 30761 (Gantsooj)
            description: 'BANK TRANSFER',
            source: 'test'
        }
    ];

    console.log(`Testing ${testTransactions.length} generic transactions (no student ID in description):\n`);
    testTransactions.forEach((txn, i) => {
        console.log(`${i + 1}. "${txn.description}" (€${txn.amount})`);
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
        console.log(`\n${i + 1}. ${result.transaction.description} (€${result.transaction.amount})`);
        console.log(`   Status: ${result.status}`);
        console.log(`   Match method: ${result.matchMethod || 'none'}`);
        if (result.slackMessageId) {
            console.log(`   ✅ SLACK MATCH FOUND!`);
            console.log(`   Slack message ID: ${result.slackMessageId}`);
            console.log(`   Thread timestamp: ${result.slackThreadTs}`);
            console.log(`   Would post notification as REPLY to this thread`);
        }
        if (result.booking) {
            console.log(`   Booking ID: ${result.booking.bookingId}`);
            console.log(`   Student: ${result.booking.studentName}`);
        }
    });
}

// Run test
testSlackOnlyMatching()
    .then(() => {
        console.log('\n✅ Test completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Test failed:', error);
        console.error(error.stack);
        process.exit(1);
    });
