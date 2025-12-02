/**
 * Test Auto-Confirmation Feature
 *
 * Tests the auto-confirmation of unconfirmed students when payment is received
 *
 * Test Case: Student 30785 (Ariuntsetseg Gansukh)
 * - Invoice: P20251025
 * - Amount: €120
 * - Expected: Student should be auto-confirmed before payment assignment
 */

const FideloAssignmentHandler = require('./fidelo-assign');

async function testAutoConfirmation() {
    console.log('🧪 Testing Auto-Confirmation Feature\n');
    console.log('Test Case: Student 30785 (Ariuntsetseg Gansukh)');
    console.log('Invoice: P20251025, Amount: €120\n');
    console.log('═'.repeat(70));

    const handler = new FideloAssignmentHandler();

    // Mock booking object for Student 30785
    const mockBooking = {
        id: 17629,  // Booking ID for Ariuntsetseg
        bookingId: 17629,
        customer_number: 30785,
        customerNumber: 30785,
        customer_name: 'Gansukh, Ariuntsetseg',
        customerName: 'Gansukh, Ariuntsetseg',
        document_number: 'P20251025',
        documentNumber: 'P20251025'
    };

    // Mock transaction
    const mockTransaction = {
        date: '2025-12-01',
        amount: 120,
        description: 'ARIUNTSETSEG GANSUKH GANBAT ULEARN ENGLISH SCHOOL',
        source: 'boi'
    };

    try {
        console.log('\n1️⃣  Checking if student is confirmed...');
        const isConfirmed = await handler.isBookingConfirmed(mockBooking.bookingId);

        if (isConfirmed) {
            console.log('   ✅ Student is already confirmed');
            console.log('   ℹ️  No auto-confirmation needed');
        } else {
            console.log('   ⚠️  Student is UNCONFIRMED');
            console.log('   🔄 Testing auto-confirmation logic...\n');

            console.log('2️⃣  Confirming student...');
            const confirmed = await handler.confirmBooking(
                mockBooking.bookingId,
                mockBooking.customerName
            );

            if (confirmed) {
                console.log('   ✅ Student successfully confirmed!\n');

                console.log('3️⃣  Verifying confirmation status...');
                const verifyConfirmed = await handler.isBookingConfirmed(mockBooking.bookingId);

                if (verifyConfirmed) {
                    console.log('   ✅ Confirmation verified - student is now confirmed');
                } else {
                    console.log('   ❌ Verification failed - student still unconfirmed');
                }
            } else {
                console.log('   ❌ Failed to confirm student');
            }
        }

        console.log('\n' + '═'.repeat(70));
        console.log('✨ Test completed successfully\n');

        console.log('Next Step: Test payment assignment with auto-confirmation');
        console.log('Run: node scripts/assign/test-payment-with-confirm.js\n');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await handler.disconnect();
    }
}

// Run test
testAutoConfirmation();
