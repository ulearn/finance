// Simple test of GL Detail Report
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const XeroAPIClient = require('../../scripts/xero/xero-client');

async function testGL() {
    const xero = new XeroAPIClient();

    try {
        console.log('🔍 Testing General Ledger Detail Report (ID: 1071)...\n');

        const report = await xero.getReport('1071');

        console.log('✅ SUCCESS! Report retrieved\n');
        console.log('Report structure:');
        console.log(JSON.stringify(report, null, 2).substring(0, 3000));

    } catch (error) {
        console.error('❌ Error:', error);
        console.error('\nFull error:', JSON.stringify(error, null, 2));
    }
}

testGL();
