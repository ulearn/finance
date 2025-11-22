// Test Journals API for entries created today
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const XeroAPIClient = require('../../scripts/xero/xero-client');

async function testJournalsToday() {
    const xero = new XeroAPIClient();

    try {
        console.log('🔍 Getting journals created/modified today (Nov 21, 2025)...\n');

        const method = async () => {
            // Get journals modified since today
            const todayStart = new Date('2025-11-21T00:00:00Z');
            const response = await xero.xero.accountingApi.getJournals(
                xero.tenantId,
                todayStart, // ifModifiedSince
                null,       // offset
                null        // paymentsOnly
            );
            return response.body;
        };

        const journals = await xero.makeApiCall(method);

        if (!journals.journals || journals.journals.length === 0) {
            console.log('❌ No journals found modified today');
            return;
        }

        console.log(`✅ Found ${journals.journals.length} journal(s) modified today\n`);
        console.log('='.repeat(80));

        // Look for journals with B127 account code (Bank Charges)
        const b127Journals = journals.journals.filter(j =>
            j.journalLines?.some(line => line.accountCode === 'B127')
        );

        if (b127Journals.length > 0) {
            console.log(`\n✅ Found ${b127Journals.length} journal(s) with B127 (Bank Charges):\n`);

            b127Journals.forEach((j, idx) => {
                console.log(`${idx + 1}. Journal #${j.journalNumber}`);
                console.log(`   Date: ${new Date(j.journalDate).toISOString().split('T')[0]}`);
                console.log(`   Source: ${j.sourceType}`);
                console.log(`   Source ID: ${j.sourceID}`);
                console.log(`\n   Journal Lines:`);

                j.journalLines.forEach((line, lineIdx) => {
                    console.log(`\n   ${lineIdx + 1}.`);
                    console.log(`      Account: ${line.accountCode} - ${line.accountName || 'N/A'}`);
                    console.log(`      Description: ${line.description || 'N/A'}`);
                    console.log(`      Net Amount: €${line.netAmount}`);
                    console.log(`      Gross Amount: €${line.grossAmount}`);
                });

                console.log('\n' + '-'.repeat(80));
            });
        } else {
            console.log(`\n⚠️  No journals found with B127 today`);
            console.log(`   Showing all ${journals.journals.length} journals instead:\n`);

            journals.journals.slice(0, 10).forEach((j, idx) => {
                console.log(`\n${idx + 1}. Journal #${j.journalNumber}`);
                console.log(`   Date: ${new Date(j.journalDate).toISOString().split('T')[0]}`);
                console.log(`   Source: ${j.sourceType}`);
                if (j.journalLines && j.journalLines.length > 0) {
                    console.log(`   Accounts: ${j.journalLines.map(l => `${l.accountCode} (€${l.grossAmount})`).join(', ')}`);
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

testJournalsToday();
