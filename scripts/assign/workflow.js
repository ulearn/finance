/**
 * Payment Assignment Workflow - Main orchestrator for incoming payments
 * Location: /home/hub/public_html/fins/scripts/incomings/workflow.js
 *
 * Purpose: Complete end-to-end workflow for assigning incoming payments
 *
 * Process Flow:
 * 1. Load unreconciled credit transactions (from Xero, Stripe, Revolut)
 * 2. Load Slack remittances from #financial channel
 * 3. Load TransferMate payout emails from Gmail (last 60 days)
 * 4. For each transaction:
 *    a. Try Slack remittance match (Priority 1 - acknowledge sales effort immediately)
 *       - Matches by amount ±€1 or partial name match
 *       - Notifications posted as THREADED REPLIES to original sales message
 *    b. Try TransferMate email match (Priority 2 - most reliable Fidelo refs)
 *       - Matches by amount ±€1 and Fidelo reference (FIDELO-XML-SERVICE12345)
 *       - Direct student ID extraction from structured payout emails
 *    c. Try Fidelo reference search (Priority 3 - P/D refs, booking ID, name + amount)
 *       - Extracts references from bank transaction descriptions
 *    d. Try HubSpot match (Priority 4 - amount + name via active deals)
 *    e. Flag for manual review if no match
 *    f. Create payment in Fidelo (if matched)
 *    g. Handle discrepancies (€1-€10 = underpayment alert, >€10 = manual review)
 * 5. Checker Review (GPT-4o analyzes ALL results):
 *    - Validates successful assignments
 *    - Diagnoses errors and proposes fixes
 *    - Attempts to resolve manual review cases
 *    - Tracks which manual sections are referenced
 * 6. Send Slack notifications (success/underpayment/manual review) with checker insights
 * 7. Generate summary report with checker stats
 *
 * Enforcement Rules:
 * - €0-€1 difference: Assign lower amount, no alert (rounding)
 * - €1-€10 difference: Assign lower amount + UNDERPAYMENT ALERT (ForEx fees)
 * - >€10 difference: BLOCK assignment, manual review required
 *
 * Double-Count Prevention:
 * - Layer 1: Filter batch deposits (Stripe payouts, Revolut transfers) from Xero
 * - Layer 2: Check for existing payments in Fidelo (amount ±€1, date ±5 days)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const FideloReferenceSearch = require('./fidelo-search');
const HubSpotMatcher = require('./hubspot-matcher');
const SlackNotifier = require('../slack/notify');
const SlackRemittanceReader = require('../slack/attach-read');
const GmailReader = require('../gmail/reader');
const FideloAssignmentHandler = require('./fidelo-assign');
const AssignmentTracker = require('./tracker');
const GPTPaymentChecker = require('./gpt-checker');
const EscrowTracker = require('./escrow');
const { determinePaymentMethod } = require('./payment-methods');
const StripeIntegration = require('../stripe/api');
const RevolutIntegration = require('../revolut/api');
const axios = require('axios');
const fs = require('fs').promises;

class PaymentAssignmentWorkflow {
    constructor(options = {}) {
        this.fideloSearch = new FideloReferenceSearch();
        this.hubspotMatcher = new HubSpotMatcher();
        this.slackNotifier = new SlackNotifier();
        this.slackRemittanceReader = new SlackRemittanceReader();
        this.gmailReader = new GmailReader();
        this.fideloAssignment = new FideloAssignmentHandler();
        this.tracker = new AssignmentTracker();
        this.gptChecker = new GPTPaymentChecker();
        this.escrowTracker = new EscrowTracker();

        // Storage for TransferMate payout emails
        this.transferMatePayments = [];

        this.dryRun = options.dryRun || false; // If true, don't create payments
        this.slackChannel = options.slackChannel || '#financial';
        this.useAIChecker = options.useAIChecker !== false; // Default: enabled (set to false to disable)
        this.deferSlackNotifications = options.deferSlackNotifications !== false; // Default: defer until after AI check

        // Threading: Track first transaction notification for threading all subsequent ones
        // This ensures all individual payments post as replies to the first one
        this.transactionThreadParentTs = null;

        // API Rate Limiting: Delay between transactions (ms) to prevent Fidelo API 422 errors
        this.apiDelay = options.apiDelay || 3000; // Default: 3 seconds between transactions

        // Thresholds
        this.thresholds = {
            roundingTolerance: 1,      // €0-€1: No alert
            underpaymentThreshold: 10, // €1-€10: Alert but assign
            manualReviewThreshold: 10  // >€10: Block assignment
        };

        // Fidelo API
        this.fideloApiBase = 'https://ulearn.fidelo.com/api/1.0/ts';
        this.fideloApiToken = process.env.FIDELO_API_TOKEN;

        // Results tracking
        this.results = {
            total: 0,
            success: 0,
            underpayment: 0,
            manualReview: 0,
            alreadyAssigned: 0,  // NEW: Track already-assigned payments (duplicate prevention)
            escrowPending: 0,    // NEW: Track escrow payments (awaiting visa approval)
            failed: 0,
            transactions: []
        };

        // Initialize Stripe and Revolut integrations (lazy load)
        this.stripe = null;
        this.revolut = null;
    }

    /**
     * Fetch transactions from Stripe for date range
     */
    async fetchStripeTransactions(startDate, endDate) {
        try {
            if (!process.env.STRIPE_SECRET && !process.env.STRIPE_API_KEY) {
                console.log('⚠️  Stripe API key not configured - skipping Stripe transactions');
                return [];
            }

            if (!this.stripe) {
                this.stripe = new StripeIntegration();
            }

            console.log(`\n💳 Fetching Stripe transactions (${startDate} to ${endDate})...`);
            // Query ALL Stripe accounts (info@ + neil@)
            const transactions = await this.stripe.getTransactionsFromAllAccounts(startDate, endDate);

            console.log(`✅ Found ${transactions.length} Stripe transaction(s)`);
            return transactions;

        } catch (error) {
            console.error('❌ Error fetching Stripe transactions:', error.message);
            console.log('⚠️  Continuing without Stripe transactions...');
            return [];
        }
    }

    /**
     * Fetch transactions from Revolut for date range
     */
    async fetchRevolutTransactions(startDate, endDate) {
        try {
            if (!process.env.REVOLUT_API_KEY) {
                console.log('⚠️  Revolut API key not configured - skipping Revolut transactions');
                return [];
            }

            if (!this.revolut) {
                this.revolut = new RevolutIntegration();
            }

            console.log(`\n💰 Fetching Revolut transactions (${startDate} to ${endDate})...`);
            const transactions = await this.revolut.getTransactions(startDate, endDate);

            console.log(`✅ Found ${transactions.length} Revolut transaction(s)`);
            return transactions;

        } catch (error) {
            console.error('❌ Error fetching Revolut transactions:', error.message);
            console.log('⚠️  Continuing without Revolut transactions...');
            return [];
        }
    }

    /**
     * Check if a Xero transaction is a Stripe payout (batch deposit)
     * These should be skipped to avoid double-counting since individual charges are fetched from Stripe API
     *
     * @param {Object} transaction - Xero transaction
     * @returns {boolean} True if this is a Stripe payout
     */
    isStripePayout(transaction) {
        const description = (transaction.description || '').toLowerCase();

        // Common patterns for Stripe payouts in bank descriptions
        const stripePayoutPatterns = [
            'stripe',
            'stripe payout',
            'stripe transfer',
            'stripe inc',
            'payout from stripe'
        ];

        return stripePayoutPatterns.some(pattern => description.includes(pattern));
    }

    /**
     * Check if a Xero transaction is a Revolut batch transfer
     * These should be skipped to avoid double-counting since individual orders are fetched from Revolut API
     *
     * @param {Object} transaction - Xero transaction
     * @returns {boolean} True if this is a Revolut batch transfer
     */
    isRevolutBatchTransfer(transaction) {
        const description = (transaction.description || '').toLowerCase();

        // Common patterns for Revolut batch transfers in bank descriptions
        const revolutTransferPatterns = [
            'revolut merchant',
            'revolut transfer',
            'from revolut merchant'
        ];

        return revolutTransferPatterns.some(pattern => description.includes(pattern));
    }

    /**
     * Filter out transactions that are already accounted for via API sources
     * Prevents double-counting of Stripe payouts and Revolut transfers
     *
     * @param {Array} xeroTransactions - Xero transactions to filter
     * @returns {Array} Filtered transactions (excluding Stripe/Revolut batch deposits)
     */
    filterXeroTransactions(xeroTransactions) {
        const filtered = xeroTransactions.filter(txn => {
            if (this.isStripePayout(txn)) {
                console.log(`⚠️  Skipping Stripe payout (already reconciled via Stripe API): ${txn.description}`);
                return false;
            }

            if (this.isRevolutBatchTransfer(txn)) {
                console.log(`⚠️  Skipping Revolut transfer (already reconciled via Revolut API): ${txn.description}`);
                return false;
            }

            // Skip Blackhall rent transactions (handled separately, not student-related)
            const description = (txn.description || '').toLowerCase();
            if (description.includes('blackhall') && description.includes('rent')) {
                console.log(`⚠️  Skipping Blackhall rent (non-student transaction): ${txn.description}`);
                return false;
            }

            return true;
        });

        const skipped = xeroTransactions.length - filtered.length;
        if (skipped > 0) {
            console.log(`✅ Filtered ${skipped} Xero transaction(s) to prevent double-counting`);
        }

        // Normalize amount field: convert string amounts with commas to numbers
        // Xero recon data has amounts like "1,250.40" which need to be parsed
        return filtered.map(txn => {
            // If amount is already a number, keep it as is
            if (typeof txn.amount === 'number') {
                return txn;
            }

            // Parse string amount (remove commas and convert to float)
            const parsedAmount = parseFloat(String(txn.amount).replace(/,/g, ''));

            return {
                ...txn,
                amount: parsedAmount
            };
        });
    }

    /**
     * Fetch transactions from all sources and combine them
     *
     * THREE-TIER ARCHITECTURE:
     *
     * 1. DATA SOURCES (Financial) - Where money actually flows from:
     *    - Stripe (info@ + neil@) [API] → Does NOT sync to Xero (main reason this workflow exists)
     *    - Revolut Merchant [API] → Syncs to Xero (we fetch via API for speed)
     *    - Bank of Ireland via Xero [Puppeteer] → Syncs to Xero (bank transfers, TransferMate, escrow)
     *
     * 2. CRM/GUIDES (Matching) - Help identify students:
     *    - Slack #financial → Sales posts remittance with student ID
     *    - Gmail/TransferMate → Payout emails with perfect Fidelo references
     *    - HubSpot → Deals with student emails & amounts
     *
     * 3. ASSIGNMENT TARGET (Recording) - Where we write the payment:
     *    - Fidelo SIS → Student booking system
     *
     * @param {string} startDate - ISO date string (YYYY-MM-DD)
     * @param {string} endDate - ISO date string (YYYY-MM-DD)
     * @param {Array} xeroTransactions - Optional Xero transactions to include
     * @returns {Promise<Array>} Combined transactions from all DATA SOURCES
     */
    async fetchAllTransactions(startDate, endDate, xeroTransactions = []) {
        console.log('\n📊 Fetching transactions from all DATA SOURCES (Financial)...');

        const [stripeTransactions, revolutTransactions] = await Promise.all([
            this.fetchStripeTransactions(startDate, endDate),
            this.fetchRevolutTransactions(startDate, endDate)
        ]);

        // Filter Xero transactions to remove Stripe payouts and Revolut transfers
        // (they're already included as individual charges/orders from the APIs)
        const filteredXeroTransactions = this.filterXeroTransactions(xeroTransactions);

        // Combine all transactions from DATA SOURCES
        const allTransactions = [
            ...filteredXeroTransactions,  // BOI (bank transfers, TransferMate, escrow)
            ...stripeTransactions,        // Stripe (info@ terminals + neil@ online)
            ...revolutTransactions        // Revolut Merchant (online payments)
        ];

        console.log(`\n📋 DATA SOURCES Summary:`);
        console.log(`   Xero (BOI): ${filteredXeroTransactions.length} (${xeroTransactions.length - filteredXeroTransactions.length} filtered)`);
        console.log(`   Stripe (info@ + neil@): ${stripeTransactions.length}`);
        console.log(`   Revolut Merchant: ${revolutTransactions.length}`);
        console.log(`   Total Payments: ${allTransactions.length}\n`);

        return allTransactions;
    }

    /**
     * Main workflow execution
     */
    async processTransactions(transactions) {
        console.log('═══════════════════════════════════════════');
        console.log('INCOMING PAYMENTS ASSIGNMENT WORKFLOW');
        console.log('═══════════════════════════════════════════');
        console.log(`Mode: ${this.dryRun ? 'DRY RUN (no payments created)' : 'LIVE'}`);
        console.log(`Transactions to process: ${transactions.length}\n`);

        // Load Slack remittances from #financial channel
        try {
            console.log('📥 Loading Slack remittances from #financial channel...');
            await this.slackRemittanceReader.loadCheckpoint();
            // Parse attachments (PDFs/images) to extract amounts and payment details
            await this.slackRemittanceReader.fetchNewRemittances(100, true, true);
            const stats = this.slackRemittanceReader.getStats();
            console.log(`✅ Loaded ${stats.totalRemittances} remittances (${stats.withAmount} with amounts)\n`);
        } catch (error) {
            console.log(`⚠️  Could not load Slack remittances: ${error.message}`);
            console.log('   Continuing without Slack remittance matching...\n');
        }

        // Load TransferMate payout emails from Gmail
        try {
            console.log('📧 Loading TransferMate payout emails from Gmail...');
            await this.loadTransferMatePayouts();
            console.log(`✅ Loaded ${this.transferMatePayments.length} TransferMate payments with Fidelo references\n`);
        } catch (error) {
            console.log(`⚠️  Could not load TransferMate emails: ${error.message}`);
            console.log('   Continuing without TransferMate email matching...\n');
        }

        this.results.total = transactions.length;

        for (let i = 0; i < transactions.length; i++) {
            const txn = transactions[i];

            console.log(`\n${'─'.repeat(70)}`);
            console.log(`Processing: "${txn.description}" (€${txn.amount})`);
            console.log(`Date: ${txn.date}`);
            console.log('─'.repeat(70));

            try {
                const result = await this.processTransaction(txn);
                this.results.transactions.push(result);

                // Update tracker status (if transaction has ID and source)
                if (txn.id && txn.source) {
                    const statusMap = {
                        'success': 'assigned',
                        'already_assigned': 'duplicate',
                        'manual_review': 'review',
                        'underpayment': 'assigned',
                        'error': 'failed',
                        'failed': 'failed'
                    };
                    const trackerStatus = statusMap[result.status] || 'failed';

                    try {
                        await this.tracker.updateStatus(txn.source, txn.id, trackerStatus, {
                            fideloPaymentId: result.payment?.paymentId,
                            fideloStudentId: result.booking?.customerNumber || result.booking?.customer_number,
                            fideloInvoice: result.booking?.documentNumber || result.booking?.document_number,
                            notes: result.notification || result.error
                        });
                    } catch (err) {
                        console.log(`   ⚠️  Tracker update failed: ${err.message}`);
                    }
                }

                // Update counters
                if (result.status === 'success') {
                    this.results.success++;
                } else if (result.status === 'underpayment') {
                    this.results.underpayment++;
                } else if (result.status === 'manual_review') {
                    this.results.manualReview++;
                } else if (result.status === 'already_assigned') {
                    this.results.alreadyAssigned++;
                } else if (result.status === 'escrow_pending') {
                    this.results.escrowPending++;
                } else {
                    this.results.failed++;
                }

            } catch (error) {
                console.error(`❌ Error processing transaction:`, error.message);
                this.results.failed++;
                this.results.transactions.push({
                    transaction: txn,
                    status: 'error',
                    error: error.message
                });
            }

            // API Rate Limiting: Add delay between transactions (except after last one)
            if (i < transactions.length - 1 && this.apiDelay > 0) {
                console.log(`⏱️  Waiting ${this.apiDelay}ms before next transaction...`);
                await new Promise(resolve => setTimeout(resolve, this.apiDelay));
            }
        }

        // Step 5: Checker Review (if enabled)
        if (this.useAIChecker && this.results.transactions.length > 0) {
            console.log('\n' + '═'.repeat(70));
            console.log('STEP 5: AI PAYMENT CHECKER REVIEW');
            console.log('═'.repeat(70));

            try {
                // Check all transaction results with GPT
                const aiAssessments = await this.gptChecker.checkTransactions(this.results.transactions);

                // Attach AI assessments to results
                this.results.transactions.forEach((result, index) => {
                    result.aiAssessment = aiAssessments[index]?.aiAssessment || null;
                });

                // Generate AI checker summary
                const aiSummary = this.gptChecker.generateSummary(aiAssessments);
                this.results.aiCheckerStats = this.gptChecker.getStats();
                this.results.aiCheckerSummary = aiSummary;

            } catch (error) {
                console.error('\n❌ Checker failed:', error.message);
                console.log('   Continuing without AI assessments...\n');
            }
        }

        // Generate summary
        await this.generateSummary();

        return this.results;
    }

    /**
     * Process single transaction
     */
    async processTransaction(txn) {
        const result = {
            transaction: txn,
            status: null,
            matchMethod: null,
            booking: null,
            payment: null,
            discrepancy: null,
            notification: null
        };

        // Step 1: Try Slack remittance match FIRST (acknowledge sales effort immediately)
        console.log('\n1️⃣ Trying Slack remittance match (student ID from #financial)...');
        const slackMatch = await this.findSlackRemittance(txn);

        if (slackMatch.success) {
            console.log(`✅ Found via Slack remittance: Student ID ${slackMatch.remittance.studentId} - ${slackMatch.remittance.studentName}`);
            result.matchMethod = 'slack_remittance';
            result.slackMessageId = slackMatch.remittance.messageId;
            result.slackThreadTs = slackMatch.remittance.messageId; // Used for threading replies

            // Check for ESCROW before attempting assignment (top of financial funnel - unsettled funds)
            console.log('\n🔍 Checking escrow status (unsettled funds check)...');
            const matchingEscrow = await this.escrowTracker.findMatchingEscrow(txn);

            if (matchingEscrow && matchingEscrow.status === 'PENDING') {
                console.log(`   🔒 ESCROW PAYMENT DETECTED: ${matchingEscrow.escrow_id}`);
                console.log(`   Student: ${matchingEscrow.student_name} (ID: ${matchingEscrow.student_id})`);
                console.log(`   Amount: €${matchingEscrow.amount}`);
                console.log(`   ⚠️  Funds in TransferMate escrow - NOT in ULearn BOI account`);
                console.log(`   ⚠️  SKIPPING Fidelo assignment until visa approval\n`);

                // Reply to Slack thread with escrow warning
                const escrowMessage = this.escrowTracker.formatSlackEscrowMessage(matchingEscrow, txn);

                if (!this.dryRun) {
                    await this.slackNotifier.sendMessage(escrowMessage, this.slackChannel, result.slackThreadTs);
                    console.log(`   📢 Escrow notification sent to Slack thread`);
                } else {
                    console.log('   📢 [DRY RUN] Would reply to Slack thread with escrow notification');
                }

                // Return special escrow status - do NOT proceed with assignment
                result.status = 'escrow_pending';
                result.escrowId = matchingEscrow.escrow_id;
                result.notification = 'Payment in TransferMate escrow - awaiting visa approval';

                return result;
            } else {
                console.log('   ✓ Not an escrow payment - proceeding with assignment');
            }

            // Search Fidelo by student ID
            console.log(`\n   Searching Fidelo for student ID ${slackMatch.remittance.studentId}...`);
            const studentBooking = await this.fideloSearch.findBookingByStudentId(slackMatch.remittance.studentId);

            if (!studentBooking.success) {
                console.log(`⚠️  No Fidelo booking found for student ID ${slackMatch.remittance.studentId}`);
                result.status = 'manual_review';
                await this.handleManualReview(txn, {
                    reason: 'slack_match_no_fidelo_booking',
                    message: `Slack remittance found (Student ID ${slackMatch.remittance.studentId}), but no Fidelo booking found`,
                    slackRemittance: slackMatch.remittance
                }, result);
                return result;
            }

            console.log(`✅ Found Fidelo booking ${studentBooking.booking.bookingId} for student ID ${slackMatch.remittance.studentId}`);
            result.booking = studentBooking.booking;

            // Determine payment method
            const paymentMethod = determinePaymentMethod(txn.description, false);

            // Convert date format before assignment (Fidelo requires Y-m-d format)
            const txnWithConvertedDate = {
                ...txn,
                date: this.fideloAssignment.convertToYMD(txn.date)
            };

            // Assign payment with all checks (duplicate detection, escrow handling)
            const assignmentResult = await this.fideloAssignment.assignPaymentWithChecks(txnWithConvertedDate, result.booking, {
                dryRun: this.dryRun,
                paymentMethodId: paymentMethod.methodId,
                paymentMethodName: paymentMethod.methodName
            });

            // Handle duplicate detection
            if (assignmentResult.alreadyAssigned) {
                const match = assignmentResult.existingPayment;
                console.log(`\n⚠️  ALREADY ASSIGNED: Payment already exists in Fidelo`);
                console.log(`   Invoice: ${match.invoice || 'Unknown'}`);
                console.log(`   Existing Payment ID: ${match.id}`);
                console.log(`   Amount: €${match.amount} (diff: €${match.amountDifference || '0.00'})`);
                console.log(`   Date: ${match.date} (${match.daysDifference} days difference)`);
                console.log(`   Method: ${match.method}`);
                console.log(`   Comment: ${match.comment || 'N/A'}`);
                console.log(`\n✅ Skipping to avoid duplicate - payment already reconciled\n`);

                result.status = 'already_assigned';
                result.existingPayment = match;
                result.notification = 'Payment already assigned - skipped';
                return result;
            }

            // Handle assignment failure
            if (!assignmentResult.success) {
                console.error(`❌ Payment assignment failed: ${assignmentResult.error}`);
                result.status = 'error';
                result.error = assignmentResult.error;
                return result;
            }

            // Success - Slack remittances are human-verified (no discrepancy check needed)
            console.log(`✅ Payment created: ID ${assignmentResult.paymentId}`);
            if (assignmentResult.escrowHandled) {
                console.log(`💱 Replaced ${assignmentResult.escrowCount} TransferMate Escrow payment(s)`);
            }

            result.payment = {
                paymentId: assignmentResult.paymentId,
                methodUsed: assignmentResult.methodUsed
            };
            result.status = 'success';
            await this.handleSuccess(txn, result.booking, result.payment, result);

            return result;
        }

        // Step 2: Try TransferMate email match (most reliable Fidelo references)
        console.log('\n2️⃣ Trying TransferMate email match (Gmail payout notifications)...');
        const transferMateMatch = await this.findTransferMatePayment(txn);

        if (transferMateMatch.success) {
            const tmPayment = transferMateMatch.payment;
            console.log(`✅ Found via TransferMate email: Student ID ${tmPayment.fideloRef}`);
            console.log(`   Amount: €${tmPayment.amount} ${tmPayment.currency}`);
            console.log(`   TM Payment ID: ${tmPayment.pmntId}`);
            console.log(`   Confidence: ${transferMateMatch.confidence}`);
            if (transferMateMatch.note) {
                console.log(`   Note: ${transferMateMatch.note}`);
            }

            result.matchMethod = 'transfermate_email';
            result.transferMatePaymentId = tmPayment.pmntId;

            // Check for ESCROW before attempting assignment (top of financial funnel - unsettled funds)
            console.log('\n🔍 Checking escrow status (unsettled funds check)...');
            const matchingEscrow = await this.escrowTracker.findMatchingEscrow(txn);

            if (matchingEscrow && matchingEscrow.status === 'PENDING') {
                console.log(`   🔒 ESCROW PAYMENT DETECTED: ${matchingEscrow.escrow_id}`);
                console.log(`   Student: ${matchingEscrow.student_name} (ID: ${matchingEscrow.student_id})`);
                console.log(`   Amount: €${matchingEscrow.amount}`);
                console.log(`   ⚠️  Funds in TransferMate escrow - NOT in ULearn BOI account`);
                console.log(`   ⚠️  SKIPPING Fidelo assignment until visa approval\n`);

                // Post standalone escrow notification (no Slack thread to reply to)
                const escrowMessage = this.escrowTracker.formatSlackEscrowMessage(matchingEscrow, txn);

                if (!this.dryRun) {
                    await this.slackNotifier.sendMessage(escrowMessage, this.slackChannel);
                    console.log(`   📢 Escrow notification sent to Slack`);
                } else {
                    console.log('   📢 [DRY RUN] Would send standalone escrow notification to Slack');
                }

                // Return special escrow status - do NOT proceed with assignment
                result.status = 'escrow_pending';
                result.escrowId = matchingEscrow.escrow_id;
                result.notification = 'Payment in TransferMate escrow - awaiting visa approval';

                return result;
            } else {
                console.log('   ✓ Not an escrow payment - proceeding with assignment');
            }

            // Search Fidelo by student ID from TransferMate email
            console.log(`\n   Searching Fidelo for student ID ${tmPayment.fideloRef}...`);
            const studentBooking = await this.fideloSearch.findBookingByStudentId(tmPayment.fideloRef);

            if (!studentBooking.success) {
                console.log(`⚠️  No Fidelo booking found for student ID ${tmPayment.fideloRef}`);
                result.status = 'manual_review';
                await this.handleManualReview(txn, {
                    reason: 'transfermate_match_no_fidelo_booking',
                    message: `TransferMate email found (Student ID ${tmPayment.fideloRef}), but no Fidelo booking found`,
                    transferMatePayment: tmPayment
                }, result);
                return result;
            }

            console.log(`✅ Found Fidelo booking ${studentBooking.booking.bookingId} for student ID ${tmPayment.fideloRef}`);
            result.booking = studentBooking.booking;

            // Determine payment method (always Bank Transfer for TransferMate)
            const paymentMethod = determinePaymentMethod(txn.description, false);

            // Convert date format before assignment (Fidelo requires Y-m-d format)
            const txnWithConvertedDate = {
                ...txn,
                date: this.fideloAssignment.convertToYMD(txn.date)
            };

            // Assign payment with all checks
            const assignmentResult = await this.fideloAssignment.assignPaymentWithChecks(txnWithConvertedDate, result.booking, {
                dryRun: this.dryRun,
                paymentMethodId: paymentMethod.methodId,
                paymentMethodName: paymentMethod.methodName
            });

            // Handle duplicate detection
            if (assignmentResult.alreadyAssigned) {
                const match = assignmentResult.existingPayment;
                console.log(`\n⚠️  ALREADY ASSIGNED: Payment already exists in Fidelo`);
                console.log(`   Invoice: ${match.invoice || 'Unknown'}`);
                console.log(`   Existing Payment ID: ${match.id}`);
                console.log(`   Amount: €${match.amount} (diff: €${match.amountDifference || '0.00'})`);
                console.log(`   Date: ${match.date} (${match.daysDifference} days difference)`);
                console.log(`   Method: ${match.method}`);
                console.log(`   Comment: ${match.comment || 'N/A'}`);
                console.log(`\n✅ Skipping to avoid duplicate - payment already reconciled\n`);

                result.status = 'already_assigned';
                result.existingPayment = match;
                result.notification = 'Payment already assigned - skipped';
                return result;
            }

            // Handle assignment failure
            if (!assignmentResult.success) {
                console.error(`❌ Payment assignment failed: ${assignmentResult.error}`);
                result.status = 'error';
                result.error = assignmentResult.error;
                return result;
            }

            // Success - TransferMate emails are reliable
            console.log(`✅ Payment created: ID ${assignmentResult.paymentId}`);
            if (assignmentResult.escrowHandled) {
                console.log(`💱 Replaced ${assignmentResult.escrowCount} TransferMate Escrow payment(s)`);
            }

            result.payment = {
                paymentId: assignmentResult.paymentId,
                methodUsed: assignmentResult.methodUsed
            };
            result.status = 'success';
            await this.handleSuccess(txn, result.booking, result.payment, result);

            return result;
        }

        // Step 3: Try Fidelo search (P/D references, booking ID, OR name + amount)
        console.log('\n3️⃣ Trying Fidelo search (references, ID, name + amount)...');
        const bookingIdMatch = await this.fideloSearch.findBooking(txn.description, txn.amount);

        if (bookingIdMatch.success) {
            if (bookingIdMatch.reason === 'reference_matched') {
                console.log(`✅ Found via reference: ${bookingIdMatch.reference}`);
                result.matchMethod = 'fidelo_reference';
            } else if (bookingIdMatch.reason === 'name_amount_matched') {
                console.log(`✅ Found via name + amount: ${bookingIdMatch.nameWords.join(' ')}`);
                result.matchMethod = 'fidelo_name_amount';
            }
            result.booking = bookingIdMatch.booking;

            // FIX #1: Check for duplicate payment BEFORE checking discrepancy
            // This prevents false "large_discrepancy" flags when payment already exists
            console.log('\n   Checking for duplicate payment...');
            const studentId = result.booking.customer_number || result.booking.customerNumber;
            console.log(`   Student ID: ${studentId}`);
            const duplicateCheck = await this.fideloAssignment.checkForDuplicatePaymentByStudentId(
                studentId,
                result.booking,  // Pass booking object (not amount)
                txn.amount,      // Pass amount as 3rd parameter
                txn.date,        // Pass date as 4th parameter
                5                // 5 days tolerance
            );

            if (duplicateCheck.exists) {
                const match = duplicateCheck.matchedPayment;
                console.log(`\n⚠️  ALREADY ASSIGNED: Payment already exists in Fidelo`);
                console.log(`   Invoice: ${match.invoice || 'Unknown'}`);
                console.log(`   Existing Payment ID: ${match.id}`);
                console.log(`   Amount: €${match.amount} (diff: €${match.amountDifference || '0.00'})`);
                console.log(`   Date: ${match.date} (${match.daysDifference} days difference)`);
                console.log(`   Method: ${match.method}`);
                console.log(`   Comment: ${match.comment || 'N/A'}`);
                console.log(`\n✅ Skipping to avoid duplicate - payment already reconciled\n`);

                result.status = 'already_assigned';
                result.existingPayment = match;
                result.notification = 'Payment already assigned - skipped';
                return result;
            }

            // Check for discrepancy (not Slack-verified)
            const discrepancy = await this.checkDiscrepancy(txn, result.booking);
            result.discrepancy = discrepancy;

            if (discrepancy.action === 'manual_review') {
                result.status = 'manual_review';
                await this.handleManualReview(txn, discrepancy, result);
                return result;
            }

            // Determine payment method
            const paymentMethod = determinePaymentMethod(txn.description, false);

            // FIX #2: Convert date format before assignment
            // Fidelo API requires Y-m-d format (e.g., "2025-12-01"), not "1 Dec 2025"
            const txnWithConvertedDate = {
                ...txn,
                date: this.fideloAssignment.convertToYMD(txn.date)
            };

            // Assign payment with all checks (duplicate detection, escrow handling)
            const assignmentResult = await this.fideloAssignment.assignPaymentWithChecks(txnWithConvertedDate, result.booking, {
                dryRun: this.dryRun,
                paymentMethodId: paymentMethod.methodId,
                paymentMethodName: paymentMethod.methodName
            });

            // Handle duplicate detection
            if (assignmentResult.alreadyAssigned) {
                const match = assignmentResult.existingPayment;
                console.log(`\n⚠️  ALREADY ASSIGNED: Payment already exists in Fidelo`);
                console.log(`   Invoice: ${match.invoice || 'Unknown'}`);
                console.log(`   Existing Payment ID: ${match.id}`);
                console.log(`   Amount: €${match.amount} (diff: €${match.amountDifference || '0.00'})`);
                console.log(`   Date: ${match.date} (${match.daysDifference} days difference)`);
                console.log(`   Method: ${match.method}`);
                console.log(`   Comment: ${match.comment || 'N/A'}`);
                console.log(`\n✅ Skipping to avoid duplicate - payment already reconciled\n`);

                result.status = 'already_assigned';
                result.existingPayment = match;
                result.notification = 'Payment already assigned - skipped';
                return result;
            }

            // Handle assignment failure
            if (!assignmentResult.success) {
                console.error(`❌ Payment assignment failed: ${assignmentResult.error}`);
                result.status = 'error';
                result.error = assignmentResult.error;
                return result;
            }

            // Success
            console.log(`✅ Payment created: ID ${assignmentResult.paymentId}`);
            if (assignmentResult.escrowHandled) {
                console.log(`💱 Replaced ${assignmentResult.escrowCount} TransferMate Escrow payment(s)`);
            }

            result.payment = {
                paymentId: assignmentResult.paymentId,
                methodUsed: assignmentResult.methodUsed
            };

            if (discrepancy.action === 'underpayment_alert') {
                result.status = 'underpayment';
                await this.handleUnderpayment(txn, result.booking, discrepancy, result.payment, result);
            } else {
                result.status = 'success';
                await this.handleSuccess(txn, result.booking, result.payment, result);
            }

            return result;
        }

        // Step 4: Try HubSpot match (amount + name)
        console.log('\n4️⃣ Trying HubSpot match (amount + name)...');
        const hubspotMatch = await this.hubspotMatcher.findMatch(
            txn.description,
            txn.amount,
            { includeWonLost: false } // Production: only active deals
        );

        if (hubspotMatch.success) {
            console.log(`✅ Found via HubSpot: ${hubspotMatch.match.dealName}`);
            result.matchMethod = 'hubspot';

            // Get contact details from HubSpot deal and search Fidelo by name/amount
            const contactDetails = await this.getHubSpotContactDetails(hubspotMatch.match.dealId, hubspotMatch.match.contactId);

            if (!contactDetails) {
                console.log(`⚠️  Could not fetch contact details from HubSpot`);
                result.status = 'manual_review';
                await this.handleManualReview(txn, {
                    reason: 'hubspot_contact_fetch_failed',
                    message: `HubSpot deal found but could not fetch contact details`
                }, result);
                return result;
            }

            console.log(`   Contact: ${contactDetails.name} (${contactDetails.email || 'no email'})`);

            // Search Fidelo using contact name and transaction amount
            const bookingSearchResult = await this.fideloSearch.findBooking(
                contactDetails.name,
                txn.amount
            );

            if (!bookingSearchResult.success) {
                console.log(`⚠️  No Fidelo booking found for ${contactDetails.name} + €${txn.amount}`);
                result.status = 'manual_review';
                await this.handleManualReview(txn, {
                    reason: 'hubspot_match_no_fidelo_booking',
                    message: `HubSpot match: ${contactDetails.name}, but no Fidelo booking found with amount €${txn.amount}`,
                    hubspotDeal: hubspotMatch.match.dealId,
                    hubspotContact: contactDetails
                }, result);
                return result;
            }

            console.log(`✅ Found Fidelo booking ${bookingSearchResult.booking.bookingId} via HubSpot contact match`);
            result.booking = bookingSearchResult.booking;

            // Check for discrepancy (use HubSpot amount diff if available)
            const discrepancy = await this.checkDiscrepancy(txn, result.booking, hubspotMatch.match.amountDiff);
            result.discrepancy = discrepancy;

            if (discrepancy.action === 'manual_review') {
                result.status = 'manual_review';
                await this.handleManualReview(txn, discrepancy, result);
                return result;
            }

            // Determine payment method
            const paymentMethod = determinePaymentMethod(txn.description, false);

            // Convert date format before assignment (Fidelo requires Y-m-d format)
            const txnWithConvertedDate = {
                ...txn,
                date: this.fideloAssignment.convertToYMD(txn.date)
            };

            // Assign payment with all checks (duplicate detection, escrow handling)
            const assignmentResult = await this.fideloAssignment.assignPaymentWithChecks(txnWithConvertedDate, result.booking, {
                dryRun: this.dryRun,
                paymentMethodId: paymentMethod.methodId,
                paymentMethodName: paymentMethod.methodName
            });

            // Handle duplicate detection
            if (assignmentResult.alreadyAssigned) {
                const match = assignmentResult.existingPayment;
                console.log(`\n⚠️  ALREADY ASSIGNED: Payment already exists in Fidelo`);
                console.log(`   Invoice: ${match.invoice || 'Unknown'}`);
                console.log(`   Existing Payment ID: ${match.id}`);
                console.log(`   Amount: €${match.amount} (diff: €${match.amountDifference || '0.00'})`);
                console.log(`   Date: ${match.date} (${match.daysDifference} days difference)`);
                console.log(`   Method: ${match.method}`);
                console.log(`   Comment: ${match.comment || 'N/A'}`);
                console.log(`\n✅ Skipping to avoid duplicate - payment already reconciled\n`);

                result.status = 'already_assigned';
                result.existingPayment = match;
                result.notification = 'Payment already assigned - skipped';
                return result;
            }

            // Handle assignment failure
            if (!assignmentResult.success) {
                console.error(`❌ Payment assignment failed: ${assignmentResult.error}`);
                result.status = 'error';
                result.error = assignmentResult.error;
                return result;
            }

            // Success
            console.log(`✅ Payment created: ID ${assignmentResult.paymentId}`);
            if (assignmentResult.escrowHandled) {
                console.log(`💱 Replaced ${assignmentResult.escrowCount} TransferMate Escrow payment(s)`);
            }

            result.payment = {
                paymentId: assignmentResult.paymentId,
                methodUsed: assignmentResult.methodUsed
            };

            if (discrepancy.action === 'underpayment_alert') {
                result.status = 'underpayment';
                await this.handleUnderpayment(txn, result.booking, discrepancy, result.payment, result);
            } else {
                result.status = 'success';
                await this.handleSuccess(txn, result.booking, result.payment, result);
            }

            return result;
        }

        // Step 5: No match found - manual review
        console.log('\n❌ No match found');
        result.status = 'manual_review';
        await this.handleManualReview(txn, {
            reason: hubspotMatch.reason,
            message: hubspotMatch.message,
            possibleMatches: hubspotMatch.possibleMatches || hubspotMatch.amountMatches
        }, result);

        return result;
    }

    /**
     * Search Slack #financial channel for remittance matching this transaction
     * Matches by: amount (±€1), date (±7 days), or partial name match
     */
    async findSlackRemittance(txn) {
        try {
            // Try to match by amount first (most reliable)
            const byAmount = this.slackRemittanceReader.findByAmount(txn.amount, 1);

            if (byAmount.length > 0) {
                // Filter by date if we have transaction date
                if (txn.date) {
                    const txnDate = new Date(txn.date);
                    const dateTolerance = 7; // days

                    const byAmountAndDate = byAmount.filter(rem => {
                        const remDate = new Date(rem.timestamp);
                        const daysDiff = Math.abs((txnDate - remDate) / (1000 * 60 * 60 * 24));
                        return daysDiff <= dateTolerance;
                    });

                    if (byAmountAndDate.length > 0) {
                        return { success: true, remittance: byAmountAndDate[0] };
                    }
                }

                // If no date match, just return first amount match
                return { success: true, remittance: byAmount[0] };
            }

            // Try to match by partial name in bank description
            if (txn.description) {
                const words = txn.description.split(/\s+/);
                for (const word of words) {
                    if (word.length >= 4) { // Only search meaningful words
                        const byName = this.slackRemittanceReader.findByStudentName(word);
                        if (byName.length > 0) {
                            return { success: true, remittance: byName[0] };
                        }
                    }
                }
            }

            return { success: false, reason: 'no_slack_remittance_found' };

        } catch (error) {
            console.error('⚠️  Error searching Slack remittances:', error.message);
            return { success: false, reason: 'slack_search_error', error: error.message };
        }
    }

    /**
     * Load TransferMate payout emails from Gmail (last 60 days)
     * Stores payments with Fidelo references for matching
     * Detects and records INCOMING ESCROW payments (separate from released payments)
     */
    async loadTransferMatePayouts() {
        try {
            // Calculate date range (last 60 days)
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 60);

            const formatDate = (date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}/${month}/${day}`;
            };

            // Search for TransferMate payout emails
            const emails = await this.gmailReader.searchTransferMateBatchEmails({
                after: formatDate(startDate),
                before: formatDate(endDate),
                unreadOnly: false
            });

            // Load escrow tracker
            await this.escrowTracker.load();
            console.log('   🔒 Escrow tracker loaded');

            // Parse all emails and extract payments
            this.transferMatePayments = [];
            for (const email of emails) {
                // Check for INCOMING ESCROW payment
                if (this.escrowTracker.detectIncomingEscrow(email)) {
                    console.log(`   🔒 INCOMING ESCROW DETECTED in email: ${email.subject}`);

                    // Parse payments from escrow email
                    const escrowPayments = this.gmailReader.parseTransferMateBatchEmail(email.body);

                    // Record each escrow payment
                    for (const payment of escrowPayments) {
                        try {
                            const escrowRecord = await this.escrowTracker.recordIncoming({
                                studentId: payment.fideloRef,
                                studentName: payment.recipientName || 'Unknown',
                                invoice: payment.invoice || null,
                                amount: payment.amount,
                                transactionDate: email.date,
                                source: 'transfermate_email',
                                sourceReference: email.id,
                                sourceData: {
                                    emailSubject: email.subject,
                                    emailDate: email.date,
                                    pmntId: payment.pmntId,
                                    currency: payment.currency
                                }
                            });

                            console.log(`      ✅ Escrow tracked: ${escrowRecord.escrow_id} - Student ${payment.fideloRef}`);

                            // Mark payment as escrow
                            this.transferMatePayments.push({
                                ...payment,
                                emailId: email.id,
                                emailDate: email.date,
                                emailSubject: email.subject,
                                isEscrow: true,
                                escrowId: escrowRecord.escrow_id
                            });

                        } catch (error) {
                            console.error(`      ❌ Error recording escrow: ${error.message}`);
                        }
                    }

                    continue; // Skip to next email
                }

                // Normal (non-escrow) payment processing
                const payments = this.gmailReader.parseTransferMateBatchEmail(email.body);

                if (payments.length > 0) {
                    // Add email metadata to each payment
                    payments.forEach(payment => {
                        this.transferMatePayments.push({
                            ...payment,
                            emailId: email.id,
                            emailDate: email.date,
                            emailSubject: email.subject,
                            isEscrow: false
                        });
                    });
                }
            }

            // Show escrow stats
            const escrowStats = this.escrowTracker.getStats();
            if (escrowStats.pending > 0) {
                console.log(`   🔒 Escrow Status: ${escrowStats.pending} pending, ${escrowStats.released} released, ${escrowStats.refunded} refunded`);
                console.log(`   💰 Total in escrow: €${escrowStats.pending_amount.toFixed(2)}`);
            }

            return this.transferMatePayments;

        } catch (error) {
            console.error('Error loading TransferMate payouts:', error.message);
            throw error;
        }
    }

    /**
     * Search TransferMate payout emails for payment matching this transaction
     * Matches by: amount (±€1) and optionally Fidelo reference in description
     */
    async findTransferMatePayment(txn) {
        try {
            if (this.transferMatePayments.length === 0) {
                return { success: false, reason: 'no_transfermate_data_loaded' };
            }

            const txnAmount = parseFloat(txn.amount);

            // Try to match by amount (±€1 tolerance for ForEx)
            const byAmount = this.transferMatePayments.filter(payment => {
                const diff = Math.abs(payment.amount - txnAmount);
                return diff <= 1;
            });

            if (byAmount.length === 0) {
                return { success: false, reason: 'no_amount_match' };
            }

            // If exactly one match, return it
            if (byAmount.length === 1) {
                return {
                    success: true,
                    payment: byAmount[0],
                    confidence: 'high'
                };
            }

            // Multiple matches - try to disambiguate by Fidelo reference in description
            if (txn.description) {
                const descUpper = txn.description.toUpperCase();

                // Check if description contains Fidelo reference from any match
                for (const payment of byAmount) {
                    if (payment.fideloRef && descUpper.includes(payment.fideloRef)) {
                        return {
                            success: true,
                            payment: payment,
                            confidence: 'very_high'
                        };
                    }
                }
            }

            // Multiple matches, couldn't disambiguate - return first (most recent)
            return {
                success: true,
                payment: byAmount[0],
                confidence: 'medium',
                note: `${byAmount.length} possible matches, returning most recent`
            };

        } catch (error) {
            console.error('⚠️  Error searching TransferMate payments:', error.message);
            return { success: false, reason: 'search_error', error: error.message };
        }
    }

    /**
     * Check amount discrepancy and determine action
     */
    async checkDiscrepancy(txn, booking, hubspotDiff = 0) {
        // Compare against amount_open (what's still owed), NOT total booking amount
        const bookingAmount = parseFloat(booking.amount_open || booking.amountOpen || booking.dealAmount || 0);
        const receivedAmount = parseFloat(txn.amount);
        const diff = Math.abs(bookingAmount - receivedAmount);

        // Use HubSpot match diff if available (more accurate)
        const actualDiff = hubspotDiff > 0 ? hubspotDiff : diff;

        const discrepancy = {
            expectedAmount: bookingAmount,
            receivedAmount: receivedAmount,
            difference: actualDiff,
            action: null,
            reason: null
        };

        if (actualDiff <= this.thresholds.roundingTolerance) {
            // €0-€1: Rounding difference, no alert
            discrepancy.action = 'assign_no_alert';
            discrepancy.reason = 'rounding';
        } else if (actualDiff <= this.thresholds.underpaymentThreshold) {
            // €1-€10: Underpayment (likely ForEx fee), assign but alert
            discrepancy.action = 'underpayment_alert';
            discrepancy.reason = 'forex_fee';
        } else {
            // >€10: Large discrepancy, manual review required
            discrepancy.action = 'manual_review';
            discrepancy.reason = 'large_discrepancy';
        }

        return discrepancy;
    }

    /**
     * Get contact details from HubSpot
     * Returns: { name, email, phone }
     */
    async getHubSpotContactDetails(dealId, contactId) {
        try {
            if (!contactId) {
                console.log('   No contact ID found for deal');
                return null;
            }

            // Fetch contact details from HubSpot
            const contactResponse = await this.hubspotMatcher.hubspot.client.crm.contacts.basicApi.getById(
                contactId,
                ['firstname', 'lastname', 'email', 'phone']
            );

            if (!contactResponse || !contactResponse.properties) {
                return null;
            }

            const firstName = contactResponse.properties.firstname || '';
            const lastName = contactResponse.properties.lastname || '';
            const email = contactResponse.properties.email || '';
            const phone = contactResponse.properties.phone || '';

            return {
                name: `${firstName} ${lastName}`.trim(),
                firstName,
                lastName,
                email,
                phone,
                contactId // HubSpot contact ID (not Fidelo!)
            };

        } catch (error) {
            console.error(`Error fetching HubSpot contact ${contactId}:`, error.message);
            return null;
        }
    }

    /**
     * Handle successful payment
     */
    async handleSuccess(txn, booking, payment, matchResult = null) {
        console.log('✅ Payment assigned successfully');

        const notification = {
            studentName: booking.studentName || `${booking.lastname || ''}, ${booking.firstname || ''}`.trim(),
            studentId: booking.customerNumber || booking.customer_number || null,  // Student ID (Diego's ID)
            bookingId: booking.bookingId || booking.id,  // Booking ID (internal)
            amount: txn.amount,
            paymentDate: txn.date,
            pipeline: booking.pipeline || (booking.agencyId || booking.agency_id ? 'B2B' : 'B2C'),
            paymentMethod: payment.methodUsed || 'Bank Transfer',  // Use actual method from payment
            bankDescription: txn.description,
            paymentId: payment.paymentId,
            matchMethod: matchResult?.matchMethod || 'Fidelo ID',
            dealId: matchResult?.dealId || null,
            dealName: matchResult?.dealName || null,
            fideloUrl: 'https://ulearn.fidelo.com/admin'
        };

        // Determine threading:
        // 1. If from Slack guidance (sales remittance), reply to that message
        // 2. Else use transaction thread parent (first notification becomes parent)
        let threadTs = matchResult?.slackThreadTs || null;

        if (!threadTs && !this.dryRun) {
            threadTs = this.transactionThreadParentTs;
            if (threadTs) {
                console.log('   📎 Threading to first transaction notification');
            } else {
                console.log('   📌 First transaction notification - posting to channel');
            }
        }

        if (!this.dryRun) {
            const response = await this.slackNotifier.notifyPaymentSuccess(notification, this.slackChannel, threadTs);

            // Save timestamp of first transaction notification (if not already set and not a guidance reply)
            if (!this.transactionThreadParentTs && !matchResult?.slackThreadTs && response?.timestamp) {
                this.transactionThreadParentTs = response.timestamp;
                console.log(`   ✅ Saved as transaction thread parent: ${this.transactionThreadParentTs}`);
            }
        } else {
            console.log('📢 [DRY RUN] Would send success notification:');
            console.log(`   Student: ${notification.studentName}`);
            console.log(`   Student ID: ${notification.studentId}`);
            console.log(`   Booking ID: ${notification.bookingId}`);
            console.log(`   Amount: €${notification.amount}`);
            console.log(`   Match Method: ${notification.matchMethod}`);
        }
    }

    /**
     * Handle underpayment (€1-€10 discrepancy)
     */
    async handleUnderpayment(txn, booking, discrepancy, payment, matchResult = null) {
        console.log(`⚠️  UNDERPAYMENT: €${discrepancy.difference.toFixed(2)} shortfall`);

        const notification = {
            studentName: `${booking.lastname || ''}, ${booking.firstname || ''}`.trim(),
            bookingId: booking.bookingId || booking.id,
            expectedAmount: discrepancy.expectedAmount,
            receivedAmount: discrepancy.receivedAmount,
            pipeline: booking.pipeline || (booking.agencyId || booking.agency_id ? 'B2B' : 'B2C'),
            partner: booking.agencyId || booking.agency_id ? 'Partner/Agency' : null,
            startDate: booking.start_date || booking.startDate,
            bankDescription: txn.description,
            fideloUrl: 'https://ulearn.fidelo.com/admin'
        };

        // Determine threading:
        // 1. If from Slack guidance (sales remittance), reply to that message
        // 2. Else use transaction thread parent (first notification becomes parent)
        let threadTs = matchResult?.slackThreadTs || null;

        if (!threadTs && !this.dryRun) {
            threadTs = this.transactionThreadParentTs;
            if (threadTs) {
                console.log('   📎 Threading to first transaction notification');
            } else {
                console.log('   📌 First transaction notification - posting to channel');
            }
        }

        if (!this.dryRun) {
            const response = await this.slackNotifier.notifyUnderpayment(notification, this.slackChannel, threadTs);

            // Save timestamp of first transaction notification (if not already set and not a guidance reply)
            if (!this.transactionThreadParentTs && !matchResult?.slackThreadTs && response?.timestamp) {
                this.transactionThreadParentTs = response.timestamp;
                console.log(`   ✅ Saved as transaction thread parent: ${this.transactionThreadParentTs}`);
            }
        } else {
            console.log('📢 [DRY RUN] Would send underpayment alert');
        }
    }

    /**
     * Handle manual review required
     */
    async handleManualReview(txn, reason, result) {
        console.log(`🚫 MANUAL REVIEW REQUIRED: ${reason.reason || reason.message}`);

        const notification = {
            date: txn.date,
            amount: txn.amount,
            description: txn.description,
            possibleMatches: reason.possibleMatches || []
        };

        // Determine threading:
        // 1. If from Slack guidance (sales remittance), reply to that message
        // 2. Else use transaction thread parent (first notification becomes parent)
        let threadTs = result?.slackThreadTs || null;

        if (!threadTs && !this.dryRun) {
            threadTs = this.transactionThreadParentTs;
            if (threadTs) {
                console.log('   📎 Threading to first transaction notification');
            } else {
                console.log('   📌 First transaction notification - posting to channel');
            }
        }

        if (!this.dryRun) {
            const response = await this.slackNotifier.notifyManualReview(
                notification,
                reason.message,
                this.slackChannel,
                threadTs
            );

            // Save timestamp of first transaction notification (if not already set and not a guidance reply)
            if (!this.transactionThreadParentTs && !result?.slackThreadTs && response?.timestamp) {
                this.transactionThreadParentTs = response.timestamp;
                console.log(`   ✅ Saved as transaction thread parent: ${this.transactionThreadParentTs}`);
            }
        } else {
            console.log('📢 [DRY RUN] Would send manual review alert');
        }
    }

    /**
     * Generate summary report
     */
    async generateSummary() {
        console.log('\n\n═══════════════════════════════════════════');
        console.log('PAYMENT ASSIGNMENT SUMMARY');
        console.log('═══════════════════════════════════════════');
        console.log(`Total Transactions: ${this.results.total}`);
        console.log(`✅ Successfully Assigned: ${this.results.success}`);
        console.log(`⚠️  Underpayments (assigned with alert): ${this.results.underpayment}`);
        console.log(`♻️  Already Assigned (skipped): ${this.results.alreadyAssigned}`);
        console.log(`🔒 Escrow Pending (visa approval): ${this.results.escrowPending}`);
        console.log(`🚫 Manual Review Required: ${this.results.manualReview}`);
        console.log(`❌ Failed/Errors: ${this.results.failed}`);

        // Show Checker stats if available
        if (this.results.aiCheckerStats) {
            console.log('\n🤖 CHECKER STATS:');
            console.log(`   Total Reviewed: ${this.results.aiCheckerStats.totalChecked}`);
            console.log(`   ✅ Approved: ${this.results.aiCheckerStats.approved}`);
            console.log(`   🔧 Fix Proposed: ${this.results.aiCheckerStats.fixProposed}`);
            console.log(`   🚩 Flagged: ${this.results.aiCheckerStats.flagged}`);
            console.log(`   📖 Full Manual Reads: ${this.results.aiCheckerStats.fullManualReads}`);
        }

        console.log('═══════════════════════════════════════════\n');

        // Send summary to Slack
        if (!this.dryRun && this.results.total > 0) {
            let summaryText = `📊 Incoming Payments Summary\n\n` +
                `Total: ${this.results.total}\n` +
                `✅ Success: ${this.results.success}\n` +
                `⚠️ Underpayments: ${this.results.underpayment}\n` +
                `♻️ Already Assigned: ${this.results.alreadyAssigned}\n` +
                `🔒 Escrow Pending: ${this.results.escrowPending}\n` +
                `🚫 Manual Review: ${this.results.manualReview}\n` +
                `❌ Failed: ${this.results.failed}`;

            // Add Checker stats to Slack summary
            if (this.results.aiCheckerStats) {
                summaryText += `\n\n🤖 *Checker:*\n` +
                    `   Approved: ${this.results.aiCheckerStats.approved}\n` +
                    `   Fix Proposed: ${this.results.aiCheckerStats.fixProposed}\n` +
                    `   Flagged: ${this.results.aiCheckerStats.flagged}`;
            }

            summaryText += `\n\n_Detail in Thread =>_`;

            // Send summary message and get the timestamp for threading
            const summaryResponse = await this.slackNotifier.sendMessage(this.slackChannel, summaryText);
            const summaryTs = summaryResponse?.timestamp;

            // Build detailed transaction list as a threaded reply
            if (this.results.transactions.length > 0 && summaryTs) {
                let detailText = `📋 *Transaction Details:*\n`;

                this.results.transactions.forEach((result, index) => {
                    const txn = result.transaction;
                    const statusEmoji = {
                        'success': '✅',
                        'underpayment': '⚠️',
                        'already_assigned': '♻️',
                        'manual_review': '🚫',
                        'error': '❌',
                        'failed': '❌'
                    }[result.status] || '❓';

                    // Get student info if available
                    const studentName = result.booking?.studentName ||
                                       `${result.booking?.firstname || ''} ${result.booking?.lastname || ''}`.trim() ||
                                       'Unknown';
                    const studentId = result.booking?.customerNumber || result.booking?.customer_number || '—';

                    detailText += `\n${index + 1}. ${statusEmoji} €${txn.amount} - ${studentName}`;

                    // Add status-specific details
                    if (result.status === 'success') {
                        detailText += `\n   Student ID: ${studentId} | Payment ID: ${result.payment?.paymentId || 'N/A'}`;
                    } else if (result.status === 'already_assigned') {
                        detailText += `\n   Student ID: ${studentId} | Already Assigned`;
                    } else if (result.status === 'underpayment') {
                        const diff = result.discrepancy?.difference?.toFixed(2) || '0.00';
                        detailText += `\n   Student ID: ${studentId} | Shortfall: €${diff}`;
                    } else if (result.status === 'manual_review') {
                        detailText += `\n   Needs review: ${result.discrepancy?.reason || 'Unknown reason'}`;
                    } else if (result.status === 'error' || result.status === 'failed') {
                        detailText += `\n   Error: ${result.error || 'Unknown error'}`;
                    }

                    // Add assessment if available
                    if (result.aiAssessment) {
                        const ai = result.aiAssessment;
                        const action = ai.recommendedAction || 'unknown';
                        const confidence = ai.confidence || ai.aiAssessment?.confidence || 'N/A';

                        // Format: 🤖 approve (high) → Student 30732
                        detailText += `\n   🤖 ${action} (${confidence})`;

                        // Add proposed fix if available
                        if (ai.proposedFix && ai.proposedFix.studentId) {
                            detailText += ` → Student ${ai.proposedFix.studentId}`;
                        } else if (studentId && studentId !== '—') {
                            // If no proposed fix but we have the student ID, show it
                            detailText += ` → Student ${studentId}`;
                        }
                    }
                });

                // Post detailed list as threaded reply
                await this.slackNotifier.sendMessage(this.slackChannel, detailText, null, summaryTs);
            }
        }
    }
}

// Export for use as module
module.exports = PaymentAssignmentWorkflow;

// CLI test mode
if (require.main === module) {
    const workflow = new PaymentAssignmentWorkflow({
        dryRun: true, // Safety: don't create payments in test
        slackChannel: '#financial'
    });

    // Parse command line arguments
    // Usage: node payment-assignment-workflow.js [xero-file.json] [--all-sources] [--start-date YYYY-MM-DD] [--end-date YYYY-MM-DD]
    const args = process.argv.slice(2);
    const inputFile = args.find(arg => arg.endsWith('.json'));
    const allSources = args.includes('--all-sources');
    const startDateIndex = args.indexOf('--start-date');
    const endDateIndex = args.indexOf('--end-date');

    const startDate = startDateIndex !== -1 ? args[startDateIndex + 1] : null;
    const endDate = endDateIndex !== -1 ? args[endDateIndex + 1] : null;

    console.log('Running Payment Assignment Workflow Test (DRY RUN)...\n');

    (async () => {
        let transactions = [];
        let xeroTransactions = [];

        // Load Xero transactions from file if provided
        if (inputFile) {
            const fs = require('fs');
            const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

            // Filter for RECEIVE transactions only
            xeroTransactions = data.transactions
                .filter(t => t.type === 'RECEIVE')
                .map(t => ({
                    date: t.date,
                    amount: parseFloat(t.amount.replace(',', '')),
                    description: t.description,
                    source: 'xero'
                }));

            console.log(`Loaded ${xeroTransactions.length} RECEIVE transactions from ${inputFile}\n`);
        }

        // Fetch from all sources if requested
        if (allSources) {
            if (!startDate || !endDate) {
                console.error('❌ Error: --all-sources requires --start-date and --end-date');
                console.log('\nUsage: node payment-assignment-workflow.js [xero-file.json] --all-sources --start-date YYYY-MM-DD --end-date YYYY-MM-DD');
                process.exit(1);
            }

            transactions = await workflow.fetchAllTransactions(startDate, endDate, xeroTransactions);
        } else if (!inputFile) {
            // Load test transactions if no file provided and not fetching from APIs
            const testTransactions = require('../../Docs/Projects/Incomings/test-transactions.json');
            transactions = testTransactions.transactions.slice(0, 3).map(t => ({
                date: t.txn_date,
                amount: t.amount,
                description: t.description,
                source: 'test'
            }));
        } else {
            // Just use Xero transactions from file
            transactions = xeroTransactions;
        }

        const results = await workflow.processTransactions(transactions);

        console.log('\n✅ Test completed!');
        console.log(`Check logs above for detailed processing flow.`);
    })();
}
