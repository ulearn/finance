const axios = require('axios');
const fs = require('fs');

// Load current session
const session = JSON.parse(fs.readFileSync('session.json', 'utf8'));

// Payment Detail API endpoint
const API_ENDPOINT = 'e012597a49e0b3d0306f48e499505673';
const BASE_URL = 'https://ulearn.fidelo.com/api/1.0/gui2';

// Build cookie string
const cookieString = Object.entries(session.cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

// Test with a small date range (Nov 1-2, 2025)
const testUrl = `${BASE_URL}/${API_ENDPOINT}/search?filter[search_time_from_1]=01/11/2025&filter[search_time_until_1]=02/11/2025&filter[timefilter_basedon]=kip.payment_date`;

console.log('Testing Payment Detail API...');
console.log('URL:', testUrl);
console.log('Using session from:', session.timestamp);
console.log('\nWaiting for response (may take 30+ seconds)...\n');

axios.get(testUrl, {
    headers: {
        'Cookie': cookieString,
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json'
    },
    timeout: 60000
})
.then(response => {
    console.log('✓ SUCCESS! API endpoint still works!');
    console.log('Status:', response.status);
    if (response.data && response.data.hits !== undefined) {
        console.log('Hits (records found):', response.data.hits);
    }
    if (response.data && response.data.data && response.data.data.body) {
        console.log('Records in response:', response.data.data.body.length);
    }
})
.catch(error => {
    if (error.response) {
        console.log('✗ API Error - Status:', error.response.status);
        if (error.response.status === 401 || error.response.status === 403) {
            console.log('  Session expired - need to re-login');
        }
    } else {
        console.log('✗ Error:', error.message);
    }
});
