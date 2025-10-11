#!/usr/bin/env node
// Test the output endpoints directly
require('dotenv').config();
const mysql = require('mysql2/promise');

async function testOutputEndpoint() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306
    });

    // Check what the periods endpoint returns
    console.log('=== TESTING /periods ENDPOINT ===\n');

    const [periods] = await connection.execute(`
        SELECT
            month_name as month,
            date_from as from_date,
            date_to as to_date,
            authorized,
            authorized_at
        FROM payroll_authorizations
        WHERE authorized = TRUE
        ORDER BY date_from ASC
        LIMIT 12
    `);

    console.log('Periods returned:');
    periods.forEach(p => {
        console.log(`  ${p.month}: ${p.from_date} to ${p.to_date}`);
    });

    if (periods.length > 0) {
        const period = periods[0];

        // Format dates the same way output.js does
        const formatDate = (date) => {
            const d = new Date(date);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const dateFrom = formatDate(period.from_date);
        const dateTo = formatDate(period.to_date);

        console.log(`\n=== TESTING /teachers ENDPOINT ===`);
        console.log(`Query: dateFrom=${dateFrom}, dateTo=${dateTo}\n`);

        // Test the query that /teachers endpoint uses
        const [authRows] = await connection.execute(`
            SELECT id, authorized FROM payroll_authorizations
            WHERE date_from = ? AND date_to = ? AND authorized = TRUE
        `, [dateFrom, dateTo]);

        console.log(`Authorization rows found: ${authRows.length}`);
        if (authRows.length > 0) {
            console.log(`Authorization ID: ${authRows[0].id}`);

            const authId = authRows[0].id;
            const [snapshots] = await connection.execute(`
                SELECT * FROM payroll_snapshots
                WHERE authorization_id = ? AND section = 'teachers'
                ORDER BY employee_name
            `, [authId]);

            console.log(`Teacher snapshots found: ${snapshots.length}`);
            if (snapshots.length > 0) {
                console.log('\nFirst 3 teachers:');
                snapshots.slice(0, 3).forEach(snap => {
                    console.log(`  - ${snap.employee_name}: ${snap.hours}h @ €${snap.rate}`);
                });
            }
        } else {
            console.log('⚠️  NO AUTHORIZATION FOUND!');
            console.log('\nTrying to find what dates exist in the database:');
            const [allAuth] = await connection.execute(`
                SELECT date_from, date_to FROM payroll_authorizations WHERE authorized = TRUE
            `);
            allAuth.forEach(auth => {
                console.log(`  Database has: ${auth.date_from} to ${auth.date_to}`);
            });
        }
    }

    await connection.end();
}

testOutputEndpoint();
