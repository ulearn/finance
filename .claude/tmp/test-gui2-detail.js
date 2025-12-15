const axios = require('axios');
const fs = require('fs').promises;

// GUI2 API configuration
const GUI2_ENDPOINT = 'https://ulearn.fidelo.com/api/1.0/gui2/b56eab683e450abb7100bfa45fc238fd/search';
const API_TOKEN = '699c957fb710153384dc0aea54e5dbec';

async function testGUI2Detail() {
    try {
        console.log('Fetching GUI2 data for November 2025 Morning Classes...\n');

        const formData = new URLSearchParams({
            _token: API_TOKEN,
            'filter[search]': '',
            'filter[booking_created_filter]': '01/11/2025,30/11/2025',
            'filter[course_category_original][]': '4',
            'filter[customer_birthday_original]': ',',
            'filter[cancellation_date_original]': ','
        });

        const response = await axios.post(GUI2_ENDPOINT, formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 30000
        });

        console.log(`Found ${response.data.hits} records\n`);

        if (response.data.entries) {
            const entries = Object.values(response.data.entries);

            console.log('='.repeat(80));
            console.log('AVAILABLE FIELDS IN EACH RECORD:');
            console.log('='.repeat(80));

            if (entries.length > 0) {
                const sampleRecord = entries[0];
                const fields = Object.keys(sampleRecord);

                // Look for fields related to course fees, invoices, amounts
                const relevantFields = fields.filter(f =>
                    f.includes('amount') ||
                    f.includes('course') ||
                    f.includes('invoice') ||
                    f.includes('payment') ||
                    f.includes('fee') ||
                    f.includes('price')
                );

                console.log('\nRELEVANT FIELDS (amount/course/invoice/payment/fee/price):');
                relevantFields.forEach(field => {
                    console.log(`  ${field}: ${JSON.stringify(sampleRecord[field])}`);
                });

                console.log('\n' + '='.repeat(80));
                console.log('FULL FIRST RECORD:');
                console.log('='.repeat(80));
                console.log(JSON.stringify(sampleRecord, null, 2));

                // Save to file for inspection
                await fs.writeFile(
                    '.claude/tmp/gui2-sample.json',
                    JSON.stringify(response.data, null, 2)
                );
                console.log('\n✓ Full response saved to: .claude/tmp/gui2-sample.json');
            }
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

testGUI2Detail();
