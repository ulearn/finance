/**
 * Debug Fidelo Login
 * Tests the login flow and shows detailed information
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const axios = require('axios');
const https = require('https');

const client = axios.create({
    timeout: 30000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
    },
    httpsAgent: new https.Agent({
        rejectUnauthorized: false
    })
});

let cookieJar = {};

function parseCookies(setCookieHeaders) {
    if (!setCookieHeaders) return;

    const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    cookies.forEach(cookie => {
        const [nameValue] = cookie.split(';');
        const [name, value] = nameValue.split('=');
        if (name && value) {
            cookieJar[name] = value;
        }
    });
}

function getCookieString() {
    return Object.entries(cookieJar)
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
}

async function debugLogin() {
    console.log('='.repeat(80));
    console.log('FIDELO LOGIN DEBUG');
    console.log('='.repeat(80));

    const username = process.env.FIDELO_USERNAME;
    const password = process.env.FIDELO_PASSWORD;

    console.log(`\nCredentials:`);
    console.log(`  Username: ${username}`);
    console.log(`  Password: ${'*'.repeat(password.length)}\n`);

    // Step 1: GET login page
    console.log('STEP 1: GET /admin/login');
    console.log('-'.repeat(80));

    const loginPageRes = await client.get('https://ulearn.fidelo.com/admin/login', {
        validateStatus: () => true
    });

    parseCookies(loginPageRes.headers['set-cookie']);

    console.log(`Status: ${loginPageRes.status}`);
    console.log(`Cookies received: ${JSON.stringify(cookieJar, null, 2)}`);
    console.log(`Page length: ${loginPageRes.data.length} characters\n`);

    // Check for CSRF token or other hidden fields in the HTML
    const csrfMatch = loginPageRes.data.match(/name="csrf[^"]*"\s+value="([^"]+)"/i);
    const tokenMatch = loginPageRes.data.match(/name="[^"]*token[^"]*"\s+value="([^"]+)"/i);

    if (csrfMatch) {
        console.log(`⚠️  CSRF token found: ${csrfMatch[1]}`);
    }
    if (tokenMatch) {
        console.log(`⚠️  Token found: ${tokenMatch[1]}`);
    }

    // Look for the form action
    const formMatch = loginPageRes.data.match(/<form[^>]*action="([^"]+)"[^>]*>/i);
    if (formMatch) {
        console.log(`Form action: ${formMatch[1]}`);
    }

    // Look for all input fields in the form
    const inputMatches = loginPageRes.data.matchAll(/<input[^>]*name="([^"]+)"[^>]*>/gi);
    const formFields = [];
    for (const match of inputMatches) {
        formFields.push(match[1]);
    }
    if (formFields.length > 0) {
        console.log(`Form fields found: ${formFields.join(', ')}\n`);
    }

    // Step 2: POST login
    console.log('STEP 2: POST /admin/login');
    console.log('-'.repeat(80));

    const formData = new URLSearchParams();
    formData.append('login', 'ok');
    formData.append('username', username);
    formData.append('password', password);
    formData.append('systemlanguage', 'en');

    console.log(`Form data being sent:`);
    console.log(`  login: ok`);
    console.log(`  username: ${username}`);
    console.log(`  password: ${'*'.repeat(password.length)}`);
    console.log(`  systemlanguage: en`);
    console.log(`\nCookies being sent: ${getCookieString()}\n`);

    const loginRes = await client.post('https://ulearn.fidelo.com/admin/login', formData, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': getCookieString(),
            'Referer': 'https://ulearn.fidelo.com/admin/login',
            'Origin': 'https://ulearn.fidelo.com',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-GB,en;q=0.9'
        },
        maxRedirects: 0,
        validateStatus: () => true
    });

    console.log(`Status: ${loginRes.status}`);
    console.log(`Redirect location: ${loginRes.headers.location || 'None'}`);

    const newCookies = loginRes.headers['set-cookie'];
    console.log(`\nCookies from response:`);
    if (newCookies) {
        newCookies.forEach(c => console.log(`  ${c}`));
        parseCookies(newCookies);
    } else {
        console.log(`  None`);
    }

    console.log(`\nCurrent cookie jar: ${JSON.stringify(cookieJar, null, 2)}`);
    console.log(`\nResponse preview (first 500 chars):`);
    console.log(loginRes.data.substring(0, 500));

    // Check if there's an error message in the response
    const errorMatch = loginRes.data.match(/error|invalid|incorrect|wrong/gi);
    if (errorMatch) {
        console.log(`\n⚠️  Possible error indicators found in response: ${[...new Set(errorMatch)].join(', ')}`);
    }

    // Step 3: Follow redirect if present
    if (loginRes.headers.location) {
        console.log(`\nSTEP 3: Following redirect to ${loginRes.headers.location}`);
        console.log('-'.repeat(80));

        const redirectRes = await client.get(loginRes.headers.location, {
            headers: {
                'Cookie': getCookieString(),
                'Referer': 'https://ulearn.fidelo.com/admin/login'
            },
            validateStatus: () => true
        });

        parseCookies(redirectRes.headers['set-cookie']);

        console.log(`Status: ${redirectRes.status}`);
        console.log(`Final cookies: ${JSON.stringify(cookieJar, null, 2)}`);

        // Check if we have passcookie and usercookie
        if (cookieJar.passcookie && cookieJar.passcookie !== 'deleted') {
            console.log(`\n✅ LOGIN SUCCESS - Valid passcookie received`);
        } else {
            console.log(`\n❌ LOGIN FAILED - passcookie is missing or deleted`);
        }
    }

    console.log('\n' + '='.repeat(80));
}

debugLogin().catch(console.error);
