// Test Journals API to see GL entries
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const XeroAPIClient = require('../../scripts/xero/xero-client');

async function testJournals() {
    const xero = new XeroAPIClient();

    try {
        console.log('🔍 Getting recent journals (GL entries) for January 2025...\n');

        const method = async () => {
            const response = await xero.xero.accountingApi.getJournals(
                xero.tenantId,
                null, // ifModifiedSince
                null, // offset
                null  // paymentsOnly
            );
            return response.body;
        };

        const journals = await xero.makeApiCall(method);

        if (!journals.journals || journals.journals.length === 0) {
            console.log('❌ No journals found');
            return;
        }

        // Filter to journals from January 2025 and look for our reconciliation
        const janJournals = journals.journals.filter(j => {
            const date = new Date(j.journalDate);
            return date.getFullYear() === 2025 && date.getMonth() === 0; // January
        });

        console.log(`✅ Found ${janJournals.length} journal entries from January 2025\n`);

        // Look for journals with B127 account code
        const b127Journals = janJournals.filter(j =>
            j.journalLines?.some(line => line.accountCode === 'B127')
        );

        if (b127Journals.length > 0) {
            console.log(`✅ Found ${b127Journals.length} journal(s) with B127 (Bank Fees):\n`);
            console.log('='.repeat(80));

            b127Journals.forEach((j, idx) => {
                console.log(`\n${idx + 1}. Journal #${j.journalNumber}`);
                console.log(`   Date: ${new Date(j.journalDate).toISOString().split('T')[0]}`);
                console.log(`   Source: ${j.sourceType}`);
                console.log(`   \n   Journal Lines:`);

                j.journalLines.forEach((line, lineIdx) => {
                    console.log(`\n   ${lineIdx + 1}.`);
                    console.log(`      Account: ${line.accountCode} - ${line.accountName}`);
                    console.log(`      Description: ${line.description || 'N/A'}`);
                    console.log(`      Net Amount: €${line.netAmount}`);
                    console.log(`      Gross Amount: €${line.grossAmount}`);
                    console.log(`      Tax Amount: €${line.taxAmount || 0}`);
                });

                console.log('\n' + '-'.repeat(80));
            });
        } else {
            console.log(`❌ No journals found with B127 in January 2025`);
            console.log(`   Showing first 5 January journals instead:\n`);

            janJournals.slice(0, 5).forEach((j, idx) => {
                console.log(`\n${idx + 1}. Journal #${j.journalNumber} - ${new Date(j.journalDate).toISOString().split('T')[0]}`);
                console.log(`   Source: ${j.sourceType}`);
                if (j.journalLines && j.journalLines.length > 0) {
                    console.log(`   Accounts: ${j.journalLines.map(l => l.accountCode).join(', ')}`);
                }
            });
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
    }
}

testJournals();
