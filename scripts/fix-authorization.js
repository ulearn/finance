#!/usr/bin/env node
require('dotenv').config();
const mysql = require('mysql2/promise');

async function fixAuthorization() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306
    });

    console.log('Fixing SEP authorization...');

    await connection.execute(`
        UPDATE payroll_authorizations
        SET authorized = TRUE,
            authorized_by = 'System Admin',
            authorized_at = NOW()
        WHERE id = 2
    `);

    console.log('Authorization updated!');

    const [result] = await connection.execute(`
        SELECT * FROM payroll_authorizations WHERE id = 2
    `);

    console.log('\nUpdated record:');
    console.log(result[0]);

    await connection.end();
}

fixAuthorization();
