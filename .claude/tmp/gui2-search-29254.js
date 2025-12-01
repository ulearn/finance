/**
 * Search for Student ID 29254 using GUI2 API
 */

const axios = require('axios');

const GUI2_TOKEN = '9feb2576ba97b2743550120aa5dd935c';
const GUI2_URL = 'https://ulearn.fidelo.com/api/1.0/gui2/b56eab683e450abb7100bfa45fc238fd';

async function searchGUI2() {
    try {
        console.log('🔍 Searching GUI2 for Student ID 29254...\n');

        const response = await axios.get(`${GUI2_URL}/search`, {
            params: {
                '_token': GUI2_TOKEN,
                'filter[search]': '29254'
            },
            headers: {
                'Accept': 'application/json'
            }
        });

        if (response.data && response.data.entries) {
            const results = Object.values(response.data.entries);
            console.log(`✅ Found ${results.length} result(s):\n`);

            results.forEach(r => {
                console.log('═'.repeat(70));
                console.log(`Booking ID: ${r.id}`);
                console.log(`Student ID: ${r.customer_number || r.customerId}`);
                console.log(`Document: ${r.document_number}`);
                console.log(`Name: ${r.customer_firstname} ${r.customer_lastname}`);
                console.log(`Email: ${r.email || r.customer_email}`);
                console.log(`Amount: €${r.amount}`);
                console.log(`Amount Open: €${r.amount_open}`);
                console.log(`Payments: €${r.payments}`);
                console.log(`Confirmed: ${r.confirmed || r.confirmed_original}`);
                console.log('');
            });

            if (results.length > 0) {
                const booking = results[0];
                console.log('\n✅ READY TO CREATE TEST PAYMENTS');
                console.log(`Using Booking ID: ${booking.id}`);
                console.log(`Student: ${booking.customer_firstname} ${booking.customer_lastname}`);
                console.log(`Document: ${booking.document_number}`);
            }
        } else {
            console.log('❌ No results found');
            console.log('Response:', JSON.stringify(response.data, null, 2));
        }

    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

searchGUI2();
