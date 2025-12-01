/**
 * Check what fields are returned in the ALL bookings endpoint
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const FIDELO_API_TOKEN = process.env.FIDELO_API_TOKEN;
const FIDELO_API_BASE = 'https://ulearn.fidelo.com/api/1.0/ts';

async function checkAllBookingsStructure() {
    try {
        console.log('═'.repeat(70));
        console.log('CHECKING ALL BOOKINGS ENDPOINT STRUCTURE');
        console.log('═'.repeat(70));

        console.log('\n📋 Fetching all bookings...\n');

        const response = await axios.get(`${FIDELO_API_BASE}/bookings`, {
            headers: {
                'Authorization': `Bearer ${FIDELO_API_TOKEN}`,
                'Accept': 'application/json'
            }
        });

        const data = response.data;

        console.log('✅ Response received\n');
        console.log(`Response Type: ${typeof data}`);
        console.log(`Is Array: ${Array.isArray(data)}`);

        if (data.entries) {
            console.log(`\nEntries found: ${Object.keys(data.entries).length}`);

            // Find Padros booking (ID 41598)
            const padrosBooking = Object.values(data.entries).find(b => b.id === 41598 || b.id === '41598');

            if (padrosBooking) {
                console.log('\n✅ Found Padros booking (41598)!\n');
                console.log('Booking Financial Fields:');
                console.log(`  - amount: €${padrosBooking.amount}`);
                console.log(`  - amount_open: €${padrosBooking.amount_open}`);
                console.log(`  - payments: €${padrosBooking.payments}`);
                console.log(`  - document_number: ${padrosBooking.document_number}`);
                console.log(`  - customer_number: ${padrosBooking.customer_number}`);

                console.log('\n📦 Payment-Related Fields:');
                Object.keys(padrosBooking).forEach(key => {
                    if (key.toLowerCase().includes('payment') || key.toLowerCase().includes('method')) {
                        console.log(`  - ${key}: ${JSON.stringify(padrosBooking[key])}`);
                    }
                });

                console.log('\n═'.repeat(70));
                console.log('FULL PADROS BOOKING OBJECT:');
                console.log('═'.repeat(70));
                console.log(JSON.stringify(padrosBooking, null, 2));
            } else {
                console.log('\n⚠️  Padros booking not found. Showing first booking structure:\n');
                const firstBooking = Object.values(data.entries)[0];
                console.log(JSON.stringify(firstBooking, null, 2));
            }
        } else if (Array.isArray(data)) {
            console.log(`\nArray with ${data.length} bookings`);
            const padrosBooking = data.find(b => b.id === 41598 || b.id === '41598');
            if (padrosBooking) {
                console.log('\n✅ Found Padros booking!\n');
                console.log(JSON.stringify(padrosBooking, null, 2));
            }
        } else {
            console.log('\nUnexpected structure:');
            console.log(JSON.stringify(data, null, 2).substring(0, 1000));
        }

    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

checkAllBookingsStructure();
