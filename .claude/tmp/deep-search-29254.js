/**
 * Deep search for Student ID 29254 - checking ALL fields
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const FIDELO_API_TOKEN = process.env.FIDELO_API_TOKEN;
const FIDELO_API_BASE = 'https://ulearn.fidelo.com/api/1.0/ts';

async function deepSearch() {
    try {
        console.log('🔍 DEEP SEARCH for Student ID 29254...\n');

        const response = await axios.get(`${FIDELO_API_BASE}/bookings`, {
            headers: {
                'Authorization': `Bearer ${FIDELO_API_TOKEN}`,
                'Accept': 'application/json'
            }
        });

        const bookings = Object.values(response.data.entries || response.data);
        console.log(`Total bookings: ${bookings.length}\n`);

        // Search in ALL fields
        const matches = bookings.filter(b => {
            const bookingStr = JSON.stringify(b);
            return bookingStr.includes('29254');
        });

        console.log(`Found ${matches.length} booking(s) containing "29254":\n`);

        matches.forEach(b => {
            console.log('═'.repeat(70));
            console.log(`Booking ID: ${b.id}`);
            console.log(`Document: ${b.document_number}`);
            console.log(`Name: ${b.firstname || b.customer_firstname || ''} ${b.lastname || b.customer_lastname || ''}`);
            console.log(`Email: ${b.email}`);
            console.log(`Confirmed: ${b.confirmed}`);

            // Find which fields contain 29254
            console.log('\nFields containing "29254":');
            Object.keys(b).forEach(key => {
                const value = b[key];
                if (value && String(value).includes('29254')) {
                    console.log(`  - ${key}: ${value}`);
                }
            });
            console.log('');
        });

        // Also check confirmed bookings with customer_number around that range
        console.log('\n' + '═'.repeat(70));
        console.log('CONFIRMED BOOKINGS near Student ID 29254:');
        console.log('═'.repeat(70));

        const nearbyConfirmed = bookings.filter(b => {
            const num = parseInt(b.customer_number);
            return b.confirmed && num >= 29250 && num <= 29260;
        });

        nearbyConfirmed.forEach(b => {
            console.log(`Student ID ${b.customer_number}: Booking ${b.id}, ${b.firstname} ${b.lastname}, Doc: ${b.document_number}`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

deepSearch();
