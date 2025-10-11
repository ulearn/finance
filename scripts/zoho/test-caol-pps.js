#!/usr/bin/env node
// Test script to find Caol's PPS in Zoho
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const ZohoPeopleAPI = require('./people-api.js');
const axios = require('axios');

async function testCaolPPS() {
    const zoho = new ZohoPeopleAPI();

    console.log('Loading Zoho tokens...');
    const loaded = await zoho.loadTokens();

    if (!loaded) {
        console.log('Failed to load tokens');
        return;
    }

    console.log('Fetching all employees from Zoho...\n');

    try {
        const response = await axios.get(`${zoho.baseUrl}/forms/P_EmployeeView/records`, {
            headers: { 'Authorization': `Zoho-oauthtoken ${zoho.accessToken}` }
        });

        let zohoEmployees = [];
        if (response.data && Array.isArray(response.data)) {
            zohoEmployees = response.data;
        } else if (response.data && response.data.response && response.data.response.result) {
            zohoEmployees = Array.isArray(response.data.response.result)
                ? response.data.response.result
                : [response.data.response.result];
        }

        console.log(`Total employees: ${zohoEmployees.length}\n`);

        // Search for Caol by email
        const targetEmail = 'caolhiggins@gmail.com';
        const caol = zohoEmployees.find(emp => {
            const email = emp.EMPLOYEEMAILALIAS || emp['Email ID'];
            return email && email.toLowerCase() === targetEmail.toLowerCase();
        });

        if (caol) {
            console.log('✓ Found Caol in Zoho:');
            console.log('Name:', caol.FirstName || caol['First Name'], caol.LastName || caol['Last Name']);
            console.log('Email:', caol.EMPLOYEEMAILALIAS || caol['Email ID']);
            console.log('PPS:', caol.PPS || caol.pps || 'NOT FOUND');
            console.log('\nAll fields containing "pps" or "tax":');
            Object.keys(caol).forEach(key => {
                if (key.toLowerCase().includes('pps') || key.toLowerCase().includes('tax')) {
                    console.log(`  ${key}: ${caol[key]}`);
                }
            });
        } else {
            console.log(`✗ Caol NOT found with email: ${targetEmail}`);
            console.log('\nSearching for similar names (Caol, Higgin, O\'h-Uigin)...');

            zohoEmployees.forEach(emp => {
                const firstName = (emp.FirstName || emp['First Name'] || '').toLowerCase();
                const lastName = (emp.LastName || emp['Last Name'] || '').toLowerCase();
                const email = (emp.EMPLOYEEMAILALIAS || emp['Email ID'] || '').toLowerCase();

                if (firstName.includes('caol') || lastName.includes('caol') ||
                    firstName.includes('higgin') || lastName.includes('higgin') ||
                    lastName.includes('uigin') || email.includes('caol')) {
                    console.log('\nPossible match:');
                    console.log('  Name:', emp.FirstName || emp['First Name'], emp.LastName || emp['Last Name']);
                    console.log('  Email:', emp.EMPLOYEEMAILALIAS || emp['Email ID']);
                    console.log('  PPS:', emp.PPS || emp.pps || 'NOT FOUND');
                }
            });
        }
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

testCaolPPS();
