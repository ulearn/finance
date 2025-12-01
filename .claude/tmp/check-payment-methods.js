/**
 * Check Fidelo Payment Methods and Recent Assignments
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const FIDELO_API_TOKEN = process.env.FIDELO_API_TOKEN;
const FIDELO_API_BASE = 'https://ulearn.fidelo.com/api/1.0/ts';

async function getPaymentMethods() {
    try {
        console.log('\n📋 Fetching Payment Methods from Fidelo...\n');

        const response = await axios.get(`${FIDELO_API_BASE}/payment_methods`, {
            headers: {
                'Authorization': `Bearer ${FIDELO_API_TOKEN}`,
                'Accept': 'application/json'
            }
        });

        if (response.data && response.data.payment_methods) {
            console.log('✅ Payment Methods from Fidelo:\n');
            response.data.payment_methods.forEach(method => {
                console.log(`   ID ${method.id}: ${method.name}`);
            });
            return response.data.payment_methods;
        } else {
            console.log('Response:', JSON.stringify(response.data, null, 2));
        }
    } catch (error) {
        console.error('❌ Failed to fetch payment methods:', error.response?.data || error.message);
    }
}

async function checkRecentPayments() {
    try {
        console.log('\n\n📋 Checking Recent Payments for Specific Students...\n');

        // Check Padros (Student ID 30737, Booking 41598)
        const studentIds = [
            { id: 30737, name: 'Padros, Laia', booking: 41598, docNumber: 'D2025559' },
            { id: 30779, name: 'Pelliccia, Chiara', booking: 41688, docNumber: 'P20251016' },
            { id: 29804, name: 'Lu, Enshi', booking: 40628, docNumber: 'D2025551' }
        ];

        for (const student of studentIds) {
            console.log(`\n🔍 Checking: ${student.name} (Student ID: ${student.id}, Document: ${student.docNumber})`);

            const searchParams = {
                document_number: student.docNumber
            };

            const response = await axios.post(
                'https://ulearn.fidelo.com/api/1.0/gui2/4e289ca973cc2b424d58ec10197bd160/search',
                searchParams,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                }
            );

            if (response.data && response.data.result && response.data.result.length > 0) {
                const payments = response.data.result[0].payments || [];

                if (payments.length > 0) {
                    console.log(`   Found ${payments.length} payment(s):`);
                    payments.forEach(p => {
                        console.log(`   - ${p.date}: €${p.amount} (${p.method}) - ${p.comment || 'No comment'}`);
                    });
                } else {
                    console.log('   No payments found');
                }
            }
        }
    } catch (error) {
        console.error('❌ Failed to fetch payments:', error.response?.data || error.message);
    }
}

async function main() {
    console.log('═'.repeat(70));
    console.log('FIDELO PAYMENT METHODS & RECENT ASSIGNMENTS CHECK');
    console.log('═'.repeat(70));

    await getPaymentMethods();
    await checkRecentPayments();

    console.log('\n' + '═'.repeat(70));
    console.log('✅ Check complete');
    console.log('═'.repeat(70));
}

main().catch(console.error);
