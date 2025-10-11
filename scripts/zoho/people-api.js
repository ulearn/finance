// Zoho People API Integration
// Location: /home/hub/public_html/fins/scripts/zoho/people-api.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class ZohoPeopleAPI {
    constructor() {
        this.clientId = process.env.ZOHO_CLIENT_ID;
        this.clientSecret = process.env.ZOHO_CLIENT_SECRET;
        this.redirectUri = process.env.ZOHO_REDIRECT_URI;
        this.tokenFile = path.join(__dirname, 'tokens.json');
        this.accountsUrl = 'https://accounts.zoho.eu'; // EU data center
        this.baseUrl = 'https://people.zoho.eu/api'; // EU data center
        this.accessToken = null;
        this.refreshToken = null;
    }

    /**
     * Load tokens from file
     */
    async loadTokens() {
        try {
            const data = await fs.readFile(this.tokenFile, 'utf8');
            const tokens = JSON.parse(data);

            // Validate tokens are not null/undefined
            if (!tokens.access_token || !tokens.refresh_token) {
                console.log('Invalid tokens found, need to authenticate');
                return false;
            }

            this.accessToken = tokens.access_token;
            this.refreshToken = tokens.refresh_token;
            return true;
        } catch (error) {
            console.log('No tokens found, need to authenticate');
            return false;
        }
    }

    /**
     * Save tokens to file
     */
    async saveTokens(accessToken, refreshToken) {
        // Don't save if tokens are null/undefined
        if (!accessToken || !refreshToken) {
            console.error('Attempted to save invalid tokens');
            return;
        }

        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        await fs.writeFile(this.tokenFile, JSON.stringify({
            access_token: accessToken,
            refresh_token: refreshToken,
            updated_at: new Date().toISOString()
        }, null, 2));
    }

    /**
     * Generate authorization URL for OAuth flow
     */
    getAuthorizationUrl() {
        const scope = 'ZohoPeople.forms.READ,ZohoPeople.leave.READ,ZohoPeople.leave.UPDATE';
        const params = new URLSearchParams({
            client_id: this.clientId,
            scope: scope,
            response_type: 'code',
            redirect_uri: this.redirectUri,
            access_type: 'offline',
            prompt: 'consent'
        });
        return `${this.accountsUrl}/oauth/v2/auth?${params.toString()}`;
    }

    /**
     * Exchange authorization code for tokens
     */
    async exchangeCodeForTokens(code) {
        try {
            const response = await axios.post(`${this.accountsUrl}/oauth/v2/token`, null, {
                params: {
                    code: code,
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    redirect_uri: this.redirectUri,
                    grant_type: 'authorization_code'
                }
            });

            await this.saveTokens(response.data.access_token, response.data.refresh_token);
            return true;
        } catch (error) {
            console.error('Error exchanging code for tokens:', error.response?.data || error.message);
            return false;
        }
    }

    /**
     * Refresh access token using refresh token
     */
    async refreshAccessToken() {
        if (!this.refreshToken) {
            console.error('No refresh token available');
            return false;
        }

        try {
            const response = await axios.post(`${this.accountsUrl}/oauth/v2/token`, null, {
                params: {
                    refresh_token: this.refreshToken,
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    grant_type: 'refresh_token'
                }
            });

            this.accessToken = response.data.access_token;

            // Only save if we have valid tokens
            if (this.accessToken && this.refreshToken) {
                await fs.writeFile(this.tokenFile, JSON.stringify({
                    access_token: this.accessToken,
                    refresh_token: this.refreshToken,
                    updated_at: new Date().toISOString()
                }, null, 2));
            }

            return true;
        } catch (error) {
            console.error('Error refreshing token:', error.response?.data || error.message);
            return false;
        }
    }

    /**
     * Search for employee by email
     * @param {string} email - Employee email address
     * @returns {Promise<Object|null>} - Employee record or null
     */
    async searchEmployeeByEmail(email) {
        try {
            // Load tokens if not already loaded
            if (!this.accessToken) {
                const loaded = await this.loadTokens();
                if (!loaded) {
                    console.error('No valid tokens available. Please complete OAuth authorization first.');
                    return null;
                }
            }

            const response = await axios.get(`${this.baseUrl}/forms/P_EmployeeView/records`, {
                params: {
                    searchColumn: 'EMPLOYEEMAILALIAS',
                    searchValue: email
                },
                headers: {
                    'Authorization': `Zoho-oauthtoken ${this.accessToken}`
                }
            });

            if (response.data && response.data.response && response.data.response.result) {
                return response.data.response.result;
            }

            return null;
        } catch (error) {
            // If token expired, try refreshing ONCE
            if (error.response?.status === 401 && this.refreshToken) {
                console.log('Token expired, refreshing...');
                const refreshed = await this.refreshAccessToken();
                if (refreshed) {
                    // Retry the request ONCE
                    try {
                        const response = await axios.get(`${this.baseUrl}/forms/P_EmployeeView/records`, {
                            params: {
                                searchColumn: 'EMPLOYEEMAILALIAS',
                                searchValue: email
                            },
                            headers: {
                                'Authorization': `Zoho-oauthtoken ${this.accessToken}`
                            }
                        });
                        if (response.data && response.data.response && response.data.response.result) {
                            return response.data.response.result;
                        }
                    } catch (retryError) {
                        console.error('Retry failed:', retryError.message);
                        return null;
                    }
                }
            }

            console.error('Error searching employee:', error.response?.data || error.message);
            return null;
        }
    }

    /**
     * Search for employee by name
     * @param {string} firstName - Employee first name
     * @param {string} lastName - Employee last name
     * @returns {Promise<Object|null>} - Employee record or null
     */
    async searchEmployeeByName(firstName, lastName) {
        try {
            if (!this.accessToken) {
                const loaded = await this.loadTokens();
                if (!loaded) {
                    console.error('No valid tokens available. Please complete OAuth authorization first.');
                    return null;
                }
            }

            // Get all records and filter (Zoho People API doesn't support search by last name)
            const response = await axios.get(`${this.baseUrl}/forms/P_EmployeeView/records`, {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${this.accessToken}`
                }
            });

            if (response.data && Array.isArray(response.data)) {
                console.log(`Zoho returned ${response.data.length} total employees`);

                // Filter by last name AND first name
                const match = response.data.find(emp =>
                    emp['Last Name']?.toLowerCase() === lastName.toLowerCase() &&
                    emp['First Name']?.toLowerCase() === firstName.toLowerCase()
                );

                if (match) {
                    console.log(`✓ Matched: ${match['First Name']} ${match['Last Name']} - ${match['Email ID'] || 'NO EMAIL'}`);
                    // Normalize field names for our code
                    return {
                        FirstName: match['First Name'],
                        LastName: match['Last Name'],
                        EMPLOYEEMAILALIAS: match['Email ID'],
                        ...match
                    };
                } else {
                    console.log(`✗ No match found for ${firstName} ${lastName}`);
                }
            }

            return null;
        } catch (error) {
            // Don't retry if no refresh token
            if (error.response?.status === 401 && this.refreshToken) {
                console.log('Token expired, refreshing...');
                const refreshed = await this.refreshAccessToken();
                if (refreshed) {
                    // Retry ONCE
                    try {
                        const response = await axios.get(`${this.baseUrl}/forms/P_EmployeeView/records`, {
                            params: {
                                searchColumn: 'EMPLOYEELASTNAME',
                                searchValue: lastName
                            },
                            headers: {
                                'Authorization': `Zoho-oauthtoken ${this.accessToken}`
                            }
                        });
                        if (response.data && response.data.response && response.data.response.result) {
                            const results = Array.isArray(response.data.response.result)
                                ? response.data.response.result
                                : [response.data.response.result];
                            const match = results.find(emp =>
                                emp.FirstName?.toLowerCase() === firstName.toLowerCase()
                            );
                            return match || null;
                        }
                    } catch (retryError) {
                        console.error('Retry failed:', retryError.message);
                        return null;
                    }
                }
            }

            console.error('Error searching employee by name:', error.response?.data || error.message);
            return null;
        }
    }

    /**
     * Get employee leave balance
     * @param {string} employeeId - Zoho People employee ID
     * @returns {Promise<Object|null>} - Leave balance data or null
     */
    async getEmployeeLeaveBalance(employeeId) {
        try {
            if (!this.accessToken) {
                await this.loadTokens();
            }

            const response = await axios.get(`${this.baseUrl}/leave/getRecords`, {
                params: {
                    empId: employeeId
                },
                headers: {
                    'Authorization': `Zoho-oauthtoken ${this.accessToken}`
                }
            });

            return response.data;
        } catch (error) {
            if (error.response?.status === 401) {
                const refreshed = await this.refreshAccessToken();
                if (refreshed) {
                    return await this.getEmployeeLeaveBalance(employeeId);
                }
            }

            console.error('Error fetching leave balance:', error.response?.data || error.message);
            return null;
        }
    }

    /**
     * Get employee details including PPS number
     * @param {string} employeeId - Zoho People employee ID
     * @returns {Promise<Object|null>} - Employee details including PPS
     */
    async getEmployeeDetails(employeeId) {
        try {
            if (!this.accessToken) {
                await this.loadTokens();
            }

            const response = await axios.get(`${this.baseUrl}/forms/employee/records/${employeeId}`, {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${this.accessToken}`
                }
            });

            if (response.data && response.data.response && response.data.response.result) {
                const result = Array.isArray(response.data.response.result)
                    ? response.data.response.result[0]
                    : response.data.response.result;

                // Extract PPS number - field is called "PPS" in Zoho
                const ppsNumber = result.PPS || result.pps || null;

                return {
                    employeeId: result.EmployeeID || result.employeeID,
                    firstName: result.FirstName || result['First Name'],
                    lastName: result.LastName || result['Last Name'],
                    email: result.EMPLOYEEMAILALIAS || result['Email ID'],
                    ppsNumber: ppsNumber,
                    rawData: result // Include raw data for debugging
                };
            }

            return null;
        } catch (error) {
            if (error.response?.status === 401) {
                const refreshed = await this.refreshAccessToken();
                if (refreshed) {
                    return await this.getEmployeeDetails(employeeId);
                }
            }

            console.error('Error fetching employee details:', error.response?.data || error.message);
            return null;
        }
    }

    /**
     * Update employee leave balance
     * @param {string} employeeId - Zoho People employee ID
     * @param {string} leaveTypeId - Leave type ID
     * @param {number} balance - New balance
     * @returns {Promise<boolean>} - Success status
     */
    async updateEmployeeLeaveBalance(employeeId, leaveTypeId, balance) {
        try {
            if (!this.accessToken) {
                await this.loadTokens();
            }

            const response = await axios.post(
                `${this.baseUrl}/leave/updateLeaveBalance`,
                {
                    empId: employeeId,
                    leaveTypeId: leaveTypeId,
                    balance: balance
                },
                {
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return response.data.response?.status === 'success';
        } catch (error) {
            if (error.response?.status === 401) {
                const refreshed = await this.refreshAccessToken();
                if (refreshed) {
                    return await this.updateEmployeeLeaveBalance(employeeId, leaveTypeId, balance);
                }
            }

            console.error('Error updating leave balance:', error.response?.data || error.message);
            return false;
        }
    }
}

module.exports = ZohoPeopleAPI;
