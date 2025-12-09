// init-db.js - Initialize database schema
// Run this once to set up the financial modeling tables

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function initializeDatabase() {
    const connection = await mysql.createConnection({
        host: process.env.MODEL_DB_HOST || 'localhost',
        user: process.env.MODEL_DB_USER,
        password: process.env.MODEL_DB_PASSWORD,
        database: process.env.MODEL_DB_NAME || 'hub_model',
        port: process.env.MODEL_DB_PORT || 3306,
        multipleStatements: true
    });

    try {
        console.log('🔧 Initializing financial modeling database...');

        // Read schema file
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // Execute schema
        console.log('📄 Creating tables...');
        await connection.query(schema);

        console.log('✅ Database initialized successfully!');
        console.log('\nCreated tables:');
        console.log('  - financial_scenarios');
        console.log('  - forecast_drivers');
        console.log('  - financial_actuals');
        console.log('  - financial_forecasts');
        console.log('  - kpi_tracking');
        console.log('  - revenue_cost_ratios');
        console.log('  - lto_simulations');

        console.log('\n📊 Next steps:');
        console.log('1. Sync historical data from Xero: POST /fins/model/dashboard/data/sync-xero');
        console.log('2. Calculate cost ratios: POST /fins/model/dashboard/data/calculate-ratios');
        console.log('3. Create your first scenario: POST /fins/model/dashboard/scenarios');
        console.log('4. Add drivers to scenario: POST /fins/model/dashboard/scenarios/:id/drivers');
        console.log('5. Generate forecast: POST /fins/model/dashboard/scenarios/:id/forecast');
        console.log('\n🎯 Dashboard: https://hub.ulearnschool.com/fins/scripts/model/dashboard.html');

        return { success: true };

    } catch (error) {
        console.error('❌ Error initializing database:', error);
        throw error;
    } finally {
        await connection.end();
    }
}

// Run if called directly
if (require.main === module) {
    initializeDatabase()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = initializeDatabase;
