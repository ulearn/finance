/**
 * Fidelo Session Login - v11
 * Location: /home/hub/public_html/fins/scripts/fidelo/session-login-v11.js
 * Now with correct instance_hash extraction from JavaScript
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const FIDELO_CONFIG = {
    baseUrl: 'https://ulearn.fidelo.com',
    loginUrl: 'https://ulearn.fidelo.com/admin/login',
    credentials: {
        username: process.env.FIDELO_USERNAME || 'accounts@ulearnschool.com',
        password: process.env.FIDELO_PASSWORD || 'Aracna5bia'
    }
};

const SESSION_FILE = path.join(__dirname, 'session.json');

// Create axios instance
const client = axios.create({
    timeout: 30000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    httpsAgent: new https.Agent({  
        rejectUnauthorized: false
    })
});

// Cookie jar
let cookieJar = {};
let instanceHash = null;

// Parse cookies
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

// Save session to file
function saveSession() {
    try {
        const sessionData = {
            cookies: cookieJar,
            instanceHash: instanceHash,
            timestamp: new Date().toISOString()
        };
        fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2));
        console.log('✓ Session saved to file');
    } catch (error) {
        console.log('Warning: Could not save session:', error.message);
    }
}

// Load session from file
function loadSession() {
    try {
        if (!fs.existsSync(SESSION_FILE)) {
            return false;
        }

        const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
        const sessionAge = Date.now() - new Date(sessionData.timestamp).getTime();

        // Session expires after 2 hours
        if (sessionAge > 2 * 60 * 60 * 1000) {
            console.log('⏰ Saved session expired');
            return false;
        }

        cookieJar = sessionData.cookies || {};
        instanceHash = sessionData.instanceHash;
        console.log('✓ Loaded existing session from file');
        return true;
    } catch (error) {
        console.log('Warning: Could not load session:', error.message);
        return false;
    }
}

async function login() {
    console.log('Logging in to Fidelo...');
    
    try {
        // Clear cookies
        cookieJar = {};
        
        // Step 1: GET login page for PHPSESSID
        const loginPageRes = await client.get(FIDELO_CONFIG.loginUrl);
        parseCookies(loginPageRes.headers['set-cookie']);
        
        // Step 2: POST login
        const formData = new URLSearchParams();
        formData.append('login', 'ok');
        formData.append('username', FIDELO_CONFIG.credentials.username);
        formData.append('password', FIDELO_CONFIG.credentials.password);
        formData.append('systemlanguage', 'en');
        
        const loginRes = await client.post(FIDELO_CONFIG.loginUrl, formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': getCookieString(),
                'Referer': FIDELO_CONFIG.loginUrl,
                'Origin': FIDELO_CONFIG.baseUrl
            },
            maxRedirects: 0,
            validateStatus: () => true
        });
        
        if (loginRes.status === 302) {
            parseCookies(loginRes.headers['set-cookie']);
            
            // Follow redirect
            await client.get(loginRes.headers.location, {
                headers: { 'Cookie': getCookieString() }
            });
            
            console.log('✅ Login successful');
            saveSession(); // Save session after successful login
            return true;
        }

        console.log('❌ Login failed - Status:', loginRes.status);
        return false;
        
    } catch (error) {
        console.error('Login error:', error.message);
        return false;
    }
}

async function getInstanceHash() {
    try {
        console.log('Extracting instance hash...');
        
        // Get the Payment Detail page
        const response = await client.get('https://ulearn.fidelo.com/gui2/page/Ts_inquiry_payment_details', {
            headers: { 'Cookie': getCookieString() }
        });
        
        if (response.status !== 200) {
            console.log(`Page status: ${response.status}`);
            return null;
        }
        
        // The instance_hash is in JavaScript like:
        // aGUI['e012597a49e0b3d0306f48e499505673'].instance_hash = 'VKH94ZV9Q9QLYAY23ZV4AYQGBXM5RX5T';
        const pattern = /aGUI\['[a-f0-9]+'\]\.instance_hash\s*=\s*'([A-Z0-9]+)'/;
        const match = response.data.match(pattern);
        
        if (match) {
            instanceHash = match[1];
            console.log(`✅ Instance hash found: ${instanceHash}`);
            saveSession(); // Save after getting instance hash
            return instanceHash;
        }

        // Alternative pattern - sometimes it might be in different format
        const altPattern = /instance_hash['":\s]+['"]([A-Z0-9]{32})['"]"/;
        const altMatch = response.data.match(altPattern);

        if (altMatch) {
            instanceHash = altMatch[1];
            console.log(`✅ Instance hash found (alt): ${instanceHash}`);
            saveSession(); // Save after getting instance hash
            return instanceHash;
        }
        
        console.log('❌ Could not extract instance hash');
        return null;
        
    } catch (error) {
        console.error('Error getting instance hash:', error.message);
        return null;
    }
}

async function getPaymentDetailData(startDate = '24/09/2025', endDate = '01/10/2025') {
    try {
        if (!instanceHash) {
            console.log('No instance hash available');
            return null;
        }
        
        console.log(`\nFetching Payment Detail data from ${startDate} to ${endDate}...`);
        
        const formData = new URLSearchParams({
            hash: 'e012597a49e0b3d0306f48e499505673',
            instance_hash: instanceHash,
            frontend_view: '0',
            task: 'updateIcons',
            'filter[search]': '',
            'filter[search_time_from_1]': startDate,
            'filter[search_time_until_1]': endDate,
            'filter[timefilter_basedon]': 'kip.payment_date',
            'filter[search_2]': '0',
            'filter[search_3]': '0',
            'filter[search_4]': '0',
            'filter[search_5]': '0',
            'filter[search_6]': '0',
            'filter[search_7]': '0',
            'filter[search_8]': '0',
            'filter[search_9]': '0',
            'filter[search_10]': '0',
            'filter[search_11]': '0',
            'filter[inbox_filter]': '0',
            'filter[group_search]': '0',
            'filter[search_14]': '0'
        });
        
        console.log('Making API request with instance_hash:', instanceHash);
        
        const response = await client.post('https://ulearn.fidelo.com/gui2/request', formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': getCookieString(),
                'Referer': 'https://ulearn.fidelo.com/gui2/page/Ts_inquiry_payment_details',
                'Origin': 'https://ulearn.fidelo.com',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        console.log(`API Response Status: ${response.status}`);
        
        if (response.data && response.data.action === 'updateIcons') {
            console.log('✅ Payment Detail data received!');
            
            if (response.data.data) {
                const data = response.data.data;
                
                // Show summary
                if (data.head && data.body) {
                    console.log(`  Columns: ${data.head ? data.head.length : 0}`);
                    console.log(`  Rows: ${data.body ? data.body.length : 0}`);
                    
                    // Show column names
                    if (data.head && data.head.length > 0) {
                        const columnNames = data.head.map(h => h.title || h.db_column).slice(0, 10);
                        console.log(`  First columns: ${columnNames.join(', ')}`);
                    }
                    
                    // Save to file
                    const filename = `/home/hub/public_html/fins/scripts/fidelo/payment-detail-${Date.now()}.json`;
                    fs.writeFileSync(filename, JSON.stringify(response.data, null, 2));
                    console.log(`  Data saved to: ${filename}`);
                } else {
                    console.log('  Warning: Unexpected data structure');
                    console.log('  Keys in data:', Object.keys(data));
                }
                
                return response.data;
            }
        } else {
            console.log('❌ Unexpected response format');
            if (response.data) {
                console.log('Response keys:', Object.keys(response.data));
                console.log('Response preview:', JSON.stringify(response.data).substring(0, 200));
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('Error fetching payment detail:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            if (error.response.data) {
                console.log('Error data:', JSON.stringify(error.response.data).substring(0, 300));
            }
        }
        return null;
    }
}

// Main execution
async function main() {
    console.log('='.repeat(60));
    console.log('FIDELO PAYMENT DETAIL API - v11 (Working Solution)');
    console.log('='.repeat(60));
    
    // Step 1: Login
    const loginSuccess = await login();
    if (!loginSuccess) {
        console.log('Failed to login. Check if another session is active.');
        console.log('Visit https://ulearn.fidelo.com/admin/logout to clear sessions');
        return false;
    }
    
    // Step 2: Get instance hash
    const hash = await getInstanceHash();
    if (!hash) {
        console.log('Failed to get instance hash');
        return false;
    }
    
    // Step 3: Get Payment Detail data
    const data = await getPaymentDetailData('24/09/2025', '01/10/2025');
    
    if (data) {
        console.log('\n' + '='.repeat(60));
        console.log('🎉 COMPLETE SUCCESS!');
        console.log('='.repeat(60));
        console.log('\nWorkflow Summary:');
        console.log('1. ✅ Programmatic login successful');
        console.log('2. ✅ Instance hash extracted from JavaScript');
        console.log('3. ✅ Payment Detail API accessible');
        console.log('4. ✅ Data retrieved and saved');
        
        console.log('\nKey discoveries:');
        console.log('- Login requires: login=ok, username, password, systemlanguage=en');
        console.log('- Instance hash is in: aGUI[hash].instance_hash = "..."');
        console.log('- API endpoint: /gui2/request with hash and instance_hash');
        
        return true;
    } else {
        console.log('\n❌ Failed to get Payment Detail data');
        return false;
    }
}

// Export functions for use in other scripts
module.exports = {
    login,
    getInstanceHash,
    getPaymentDetailData,
    getCookieString,
    loadSession,
    saveSession
};

// Run if called directly
if (require.main === module) {
    main().then(success => {
        process.exit(success ? 0 : 1);
    });
}