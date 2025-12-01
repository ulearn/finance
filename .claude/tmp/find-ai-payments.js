/**
 * Find all AI-created payments (comment contains "- Ai")
 * Check what payment method IDs were used (likely wrong)
 */

const axios = require('axios');

const GUI2_TOKEN = '9feb2576ba97b2743550120aa5dd935c';
const GUI2_URL = 'https://ulearn.fidelo.com/api/1.0/gui2/4e289ca973cc2b424d58ec10197bd160';

async function findAIPayments() {
    try {
        console.log('═'.repeat(70));
        console.log('FINDING ALL AI-CREATED PAYMENTS');
        console.log('Searching for payments with "- Ai" in comment');
        console.log('Date Range: 2025-11-17 to 2025-11-29');
        console.log('═'.repeat(70));
        console.log('');

        // Search GUI2 for payments in date range
        const response = await axios.get(`${GUI2_URL}/search`, {
            params: {
                '_token': GUI2_TOKEN,
                'filter[date]': '2025-11-17,2025-11-29'
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
        console.log(`📋 Total payments in date range: ${allPayments.length}\n`);

        // Filter for AI-created payments
        const aiPayments = allPayments.filter(p => {
            const comment = p['ip.comment'] || p.comment || '';
            return comment.includes('- Ai');
        });

        console.log(`🤖 AI-Created Payments Found: ${aiPayments.length}\n`);

        if (aiPayments.length === 0) {
            console.log('✅ No AI-created payments found in this date range');
            return;
        }

        // Correct payment method mapping
        const CORRECT_METHODS = {
            'stripe': { id: 11, name: 'Stripe' },
            'revolut': { id: 4, name: 'Credit Card' },
            'transfermate': { id: 10, name: 'TransferMate' },
            'bank': { id: 2, name: 'Bank Transfer' }
        };

        console.log('═'.repeat(70));
        console.log('AI-CREATED PAYMENTS - REVIEW NEEDED');
        console.log('═'.repeat(70));
        console.log('');

        const issues = [];

        aiPayments.forEach((p, index) => {
            const paymentId = p['ts_ip.id'] || p.id || 'unknown';
            const date = p['ip.date'] || p.date || 'unknown';
            const amount = p.amount || p['ip.amount'] || '0';
            const comment = p['ip.comment'] || p.comment || '';
            const method = p['kpm.name'] || 'Unknown Method';
            const documentNumber = p.document_number || p['t.document_number'] || 'Unknown';
            const studentName = p.customer_name || `${p.customer_firstname || ''} ${p.customer_lastname || ''}`.trim() || 'Unknown';

            console.log(`${index + 1}. Payment ID: ${paymentId}`);
            console.log(`   Date: ${date}`);
            console.log(`   Amount: €${amount}`);
            console.log(`   Document: ${documentNumber}`);
            console.log(`   Student: ${studentName}`);
            console.log(`   Comment: ${comment}`);
            console.log(`   Current Method: "${method}"`);

            // Determine what it SHOULD be based on comment
            const commentLower = comment.toLowerCase();
            let shouldBe = null;

            if (commentLower.includes('stripe')) {
                shouldBe = CORRECT_METHODS.stripe;
            } else if (commentLower.includes('revolut')) {
                shouldBe = CORRECT_METHODS.revolut;
            } else if (commentLower.includes('transfermate')) {
                shouldBe = CORRECT_METHODS.transfermate;
            } else {
                shouldBe = CORRECT_METHODS.bank;
            }

            console.log(`   Should Be: "${shouldBe.name}" (ID ${shouldBe.id})`);

            // Check if it's wrong
            if (method !== shouldBe.name) {
                console.log(`   ⚠️  INCORRECT! Should be "${shouldBe.name}" not "${method}"`);
                issues.push({
                    paymentId,
                    documentNumber,
                    studentName,
                    date,
                    amount,
                    comment,
                    currentMethod: method,
                    shouldBe: shouldBe.name,
                    shouldBeId: shouldBe.id
                });
            } else {
                console.log(`   ✅ Correct`);
            }

            console.log('');
        });

        console.log('═'.repeat(70));
        console.log('SUMMARY');
        console.log('═'.repeat(70));
        console.log(`Total AI Payments: ${aiPayments.length}`);
        console.log(`Incorrect Method: ${issues.length}`);
        console.log(`Correct Method: ${aiPayments.length - issues.length}`);

        if (issues.length > 0) {
            console.log('\n⚠️  PAYMENTS NEEDING CORRECTION:');
            console.log('═'.repeat(70));
            issues.forEach((issue, i) => {
                console.log(`${i + 1}. Payment ${issue.paymentId} (${issue.documentNumber})`);
                console.log(`   ${issue.studentName} - €${issue.amount}`);
                console.log(`   Current: ${issue.currentMethod} → Should be: ${issue.shouldBe} (ID ${issue.shouldBeId})`);
                console.log('');
            });
        }

        console.log('═'.repeat(70));

    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

findAIPayments();
