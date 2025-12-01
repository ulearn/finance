/**
 * Check dates on existing payments to debug duplicate detection
 */

const FideloAssignmentHandler = require('../../scripts/assign/fidelo-assign');

async function checkPaymentDates() {
    const handler = new FideloAssignmentHandler();

    try {
        console.log('Checking existing payments for Laia Padros and Giacomo Ferri:\n');

        // Laia Padros - Student ID 30737, Invoice D2025559
        console.log('1. Laia Padros (Student ID 30737, Invoice D2025559)');
        const laiaPayments = await handler.getPaymentsFromAPI('D2025559');
        console.log(`   Found ${laiaPayments.length} payment(s):`);
        laiaPayments.forEach(p => {
            console.log(`   - €${p.amount} on ${p.payment_date || p['ip.date']}`);
            console.log(`     Method: ${p.payment_method || p['kpm.name']}`);
            console.log(`     Comment: ${p.comment || p['ip.comment']}`);
        });

        // Giacomo Ferri - Actually Chiara Pelliccia Student ID 30779, Invoice P20251016
        console.log('\n2. Chiara Pelliccia (Student ID 30779, Invoice P20251016)');
        const chiaraPayments = await handler.getPaymentsFromAPI('P20251016');
        console.log(`   Found ${chiaraPayments.length} payment(s):`);
        chiaraPayments.forEach(p => {
            console.log(`   - €${p.amount} on ${p.payment_date || p['ip.date']}`);
            console.log(`     Method: ${p.payment_method || p['kpm.name']}`);
            console.log(`     Comment: ${p.comment || p['ip.comment']}`);
        });

        console.log('\n📅 Stripe Transaction Dates:');
        console.log('   - Laia: 2025-11-28');
        console.log('   - Chiara: 2025-11-28');

        console.log('\n🔍 Date Tolerance: 5 days');
        console.log('   If payment dates are 2025-11-30, that\'s 2 days difference → Should match ✓');
        console.log('   If payment dates are different, that explains why duplicates not detected');

        await handler.disconnect();

    } catch (error) {
        console.error('Error:', error.message);
        await handler.disconnect();
    }
}

checkPaymentDates();
