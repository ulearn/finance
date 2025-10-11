#!/usr/bin/env node
// Test script to check PPS field name in Zoho People API
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const ZohoPeopleAPI = require('./people-api.js');

async function testPPSField() {
    const zoho = new ZohoPeopleAPI();

    console.log('Loading Zoho tokens...');
    const loaded = await zoho.loadTokens();
    if (!loaded) {
        console.error('Failed to load tokens. Please authenticate first.');
        return;
    }

    console.log('Fetching employee list to test PPS field...\n');

    try {
        // Search for a known employee - let's try searching for one
        const response = await require('axios').get(`${zoho.baseUrl}/forms/P_EmployeeView/records`, {
            headers: {
                'Authorization': `Zoho-oauthtoken ${zoho.accessToken}`
            },
            params: {
                sIndex: 1,
                limit: 5  // Just get first 5 employees
            }
        });

        if (response.data && response.data.response && response.data.response.result) {
            const employees = Array.isArray(response.data.response.result)
                ? response.data.response.result
                : [response.data.response.result];

            console.log(`Found ${employees.length} employees. Checking fields:\n`);

            employees.forEach((emp, idx) => {
                console.log(`\n=== Employee ${idx + 1}: ${emp.FirstName || emp['First Name']} ${emp.LastName || emp['Last Name']} ===`);
                console.log('Email:', emp.EMPLOYEEMAILALIAS || emp['Email ID']);

                // Check all possible PPS field variations
                console.log('\nSearching for PPS field:');
                console.log('  emp.PPS:', emp.PPS);
                console.log('  emp.pps:', emp.pps);
                console.log('  emp["PPS"]:', emp["PPS"]);
                console.log('  emp.PPSNumber:', emp.PPSNumber);
                console.log('  emp["PPS Number"]:', emp["PPS Number"]);

                // Show ALL fields that contain 'pps' (case insensitive)
                console.log('\nAll fields containing "pps" or "tax":');
                Object.keys(emp).forEach(key => {
                    if (key.toLowerCase().includes('pps') || key.toLowerCase().includes('tax')) {
                        console.log(`  ${key}:`, emp[key]);
                    }
                });
            });

            // Also print full field list from first employee
            console.log('\n\n=== ALL FIELDS from first employee ===');
            console.log(Object.keys(employees[0]).sort().join('\n'));

        } else {
            console.log('No employee data returned');
            console.log('Response:', JSON.stringify(response.data, null, 2));
        }

    } catch (error) {
        console.error('Error fetching employees:', error.response?.data || error.message);

        // Try token refresh if 401
        if (error.response?.status === 401) {
            console.log('\nToken expired, trying to refresh...');
            const refreshed = await zoho.refreshAccessToken();
            if (refreshed) {
                console.log('Token refreshed, try running the script again.');
            }
        }
    }
}

testPPSField();
