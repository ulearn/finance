/**
 * View all transactions in Software/Hosting account to identify what to exclude
 */

const XeroAPIClient = require('./xero-client.js');

async function viewSoftwareTransactions(year) {
    const xero = new XeroAPIClient();

    try {
        console.log(`\n================================================================================`);
        console.log(`SOFTWARE/HOSTING TRANSACTIONS - ${year}`);
        console.log(`================================================================================\n`);

        // Get all invoices and bank transactions coded to Software/Hosting (B106)
        const fromDate = new Date(`${year}-01-01`);
        const toDate = new Date(`${year}-12-31`);

        console.log('Fetching invoices...\n');

        // Get invoices with Software/Hosting account
        const invoices = await xero.getInvoices({
            where: `Status!="DELETED" AND Date >= DateTime(${year},1,1) AND Date <= DateTime(${year},12,31)`
        });

        const softwareTransactions = [];

        if (invoices && invoices.invoices) {
            invoices.invoices.forEach(inv => {
                inv.lineItems.forEach(line => {
                    if (line.accountCode === 'B106') { // Software/Hosting
                        softwareTransactions.push({
                            date: inv.date,
                            type: inv.type,
                            contact: inv.contact?.name || 'Unknown',
                            description: line.description || inv.reference || '',
                            amount: Math.abs(line.lineAmount || 0),
                            month: new Date(inv.date).getMonth() + 1
                        });
                    }
                });
            });
        }

        console.log('Fetching bank transactions...\n');

        // Get bank transactions
        const bankTxns = await xero.getBankTransactions({
            where: `Status!="DELETED" AND Date >= DateTime(${year},1,1) AND Date <= DateTime(${year},12,31)`
        });

        if (bankTxns && bankTxns.bankTransactions) {
            bankTxns.bankTransactions.forEach(txn => {
                txn.lineItems.forEach(line => {
                    if (line.accountCode === 'B106') { // Software/Hosting
                        softwareTransactions.push({
                            date: txn.date,
                            type: txn.type,
                            contact: txn.contact?.name || 'Bank',
                            description: line.description || txn.reference || '',
                            amount: Math.abs(line.lineAmount || 0),
                            month: new Date(txn.date).getMonth() + 1
                        });
                    }
                });
            });
        }

        // Sort by date
        softwareTransactions.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Display all transactions
        console.log(`Found ${softwareTransactions.length} software transactions:\n`);
        console.log(`DATE       | MONTH | CONTACT/VENDOR              | DESCRIPTION                                    | AMOUNT`);
        console.log(`-----------|-------|----------------------------|------------------------------------------------|----------`);

        let total = 0;
        softwareTransactions.forEach(txn => {
            const date = new Date(txn.date).toISOString().substring(0, 10);
            const contact = txn.contact.substring(0, 25).padEnd(25);
            const desc = txn.description.substring(0, 45).padEnd(45);
            console.log(`${date} | ${String(txn.month).padStart(2)}    | ${contact} | ${desc} | €${txn.amount.toFixed(2)}`);
            total += txn.amount;
        });

        console.log(`-----------|-------|----------------------------|------------------------------------------------|----------`);
        console.log(`TOTAL: €${total.toFixed(2)}`);

        // Group by vendor/description keyword
        console.log(`\n\nGROUPED BY SOFTWARE/VENDOR:\n`);
        const grouped = {};

        softwareTransactions.forEach(txn => {
            const desc = txn.description.toLowerCase();
            const contact = txn.contact.toLowerCase();
            const searchText = (desc + ' ' + contact).toLowerCase();

            // Try to identify vendor
            let vendor = 'Other';
            if (searchText.includes('zoho')) vendor = 'Zoho';
            else if (searchText.includes('hubspot')) vendor = 'HubSpot';
            else if (searchText.includes('xero')) vendor = 'Xero';
            else if (searchText.includes('fidelo')) vendor = 'Fidelo';
            else if (searchText.includes('miniextensions')) vendor = 'MiniExtensions';
            else if (searchText.includes('lucidchart')) vendor = 'Lucidchart';
            else if (searchText.includes('adobe')) vendor = 'Adobe';
            else if (searchText.includes('google')) vendor = 'Google';
            else if (searchText.includes('microsoft') || searchText.includes('office')) vendor = 'Microsoft';
            else if (searchText.includes('aws') || searchText.includes('amazon')) vendor = 'AWS';
            else if (searchText.includes('hosting')) vendor = 'Hosting';
            else vendor = txn.contact;

            if (!grouped[vendor]) {
                grouped[vendor] = { count: 0, total: 0 };
            }
            grouped[vendor].count++;
            grouped[vendor].total += txn.amount;
        });

        Object.entries(grouped)
            .sort((a, b) => b[1].total - a[1].total)
            .forEach(([vendor, data]) => {
                console.log(`${vendor.padEnd(30)} | ${String(data.count).padStart(3)} txns | €${data.total.toFixed(2)}`);
            });

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response:', JSON.stringify(error.response.body, null, 2));
        }
    }
}

// Run
const year = process.argv[2] || '2024';
viewSoftwareTransactions(year).catch(error => {
    console.error('Failed:', error.message);
    process.exit(1);
});
