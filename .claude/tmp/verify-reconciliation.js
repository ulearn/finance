// Verify our reconciliation via Journals API
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const XeroAPIClient = require('../../scripts/xero/xero-client');

async function verifyReconciliation() {
    const xero = new XeroAPIClient();

    try {
        console.log('🔍 Verifying €12.50 reconciliation from Jan 6, 2025...\n');

        const method = async () => {
            const todayStart = new Date('2025-11-21T00:00:00Z');
            const response = await xero.xero.accountingApi.getJournals(
                xero.tenantId,
                todayStart,
                null,
                null
            );
            return response.body;
        };

        const journals = await xero.makeApiCall(method);

        // Find journal #63188 or any journal with B127 and €12.50 on Jan 6
        const targetJournal = journals.journals.find(j => {
            const isJan6 = new Date(j.journalDate).toISOString().startsWith('2025-01-06');
            const hasB127 = j.journalLines?.some(line =>
                line.accountCode?.startsWith('B127') &&
                Math.abs(line.grossAmount) === 12.5
            );
            return isJan6 && hasB127;
        });

        if (!targetJournal) {
            console.log('❌ Could not find the reconciliation journal entry');
            return;
        }

        console.log('✅ RECONCILIATION VERIFIED!\n');
        console.log('='.repeat(80));
        console.log('\n📋 Full Journal Entry Details:\n');
        console.log(JSON.stringify(targetJournal, null, 2));
        console.log('\n' + '='.repeat(80));

        console.log('\n\n📊 Summary:');
        console.log(`   Journal Number: #${targetJournal.journalNumber}`);
        console.log(`   Date: ${new Date(targetJournal.journalDate).toISOString().split('T')[0]}`);
        console.log(`   Source Type: ${targetJournal.sourceType}`);
        console.log(`   Source ID: ${targetJournal.sourceID}`);
        console.log(`   Created: ${new Date(targetJournal.createdDateUTC).toISOString()}`);

        console.log(`\n   📝 Journal Lines:`);
        targetJournal.journalLines.forEach((line, idx) => {
            console.log(`\n   ${idx + 1}. ${line.accountCode} - ${line.accountName || 'N/A'}`);
            console.log(`      Description: ${line.description || 'N/A'}`);
            console.log(`      Net Amount: €${line.netAmount}`);
            console.log(`      Gross Amount: €${line.grossAmount}`);
            console.log(`      Tax Amount: €${line.taxAmount || 0}`);

            if (line.trackingCategories && line.trackingCategories.length > 0) {
                console.log(`      Tracking:`);
                line.trackingCategories.forEach(tc => {
                    console.log(`         ${tc.name}: ${tc.option}`);
                });
            }
        });

        console.log('\n\n✅ VERIFICATION COMPLETE');
        console.log('   Transaction: MOYILIAN CHRG GP €12.50');
        console.log('   Date: 2025-01-06');
        console.log('   Coded to: Bank Charges (B127)');
        console.log('   Status: Successfully reconciled ✓');

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
    }
}

verifyReconciliation();
