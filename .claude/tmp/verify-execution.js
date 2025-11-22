const XeroClient = require('../../scripts/xero/xero-client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function verifyReconciliations() {
  const xero = new XeroClient();

  try {
    // Get journals from today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const journals = await xero.getJournals({ ifModifiedSince: today });

    const count = journals.journals ? journals.journals.length : 0;
    console.log(`Found ${count} journals from today:`);
    console.log('');

    if (journals.journals) {
      // Sort by creation time, most recent first
      const sorted = journals.journals.sort((a, b) =>
        new Date(b.createdDateUTC) - new Date(a.createdDateUTC)
      );

      sorted.forEach(journal => {
        console.log(`Journal #${journal.journalNumber} (${journal.journalDate})`);
        console.log(`  Created: ${journal.createdDateUTC}`);

        journal.journalLines.forEach(line => {
          if (line.accountCode) {
            const amount = line.grossAmount || line.netAmount || 0;
            console.log(`  - ${line.accountCode} ${line.accountName}: €${amount} | ${line.description}`);
          }
        });
        console.log('');
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

verifyReconciliations();
