/**
 * TransferMate Escrow Payment Tracking
 *
 * Handles detection, tracking, and lifecycle management of escrow payments.
 * Escrow payments are NOT assigned in Fidelo until visa approval and release.
 *
 * Lifecycle:
 * 1. INCOMING: Payment enters TransferMate escrow → Track but don't assign
 * 2. RELEASED: Visa approved, funds transferred to BOI → Assign normally
 * 3. REFUNDED: Visa refused, funds returned to sender → Track refund, retain fees
 */

const fs = require('fs').promises;
const path = require('path');

class EscrowTracker {
    constructor() {
        this.trackingFile = path.join(__dirname, 'escrow-tracking.json');
        this.escrowData = null;
    }

    /**
     * Load escrow tracking data from file
     */
    async load() {
        try {
            const data = await fs.readFile(this.trackingFile, 'utf8');
            this.escrowData = JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist - create initial structure
                this.escrowData = {
                    last_updated: new Date().toISOString(),
                    total_count: 0,
                    pending_count: 0,
                    released_count: 0,
                    refunded_count: 0,
                    escrow_payments: []
                };
                await this.save();
            } else {
                throw error;
            }
        }
        return this.escrowData;
    }

    /**
     * Save escrow tracking data to file
     */
    async save() {
        this.escrowData.last_updated = new Date().toISOString();
        await fs.writeFile(this.trackingFile, JSON.stringify(this.escrowData, null, 2));
    }

    /**
     * Detect if TransferMate email indicates INCOMING escrow payment
     *
     * @param {Object} transferMateEmail - TransferMate email object with body/text
     * @returns {Boolean} true if this is an incoming escrow payment
     */
    detectIncomingEscrow(transferMateEmail) {
        if (!transferMateEmail || !transferMateEmail.body) {
            return false;
        }

        const body = transferMateEmail.body.toLowerCase();

        // Primary signal: "being held in TransferMate's Escrow account"
        const escrowPhrases = [
            'being held in transfermate\'s escrow account',
            'are being held in transfermate\'s escrow account',
            'held in escrow account',
            'escrow account pending'
        ];

        const isIncoming = escrowPhrases.some(phrase => body.includes(phrase));

        // Exclude phrases that indicate RELEASE (not incoming)
        const releasePhrases = [
            'released from escrow',
            'transferred to your account',
            'payment has been transferred',
            'escrow released',
            'visa approved'
        ];

        const isRelease = releasePhrases.some(phrase => body.includes(phrase));

        return isIncoming && !isRelease;
    }

    /**
     * Detect if Slack message indicates INCOMING escrow payment
     *
     * @param {Object} slackMessage - Slack message object with text
     * @returns {Boolean} true if this is an incoming escrow payment
     */
    detectSlackEscrow(slackMessage) {
        if (!slackMessage || !slackMessage.text) {
            return false;
        }

        const text = slackMessage.text.toLowerCase();

        // Incoming indicators
        const incomingKeywords = [
            'escrow received',
            'escrow held',
            'visa pending',
            'awaiting visa',
            'escrow account'
        ];

        // Exclude release indicators
        const releaseKeywords = [
            'escrow released',
            'visa approved',
            'transferred to account',
            'settled'
        ];

        const hasIncoming = incomingKeywords.some(keyword => text.includes(keyword));
        const hasRelease = releaseKeywords.some(keyword => text.includes(keyword));

        return hasIncoming && !hasRelease;
    }

    /**
     * Generate unique escrow ID
     */
    generateEscrowId() {
        const year = new Date().getFullYear();
        const count = this.escrowData.total_count + 1;
        return `ESC-${year}-${String(count).padStart(3, '0')}`;
    }

    /**
     * Record incoming escrow payment
     *
     * @param {Object} params - Escrow payment details
     * @returns {Object} Escrow record
     */
    async recordIncoming(params) {
        const {
            studentId,
            studentName,
            invoice,
            amount,
            transactionDate,
            source, // 'transfermate_email' or 'slack_financial'
            sourceReference, // Email ID or Slack timestamp
            sourceData // Full email or Slack message for reference
        } = params;

        // Check if already recorded
        const existing = this.escrowData.escrow_payments.find(e =>
            e.student_id === studentId &&
            e.invoice === invoice &&
            e.status === 'PENDING'
        );

        if (existing) {
            console.log(`   ℹ️  Escrow already tracked: ${existing.escrow_id}`);
            return existing;
        }

        const escrowId = this.generateEscrowId();
        const record = {
            escrow_id: escrowId,
            student_id: studentId,
            student_name: studentName,
            invoice: invoice,
            amount: parseFloat(amount),
            date_entered: transactionDate,
            status: 'PENDING', // PENDING | RELEASED | REFUNDED
            source: source,
            source_reference: sourceReference,
            source_data: sourceData,
            release_transaction_id: null,
            release_date: null,
            refund_transaction_id: null,
            refund_date: null,
            fees_retained: {
                visa_support: 0,
                admin_course: 0,
                admin_accommodation: 0
            },
            notes: []
        };

        this.escrowData.escrow_payments.push(record);
        this.escrowData.total_count++;
        this.escrowData.pending_count++;
        await this.save();

        console.log(`   ✅ Escrow tracked: ${escrowId} - ${studentName} (${studentId})`);
        return record;
    }

    /**
     * Find matching escrow record for a release/refund transaction
     *
     * @param {Object} transaction - BOI transaction
     * @returns {Object|null} Matching escrow record
     */
    async findMatchingEscrow(transaction) {
        const pending = this.escrowData.escrow_payments.filter(e => e.status === 'PENDING');

        // Try to match by:
        // 1. Invoice reference in transaction description
        // 2. Amount (within €5 tolerance)
        // 3. Student ID (if available in transaction)

        for (const escrow of pending) {
            // Check invoice reference
            if (transaction.description && escrow.invoice) {
                const desc = transaction.description.toUpperCase();
                if (desc.includes(escrow.invoice)) {
                    return escrow;
                }
            }

            // Check amount match (within tolerance)
            const txnAmount = parseFloat(transaction.amount);
            const amountDiff = Math.abs(txnAmount - escrow.amount);
            if (amountDiff <= 5) {
                // Close amount match - might be same payment
                console.log(`   ⚠️  Potential escrow match by amount: ${escrow.escrow_id} (diff: €${amountDiff.toFixed(2)})`);
                return escrow;
            }
        }

        return null;
    }

    /**
     * Record escrow release (funds transferred to BOI account)
     *
     * @param {String} escrowId - Escrow ID
     * @param {Object} releaseTransaction - BOI transaction details
     */
    async recordRelease(escrowId, releaseTransaction) {
        const record = this.escrowData.escrow_payments.find(e => e.escrow_id === escrowId);

        if (!record) {
            throw new Error(`Escrow record not found: ${escrowId}`);
        }

        if (record.status !== 'PENDING') {
            console.log(`   ⚠️  Escrow ${escrowId} already ${record.status}`);
            return record;
        }

        record.status = 'RELEASED';
        record.release_date = new Date().toISOString();
        record.release_transaction_id = releaseTransaction.id || releaseTransaction.dataId;
        record.notes.push(`Released on ${record.release_date} via transaction ${record.release_transaction_id}`);

        this.escrowData.pending_count--;
        this.escrowData.released_count++;
        await this.save();

        console.log(`   ✅ Escrow released: ${escrowId}`);
        return record;
    }

    /**
     * Record escrow refund (funds returned to sender after visa refusal)
     *
     * @param {String} escrowId - Escrow ID
     * @param {Object} refundTransaction - Refund transaction details
     * @param {Object} fees - Fees retained {visa: 250, admin: 50/65}
     */
    async recordRefund(escrowId, refundTransaction, fees) {
        const record = this.escrowData.escrow_payments.find(e => e.escrow_id === escrowId);

        if (!record) {
            throw new Error(`Escrow record not found: ${escrowId}`);
        }

        if (record.status !== 'PENDING') {
            console.log(`   ⚠️  Escrow ${escrowId} already ${record.status}`);
            return record;
        }

        record.status = 'REFUNDED';
        record.refund_date = new Date().toISOString();
        record.refund_transaction_id = refundTransaction.id || refundTransaction.dataId;
        record.fees_retained = fees || { visa_support: 250, admin_course: 50, admin_accommodation: 0 };

        const totalFees = Object.values(record.fees_retained).reduce((sum, fee) => sum + fee, 0);
        record.notes.push(`Refunded on ${record.refund_date}. Retained fees: €${totalFees}`);

        this.escrowData.pending_count--;
        this.escrowData.refunded_count++;
        await this.save();

        console.log(`   ✅ Escrow refunded: ${escrowId} (retained €${totalFees} in fees)`);
        return record;
    }

    /**
     * Get escrow statistics
     */
    getStats() {
        return {
            total: this.escrowData.total_count,
            pending: this.escrowData.pending_count,
            released: this.escrowData.released_count,
            refunded: this.escrowData.refunded_count,
            pending_amount: this.escrowData.escrow_payments
                .filter(e => e.status === 'PENDING')
                .reduce((sum, e) => sum + e.amount, 0)
        };
    }

    /**
     * Format Slack message for incoming escrow payment
     */
    formatSlackEscrowMessage(escrowRecord, transaction) {
        const lines = [
            `🔒 *ESCROW PAYMENT RECEIVED*`,
            `Escrow ID: \`${escrowRecord.escrow_id}\``,
            `Student: *${escrowRecord.student_name}* (ID: ${escrowRecord.student_id})`,
            `Amount: €${escrowRecord.amount.toFixed(2)}`,
            `Invoice: ${escrowRecord.invoice || 'N/A'}`,
            `Date: ${transaction.date}`,
            ``,
            `⚠️ *FUNDS IN TRANSFERMATE ESCROW ACCOUNT*`,
            `• Status: Visa Application Pending`,
            `• NOT in ULearn BOI account`,
            `• NOT assigned in Fidelo`,
            `• Student remains "Unconfirmed"`,
            ``,
            `⏳ Awaiting visa decision...`,
            `✅ Will auto-assign when visa approved & escrow released`,
            `❌ Will track refund if visa refused (fees: €250-€315)`
        ];

        return lines.join('\n');
    }

    /**
     * Format Slack message for escrow release
     */
    formatSlackReleaseMessage(escrowRecord) {
        const lines = [
            `✅ *ESCROW RELEASED*`,
            `Escrow ID: \`${escrowRecord.escrow_id}\``,
            `Student: *${escrowRecord.student_name}* (ID: ${escrowRecord.student_id})`,
            `Amount: €${escrowRecord.amount.toFixed(2)}`,
            ``,
            `🎉 Visa approved - funds transferred to BOI account`,
            `📋 Processing payment assignment in Fidelo...`
        ];

        return lines.join('\n');
    }

    /**
     * Format Slack message for escrow refund
     */
    formatSlackRefundMessage(escrowRecord) {
        const totalFees = Object.values(escrowRecord.fees_retained).reduce((sum, fee) => sum + fee, 0);

        const lines = [
            `↩️ *ESCROW REFUNDED*`,
            `Escrow ID: \`${escrowRecord.escrow_id}\``,
            `Student: *${escrowRecord.student_name}* (ID: ${escrowRecord.student_id})`,
            `Amount: €${escrowRecord.amount.toFixed(2)}`,
            ``,
            `❌ Visa refused - funds returned to sender`,
            `💰 Fees retained: €${totalFees}`,
            `   • Visa support: €${escrowRecord.fees_retained.visa_support}`,
            `   • Admin (course): €${escrowRecord.fees_retained.admin_course}`,
            `   • Admin (accommodation): €${escrowRecord.fees_retained.admin_accommodation}`
        ];

        return lines.join('\n');
    }
}

module.exports = EscrowTracker;
