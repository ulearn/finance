/**
 * Stripe API Test Script
 * Location: /home/hub/public_html/fins/scripts/stripe/test.js
 *
 * Purpose: Test Stripe API connection and permissions
 */

const StripeIntegration = require('./api');

const startDate = process.argv[2] || '2025-11-01';
const endDate = process.argv[3] || '2025-11-30';

console.log(`Testing Stripe API for ${startDate} to ${endDate}...\n`);

(async () => {
    try {
        const stripe = new StripeIntegration();

        console.log('✅ Stripe client initialized');
        console.log('Fetching transactions...\n');

        const transactions = await stripe.getTransactions(startDate, endDate);

        console.log(`\n✅ SUCCESS! Found ${transactions.length} transaction(s)\n`);

        if (transactions.length > 0) {
            console.log('Sample transactions:');
            transactions.slice(0, 5).forEach(txn => {
                console.log(`  ${txn.date}: ${txn.customerName} - €${txn.amount} (net: €${txn.netAmount}, fee: €${txn.fee})`);
            });

            console.log('\n📊 Summary:');
            const totalGross = transactions.reduce((sum, t) => sum + t.amount, 0);
            const totalNet = transactions.reduce((sum, t) => sum + t.netAmount, 0);
            const totalFees = transactions.reduce((sum, t) => sum + t.fee, 0);

            console.log(`  Total Gross: €${totalGross.toFixed(2)}`);
            console.log(`  Total Net: €${totalNet.toFixed(2)}`);
            console.log(`  Total Fees: €${totalFees.toFixed(2)}`);
        }

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);

        if (error.response?.data?.error) {
            console.error('Stripe Error:', error.response.data.error.message);
        }

        console.log('\nTroubleshooting:');
        console.log('1. Check STRIPE_SECRET is set in .env');
        console.log('2. Verify API key permissions: rak_charge_read, rak_customer_read, rak_payout_read, rak_balance_read');
        console.log('3. Confirm API key is active (not deleted or expired)');
    }
})();
