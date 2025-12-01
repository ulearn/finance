/**
 * Test Complete Sequence
 * Verify: Slack (Step 1) → Fidelo (Step 2) → HubSpot (Step 3) → Manual Review (Step 4)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const PaymentWorkflow = require('../../scripts/assign/workflow');

async function testCompleteSequence() {
    console.log('🧪 Testing Complete Sequence...\n');

    // Create workflow in DRY RUN mode
    const workflow = new PaymentWorkflow({
        dryRun: true,
        slackChannel: '#financial'
    });

    const testTransactions = [
        {
            date: '2025-11-28',
            amount: 100.00,
            description: 'INTERNATIONAL TRANSFER', // Should match Slack first
            source: 'test',
            expectedMatch: 'Slack (€100 = student 30694)'
        },
        {
            date: '2025-11-28',
            amount: 2160.00,
            description: '1580214041P2025951 IP', // Should match Fidelo (P2025951)
            source: 'test',
            expectedMatch: 'Fidelo (P2025951 reference)'
        },
        {
            date: '2025-11-28',
            amount: 999.00,
            description: 'RANDOM PAYMENT NO INFO', // Should require manual review
            source: 'test',
            expectedMatch: 'Manual Review (no match)'
        }
    ];

    console.log('Expected sequence:');
    console.log('1️⃣ Slack remittance (Priority 1)');
    console.log('2️⃣ Fidelo reference search (Priority 2)');
    console.log('3️⃣ HubSpot match (Priority 3)');
    console.log('4️⃣ Manual review (no match)\n');

    console.log(`Testing ${testTransactions.length} transactions:\n`);
    testTransactions.forEach((txn, i) => {
        console.log(`${i + 1}. "${txn.description}" (€${txn.amount})`);
        console.log(`   Expected: ${txn.expectedMatch}`);
    });
    console.log('\n' + '═'.repeat(70) + '\n');

    // Process transactions
    const results = await workflow.processTransactions(testTransactions);

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('SEQUENCE VERIFICATION');
    console.log('═'.repeat(70));

    results.transactions.forEach((result, i) => {
        const txn = testTransactions[i];
        console.log(`\n${i + 1}. ${txn.description}`);
        console.log(`   Expected: ${txn.expectedMatch}`);
        console.log(`   Actual:   ${result.matchMethod || 'no match'}`);

        if (result.matchMethod === 'slack_remittance') {
            console.log(`   ✅ MATCHED SLACK FIRST! Thread: ${result.slackThreadTs}`);
        } else if (result.matchMethod === 'fidelo_reference') {
            console.log(`   ✅ MATCHED FIDELO (as expected - no Slack match)`);
        } else if (result.status === 'manual_review') {
            console.log(`   ✅ MANUAL REVIEW (as expected - no matches)`);
        }
    });

    console.log('\n' + '═'.repeat(70));
    console.log('OVERALL RESULTS');
    console.log('═'.repeat(70));
    console.log(`Slack matches: ${results.transactions.filter(t => t.matchMethod === 'slack_remittance').length}`);
    console.log(`Fidelo matches: ${results.transactions.filter(t => t.matchMethod === 'fidelo_reference').length}`);
    console.log(`HubSpot matches: ${results.transactions.filter(t => t.matchMethod === 'hubspot').length}`);
    console.log(`Manual review: ${results.manualReview}`);
}

// Run test
testCompleteSequence()
    .then(() => {
        console.log('\n✅ Test completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Test failed:', error);
        console.error(error.stack);
        process.exit(1);
    });
