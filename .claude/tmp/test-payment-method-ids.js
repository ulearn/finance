/**
 * Test Payment Method IDs
 * Student ID 29254 - Create 3 test payments to verify payment_method_id mapping
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const FIDELO_API_TOKEN = process.env.FIDELO_API_TOKEN;
const FIDELO_API_BASE = 'https://ulearn.fidelo.com/api/1.0/ts';

async function testPaymentMethodIds() {
    try {
        console.log('═'.repeat(70));
        console.log('PAYMENT METHOD ID TEST');
        console.log('═'.repeat(70));

        // Step 1: Find booking for Student ID 29254
        console.log('\n📋 Finding booking for Student ID 29254...\n');

        const bookingsResponse = await axios.get(`${FIDELO_API_BASE}/bookings`, {
            headers: {
                'Authorization': `Bearer ${FIDELO_API_TOKEN}`,
                'Accept': 'application/json'
            }
        });

        const bookings = bookingsResponse.data.entries || bookingsResponse.data;
        const userBooking = Object.values(bookings).find(b =>
            b.customer_number === 29254 || b.customer_number === '29254'
        );

        if (!userBooking) {
            console.error('❌ Booking not found for Student ID 29254');
            console.log('Searching first 10 bookings for customer_number field...');
            Object.values(bookings).slice(0, 10).forEach(b => {
                console.log(`  Booking ${b.id}: customer_number = ${b.customer_number}`);
            });
            return;
        }

        console.log('✅ Found booking:');
        console.log(`   Booking ID: ${userBooking.id}`);
        console.log(`   Student: ${userBooking.customer_firstname} ${userBooking.customer_lastname}`);
        console.log(`   Customer Number: ${userBooking.customer_number}`);
        console.log(`   Document: ${userBooking.document_number}`);
        console.log(`   Amount: €${userBooking.amount}`);
        console.log(`   Amount Open: €${userBooking.amount_open}`);

        const bookingId = userBooking.id;

        // Step 2: Create 3 test payments with different method IDs
        const testPayments = [
            { methodId: 4, methodName: 'Stripe (expected)' },
            { methodId: 5, methodName: 'Credit Card (expected)' },
            { methodId: 2, methodName: 'TransferMate (expected)' }
        ];

        console.log('\n📝 Creating test payments...\n');

        const results = [];

        for (const test of testPayments) {
            console.log(`Creating payment with method_id: ${test.methodId} (${test.methodName})...`);

            const paymentData = {
                inquiry_id: bookingId,
                school_id: 1,
                booking_id: bookingId,
                payment_date: '2025-11-29',
                payment_method_id: test.methodId,
                payment_amount: 0.01,
                payment_comment: `TEST payment_method_id=${test.methodId} - DELETE ME`
            };

            try {
                const response = await axios.post(
                    `${FIDELO_API_BASE}/payments`,
                    paymentData,
                    {
                        headers: {
                            'Authorization': `Bearer ${FIDELO_API_TOKEN}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        }
                    }
                );

                if (response.data.payment_id) {
                    console.log(`   ✅ Created payment ID: ${response.data.payment_id}`);
                    results.push({
                        paymentId: response.data.payment_id,
                        methodId: test.methodId,
                        expected: test.methodName
                    });
                } else {
                    console.log(`   ❌ Unexpected response:`, response.data);
                }
            } catch (error) {
                console.error(`   ❌ Failed:`, error.response?.data || error.message);
            }

            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log('\n' + '═'.repeat(70));
        console.log('TEST SUMMARY');
        console.log('═'.repeat(70));
        console.log(`\nBooking: ${userBooking.document_number} (ID: ${bookingId})`);
        console.log(`Student: ${userBooking.customer_firstname} ${userBooking.customer_lastname}`);
        console.log('\nTest Payments Created:\n');

        results.forEach(r => {
            console.log(`✅ Payment ID ${r.paymentId}:`);
            console.log(`   payment_method_id: ${r.methodId}`);
            console.log(`   Expected to show: "${r.expected}"`);
            console.log('');
        });

        console.log('═'.repeat(70));
        console.log('NEXT STEP: Check Fidelo UI for this booking');
        console.log(`Look for 3 × €0.01 payments dated 2025-11-29`);
        console.log(`Verify which payment method names appear`);
        console.log('═'.repeat(70));

    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
        if (error.response?.data) {
            console.error('Full error:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testPaymentMethodIds();
