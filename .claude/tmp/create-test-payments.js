/**
 * Create 3 test payments on Booking 40066 (Student ID 29254)
 * Test payment_method_id mapping
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const FIDELO_API_TOKEN = process.env.FIDELO_API_TOKEN;
const FIDELO_API_BASE = 'https://ulearn.fidelo.com/api/1.0/ts';

async function createTestPayments() {
    try {
        console.log('═'.repeat(70));
        console.log('PAYMENT METHOD ID TEST');
        console.log('═'.repeat(70));
        console.log('\nBooking: 40066 (Student ID 29254 - Neil Test24)');
        console.log('Document: D2024453\n');

        const bookingId = 40066;

        const testPayments = [
            { methodId: 4, expected: 'Stripe' },
            { methodId: 5, expected: 'Credit Card' },
            { methodId: 2, expected: 'TransferMate' }
        ];

        console.log('Creating 3 test payments (€0.01 each)...\n');

        const results = [];

        for (const test of testPayments) {
            console.log(`📝 Creating payment with payment_method_id: ${test.methodId} (expecting "${test.expected}")...`);

            const paymentData = {
                inquiry_id: bookingId,
                school_id: 1,
                booking_id: bookingId,
                payment_date: '2025-11-29',
                payment_method_id: test.methodId,
                payment_amount: 0.01,
                payment_comment: `TEST method_id=${test.methodId} - DELETE ME`
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
                    console.log(`   ✅ Created Payment ID: ${response.data.payment_id}\n`);
                    results.push({
                        paymentId: response.data.payment_id,
                        methodId: test.methodId,
                        expected: test.expected
                    });
                } else {
                    console.log(`   ⚠️  Unexpected response:`, response.data, '\n');
                }
            } catch (error) {
                console.error(`   ❌ Failed:`, error.response?.data || error.message, '\n');
            }

            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log('═'.repeat(70));
        console.log('TEST SUMMARY');
        console.log('═'.repeat(70));
        console.log('\nBooking: D2024453 (ID: 40066)');
        console.log('Student: Neil Test24 (ID: 29254)');
        console.log('\n✅ Test Payments Created:\n');

        results.forEach(r => {
            console.log(`Payment ID ${r.paymentId}:`);
            console.log(`   payment_method_id: ${r.methodId}`);
            console.log(`   Expected Method Name: "${r.expected}"`);
            console.log('');
        });

        console.log('═'.repeat(70));
        console.log('NEXT STEP:');
        console.log('Check Fidelo UI for booking D2024453 (Neil Test24)');
        console.log('Look for 3 × €0.01 payments dated 29/11/2025');
        console.log('Verify which payment method NAME appears for each:');
        console.log('  - ID 4 should show: "Stripe"');
        console.log('  - ID 5 should show: "Credit Card"');
        console.log('  - ID 2 should show: "TransferMate"');
        console.log('═'.repeat(70));

    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

createTestPayments();
