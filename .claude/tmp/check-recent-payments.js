/**
 * Check Recent Payments Created (Nov 28-29)
 * Find all payments with comment ending in "- Ai" (our automation signature)
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const GUI2_API = 'https://ulearn.fidelo.com/api/1.0/gui2/4e289ca973cc2b424d58ec10197bd160/search';

async function checkPaymentsForStudent(documentNumber, studentName) {
    try {
        console.log(`\n🔍 Checking: ${studentName} (${documentNumber})`);

        const response = await axios.post(
            GUI2_API,
            { document_number: documentNumber },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            }
        );

        if (response.data && response.data.result && response.data.result.length > 0) {
            const booking = response.data.result[0];
            const payments = booking.payments || [];

            // Filter for AI-created payments (comment ends with "- Ai")
            const aiPayments = payments.filter(p =>
                p.comment && p.comment.trim().endsWith('- Ai')
            );

            if (aiPayments.length > 0) {
                console.log(`   ⚠️  Found ${aiPayments.length} AI-created payment(s):`);
                aiPayments.forEach(p => {
                    console.log(`   - Date: ${p.date}`);
                    console.log(`     Amount: €${p.amount}`);
                    console.log(`     Method: ${p.method} (payment_method_id: ${p.payment_method_id || 'unknown'})`);
                    console.log(`     Comment: ${p.comment}`);
                    console.log(`     Payment ID: ${p.id || 'unknown'}`);
                    console.log('');
                });
            } else {
                console.log('   ✅ No AI-created payments found');
            }

            // Also show ALL recent payments for context
            const recentPayments = payments.filter(p => {
                const paymentDate = new Date(p.date);
                const nov27 = new Date('2025-11-27');
                return paymentDate >= nov27;
            });

            if (recentPayments.length > 0) {
                console.log(`   📋 All recent payments (since Nov 27):`);
                recentPayments.forEach(p => {
                    console.log(`   - ${p.date}: €${p.amount} (${p.method}) - ${p.comment || 'No comment'}`);
                });
            }
        } else {
            console.log('   ❌ Booking not found');
        }
    } catch (error) {
        console.error(`   ❌ Error:`, error.response?.data || error.message);
    }
}

async function main() {
    console.log('═'.repeat(70));
    console.log('CHECK RECENT AI-CREATED PAYMENTS');
    console.log('Looking for payments with comment ending in "- Ai"');
    console.log('═'.repeat(70));

    // Cherry-picked Slack remittances from test
    await checkPaymentsForStudent('D2025559', 'Padros, Laia (Student ID 30737)');
    await checkPaymentsForStudent('P20251016', 'Pelliccia, Chiara (Student ID 30779)');
    await checkPaymentsForStudent('D2025551', 'Lu, Enshi (Student ID 29804)');
    await checkPaymentsForStudent('D2025539', 'Le Port, Marie (Student ID 30758)');

    console.log('\n' + '═'.repeat(70));
    console.log('✅ Check complete');
    console.log('═'.repeat(70));
}

main().catch(console.error);
