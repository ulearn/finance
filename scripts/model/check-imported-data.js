// Quick script to check what was imported
require('dotenv').config();
const mysql = require('mysql2/promise');

async function check() {
    const connection = await mysql.createConnection({
        host: process.env.MODEL_DB_HOST,
        user: process.env.MODEL_DB_USER,
        password: process.env.MODEL_DB_PASSWORD,
        database: process.env.MODEL_DB_NAME
    });

    const [rows] = await connection.execute(`
        SELECT period_date, revenue_total, revenue_b2b, revenue_b2c,
               gross_profit, operating_profit
        FROM financial_actuals
        ORDER BY period_date DESC
        LIMIT 12
    `);

    console.log('Imported data:');
    console.table(rows);

    await connection.end();
}

check();
