/**
 * Test Ariuntsetseg 422 Error
 *
 * Student ID: 30785
 * Invoice: P20251025
 * Amount: €120
 * Date: 2025-12-01
 *
 * Goal: Capture the exact 422 error response from Fidelo API
 */

const FideloAssignmentHandler = require('./fidelo-assign');

async function test422Error() {
    console.log('🔍 Testing Ariuntsetseg €120 Payment Assignment\n');
    console.log('Student ID: 30785');
    console.log('Invoice: P20251025');
    console.log('Amount: €120');
    console.log('Date: 2025-12-01\n');
    console.log('═'.repeat(70));

    const handler = new FideloAssignmentHandler();

    // Mock transaction for Ariuntsetseg
    const mockTransaction = {
        date: '2025-12-01',
        amount: 120,
        description: 'SCHOOL FEE         SP',
        reference: '931',
        source: 'boi'
    };

    // Mock booking for Ariuntsetseg
    const mockBooking = {
        bookingId: 41695,
        id: 41695,
        customerNumber: 30785,
        customer_number: 30785,
        customerName: 'Gansukh, Ariuntsetseg',
        customer_name: 'Gansukh, Ariuntsetseg',
        documentNumber: 'P20251025',
        document_number: 'P20251025',
        confirmed: true
    };

    try {
        console.log('\n📤 Attempting to assign payment...\n');

        const result = await handler.assignPaymentWithChecks(
            mockTransaction,
            mockBooking,
            {
                paymentMethodId: 2, // Bank Transfer (method ID 2 in Fidelo)
                paymentMethodName: 'Bank Transfer',
                dryRun: false // LIVE mode
            }
        );

        if (result.success) {
            console.log('\n✅ SUCCESS: Payment assigned!');
            console.log('   Payment ID:', result.paymentId);
        } else {
            console.log('\n❌ FAILED: Payment assignment failed');
            console.log('   Error:', result.error);
            if (result.errorDetails) {
                console.log('   Error Details:', JSON.stringify(result.errorDetails, null, 2));
            }
            if (result.errorStatus) {
                console.log('   HTTP Status:', result.errorStatus);
            }
        }

    } catch (error) {
        console.error('\n❌ Uncaught Error:', error.message);
        console.error(error.stack);
    } finally {
        await handler.disconnect();
    }

    console.log('\n' + '═'.repeat(70));
}

// Run test
test422Error();
