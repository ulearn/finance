// Test what reports are available via Xero API
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const XeroAPIClient = require('../../scripts/xero/xero-client');

async function testReports() {
    const xero = new XeroAPIClient();

    try {
        console.log('🔍 Testing Trial Balance report (shows GL detail)...\n');

        // Get Trial Balance report
        const method = async () => {
            const response = await xero.xero.accountingApi.getReportTrialBalance(
                xero.tenantId,
                new Date('2025-01-06'), // The date of our test reconciliation
                null, // paymentsOnly
                false // standardLayout
            );
            return response.body;
        };

        const report = await xero.makeApiCall(method);
        console.log('Trial Balance Report:');
        console.log(JSON.stringify(report, null, 2));

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response:', JSON.stringify(error.response.body, null, 2));
        }
    }
}

testReports();
