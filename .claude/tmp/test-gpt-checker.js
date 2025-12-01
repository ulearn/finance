#!/usr/bin/env node
/**
 * Test GPT Payment Checker
 *
 * Tests the AI checker with sample transaction results
 */

const GPTPaymentChecker = require('../../scripts/assign/gpt-checker');

(async () => {
    console.log('Testing GPT Payment Checker...\n');

    const checker = new GPTPaymentChecker();

    // Sample transaction results (mix of success, error, manual review)
    const sampleResults = [
        // Successful assignment
        {
            transaction: {
                id: 'ch_3SYRfHL17ol1v2QQ1in56EGj',
                source: 'stripe',
                amount: 554,
                date: '2025-11-14',
                description: 'Stripe payment',
                customerName: 'Moana Frauchiger'
            },
            status: 'success',
            matchMethod: 'transfermate_email',
            booking: {
                documentNumber: 'D2025548',
                customerNumber: '30748',
                amount_open: 554
            },
            payment: {
                paymentId: 37032
            }
        },

        // Manual review - no match found
        {
            transaction: {
                id: 'dataId123',
                source: 'boi',
                amount: 500,
                date: '2025-11-28',
                description: 'Andrea Michelle Di',
                reference: ''
            },
            status: 'manual_review',
            matchMethod: null,
            notification: 'No match found - truncated name'
        },

        // Error - student ID not found
        {
            transaction: {
                id: 'ord_xyz789',
                source: 'revolut',
                amount: 1450,
                date: '2025-11-25',
                description: 'ULEARN29999',
                customerName: 'Unknown'
            },
            status: 'manual_review',
            matchMethod: null,
            error: 'No Fidelo booking found for student ID 29999'
        }
    ];

    try {
        // Check all transactions
        const assessments = await checker.checkTransactions(sampleResults);

        // Generate summary
        const summary = checker.generateSummary(assessments);

        // Show individual assessments
        console.log('\n' + '═'.repeat(70));
        console.log('DETAILED ASSESSMENTS');
        console.log('═'.repeat(70));

        assessments.forEach((a, i) => {
            console.log(`\n${i + 1}. Transaction: ${a.transaction.transaction.id}`);
            console.log(`   Recommended Action: ${a.aiAssessment.recommendedAction}`);
            console.log(`   Confidence: ${a.aiAssessment.aiAssessment?.confidence || 'N/A'}`);
            console.log(`   Reasoning: ${a.aiAssessment.aiAssessment?.reasoning || 'N/A'}`);

            if (a.aiAssessment.proposedFix) {
                console.log(`   Proposed Fix:`);
                console.log(`     Student ID: ${a.aiAssessment.proposedFix.studentId || 'N/A'}`);
                console.log(`     Method: ${a.aiAssessment.proposedFix.searchMethod || 'N/A'}`);
                console.log(`     Notes: ${a.aiAssessment.proposedFix.notes || 'N/A'}`);
            }
        });

        console.log('\n✅ Test complete\n');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
})();
