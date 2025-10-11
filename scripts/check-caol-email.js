#!/usr/bin/env node
require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkCaolEmail() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306
    });

    const [rows] = await connection.execute(`
        SELECT DISTINCT firstname, email, pps_number
        FROM teacher_payments
        WHERE firstname LIKE '%Caol%' OR firstname LIKE '%Uigin%'
        ORDER BY firstname
    `);

    console.log('Teachers matching "Caol" or "Uigin":');
    console.log('========================================');
    rows.forEach(row => {
        console.log(`Name: ${row.firstname}`);
        console.log(`Email: ${row.email || 'NULL'}`);
        console.log(`PPS: ${row.pps_number || 'NULL'}`);
        console.log('----------------------------------------');
    });

    await connection.end();
}

checkCaolEmail();
