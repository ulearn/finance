#!/usr/bin/env node
/**
 * Test Payment Workflow with AI Checker Integration
 *
 * Demonstrates the complete workflow with GPT-4o AI checker:
 * 1. Processes sample transactions
 * 2. AI reviews all results (success, error, manual review)
 * 3. Generates comprehensive summary with AI insights
 */

const PaymentWorkflow = require('../../scripts/assign/workflow');

(async () => {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('TESTING PAYMENT WORKFLOW WITH AI CHECKER INTEGRATION');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Create workflow with AI checker enabled
    const workflow = new PaymentWorkflow({
        dryRun: true,  // Don't actually create payments
        slackChannel: '#financial-test',
        useAIChecker: true,  // Enable AI checker
        apiDelay: 500  // Reduce delay for testing
    });

    // Sample transactions representing different scenarios
    const testTransactions = [
        // Successful assignment (D reference match)
        {
            date: '2025-11-28',
            amount: 1342,
            description: 'ULEARND2025548TMUL SP',
            source: 'boi',
            id: 'test001'
        },

        // Manual review (truncated name)
        {
            date: '2025-11-28',
            amount: 500,
            description: 'Andrea Michelle Di',
            source: 'boi',
            id: 'test002'
        },

        // Error case (student ID not found)
        {
            date: '2025-11-25',
            amount: 1450,
            description: 'ULEARN29999',
            source: 'boi',
            id: 'test003'
        },

        // Successful assignment (student ID match)
        {
            date: '2025-11-20',
            amount: 554,
            description: 'Payment from Student 30748',
            source: 'stripe',
            id: 'ch_test123'
        }
    ];

    console.log(`Processing ${testTransactions.length} test transactions...\n`);

    try {
        // Run workflow
        const results = await workflow.processTransactions(testTransactions);

        console.log('\n' + '═'.repeat(70));
        console.log('TEST RESULTS');
        console.log('═'.repeat(70));
        console.log(`Total: ${results.total}`);
        console.log(`Success: ${results.success}`);
        console.log(`Manual Review: ${results.manualReview}`);
        console.log(`Failed: ${results.failed}`);

        if (results.aiCheckerStats) {
            console.log('\nAI Checker Stats:');
            console.log(`  Total Checked: ${results.aiCheckerStats.totalChecked}`);
            console.log(`  Approved: ${results.aiCheckerStats.approved}`);
            console.log(`  Fix Proposed: ${results.aiCheckerStats.fixProposed}`);
            console.log(`  Flagged: ${results.aiCheckerStats.flagged}`);
            console.log(`  Full Manual Reads: ${results.aiCheckerStats.fullManualReads}`);

            // Show which manual sections were referenced
            const sections = Object.entries(results.aiCheckerStats.manualSectionsRead || {});
            if (sections.length > 0) {
                console.log('\nManual Sections Referenced:');
                sections.forEach(([section, count]) => {
                    console.log(`  ${section}: ${count} times`);
                });
            }
        }

        // Show AI assessments for each transaction
        console.log('\n' + '═'.repeat(70));
        console.log('AI ASSESSMENTS BY TRANSACTION');
        console.log('═'.repeat(70));

        results.transactions.forEach((result, index) => {
            const txn = result.transaction;
            console.log(`\n${index + 1}. ${txn.description} (€${txn.amount})`);
            console.log(`   Status: ${result.status}`);

            if (result.aiAssessment) {
                const ai = result.aiAssessment;
                console.log(`   AI Action: ${ai.recommendedAction || 'unknown'}`);
                console.log(`   AI Confidence: ${ai.aiAssessment?.confidence || 'N/A'}`);
                console.log(`   AI Reasoning: ${ai.aiAssessment?.reasoning || 'N/A'}`);

                if (ai.proposedFix) {
                    console.log(`   Proposed Fix:`);
                    console.log(`     Student ID: ${ai.proposedFix.studentId || 'N/A'}`);
                    console.log(`     Method: ${ai.proposedFix.searchMethod || 'N/A'}`);
                    console.log(`     Notes: ${ai.proposedFix.notes || 'N/A'}`);
                }

                if (ai.aiAssessment?.issues && ai.aiAssessment.issues.length > 0) {
                    console.log(`   Issues: ${ai.aiAssessment.issues.join(', ')}`);
                }

                if (ai.aiAssessment?.suggestions && ai.aiAssessment.suggestions.length > 0) {
                    console.log(`   Suggestions: ${ai.aiAssessment.suggestions.join(', ')}`);
                }
            } else {
                console.log(`   ⚠️  No AI assessment available`);
            }
        });

        console.log('\n' + '═'.repeat(70));
        console.log('✅ TEST COMPLETED SUCCESSFULLY');
        console.log('═'.repeat(70));

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
})();
