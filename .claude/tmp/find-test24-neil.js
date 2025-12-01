/**
 * Find Test24, Neil - Student ID 29254
 * Document: D2024453
 * Email: neilsjmcmahon@gmail.com
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const FIDELO_API_TOKEN = process.env.FIDELO_API_TOKEN;
const FIDELO_API_BASE = 'https://ulearn.fidelo.com/api/1.0/ts';

async function findNeil() {
    try {
        console.log('🔍 Searching for Test24, Neil...\n');

        const response = await axios.get(`${FIDELO_API_BASE}/bookings`, {
            headers: {
                'Authorization': `Bearer ${FIDELO_API_TOKEN}`,
                'Accept': 'application/json'
            }
        });

        const bookings = Object.values(response.data.entries || response.data);
        console.log(`Total bookings: ${bookings.length}\n`);

        // Search by document number
        console.log('Searching by Document Number: D2024453...');
        let match = bookings.find(b =>
            b.document_number === 'D2024453' ||
            (b.document_number_all && b.document_number_all.includes('D2024453'))
        );

        if (!match) {
            console.log('Not found by document. Searching by email: neilsjmcmahon@gmail.com...');
            match = bookings.find(b =>
                b.email && typeof b.email === 'string' && b.email.toLowerCase().includes('neilsjmcmahon')
            );
        }

        if (!match) {
            console.log('Not found by email. Searching by name: Test24, Neil...');
            match = bookings.find(b =>
                b.lastname && b.lastname.toLowerCase().includes('test24') ||
                b.customer_lastname && b.customer_lastname.toLowerCase().includes('test24')
            );
        }

        if (match) {
            console.log('\n✅ FOUND BOOKING:\n');
            console.log(`Booking ID: ${match.id}`);
            console.log(`Customer Number (Student ID): ${match.customer_number}`);
            console.log(`Document Number: ${match.document_number}`);
            console.log(`Name: ${match.firstname || match.customer_firstname} ${match.lastname || match.customer_lastname}`);
            console.log(`Email: ${match.email}`);
            console.log(`Amount: €${match.amount}`);
            console.log(`Amount Open: €${match.amount_open}`);
            console.log(`Payments: €${match.payments}`);
        } else {
            console.log('\n❌ Not found by any criteria');
            console.log('\nTrying partial matches...');

            const partialMatches = bookings.filter(b =>
                (b.email && b.email.includes('neil')) ||
                (b.lastname && b.lastname.toLowerCase().includes('test')) ||
                (b.document_number && b.document_number.includes('2024453'))
            );

            if (partialMatches.length > 0) {
                console.log(`\nFound ${partialMatches.length} partial matches:`);
                partialMatches.slice(0, 5).forEach(b => {
                    console.log(`  - ID ${b.id}: ${b.firstname} ${b.lastname}, ${b.email}, Doc: ${b.document_number}, Customer: ${b.customer_number}`);
                });
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

findNeil();
