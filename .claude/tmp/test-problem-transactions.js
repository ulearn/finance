/**
 * Test Problem Transactions
 *
 * 1. ULEARNP20251003TMU SP (€1126.6) - Feola, Luca
 * 2. SCHOOL FEE SP (€120) - Ariuntsetseg Gansukh
 */

const FideloSearcher = require('../../scripts/assign/fidelo-search');
const FideloAssignmentHandler = require('../../scripts/assign/fidelo-assign');

async function testProblematicTransactions() {
    console.log('═'.repeat(70));
    console.log('TESTING PROBLEMATIC TRANSACTIONS');
    console.log('═'.repeat(70));

    const searcher = new FideloSearcher();
    const handler = new FideloAssignmentHandler();

    // ===================================================================
    // TEST 1: ULEARNP20251003TMU SP (€1126.6) - Feola, Luca
    // ===================================================================
    console.log('\n1️⃣  TEST: ULEARNP20251003TMU SP (€1126.6) - Feola, Luca');
    console.log('─'.repeat(70));

    const txn1 = {
        description: 'ULEARNP20251003TMU SP',
        date: '1 Dec 2025',
        amount: 1126.6,
        reference: '931',
        source: 'boi'
    };

    console.log('\n📋 Transaction Details:');
    console.log(`   Description: ${txn1.description}`);
    console.log(`   Amount: €${txn1.amount}`);
    console.log(`   Date: ${txn1.date}`);

    console.log('\n🔍 Step 1: Extract References');
    const refs1 = searcher.extractReferences(txn1.description);
    console.log(`   Extracted: ${JSON.stringify(refs1)}`);

    if (refs1.length > 0) {
        console.log('\n🔍 Step 2: Search Fidelo for Reference');
        for (const ref of refs1) {
            console.log(`   Searching for: ${ref}`);
            const booking = await searcher.searchByReference(ref);

            if (booking) {
                console.log(`   ✅ Found booking:`);
                console.log(`      ID: ${booking.id}`);
                console.log(`      Customer: ${booking.customer_name || booking.customerName}`);
                console.log(`      Student ID: ${booking.customer_number || booking.customerNumber}`);
                console.log(`      Invoice: ${booking.document_number || booking.documentNumber}`);
                console.log(`      Amount Open: €${booking.amount_open || booking.amountOpen}`);

                // Check for duplicates
                console.log('\n🔍 Step 3: Check for Duplicate Payments');
                const studentId = booking.customer_number || booking.customerNumber;
                const duplicateCheck = await handler.checkForDuplicatePaymentByStudentId(
                    studentId,
                    booking,
                    txn1.amount,
                    txn1.date,
                    5 // 5 days tolerance
                );

                if (duplicateCheck.exists) {
                    console.log(`   ♻️  DUPLICATE FOUND!`);
                    console.log(`      Payment ID: ${duplicateCheck.matchedPayment.id}`);
                    console.log(`      Amount: €${duplicateCheck.matchedPayment.amount}`);
                    console.log(`      Date: ${duplicateCheck.matchedPayment.date}`);
                    console.log(`      Days Difference: ${duplicateCheck.matchedPayment.daysDifference}`);
                    console.log(`      Amount Difference: €${duplicateCheck.matchedPayment.amountDifference || 0}`);
                } else {
                    console.log(`   ❌ No duplicate found`);
                    console.log(`   ⚠️  This should probably be a duplicate!`);
                }
            } else {
                console.log(`   ❌ No booking found for: ${ref}`);
            }
        }
    }

    // ===================================================================
    // TEST 2: SCHOOL FEE SP (€120) - Ariuntsetseg Gansukh
    // ===================================================================
    console.log('\n\n2️⃣  TEST: SCHOOL FEE SP (€120) - Ariuntsetseg Gansukh');
    console.log('─'.repeat(70));

    const txn2 = {
        description: 'SCHOOL FEE         SP',
        date: '1 Dec 2025',
        amount: 120,
        reference: '931',
        source: 'boi'
    };

    console.log('\n📋 Transaction Details:');
    console.log(`   Description: ${txn2.description}`);
    console.log(`   Amount: €${txn2.amount}`);
    console.log(`   Date: ${txn2.date}`);

    console.log('\n🔍 Step 1: Extract References');
    const refs2 = searcher.extractReferences(txn2.description);
    console.log(`   Extracted: ${JSON.stringify(refs2)}`);

    if (refs2.length === 0) {
        console.log('   ⚠️  No structured references found');
        console.log('\n🔍 Step 2: Search by Student ID (from test files: 30785)');

        const booking = await searcher.searchByReference('30785');

        if (booking) {
            console.log(`   ✅ Found booking:`);
            console.log(`      ID: ${booking.id}`);
            console.log(`      Customer: ${booking.customer_name || booking.customerName}`);
            console.log(`      Student ID: ${booking.customer_number || booking.customerNumber}`);
            console.log(`      Invoice: ${booking.document_number || booking.documentNumber}`);
            console.log(`      Confirmed: ${booking.confirmed}`);

            console.log('\n🔍 Step 3: Test Date Conversion');
            const convertedDate = handler.convertToYMD(txn2.date);
            console.log(`   Original: ${txn2.date}`);
            console.log(`   Converted: ${convertedDate}`);

            console.log('\n🔍 Step 4: Test Payment Assignment (DRY RUN)');
            try {
                const result = await handler.assignPaymentWithChecks(
                    txn2,
                    booking,
                    {
                        paymentMethodId: 2, // Bank Transfer
                        paymentMethodName: 'Bank Transfer',
                        dryRun: true // DRY RUN
                    }
                );

                console.log(`   Result:`, JSON.stringify(result, null, 2));
            } catch (error) {
                console.error(`   ❌ Error:`, error.message);
                if (error.response) {
                    console.error(`   HTTP Status:`, error.response.status);
                    console.error(`   Response Data:`, JSON.stringify(error.response.data, null, 2));
                }
            }
        } else {
            console.log(`   ❌ No booking found for student ID 30785`);
        }
    }

    console.log('\n' + '═'.repeat(70));
    console.log('TEST COMPLETE');
    console.log('═'.repeat(70));

    await handler.disconnect();
}

// Run tests
testProblematicTransactions().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
