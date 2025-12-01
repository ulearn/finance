/**
 * Create 13 test payments (IDs 0-12) to map ALL payment methods
 * Booking: 40066 (Student ID 29254 - Neil Test24)
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const FIDELO_API_TOKEN = process.env.FIDELO_API_TOKEN;
const FIDELO_API_BASE = 'https://ulearn.fidelo.com/api/1.0/ts';

async function createAllTests() {
    try {
        const bookingId = 40066;

        console.log('═'.repeat(70));
        console.log('COMPLETE PAYMENT METHOD MAPPING TEST');
        console.log('═'.repeat(70));
        console.log(`\nBooking: 40066 (Student ID 29254 - Neil Test24)`);
        console.log(`Creating 13 test payments (IDs 0-12)...\n`);

        const results = [];

        for (let methodId = 0; methodId <= 12; methodId++) {
            console.log(`Creating payment with payment_method_id: ${methodId}...`);

            const paymentData = {
                inquiry_id: bookingId,
                school_id: 1,
                booking_id: bookingId,
                payment_date: '2025-11-29',
                payment_method_id: methodId,
                payment_amount: 0.01,
                payment_comment: `TEST ID=${methodId} - DELETE`
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
                    console.log(`   ✅ Payment ID: ${response.data.payment_id}`);
                    results.push({
                        paymentId: response.data.payment_id,
                        methodId: methodId
                    });
                } else {
                    console.log(`   ⚠️  Unexpected response:`, response.data);
                }
            } catch (error) {
                console.error(`   ❌ Failed:`, error.response?.data?.message || error.message);
            }

            // Small delay
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        console.log('\n' + '═'.repeat(70));
        console.log('✅ COMPLETED - CHECK FIDELO UI');
        console.log('═'.repeat(70));
        console.log(`\nCreated ${results.length} test payments on booking D2024453`);
        console.log(`\nPayment IDs created:`);
        results.forEach(r => {
            console.log(`   Payment ${r.paymentId}: method_id=${r.methodId}`);
        });

        console.log('\n' + '═'.repeat(70));
        console.log('NEXT: Copy payment method names from Fidelo UI');
        console.log('Format: ID | Method Name');
        console.log('═'.repeat(70));

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

createAllTests();
