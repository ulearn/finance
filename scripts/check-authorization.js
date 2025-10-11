#!/usr/bin/env node
require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkAuthorization() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306
    });

    console.log('=== AUTHORIZED PERIODS ===');
    const [authorizations] = await connection.execute(`
        SELECT * FROM payroll_authorizations
        ORDER BY date_from DESC
    `);

    authorizations.forEach(auth => {
        console.log(`\nID: ${auth.id}`);
        console.log(`Month: ${auth.month_name}`);
        console.log(`Period: ${auth.date_from} to ${auth.date_to}`);
        console.log(`Authorized: ${auth.authorized ? 'YES' : 'NO'}`);
        console.log(`Authorized At: ${auth.authorized_at}`);
    });

    console.log('\n\n=== SNAPSHOTS ===');
    for (const auth of authorizations) {
        const [snapshots] = await connection.execute(`
            SELECT section, COUNT(*) as count
            FROM payroll_snapshots
            WHERE authorization_id = ?
            GROUP BY section
        `, [auth.id]);

        console.log(`\nAuthorization ID ${auth.id} (${auth.month_name}):`);
        snapshots.forEach(snap => {
            console.log(`  ${snap.section}: ${snap.count} records`);
        });

        // Show teacher snapshot details
        const [teachers] = await connection.execute(`
            SELECT employee_name, employee_email, hours, rate, total_pay
            FROM payroll_snapshots
            WHERE authorization_id = ? AND section = 'teachers'
            ORDER BY employee_name
            LIMIT 5
        `, [auth.id]);

        if (teachers.length > 0) {
            console.log(`\n  First ${Math.min(5, teachers.length)} teachers:`);
            teachers.forEach(t => {
                console.log(`    - ${t.employee_name} (${t.employee_email}): ${t.hours}h @ €${t.rate} = €${t.total_pay}`);
            });
        }
    }

    await connection.end();
}

checkAuthorization();
