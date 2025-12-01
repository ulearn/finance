/**
 * Find Student ID 29254
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const FIDELO_API_TOKEN = process.env.FIDELO_API_TOKEN;
const FIDELO_API_BASE = 'https://ulearn.fidelo.com/api/1.0/ts';

async function findStudent() {
    try {
        console.log('🔍 Searching ALL bookings for Student ID (customer_number) 29254...\n');

        const response = await axios.get(`${FIDELO_API_BASE}/bookings`, {
            headers: {
                'Authorization': `Bearer ${FIDELO_API_TOKEN}`,
                'Accept': 'application/json'
            }
        });

        const bookings = Object.values(response.data.entries || response.data);
        console.log(`Total bookings: ${bookings.length}\n`);

        // Search for 29254
        const matches = bookings.filter(b =>
            String(b.customer_number) === '29254'
        );

        if (matches.length > 0) {
            console.log(`✅ Found ${matches.length} booking(s) for Student ID 29254:\n`);
            matches.forEach(b => {
                console.log(`Booking ID: ${b.id}`);
                console.log(`Student: ${b.customer_firstname} ${b.customer_lastname}`);
                console.log(`Customer Number: ${b.customer_number}`);
                console.log(`Document: ${b.document_number}`);
                console.log('');
            });
        } else {
            console.log('❌ No bookings found for Student ID 29254');
            console.log('\nSearching for similar IDs:');

            const similar = bookings.filter(b => {
                const num = String(b.customer_number);
                return num.includes('2925') || num.includes('9254');
            });

            if (similar.length > 0) {
                console.log(`\nFound ${similar.length} similar customer numbers:`);
                similar.forEach(b => {
                    console.log(`  - Customer ${b.customer_number}: Booking ${b.id} (${b.customer_firstname} ${b.customer_lastname})`);
                });
            } else {
                console.log('\nNo similar IDs found either.');
                console.log('\nShowing customer_number range in system:');
                const numbers = bookings.map(b => parseInt(b.customer_number)).filter(n => !isNaN(n)).sort((a,b) => a - b);
                console.log(`  Lowest: ${numbers[0]}`);
                console.log(`  Highest: ${numbers[numbers.length - 1]}`);
                console.log(`  Around 29254: ${numbers.filter(n => n >= 29250 && n <= 29260).join(', ') || 'None'}`);
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

findStudent();
