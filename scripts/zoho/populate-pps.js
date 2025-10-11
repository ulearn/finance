#!/usr/bin/env node
// Script to fetch PPS numbers from Zoho and populate teacher_payments table
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mysql = require('mysql2/promise');
const axios = require('axios');
const ZohoPeopleAPI = require('./people-api.js');

async function getConnection() {
    return await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306
    });
}

async function populatePPS() {
    const zoho = new ZohoPeopleAPI();
    let connection;

    try {
        console.log('Loading Zoho tokens...');
        const loaded = await zoho.loadTokens();
        if (!loaded) {
            console.error('Failed to load tokens. Please authenticate first.');
            return;
        }

        console.log('Connecting to database...');
        connection = await getConnection();

        // Get all distinct teachers with emails
        const [teachers] = await connection.execute(`
            SELECT DISTINCT firstname, email
            FROM teacher_payments
            WHERE email IS NOT NULL AND email != ''
            ORDER BY firstname
        `);

        console.log(`\nFound ${teachers.length} teachers in database\n`);

        let successCount = 0;
        let failCount = 0;

        // Fetch all employees from Zoho first
        console.log('Fetching all employees from Zoho...');
        const response = await axios.get(`${zoho.baseUrl}/forms/P_EmployeeView/records`, {
            headers: {
                'Authorization': `Zoho-oauthtoken ${zoho.accessToken}`
            }
        });

        let zohoEmployees = [];
        if (response.data && Array.isArray(response.data)) {
            zohoEmployees = response.data;
        } else if (response.data && response.data.response && response.data.response.result) {
            zohoEmployees = Array.isArray(response.data.response.result)
                ? response.data.response.result
                : [response.data.response.result];
        }

        console.log(`Found ${zohoEmployees.length} employees in Zoho\n`);

        // Create email lookup map
        const zohoByEmail = {};
        zohoEmployees.forEach(emp => {
            const email = emp.EMPLOYEEMAILALIAS || emp['Email ID'];
            if (email) {
                zohoByEmail[email.toLowerCase()] = emp;
            }
        });

        // Process each teacher
        for (const teacher of teachers) {
            const email = teacher.email.toLowerCase();
            const zohoEmployee = zohoByEmail[email];

            if (zohoEmployee) {
                const pps = zohoEmployee.PPS || zohoEmployee.pps;

                if (pps) {
                    // Update all records for this teacher
                    const [result] = await connection.execute(`
                        UPDATE teacher_payments
                        SET pps_number = ?
                        WHERE email = ?
                    `, [pps, teacher.email]);

                    console.log(`✓ ${teacher.firstname.padEnd(20)} ${teacher.email.padEnd(35)} PPS: ${pps} (${result.affectedRows} records updated)`);
                    successCount++;
                } else {
                    console.log(`✗ ${teacher.firstname.padEnd(20)} ${teacher.email.padEnd(35)} NO PPS in Zoho`);
                    failCount++;
                }
            } else {
                console.log(`✗ ${teacher.firstname.padEnd(20)} ${teacher.email.padEnd(35)} Not found in Zoho`);
                failCount++;
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log(`\n=== SUMMARY ===`);
        console.log(`✓ Success: ${successCount}`);
        console.log(`✗ Failed:  ${failCount}`);
        console.log(`Total:     ${teachers.length}`);

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

populatePPS();
