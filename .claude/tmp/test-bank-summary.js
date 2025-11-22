// Test Bank Summary Report
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const XeroAPIClient = require('../../scripts/xero/xero-client');

async function testBankSummary() {
    const xero = new XeroAPIClient();

    try {
        console.log('🔍 Getting Bank Summary Report for January 2025...\n');

        const method = async () => {
            // Get bank summary for January 2025
            const response = await xero.xero.accountingApi.getReportBankSummary(
                xero.tenantId,
                new Date('2025-01-01'), // fromDate
                new Date('2025-01-31')  // toDate
            );
            return response.body;
        };

        const report = await xero.makeApiCall(method);

        console.log('✅ Bank Summary Report retrieved!\n');
        console.log('='.repeat(80));
        console.log(JSON.stringify(report, null, 2).substring(0, 5000));
        console.log('\n' + '='.repeat(80));

        if (report.Reports && report.Reports.length > 0) {
            const r = report.Reports[0];
            console.log('\n📊 Report Details:');
            console.log(`   Name: ${r.ReportName}`);
            console.log(`   Type: ${r.ReportType}`);
            console.log(`   Date: ${r.ReportDate}`);
            console.log(`   Rows: ${r.Rows?.length || 0}`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('\n📋 Response:', error.response.statusCode);
            console.error('Body:', JSON.stringify(error.response.body, null, 2));
        }
    }
}

testBankSummary();
