/**
 * GPT Payment Assignment Checker
 *
 * AI-assisted review of payment assignment results before finalizing.
 * Reviews ALL transactions (successful, errors, manual review) and provides
 * assessment, diagnosis, and fix suggestions.
 *
 * Uses OpenAI GPT-4o for intelligent analysis with fallback to full manual
 * when quick-start guidance isn't sufficient.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const fs = require('fs').promises;
const axios = require('axios');

class GPTPaymentChecker {
    constructor() {
        this.apiKey = process.env.OPENAI_API_KEY;
        this.model = 'gpt-4o-2024-08-06'; // Latest GPT-4o model
        this.quickStartPrompt = null;
        this.fullManual = null;

        // Stats tracking
        this.stats = {
            totalChecked: 0,
            approved: 0,
            flagged: 0,
            fixProposed: 0,
            manualSectionsRead: {},
            fullManualReads: 0
        };
    }

    /**
     * Load quick-start prompt from file
     */
    async loadQuickStartPrompt() {
        if (this.quickStartPrompt) return this.quickStartPrompt;

        const promptPath = path.join(__dirname, 'gpt-checker.md');
        this.quickStartPrompt = await fs.readFile(promptPath, 'utf8');
        return this.quickStartPrompt;
    }

    /**
     * Load full manual (only when needed)
     */
    async loadFullManual() {
        if (this.fullManual) return this.fullManual;

        const manualPath = path.join(__dirname, '../../Docs/Projects/Incomings/Manual.md');
        this.fullManual = await fs.readFile(manualPath, 'utf8');
        this.stats.fullManualReads++;
        return this.fullManual;
    }

    /**
     * Call OpenAI API with context and transaction details
     */
    async callGPT(messages, temperature = 0.3) {
        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: this.model,
                    messages: messages,
                    temperature: temperature,
                    response_format: { type: 'json_object' }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000 // 30 second timeout
                }
            );

            return JSON.parse(response.data.choices[0].message.content);

        } catch (error) {
            console.error('❌ GPT API Error:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', JSON.stringify(error.response.data));
            }
            throw error;
        }
    }

    /**
     * Check a single transaction result
     */
    async checkTransaction(transactionResult) {
        this.stats.totalChecked++;

        const txn = transactionResult.transaction;
        const status = transactionResult.status;

        // Build context for GPT
        const quickStart = await this.loadQuickStartPrompt();

        const messages = [
            {
                role: 'system',
                content: `You are a payment assignment reviewer. Use the Quick Start Guide below to analyze transactions.

${quickStart}

IMPORTANT: Your response must be valid JSON matching the output format in the guide.`
            },
            {
                role: 'user',
                content: `Analyze this transaction result:

**Transaction Details:**
- Source: ${txn.source}
- Amount: €${txn.amount}
- Date: ${txn.date}
- Description: ${txn.description || 'N/A'}
- Reference: ${txn.reference || 'N/A'}
- Customer Name: ${txn.customerName || 'N/A'}
- Transaction ID: ${txn.id}

**Assignment Result:**
- Status: ${status}
- Match Method: ${transactionResult.matchMethod || 'N/A'}
${transactionResult.booking ? `- Matched Booking: ${transactionResult.booking.documentNumber} (Student ${transactionResult.booking.customerNumber})` : ''}
${transactionResult.payment ? `- Payment Created: ID ${transactionResult.payment.paymentId}` : ''}
${transactionResult.discrepancy ? `- Discrepancy: Expected €${transactionResult.discrepancy.expectedAmount}, Received €${transactionResult.discrepancy.receivedAmount}, Diff: €${transactionResult.discrepancy.difference}` : ''}
${transactionResult.error ? `- Error: ${transactionResult.error}` : ''}
${transactionResult.notification ? `- Notes: ${transactionResult.notification}` : ''}

Provide your assessment in JSON format.`
            }
        ];

        try {
            const assessment = await this.callGPT(messages);

            // Track manual sections read
            if (assessment.manualSectionsRead && assessment.manualSectionsRead.length > 0) {
                assessment.manualSectionsRead.forEach(section => {
                    this.stats.manualSectionsRead[section] = (this.stats.manualSectionsRead[section] || 0) + 1;
                });
            }

            // Update stats
            if (assessment.recommendedAction === 'approve') {
                this.stats.approved++;
            } else if (assessment.recommendedAction === 'fix') {
                this.stats.fixProposed++;
            } else {
                this.stats.flagged++;
            }

            // If GPT needs full manual, provide it and retry
            if (assessment.needsFullManual) {
                console.log('   🔍 GPT requested full manual - providing context...');
                const fullManual = await this.loadFullManual();

                messages.push({
                    role: 'assistant',
                    content: JSON.stringify(assessment)
                });

                messages.push({
                    role: 'user',
                    content: `Here is the full manual for additional context:

${fullManual}

Please provide an updated assessment with this additional information.`
                });

                const updatedAssessment = await this.callGPT(messages);
                return updatedAssessment;
            }

            return assessment;

        } catch (error) {
            console.error(`   ❌ GPT check failed for ${txn.id}:`, error.message);

            // Return safe fallback assessment
            return {
                transactionId: txn.id,
                status: status,
                aiAssessment: {
                    isCorrect: null,
                    confidence: 'low',
                    reasoning: `GPT check failed: ${error.message}`,
                    issues: ['AI analysis unavailable'],
                    suggestions: ['Proceed with human review']
                },
                recommendedAction: 'human_review',
                error: error.message
            };
        }
    }

    /**
     * Check multiple transactions in batch
     */
    async checkTransactions(transactionResults) {
        console.log('\n' + '═'.repeat(70));
        console.log('🤖 AI PAYMENT CHECKER - REVIEWING ASSIGNMENTS');
        console.log('═'.repeat(70));
        console.log(`Model: ${this.model}`);
        console.log(`Transactions to review: ${transactionResults.length}\n`);

        const assessments = [];

        for (const result of transactionResults) {
            const txn = result.transaction;
            console.log(`\n📋 Checking: ${txn.source} ${txn.id} (€${txn.amount})`);
            console.log(`   Status: ${result.status}`);

            const assessment = await this.checkTransaction(result);

            console.log(`   AI Assessment: ${assessment.recommendedAction || 'unknown'}`);
            if (assessment.aiAssessment?.confidence) {
                console.log(`   Confidence: ${assessment.aiAssessment.confidence}`);
            }
            if (assessment.aiAssessment?.reasoning) {
                console.log(`   Reasoning: ${assessment.aiAssessment.reasoning}`);
            }

            assessments.push({
                transaction: result,
                aiAssessment: assessment
            });

            // Small delay between API calls
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        return assessments;
    }

    /**
     * Generate summary report of AI checker results
     */
    generateSummary(assessments) {
        console.log('\n' + '═'.repeat(70));
        console.log('AI CHECKER SUMMARY');
        console.log('═'.repeat(70));
        console.log(`Total Checked: ${this.stats.totalChecked}`);
        console.log(`✅ Approved: ${this.stats.approved}`);
        console.log(`🔧 Fix Proposed: ${this.stats.fixProposed}`);
        console.log(`🚩 Flagged for Human Review: ${this.stats.flagged}`);
        console.log(`📖 Full Manual Reads: ${this.stats.fullManualReads}`);

        // Show which manual sections were most referenced
        const sectionsRead = Object.entries(this.stats.manualSectionsRead);
        if (sectionsRead.length > 0) {
            console.log('\n📚 Manual Sections Referenced:');
            sectionsRead
                .sort((a, b) => b[1] - a[1])
                .forEach(([section, count]) => {
                    console.log(`   ${section}: ${count} times`);
                });
        }

        // Group by recommended action
        const byAction = {
            approve: [],
            fix: [],
            human_review: []
        };

        assessments.forEach(a => {
            const action = a.aiAssessment.recommendedAction || 'human_review';
            if (!byAction[action]) byAction[action] = [];
            byAction[action].push(a);
        });

        // Show fix suggestions
        if (byAction.fix && byAction.fix.length > 0) {
            console.log('\n🔧 PROPOSED FIXES:');
            byAction.fix.forEach(a => {
                const txn = a.transaction.transaction;
                const fix = a.aiAssessment.proposedFix;
                console.log(`\n   Transaction: ${txn.source} €${txn.amount} - "${txn.description}"`);
                if (fix) {
                    console.log(`   → Student ID: ${fix.studentId || 'N/A'}`);
                    console.log(`   → Method: ${fix.searchMethod || 'N/A'}`);
                    console.log(`   → Notes: ${fix.notes || 'N/A'}`);
                }
            });
        }

        // Show flagged items
        if (byAction.human_review && byAction.human_review.length > 0) {
            console.log('\n🚩 FLAGGED FOR HUMAN REVIEW:');
            byAction.human_review.forEach(a => {
                const txn = a.transaction.transaction;
                const issues = a.aiAssessment.aiAssessment?.issues || [];
                console.log(`\n   Transaction: ${txn.source} €${txn.amount} - "${txn.description}"`);
                console.log(`   Issues: ${issues.join(', ')}`);
            });
        }

        console.log('\n' + '═'.repeat(70));

        return {
            stats: this.stats,
            byAction: byAction
        };
    }

    /**
     * Get stats for logging/reporting
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Reset stats (e.g., between runs)
     */
    resetStats() {
        this.stats = {
            totalChecked: 0,
            approved: 0,
            flagged: 0,
            fixProposed: 0,
            manualSectionsRead: {},
            fullManualReads: 0
        };
    }
}

module.exports = GPTPaymentChecker;
