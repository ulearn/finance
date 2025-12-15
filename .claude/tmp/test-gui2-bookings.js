const axios = require('axios');

// GUI2 API configuration
const GUI2_ENDPOINT = 'https://ulearn.fidelo.com/api/1.0/gui2/b56eab683e450abb7100bfa45fc238fd/search';
const API_TOKEN = '699c957fb710153384dc0aea54e5dbec';

async function testGUI2Bookings() {
    try {
        console.log('Testing GUI2 Bookings API...\n');
        console.log('Fetching November 2025 Morning Classes (Category 4)...\n');

        // Build the POST data for November 2025, Morning Classes only
        const formData = new URLSearchParams({
            _token: API_TOKEN,
            'filter[search]': '',
            'filter[booking_created_filter]': '01/11/2025,30/11/2025',
            'filter[course_category_original][]': '4', // Morning Classes category
            'filter[customer_birthday_original]': ',',
            'filter[cancellation_date_original]': ',',
            'filter[confirmed_date_original]': ',',
            'filter[course_period]': ',',
            'filter[document_date_original]': ',',
            'filter[accommodation_last_end_original]': ',',
            'filter[course_last_end_original]': ',',
            'filter[course_last_end_date_original]': ',',
            'filter[first_course_start_original]': ',',
            'filter[accommodation_last_end_date_original]': ',',
            'filter[paymentterms_next_date_original]': ',',
            'filter[all_end_original]': ',',
            'filter[all_start_original]': ',',
            'filter[service_period_filter]': ',',
            'filter[course_contact_original]': ',',
            'filter[accommodation_from_original]': ',',
            'filter[course_from_original]': ',',
            'filter[accommodation_first_start_original]': ',',
            'filter[changed_original]': ',',
            'filter[visum_contact_original]': ','
        });

        const response = await axios.post(GUI2_ENDPOINT, formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 30000
        });

        console.log('Response Status:', response.status);
        console.log('\nResponse Data Structure:');
        console.log('Keys:', Object.keys(response.data));

        if (response.data.data) {
            console.log('\nData Keys:', Object.keys(response.data.data));

            if (response.data.data.body) {
                console.log(`\nNumber of records: ${response.data.data.body.length}`);

                if (response.data.data.head) {
                    console.log('\nColumn Headers:');
                    response.data.data.head.forEach((header, idx) => {
                        console.log(`  ${idx}: ${header.title || header.db_column} (${header.db_column})`);
                    });
                }

                if (response.data.data.body.length > 0) {
                    console.log('\n='.repeat(80));
                    console.log('FIRST RECORD (sample):');
                    console.log('='.repeat(80));
                    console.log(JSON.stringify(response.data.data.body[0], null, 2));
                }
            }
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testGUI2Bookings();
