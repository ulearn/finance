/**
 * List all available reports in Xero to see what we can use
 */

const XeroAPIClient = require('./xero-client.js');

async function listReports() {
    const xero = new XeroAPIClient();

    try {
        console.log(`\n================================================================================`);
        console.log(`AVAILABLE XERO REPORTS`);
        console.log(`================================================================================\n`);

        const reports = await xero.getReports();

        if (reports && reports.reports) {
            console.log(`Found ${reports.reports.length} reports:\n`);

            reports.reports.forEach(report => {
                console.log(`- ${report.reportName || report.reportID}`);
                if (report.reportTitle) console.log(`  Title: ${report.reportTitle}`);
                if (report.reportType) console.log(`  Type: ${report.reportType}`);
                if (report.reportID) console.log(`  ID: ${report.reportID}`);
                console.log('');
            });
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response:', JSON.stringify(error.response.body, null, 2));
        }
    }
}

listReports().catch(error => {
    console.error('Failed:', error.message);
    process.exit(1);
});
