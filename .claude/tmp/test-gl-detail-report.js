// Test General Ledger Detail Report ID 1071
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const XeroAPIClient = require('../../scripts/xero/xero-client');

async function testGLDetailReport() {
    const xero = new XeroAPIClient();

    try {
        console.log('🔍 Accessing General Ledger Detail Report (ID: 1071)...\n');

        // Try to get the GL Detail report using report ID 1071
        const method = async () => {
            const response = await xero.xero.accountingApi.getReportFromId(
                xero.tenantId,
                '1071' // General Ledger Detail report ID
            );
            return response.body;
        };

        const report = await xero.makeApiCall(method);

        console.log('✅ Report retrieved successfully!\n');
        console.log('='.repeat(80));
        console.log('\n📋 Report Structure:\n');
        console.log(JSON.stringify(report, null, 2).substring(0, 2000)); // First 2000 chars
        console.log('\n...\n');
        console.log('='.repeat(80));

        // Analyze the report structure
        if (report.Reports && report.Reports.length > 0) {
            const r = report.Reports[0];
            console.log('\n📊 Report Details:');
            console.log(`   Name: ${r.ReportName}`);
            console.log(`   Type: ${r.ReportType}`);
            console.log(`   Date: ${r.ReportDate}`);
            console.log(`   Rows: ${r.Rows?.length || 0}`);

            if (r.Rows && r.Rows.length > 0) {
                console.log('\n   First 3 rows:');
                r.Rows.slice(0, 3).forEach((row, idx) => {
                    console.log(`\n   ${idx + 1}. Row Type: ${row.RowType}`);
                    console.log(`      Title: ${row.Title || 'N/A'}`);
                    if (row.Cells && row.Cells.length > 0) {
                        console.log(`      Cells: ${row.Cells.length}`);
                        console.log(`      Sample: ${row.Cells.map(c => c.Value).slice(0, 5).join(' | ')}`);
                    }
                    if (row.Rows && row.Rows.length > 0) {
                        console.log(`      Sub-rows: ${row.Rows.length}`);
                    }
                });
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);

        if (error.response) {
            console.error('\n📋 Response Details:');
            console.error('   Status:', error.response.statusCode);
            console.error('   Body:', JSON.stringify(error.response.body, null, 2));
        }

        if (error.message.includes('scope')) {
            console.error('\n⚠️  This might be a scope/permission issue.');
            console.error('   Required scope: accounting.reports.read');
        }
    }
}

testGLDetailReport();
