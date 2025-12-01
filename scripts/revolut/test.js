/**
 * Revolut Merchant API Test Script
 * Location: /home/hub/public_html/fins/scripts/revolut/test.js
 *
 * Purpose: Test Revolut Merchant API connection and permissions
 */

const RevolutIntegration = require('./api');

const startDate = process.argv[2] || '2025-11-01';
const endDate = process.argv[3] || '2025-11-30';

console.log(`Testing Revolut Merchant API for ${startDate} to ${endDate}...\n`);

(async () => {
    try {
        const revolut = new RevolutIntegration();

        console.log('✅ Revolut client initialized');
        console.log(`Environment: ${revolut.environment}`);
        console.log('Testing API connection...\n');

        // Test connection first
        const connectionTest = await revolut.testConnection();

        if (!connectionTest) {
            throw new Error('Connection test failed');
        }

        console.log('\nFetching transactions...\n');

        const transactions = await revolut.getTransactions(startDate, endDate);

        console.log(`\n✅ SUCCESS! Found ${transactions.length} transaction(s)\n`);

        if (transactions.length > 0) {
            console.log('Sample transactions:');
            transactions.slice(0, 5).forEach(txn => {
                console.log(`  ${txn.date}: ${txn.customerName} - €${txn.amount} (${txn.status})`);
            });

            console.log('\n📊 Summary:');
            const totalGross = transactions.reduce((sum, t) => sum + t.amount, 0);
            const totalNet = transactions.reduce((sum, t) => sum + t.netAmount, 0);
            const totalFees = transactions.reduce((sum, t) => sum + t.fee, 0);

            console.log(`  Total Gross: €${totalGross.toFixed(2)}`);
            console.log(`  Total Net: €${totalNet.toFixed(2)}`);
            console.log(`  Total Fees: €${totalFees.toFixed(2)}`);

            console.log('\n📋 Payment Methods:');
            const methods = {};
            transactions.forEach(txn => {
                methods[txn.paymentMethod] = (methods[txn.paymentMethod] || 0) + 1;
            });
            Object.entries(methods).forEach(([method, count]) => {
                console.log(`  ${method}: ${count} transaction(s)`);
            });
        } else {
            console.log('ℹ️  No transactions found for this period');
            console.log('   This may be normal if:');
            console.log('   - Testing sandbox with no test data');
            console.log('   - Production account has no transactions in date range');
            console.log('   - Merchant account not yet active');
        }

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);

        if (error.response?.data) {
            console.error('Revolut API Error:', JSON.stringify(error.response.data, null, 2));
        }

        console.log('\nTroubleshooting:');
        console.log('1. Check REVOLUT_API_KEY is set in .env');
        console.log('2. Verify API key has required permissions:');
        console.log('   - Accounts (read)');
        console.log('   - Transactions (read)');
        console.log('   - Counterparties (read)');
        console.log('3. Confirm REVOLUT_ENVIRONMENT is correct (production/sandbox)');
        console.log('4. Verify API key is active (not expired or revoked)');

        process.exit(1);
    }
})();
