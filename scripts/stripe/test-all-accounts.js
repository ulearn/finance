/**
 * Test Stripe API - ALL Accounts (info@ + neil@)
 * Pulls transactions from both Stripe accounts for a date range
 */

const StripeIntegration = require('./api');
const fs = require('fs');

const startDate = process.argv[2] || '2025-11-01';
const endDate = process.argv[3] || '2025-11-30';

console.log(`Fetching from ALL Stripe accounts for ${startDate} to ${endDate}...\n`);

(async () => {
    try {
        const stripe = new StripeIntegration();
        const transactions = await stripe.getTransactionsFromAllAccounts(startDate, endDate);

        console.log(`\n✅ Total: ${transactions.length} transactions\n`);

        // Group by account
        const byAccount = {};
        transactions.forEach(t => {
            const acct = t.stripeAccount || 'default';
            if (!byAccount[acct]) byAccount[acct] = [];
            byAccount[acct].push(t);
        });

        console.log('Breakdown by account:');
        Object.keys(byAccount).forEach(acct => {
            const total = byAccount[acct].reduce((sum, t) => sum + t.amount, 0);
            console.log(`  ${acct}@: ${byAccount[acct].length} transactions, €${total.toFixed(2)}`);
        });

        console.log('\nSample transactions:');
        transactions.slice(0, 10).forEach(txn => {
            console.log(`  [${txn.stripeAccount || 'default'}] ${txn.date}: ${txn.customerName} - €${txn.amount} (ID: ${txn.id})`);
        });

        // Save for workflow
        const outputFile = `./nov-2025-all-accounts.json`;
        fs.writeFileSync(outputFile, JSON.stringify(transactions, null, 2));
        console.log(`\n💾 Saved to: ${outputFile}`);

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        if (error.stack) console.error(error.stack);
    }
})();
