/**
 * Check what fields are returned for payments in Bookings API
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const FIDELO_API_TOKEN = process.env.FIDELO_API_TOKEN;
const FIDELO_API_BASE = 'https://ulearn.fidelo.com/api/1.0/ts';

async function checkPaymentStructure() {
    try {
        console.log('═'.repeat(70));
        console.log('CHECKING PAYMENT STRUCTURE IN BOOKINGS API');
        console.log('═'.repeat(70));

        // Fetch Padros booking (we know this has a payment)
        // Booking ID 41598, Document D2025559
        console.log('\n📋 Fetching Booking 41598 (Padros, Laia)...\n');

        const response = await axios.get(`${FIDELO_API_BASE}/bookings/41598`, {
            headers: {
                'Authorization': `Bearer ${FIDELO_API_TOKEN}`,
                'Accept': 'application/json'
            }
        });

        const booking = response.data;

        console.log('✅ Booking fetched successfully\n');
        console.log('Booking Details:');
        console.log(`  - ID: ${booking.id}`);
        console.log(`  - Document: ${booking.document_number}`);
        console.log(`  - Student: ${booking.customer_firstname} ${booking.customer_lastname}`);
        console.log(`  - Customer Number: ${booking.customer_number}`);
        console.log(`  - Amount: €${booking.amount}`);
        console.log(`  - Amount Open: €${booking.amount_open}`);
        console.log(`  - Payments Total: €${booking.payments || 'N/A'}`);

        // Check if payments array exists
        if (booking.payment_details || booking.payments_details || booking.payment || booking.incoming_payments) {
            console.log('\n📦 PAYMENTS ARRAY FOUND!\n');
            const paymentsArray = booking.payment_details || booking.payments_details || booking.payment || booking.incoming_payments;

            console.log(`Total Payments: ${Array.isArray(paymentsArray) ? paymentsArray.length : 'Not an array'}\n`);

            if (Array.isArray(paymentsArray) && paymentsArray.length > 0) {
                console.log('Payment Structure (first payment):');
                console.log(JSON.stringify(paymentsArray[0], null, 2));

                console.log('\n📋 All Available Fields in Payment:');
                Object.keys(paymentsArray[0]).forEach(key => {
                    console.log(`  - ${key}: ${paymentsArray[0][key]}`);
                });
            }
        } else {
            console.log('\n⚠️  No payments array found in booking response');
            console.log('\n📋 Available Top-Level Fields:');
            Object.keys(booking).forEach(key => {
                if (key.toLowerCase().includes('payment') || key.toLowerCase().includes('method')) {
                    console.log(`  ✓ ${key}: ${booking[key]}`);
                }
            });
        }

        console.log('\n' + '═'.repeat(70));
        console.log('FULL BOOKING OBJECT (showing all fields):');
        console.log('═'.repeat(70));
        console.log(JSON.stringify(booking, null, 2));

    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

checkPaymentStructure();
