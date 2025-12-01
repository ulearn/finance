/**
 * Fidelo Payment Assignment Utilities
 * Location: /home/hub/public_html/fins/scripts/incomings/fidelo-assign.js
 *
 * Purpose: Utilities for assigning payments to Fidelo bookings
 *
 * Features:
 * - Duplicate payment detection (across ALL invoices for a Student ID)
 * - TransferMate Escrow payment handling (legacy cleanup)
 * - Payment fetching from database and API
 * - Date parsing utilities
 *
 * Business Context (Escrow):
 * - Old process: Escrow payments were recorded in Fidelo while funds still in escrow
 * - New process: Only record payments when funds actually received in bank
 * - When escrow funds are released and received:
 *   1. DELETE the old "TransferMate Escrow" payment record
 *   2. CREATE new "TransferMate" payment with actual received amount
 */

const axios = require('axios');
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

class FideloAssignmentHandler {
    constructor() {
        this.gui2Token = '9feb2576ba97b2743550120aa5dd935c';
        this.gui2Url = 'https://ulearn.fidelo.com/api/1.0/gui2/4e289ca973cc2b424d58ec10197bd160';
        this.apiToken = process.env.FIDELO_API_TOKEN || '699c957fb710153384dc0aea54e5dbec';
        this.connection = null;
    }

    /**
     * Connect to MySQL database
     */
    async connect() {
        if (!this.connection) {
            this.connection = await mysql.createConnection({
                host: process.env.DB_HOST,
                port: process.env.DB_PORT,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME
            });
        }
        return this.connection;
    }

    /**
     * Disconnect from MySQL
     */
    async disconnect() {
        if (this.connection) {
            await this.connection.end();
            this.connection = null;
        }
    }

    /**
     * Check if a payment already exists in Fidelo for this transaction
     * Prevents duplicate assignment during transition from manual to automated process
     *
     * @param {string} documentNumber - Booking document number
     * @param {number} amount - Transaction amount
     * @param {string} date - Transaction date (YYYY-MM-DD or DD MMM YYYY)
     * @param {number} dateTolerance - Days tolerance for date matching (default 5)
     * @returns {Promise<Object>} { exists: boolean, matchedPayment: object|null }
     */
    async checkForDuplicatePayment(documentNumber, amount, date, dateTolerance = 5) {
        try {
            // Get all payments for this booking
            let payments = documentNumber ? await this.getPaymentsFromDatabase(documentNumber) : [];

            // Fallback to API if database has no results
            if (payments.length === 0 && documentNumber) {
                payments = await this.getPaymentsFromAPI(documentNumber);
            }

            if (payments.length === 0) {
                return { exists: false, matchedPayment: null };
            }

            // Parse transaction date
            const txnDate = this.parseDate(date);
            if (!txnDate) {
                console.log('⚠️  Could not parse transaction date for duplicate check');
                return { exists: false, matchedPayment: null };
            }

            // Check each payment for matches
            for (const payment of payments) {
                const paymentAmount = parseFloat(payment.amount || 0);
                const amountDiff = Math.abs(paymentAmount - amount);

                // Check amount match (within €1 tolerance for rounding)
                if (amountDiff > 1) {
                    continue; // Amount doesn't match, skip
                }

                // Check date match (within tolerance days)
                const paymentDate = this.parseDate(payment.payment_date || payment['ip.date']);
                if (!paymentDate) {
                    continue; // Can't parse payment date, skip
                }

                const daysDiff = Math.abs((txnDate - paymentDate) / (1000 * 60 * 60 * 24));
                if (daysDiff <= dateTolerance) {
                    // Found a match!
                    return {
                        exists: true,
                        matchedPayment: {
                            id: payment.payment_id || payment['ts_ip.id'] || payment.id,
                            amount: paymentAmount,
                            date: payment.payment_date || payment['ip.date'],
                            method: payment.payment_method || payment['kpm.name'],
                            comment: payment.comment || payment['ip.comment'] || '',
                            daysDifference: Math.round(daysDiff)
                        }
                    };
                }
            }

            return { exists: false, matchedPayment: null };

        } catch (error) {
            console.error('❌ Error checking for duplicate payment:', error.message);
            // On error, return false to allow assignment (safer than blocking)
            return { exists: false, matchedPayment: null };
        }
    }

    /**
     * Check for duplicate payment by Student ID across ALL invoices
     * CRITICAL: Students can have multiple invoices (D2025510, D2025551, etc.) for one booking
     * We must check ALL invoices, not just one
     *
     * @param {number} studentId - Student ID (customer_number)
     * @param {Object} booking - Fidelo booking object (contains document numbers)
     * @param {number} amount - Transaction amount
     * @param {string} date - Transaction date
     * @param {number} dateTolerance - Days tolerance (default 5)
     * @returns {Promise<Object>} { exists: boolean, matchedPayment: object|null }
     */
    async checkForDuplicatePaymentByStudentId(studentId, booking, amount, date, dateTolerance = 5) {
        try {
            console.log(`🔍 Checking for duplicate payment across ALL invoices for Student ID ${studentId}...`);

            // Collect all document numbers (invoices) from booking object
            // Support both camelCase (from fidelo-search.js) and underscore (from raw API)
            const documentNumbers = [];
            const docNumber = booking.documentNumber || booking.document_number;
            if (docNumber) {
                documentNumbers.push(docNumber);
            }
            // Also check if there are multiple document numbers in document_number_all
            const docNumbersAll = booking.documentNumberAll || booking.document_number_all;
            if (docNumbersAll && Array.isArray(docNumbersAll)) {
                documentNumbers.push(...docNumbersAll.filter(d => d.startsWith('D') || d.startsWith('P')));
            }

            // Remove duplicates
            const uniqueDocuments = [...new Set(documentNumbers)];
            console.log(`   Checking ${uniqueDocuments.length} invoice(s): ${uniqueDocuments.join(', ')}`);

            // Check for duplicate payment across ALL invoices
            const txnDate = this.parseDate(date);
            if (!txnDate) {
                console.log('   ⚠️  Could not parse transaction date');
                return { exists: false, matchedPayment: null };
            }

            // Search payments across all invoices
            for (const docNumber of uniqueDocuments) {
                let payments = await this.getPaymentsFromDatabase(docNumber);
                if (payments.length === 0) {
                    payments = await this.getPaymentsFromAPI(docNumber);
                }

                // Check each payment
                for (const payment of payments) {
                    const paymentAmount = parseFloat(payment.amount || 0);
                    const amountDiff = Math.abs(paymentAmount - amount);

                    // Amount match (±€1 tolerance)
                    if (amountDiff > 1) continue;

                    // Date match
                    const paymentDate = this.parseDate(payment.payment_date || payment['ip.date']);
                    if (!paymentDate) continue;

                    const daysDiff = Math.abs((txnDate - paymentDate) / (1000 * 60 * 60 * 24));

                    if (daysDiff <= dateTolerance) {
                        // FOUND DUPLICATE!
                        const matched = {
                            id: payment.payment_id || payment['ts_ip.id'] || payment.id,
                            amount: paymentAmount,
                            date: payment.payment_date || payment['ip.date'],
                            method: payment.payment_method || payment['kpm.name'],
                            comment: payment.comment || payment['ip.comment'] || '',
                            invoice: docNumber,
                            daysDifference: Math.round(daysDiff),
                            amountDifference: amountDiff.toFixed(2)
                        };

                        console.log(`   ⚠️  DUPLICATE FOUND on invoice ${docNumber}!`);
                        console.log(`      Amount: €${matched.amount} (diff: €${matched.amountDifference})`);
                        console.log(`      Date: ${matched.date} (${matched.daysDifference} days diff)`);
                        console.log(`      Method: ${matched.method}`);
                        console.log(`      Comment: ${matched.comment}`);

                        return {
                            exists: true,
                            matchedPayment: matched
                        };
                    }
                }
            }

            console.log(`   ✅ No duplicate found across ${uniqueDocuments.length} invoice(s)`);
            return { exists: false, matchedPayment: null };

        } catch (error) {
            console.error('❌ Error checking for duplicate by Student ID:', error.message);
            return { exists: false, matchedPayment: null };
        }
    }

    /**
     * Parse date from various formats to Date object
     * Handles: YYYY-MM-DD, DD MMM YYYY, ISO strings
     *
     * @param {string} dateString - Date string
     * @returns {Date|null} Date object or null if parse fails
     */
    parseDate(dateString) {
        if (!dateString) return null;

        try {
            // Try ISO format first
            let date = new Date(dateString);
            if (!isNaN(date.getTime())) {
                return date;
            }

            // Try "DD MMM YYYY" format (e.g., "21 Nov 2025")
            const parts = dateString.match(/(\d+)\s+(\w+)\s+(\d+)/);
            if (parts) {
                const day = parseInt(parts[1]);
                const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                                   'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                const month = monthNames.indexOf(parts[2].toLowerCase());
                const year = parseInt(parts[3]);

                if (month !== -1) {
                    return new Date(year, month, day);
                }
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Get payments for a booking from database
     * Faster than API, but limited to synced date range
     *
     * @param {string} documentNumber - Booking document number
     * @returns {Promise<Array>} Array of payment objects
     */
    async getPaymentsFromDatabase(documentNumber) {
        try {
            await this.connect();

            const [rows] = await this.connection.execute(
                `SELECT
                    payment_id,
                    inquiry_number,
                    document_number,
                    \`ip.fullname\` as fullname,
                    \`ip.date\` as payment_date,
                    amount,
                    \`kpm.name\` as payment_method,
                    \`ip.comment\` as comment
                FROM payments
                WHERE document_number LIKE ?`,
                [`%${documentNumber}%`]
            );

            return rows;

        } catch (error) {
            console.error('Error querying database for payments:', error.message);
            return [];
        }
    }

    /**
     * Get payments for a booking via GUI2 Payments API
     * 
     * IMPORTANT: Payments GUI2 searches by DOCUMENT NUMBER (P/D refs), NOT inquiry number!
     * The inquiry_number field is often empty in payment records.
     *
     * @param {string} documentNumber - Booking document number (e.g., "P2025771" or "D2025412")
     * @returns {Promise<Array>} Array of payment objects
     */
    async getPaymentsFromAPI(documentNumber) {
        try {
            if (!documentNumber) {
                console.log('⚠️  No document number - cannot search payments');
                return [];
            }

            // Use Payments GUI2 API (4e289ca973cc2b424d58ec10197bd160)
            // This is the "Incoming Payments" popup, NOT the Bookings view
            const response = await axios.get(`${this.gui2Url}/search`, {
                params: {
                    '_token': this.gui2Token,
                    'filter[search]': documentNumber, // Search by P/D reference
                    'filter[date]': '2020-01-01,2026-12-31',
                    'filter[release]': ''
                },
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (response.data && response.data.entries) {
                const payments = Object.values(response.data.entries);

                console.log(`GUI2 Payments API: ${payments.length} payment(s) for ${documentNumber}`);

                if (payments.length > 0 && payments.length <= 5) {
                    console.log('Payment details:');
                    payments.forEach(p => {
                        const id = p['ts_ip.id'] || 'unknown';
                        const method = p['kpm.name'] || 'Unknown';
                        console.log(`  - ID ${id}: €${p.amount} (${method})`);
                    });
                }

                return payments;
            }

            return [];

        } catch (error) {
            console.error('Error fetching payments from GUI2:', error.message);
            return [];
        }
    }

    /**
     * Check if booking has TransferMate Escrow payments
     *
     * @param {number} bookingId - Booking ID
     * @param {string} documentNumber - Document number (P/D reference)
     * @returns {Promise<Object>} { hasEscrow: boolean, payments: Array, escrowPayments: Array }
     */
    async checkForEscrowPayments(bookingId, documentNumber) {
        console.log(`Checking for TransferMate Escrow payments on booking ${bookingId}...`);

        // Try database first (faster)
        let payments = documentNumber ? await this.getPaymentsFromDatabase(documentNumber) : [];

        // Fallback to API if database empty or no document number
        if (payments.length === 0 && documentNumber) {
            console.log('No payments in database, checking API...');
            payments = await this.getPaymentsFromAPI(documentNumber);
        }

        // Filter for TransferMate Escrow method
        const escrowPayments = payments.filter(p => {
            const method = p.payment_method || p['kpm.name'] || '';
            return method.toLowerCase().includes('transfermate escrow');
        });

        if (escrowPayments.length > 0) {
            console.log(`⚠️  Found ${escrowPayments.length} TransferMate Escrow payment(s):`);
            escrowPayments.forEach(p => {
                const paymentId = p.payment_id || p['ts_ip.id'] || 'unknown';
                const paymentDate = p.payment_date || p['ip.date'] || 'unknown';
                console.log(`   - Payment ID ${paymentId}: €${p.amount} (${paymentDate})`);
            });
        }

        return {
            hasEscrow: escrowPayments.length > 0,
            payments,
            escrowPayments
        };
    }

    /**
     * Delete a payment via Fidelo API
     *
     * @param {number} paymentId - Fidelo payment ID
     * @returns {Promise<boolean>} Success status
     */
    async deletePayment(paymentId) {
        try {
            console.log(`Deleting payment ${paymentId}...`);

            await axios.delete(
                `https://ulearn.fidelo.com/api/1.0/ts/payments/${paymentId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'Accept': 'application/json'
                    }
                }
            );

            console.log(`✅ Payment ${paymentId} deleted`);
            return true;

        } catch (error) {
            console.error(`❌ Error deleting payment ${paymentId}:`, error.response?.data || error.message);
            return false;
        }
    }

    /**
     * Delete all TransferMate Escrow payments for a booking
     *
     * @param {number} bookingId - Booking ID  
     * @param {string} documentNumber - Document number
     * @returns {Promise<Object>} { success: boolean, deletedCount: number, errors: Array }
     */
    async deleteEscrowPayments(bookingId, documentNumber) {
        const result = await this.checkForEscrowPayments(bookingId, documentNumber);

        if (!result.hasEscrow) {
            console.log('No TransferMate Escrow payments found');
            return { success: true, deletedCount: 0, errors: [] };
        }

        console.log(`\n🗑️  Deleting ${result.escrowPayments.length} TransferMate Escrow payment(s)...`);

        const errors = [];
        let deletedCount = 0;

        for (const payment of result.escrowPayments) {
            const paymentId = payment.payment_id || payment['ts_ip.id'];

            if (!paymentId) {
                errors.push({
                    paymentId: 'UNKNOWN',
                    amount: payment.amount,
                    error: 'No payment ID found'
                });
                continue;
            }

            const success = await this.deletePayment(paymentId);
            if (success) {
                deletedCount++;
            } else {
                errors.push({
                    paymentId,
                    amount: payment.amount
                });
            }
        }

        const allDeleted = deletedCount === result.escrowPayments.length;

        if (allDeleted) {
            console.log(`✅ All ${deletedCount} escrow payment(s) deleted`);
        } else {
            console.log(`⚠️  Deleted ${deletedCount}/${result.escrowPayments.length}`);
        }

        return {
            success: allDeleted,
            deletedCount,
            errors
        };
    }

    /**
     * Assign payment to Fidelo with all necessary checks
     * This is the main entry point for payment assignment - handles:
     * 1. Duplicate detection (across ALL invoices for Student ID)
     * 2. Escrow payment handling
     * 3. Actual payment assignment
     *
     * @param {Object} txn - Transaction object { date, amount, description, source }
     * @param {Object} booking - Fidelo booking object
     * @param {Object} options - Options { dryRun, paymentMethodId, paymentMethodName }
     * @returns {Promise<Object>} Assignment result
     */
    async assignPaymentWithChecks(txn, booking, options = {}) {
        const { dryRun = false, paymentMethodId, paymentMethodName } = options;

        // STEP 1: Check for duplicate payments across ALL invoices for this Student ID
        const studentId = booking.customerNumber || booking.customer_number;
        const duplicateCheck = await this.checkForDuplicatePaymentByStudentId(
            studentId,
            booking,  // Pass booking object with document numbers
            txn.amount,
            txn.date,
            5 // 5 days tolerance
        );

        if (duplicateCheck.exists) {
            const match = duplicateCheck.matchedPayment;
            return {
                success: false,
                alreadyAssigned: true,
                existingPayment: match,
                message: 'Payment already exists in Fidelo'
            };
        }

        // STEP 2: Check for and handle TransferMate Escrow payments
        const bookingId = booking.bookingId || booking.id;
        const documentNumber = booking.document_number || booking.documentNumber;

        const escrowCheck = await this.checkForEscrowPayments(bookingId, documentNumber);
        let escrowDeleted = false;
        let escrowCount = 0;

        if (escrowCheck.hasEscrow) {
            escrowCount = escrowCheck.escrowPayments.length;

            if (!dryRun) {
                const deleteResult = await this.deleteEscrowPayments(bookingId, documentNumber);
                escrowDeleted = deleteResult.success;
            }
        }

        // STEP 3: Build payment comment with useful reference info
        let paymentComment = txn.description;

        // For Stripe/Revolut: Include payment ID instead of customer name
        if (txn.source === 'stripe' && txn.id) {
            // Stripe charge ID: ch_xxx (unique identifier for reconciliation)
            paymentComment = `Stripe: ${txn.id}`;
        } else if (txn.source === 'revolut' && txn.id) {
            // Revolut order ID or reference
            paymentComment = txn.reference
                ? `Revolut: ${txn.reference}`
                : `Revolut: ${txn.id}`;
        }
        // For bank transfers: keep original description

        paymentComment += ' - Ai'; // Tag as AI-created

        // STEP 4: Assign payment to Fidelo
        const paymentData = {
            inquiry_id: bookingId,
            school_id: 1,
            booking_id: bookingId,
            payment_date: txn.date,
            payment_method_id: paymentMethodId,
            payment_amount: txn.amount,
            payment_comment: paymentComment
        };

        if (dryRun) {
            return {
                success: true,
                dryRun: true,
                paymentId: 'DRY_RUN',
                paymentData,
                escrowHandled: escrowCount > 0,
                escrowCount,
                methodUsed: paymentMethodName
            };
        }

        try {
            const response = await axios.post(
                `https://ulearn.fidelo.com/api/1.0/ts/payments`,
                paymentData,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                }
            );

            return {
                success: true,
                paymentId: response.data.payment_id,
                escrowHandled: escrowCount > 0,
                escrowCount,
                escrowDeleted,
                methodUsed: paymentMethodName,
                response: response.data
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                errorDetails: error.response?.data
            };
        }
    }
}

module.exports = FideloAssignmentHandler;
