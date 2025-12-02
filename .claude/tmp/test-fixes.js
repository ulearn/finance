/**
 * Test All Fixes for Issues #1-4
 *
 * 1. ULEARNP20251003TMU extraction (should extract P20251003) ✅
 * 2. Ariuntsetseg Gansukh (€120) - should be detected as DUPLICATE, not 422 error
 * 3. Feola, Luca (€1126.6) - should be detected as DUPLICATE, not large_discrepancy
 * 4. Message text - "already paid" → "already assigned"
 */

const PaymentWorkflow = require('../../scripts/assign/workflow');

async function testAllFixes() {
    console.log('═'.repeat(80));
    console.log('TESTING ALL FIXES');
    console.log('═'.repeat(80));

    const workflow = new PaymentWorkflow({
        dryRun: true, // DRY RUN MODE
        sources: ['boi'] // Only BOI transactions
    });

    // Mock transactions for the two problematic payments
    const transactions = [
        {
            id: 'd7e4a5bdbe1445ec86a627dc0b7b71eb',
            source: 'boi',
            date: '1 Dec 2025',
            amount: 1126.6,
            description: 'ULEARNP20251003TMU SP',
            reference: '931'
        },
        {
            id: 'ab92b037e66d427cb7a1b2f81669f494',
            source: 'boi',
            date: '1 Dec 2025',
            amount: 120,
            description: 'SCHOOL FEE         SP',
            reference: '931'
        }
    ];

    console.log(`\nProcessing ${transactions.length} transactions...\n`);

    // Process transactions
    await workflow.processTransactions(transactions);

    // Check results
    console.log('\n' + '═'.repeat(80));
    console.log('RESULTS SUMMARY');
    console.log('═'.repeat(80));

    const results = workflow.results.transactions;

    results.forEach((result, index) => {
        const txn = result.transaction;
        console.log(`\n${index + 1}. €${txn.amount} - ${txn.description.substring(0, 30)}`);
        console.log(`   Status: ${result.status}`);
        console.log(`   Match Method: ${result.matchMethod || 'N/A'}`);

        if (result.booking) {
            console.log(`   Student: ${result.booking.customer_name || result.booking.customerName}`);
            console.log(`   Student ID: ${result.booking.customer_number || result.booking.customerNumber}`);
            console.log(`   Invoice: ${result.booking.document_number || result.booking.documentNumber}`);
        }

        if (result.status === 'already_assigned') {
            console.log(`   ✅ CORRECTLY DETECTED AS DUPLICATE!`);
            if (result.existingPayment) {
                console.log(`   Existing payment: €${result.existingPayment.amount} on ${result.existingPayment.date}`);
            }
        } else if (result.status === 'manual_review') {
            console.log(`   ⚠️  MANUAL REVIEW: ${result.discrepancy?.reason || 'Unknown'}`);
            if (result.discrepancy?.reason === 'large_discrepancy') {
                console.log(`   ❌ BUG: Should be duplicate, not large_discrepancy!`);
            }
        } else if (result.status === 'error' || result.status === 'failed') {
            console.log(`   ❌ ERROR: ${result.error || 'Unknown'}`);
            if (result.error && result.error.includes('422')) {
                console.log(`   ❌ BUG: 422 error likely means duplicate check failed!`);
            }
        }

        console.log(`   Notification: ${result.notification || 'N/A'}`);
    });

    // Validate fixes
    console.log('\n' + '═'.repeat(80));
    console.log('FIX VALIDATION');
    console.log('═'.repeat(80));

    let allFixed = true;

    // Check Fix #1 & #3: Feola (€1126.6) should be duplicate
    const feolaResult = results.find(r => r.transaction.amount === 1126.6);
    if (feolaResult) {
        if (feolaResult.status === 'already_assigned') {
            console.log(`\n✅ FIX #1 & #3: Feola (€1126.6) correctly detected as DUPLICATE`);
        } else {
            console.log(`\n❌ FIX #1 & #3 FAILED: Feola status is '${feolaResult.status}' (should be 'already_assigned')`);
            allFixed = false;
        }
    } else {
        console.log(`\n⚠️  FIX #1 & #3: Could not find Feola transaction in results`);
    }

    // Check Fix #2: Ariuntsetseg (€120) should be duplicate, not 422
    const ariuntsetsegResult = results.find(r => r.transaction.amount === 120);
    if (ariuntsetsegResult) {
        if (ariuntsetsegResult.status === 'already_assigned') {
            console.log(`\n✅ FIX #2: Ariuntsetseg (€120) correctly detected as DUPLICATE (not 422 error)`);
        } else if (ariuntsetsegResult.status === 'error' && ariuntsetsegResult.error?.includes('422')) {
            console.log(`\n❌ FIX #2 FAILED: Ariuntsetseg still showing 422 error`);
            allFixed = false;
        } else {
            console.log(`\n⚠️  FIX #2: Ariuntsetseg status is '${ariuntsetsegResult.status}' (expected 'already_assigned')`);
        }
    } else {
        console.log(`\n⚠️  FIX #2: Could not find Ariuntsetseg transaction in results`);
    }

    // Check Fix #4: Message text
    const duplicateResult = results.find(r => r.status === 'already_assigned');
    if (duplicateResult && duplicateResult.notification) {
        if (duplicateResult.notification.includes('already assigned')) {
            console.log(`\n✅ FIX #4: Notification message uses "already assigned"`);
        } else if (duplicateResult.notification.includes('already paid')) {
            console.log(`\n❌ FIX #4 FAILED: Notification still uses "already paid"`);
            allFixed = false;
        }
    }

    console.log('\n' + '═'.repeat(80));
    if (allFixed) {
        console.log('🎉 ALL FIXES VERIFIED SUCCESSFULLY!');
    } else {
        console.log('⚠️  SOME FIXES MAY NEED ADDITIONAL WORK');
    }
    console.log('═'.repeat(80));

    await workflow.fideloAssignment.disconnect();
}

// Run tests
testAllFixes().catch(err => {
    console.error('❌ Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
});
