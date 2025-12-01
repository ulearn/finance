/**
 * List ALL AI-created payments for deletion
 */

const axios = require('axios');

const GUI2_TOKEN = '9feb2576ba97b2743550120aa5dd935c';
const GUI2_URL = 'https://ulearn.fidelo.com/api/1.0/gui2/4e289ca973cc2b424d58ec10197bd160';

async function listAllAIPayments() {
    try {
        console.log('═'.repeat(70));
        console.log('ALL AI-CREATED PAYMENTS');
        console.log('Searching for payments with "- Ai" in comment');
        console.log('Date Range: 2020-01-01 to 2026-12-31 (all time)');
        console.log('═'.repeat(70));
        console.log('');

        // Search all payments
        const response = await axios.get(`${GUI2_URL}/search`, {
            params: {
                '_token': GUI2_TOKEN,
                'filter[date]': '2020-01-01,2026-12-31'
            },
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.data || !response.data.entries) {
            console.log('❌ No data returned from API');
            return;
        }

        const allPayments = Object.values(response.data.entries);
        console.log(`📋 Total payments queried: ${allPayments.length}\n`);

        // Filter for AI-created payments (contains "- Ai")
        const aiPayments = allPayments.filter(p => {
            const comment = p['ip.comment'] || p.comment || '';
            return comment.includes('- Ai');
        });

        console.log(`🤖 AI-Created Payments Found: ${aiPayments.length}\n`);

        if (aiPayments.length === 0) {
            console.log('✅ No AI-created payments found');
            return;
        }

        console.log('═'.repeat(70));
        console.log('PAYMENTS TO DELETE');
        console.log('═'.repeat(70));
        console.log('');

        aiPayments.forEach((p, index) => {
            const paymentId = p['ts_ip.id'] || p.id;
            const receiptNumber = p['ip.receipt_number'] || p.receipt_number || 'N/A';
            const date = p['ip.date'] || p.date || 'unknown';
            const amount = p.amount || p['ip.amount'] || '0';
            const comment = p['ip.comment'] || p.comment || '';
            const method = p['kpm.name'] || 'Unknown';
            const documentNumber = p.document_number || p['t.document_number'] || 'Unknown';
            const bookingId = p.booking_id || p['ts_ip.booking_id'] || 'Unknown';

            console.log(`${index + 1}. Receipt #${receiptNumber} (Payment ID: ${paymentId})`);
            console.log(`   Booking: ${documentNumber} (ID: ${bookingId})`);
            console.log(`   Date: ${date}`);
            console.log(`   Amount: €${amount}`);
            console.log(`   Method: ${method}`);
            console.log(`   Comment: ${comment}`);
            console.log('');
        });

        console.log('═'.repeat(70));
        console.log('SUMMARY FOR DELETION');
        console.log('═'.repeat(70));
        console.log(`\nTotal AI Payments to Delete: ${aiPayments.length}\n`);

        console.log('Receipt Numbers (for easy deletion in Fidelo UI):');
        aiPayments.forEach(p => {
            const receiptNumber = p['ip.receipt_number'] || p.receipt_number || 'N/A';
            const documentNumber = p.document_number || p['t.document_number'] || 'Unknown';
            const amount = p.amount || p['ip.amount'] || '0';
            console.log(`   ${receiptNumber} - ${documentNumber} (€${amount})`);
        });

        console.log('\n' + '═'.repeat(70));

    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

listAllAIPayments();
