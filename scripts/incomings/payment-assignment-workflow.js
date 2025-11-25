/**
 * Payment Assignment Workflow - Main orchestrator for incoming payments
 * Location: /home/hub/public_html/fins/scripts/incomings/payment-assignment-workflow.js
 *
 * Purpose: Complete end-to-end workflow for assigning incoming payments
 *
 * Process Flow:
 * 1. Load unreconciled credit transactions (from Xero or test data)
 * 2. For each transaction:
 *    a. Try Booking ID match (Priority 1 - fastest)
 *    b. Try HubSpot match (Priority 2 - amount + name)
 *    c. Flag for manual review if no match
 * 3. Create payment in Fidelo (if matched)
 * 4. Handle discrepancies (€1-€10 = underpayment alert, >€10 = manual review)
 * 5. Send Slack notifications (success/underpayment/manual review)
 * 6. Generate summary report
 *
 * Enforcement Rules:
 * - €0-€1 difference: Assign lower amount, no alert (rounding)
 * - €1-€10 difference: Assign lower amount + UNDERPAYMENT ALERT (ForEx fees)
 * - >€10 difference: BLOCK assignment, manual review required
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const FideloReferenceSearch = require('./fidelo-reference-search');
const HubSpotMatcher = require('./hubspot-matcher');
const SlackNotifier = require('../slack/slack-notifier');
const axios = require('axios');

class PaymentAssignmentWorkflow {
    constructor(options = {}) {
        this.fideloSearch = new FideloReferenceSearch();
        this.hubspotMatcher = new HubSpotMatcher();
        this.slackNotifier = new SlackNotifier();

        this.dryRun = options.dryRun || false; // If true, don't create payments
        this.slackChannel = options.slackChannel || '#financial';

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
            failed: 0,
            transactions: []
        };
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

        this.results.total = transactions.length;

        for (const txn of transactions) {
            console.log(`\n${'─'.repeat(70)}`);
            console.log(`Processing: "${txn.description}" (€${txn.amount})`);
            console.log(`Date: ${txn.date}`);
            console.log('─'.repeat(70));

            try {
                const result = await this.processTransaction(txn);
                this.results.transactions.push(result);

                // Update counters
                if (result.status === 'success') {
                    this.results.success++;
                } else if (result.status === 'underpayment') {
                    this.results.underpayment++;
                } else if (result.status === 'manual_review') {
                    this.results.manualReview++;
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

        // Step 1: Try Fidelo search (P/D references, booking ID, OR name + amount)
        console.log('\n1️⃣ Trying Fidelo search (references, ID, name + amount)...');
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

            // Check amount discrepancy
            const discrepancy = await this.checkDiscrepancy(txn, bookingIdMatch.booking);
            result.discrepancy = discrepancy;

            if (discrepancy.action === 'manual_review') {
                result.status = 'manual_review';
                await this.handleManualReview(txn, discrepancy, result);
                return result;
            }

            // Assign payment
            const payment = await this.assignPayment(txn, bookingIdMatch.booking);
            result.payment = payment;

            if (discrepancy.action === 'underpayment_alert') {
                result.status = 'underpayment';
                await this.handleUnderpayment(txn, bookingIdMatch.booking, discrepancy, payment);
            } else {
                result.status = 'success';
                await this.handleSuccess(txn, bookingIdMatch.booking, payment);
            }

            return result;
        }

        // Step 2: Try HubSpot match (amount + name)
        console.log('\n2️⃣ Trying HubSpot match (amount + name)...');
        const hubspotMatch = await this.hubspotMatcher.findMatch(
            txn.description,
            txn.amount,
            { includeWonLost: false } // Production: only active deals
        );

        if (hubspotMatch.success) {
            console.log(`✅ Found via HubSpot: ${hubspotMatch.match.dealName}`);
            result.matchMethod = 'hubspot';

            // Get Fidelo booking via contact ID
            const booking = await this.getFideloBookingByContactId(hubspotMatch.match.contactId);

            if (!booking) {
                console.log(`⚠️  No Fidelo booking found for contact ID: ${hubspotMatch.match.contactId}`);
                result.status = 'manual_review';
                await this.handleManualReview(txn, {
                    reason: 'hubspot_match_no_fidelo_booking',
                    message: `HubSpot match found but no Fidelo booking for contact ${hubspotMatch.match.contactId}`
                }, result);
                return result;
            }

            result.booking = booking;

            // Check amount discrepancy
            const discrepancy = await this.checkDiscrepancy(txn, booking, hubspotMatch.match.amountDiff);
            result.discrepancy = discrepancy;

            if (discrepancy.action === 'manual_review') {
                result.status = 'manual_review';
                await this.handleManualReview(txn, discrepancy, result);
                return result;
            }

            // Assign payment
            const payment = await this.assignPayment(txn, booking);
            result.payment = payment;

            if (discrepancy.action === 'underpayment_alert') {
                result.status = 'underpayment';
                await this.handleUnderpayment(txn, booking, discrepancy, payment);
            } else {
                result.status = 'success';
                await this.handleSuccess(txn, booking, payment);
            }

            return result;
        }

        // Step 3: No match found - manual review
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
     * Check amount discrepancy and determine action
     */
    async checkDiscrepancy(txn, booking, hubspotDiff = 0) {
        const bookingAmount = parseFloat(booking.amount || booking.dealAmount || 0);
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
     * Get Fidelo booking by contact ID
     */
    async getFideloBookingByContactId(contactId) {
        try {
            const response = await axios.get(
                `${this.fideloApiBase}/bookings?filter[contact_id]=${contactId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.fideloApiToken}`,
                        'Accept': 'application/json'
                    }
                }
            );

            // Return most recent booking for this contact
            if (response.data && response.data.length > 0) {
                return response.data[0];
            }

            return null;
        } catch (error) {
            console.error(`Error fetching booking for contact ${contactId}:`, error.message);
            return null;
        }
    }

    /**
     * Assign payment to Fidelo booking
     */
    async assignPayment(txn, booking) {
        const bookingId = booking.bookingId || booking.id;
        const paymentData = {
            inquiry_id: bookingId,
            school_id: 1,
            booking_id: bookingId,
            payment_date: txn.date,
            payment_method_id: 1, // Bank Transfer (default)
            payment_amount: txn.amount,
            payment_comment: `${txn.description} - Ai`
        };

        if (this.dryRun) {
            console.log('💰 [DRY RUN] Would create payment:', paymentData);
            return { paymentId: 'DRY_RUN', created: false };
        }

        try {
            const response = await axios.post(
                `${this.fideloApiBase}/payments`,
                paymentData,
                {
                    headers: {
                        'Authorization': `Bearer ${this.fideloApiToken}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                }
            );

            console.log(`✅ Payment created: ID ${response.data.payment_id}`);
            return {
                paymentId: response.data.payment_id,
                created: true,
                response: response.data
            };

        } catch (error) {
            console.error('❌ Failed to create payment:', error.response?.data || error.message);
            throw new Error(`Payment creation failed: ${error.message}`);
        }
    }

    /**
     * Handle successful payment
     */
    async handleSuccess(txn, booking, payment, matchResult = null) {
        console.log('✅ Payment assigned successfully');

        const notification = {
            studentName: `${booking.lastname || ''}, ${booking.firstname || ''}`.trim(),
            bookingId: booking.bookingId || booking.id,
            amount: txn.amount,
            paymentDate: txn.date,
            pipeline: booking.pipeline || (booking.agencyId || booking.agency_id ? 'B2B' : 'B2C'),
            paymentMethod: 'Bank Transfer',
            bankDescription: txn.description,
            paymentId: payment.paymentId,
            matchMethod: matchResult?.matchMethod || 'Fidelo ID',
            dealId: matchResult?.dealId || null,
            dealName: matchResult?.dealName || null,
            fideloUrl: 'https://ulearn.fidelo.com/admin'
        };

        if (!this.dryRun) {
            await this.slackNotifier.notifyPaymentSuccess(notification, this.slackChannel);
        } else {
            console.log('📢 [DRY RUN] Would send success notification');
        }
    }

    /**
     * Handle underpayment (€1-€10 discrepancy)
     */
    async handleUnderpayment(txn, booking, discrepancy, payment) {
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

        if (!this.dryRun) {
            await this.slackNotifier.notifyUnderpayment(notification, this.slackChannel);
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

        if (!this.dryRun) {
            await this.slackNotifier.notifyManualReview(
                notification,
                reason.message,
                this.slackChannel
            );
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
        console.log(`🚫 Manual Review Required: ${this.results.manualReview}`);
        console.log(`❌ Failed/Errors: ${this.results.failed}`);
        console.log('═══════════════════════════════════════════\n');

        // Send summary to Slack
        if (!this.dryRun && this.results.total > 0) {
            const summaryText = `📊 Incoming Payments Summary\n\n` +
                `Total: ${this.results.total}\n` +
                `✅ Success: ${this.results.success}\n` +
                `⚠️ Underpayments: ${this.results.underpayment}\n` +
                `🚫 Manual Review: ${this.results.manualReview}\n` +
                `❌ Failed: ${this.results.failed}`;

            await this.slackNotifier.sendMessage(this.slackChannel, summaryText);
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

    // Accept file path from command line or use default test data
    const inputFile = process.argv[2];

    console.log('Running Payment Assignment Workflow Test (DRY RUN)...\n');

    (async () => {
        let transactions;

        if (inputFile) {
            // Load from provided file (Xero JSON format)
            const fs = require('fs');
            const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

            // Filter for RECEIVE transactions only
            transactions = data.transactions
                .filter(t => t.type === 'RECEIVE')
                .map(t => ({
                    date: t.date,
                    amount: parseFloat(t.amount.replace(',', '')),
                    description: t.description
                }));

            console.log(`Loaded ${transactions.length} RECEIVE transactions from ${inputFile}\n`);
        } else {
            // Load test transactions
            const testTransactions = require('../../Docs/Projects/Incomings/test-transactions.json');
            transactions = testTransactions.transactions.slice(0, 3).map(t => ({
                date: t.txn_date,
                amount: t.amount,
                description: t.description
            }));
        }

        const results = await workflow.processTransactions(transactions);

        console.log('\n✅ Test completed!');
        console.log(`Check logs above for detailed processing flow.`);
    })();
}
