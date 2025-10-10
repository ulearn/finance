// Fidelo Authentication Utility
// Centralized login and session management for Fidelo API access
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const axios = require('axios');

class FideloAuth {
    constructor() {
        this.baseURL = 'https://ulearn.fidelo.com';
        this.loginEndpoint = '/api/1.0/login';
        this.timeout = 60000; // 60 second timeout

        // Login credentials from environment
        this.username = process.env.FIDELO_USERNAME || 'paul@ulearn.ie';
        this.password = process.env.FIDELO_PASSWORD;

        this.sessionToken = null;
        this.cookies = null;
        this.isAuthenticated = false;
    }

    /**
     * Perform programmatic login to Fidelo
     * @returns {Promise<boolean>} - Success status
     */
    async login() {
        console.log('\n=== Logging into Fidelo ===');

        if (!this.password) {
            console.log('✗ FIDELO_PASSWORD not set in environment');
            return false;
        }

        const loginUrl = `${this.baseURL}${this.loginEndpoint}`;
        const loginData = new URLSearchParams({
            username: this.username,
            password: this.password,
            submit: 'Login'
        });

        try {
            const response = await axios.post(loginUrl, loginData.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                maxRedirects: 0,
                validateStatus: (status) => status === 302 || status === 200,
                timeout: this.timeout
            });

            // Extract cookies and session token
            const setCookieHeader = response.headers['set-cookie'];
            if (setCookieHeader) {
                this.cookies = setCookieHeader.map(cookie => cookie.split(';')[0]).join('; ');

                // Extract session token from cookies
                const sessionMatch = this.cookies.match(/PHPSESSID=([^;]+)/);
                if (sessionMatch) {
                    this.sessionToken = sessionMatch[1];
                }

                this.isAuthenticated = true;
                console.log('✓ Login successful');
                console.log('  Session ID:', this.sessionToken ? this.sessionToken.substring(0, 10) + '...' : 'N/A');
                return true;
            }

            console.log('✗ Login failed - no session cookie received');
            return false;

        } catch (error) {
            console.log('✗ Login error:', error.message);
            return false;
        }
    }

    /**
     * Make an authenticated API request to Fidelo
     * @param {string} url - API endpoint URL
     * @param {Object} options - Axios request options
     * @returns {Promise<Object>} - Response data
     */
    async authenticatedRequest(url, options = {}) {
        if (!this.isAuthenticated || !this.cookies) {
            throw new Error('Not authenticated - call login() first');
        }

        const requestOptions = {
            ...options,
            headers: {
                'Cookie': this.cookies,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Referer': 'https://ulearn.fidelo.com/',
                ...(options.headers || {})
            },
            timeout: this.timeout,
            validateStatus: (status) => true
        };

        try {
            const response = await axios(url, requestOptions);
            return response;
        } catch (error) {
            throw new Error(`Request failed: ${error.message}`);
        }
    }

    /**
     * Fetch data from a Fidelo GUI2 search endpoint
     * @param {string} endpointKey - The GUI2 endpoint hash key
     * @param {Object} filters - Query filters
     * @returns {Promise<Object>} - API response data
     */
    async fetchGUI2Data(endpointKey, filters = {}) {
        const apiUrl = `${this.baseURL}/api/1.0/gui2/${endpointKey}/search`;
        const params = new URLSearchParams(filters);
        const fullUrl = `${apiUrl}?${params}`;

        const response = await this.authenticatedRequest(fullUrl, {
            method: 'GET'
        });

        if (response.status === 200) {
            return response.data;
        } else {
            throw new Error(`API returned status ${response.status}`);
        }
    }

    /**
     * Get authentication headers for manual requests
     * @returns {Object} - Headers object with cookies
     */
    getAuthHeaders() {
        if (!this.isAuthenticated || !this.cookies) {
            throw new Error('Not authenticated - call login() first');
        }

        return {
            'Cookie': this.cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://ulearn.fidelo.com/'
        };
    }

    /**
     * Check if currently authenticated
     * @returns {boolean}
     */
    isLoggedIn() {
        return this.isAuthenticated && this.cookies !== null;
    }

    /**
     * Clear authentication state
     */
    logout() {
        this.sessionToken = null;
        this.cookies = null;
        this.isAuthenticated = false;
        console.log('✓ Logged out');
    }
}

module.exports = FideloAuth;
