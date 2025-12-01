/**
 * Assignment Tracker - Track transaction assignment status to Fidelo
 * Location: /home/hub/public_html/fins/scripts/incomings/assignment-tracker.js
 *
 * Purpose: Maintain checkpoint system for all financial sources
 * - BOI (from Xero recon files)
 * - Stripe (from API)
 * - Revolut (from API)
 *
 * File Structure: /scripts/assign/2025/11-nov-tracker.json
 * - New file created automatically on 1st of each month
 * - Tracks: transaction ID, amount, status, timestamps
 */

const fs = require('fs').promises;
const path = require('path');

class AssignmentTracker {
    constructor() {
        this.baseDir = __dirname;
    }

    /**
     * Get current month's assignment file path
     * Format: /scripts/assign/2025/11-nov-tracker.json
     */
    getCurrentMonthFile() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1; // 1-12
        const monthName = now.toLocaleString('en-US', { month: 'short' }).toLowerCase();

        const dir = path.join(this.baseDir, String(year));
        const filename = `${month}-${monthName}-tracker.json`;

        return {
            dir,
            filepath: path.join(dir, filename),
            year,
            month,
            monthName
        };
    }

    /**
     * Initialize assignment file if it doesn't exist
     */
    async ensureFileExists() {
        const { dir, filepath } = this.getCurrentMonthFile();

        // Ensure directory exists
        try {
            await fs.access(dir);
        } catch {
            await fs.mkdir(dir, { recursive: true });
        }

        // Ensure file exists with proper structure
        try {
            await fs.access(filepath);
            // File exists - validate structure
            const content = await fs.readFile(filepath, 'utf8');
            if (!content || content.trim() === '') {
                // Empty file - initialize
                await this.initializeFile(filepath);
            }
        } catch {
            // File doesn't exist - create it
            await this.initializeFile(filepath);
        }

        return filepath;
    }

    /**
     * Initialize new assignment file with structure
     */
    async initializeFile(filepath) {
        const { year, month, monthName } = this.getCurrentMonthFile();

        const initialData = {
            metadata: {
                year,
                month,
                monthName,
                created: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            },
            transactions: {
                boi: [],      // BOI bank transactions (from Xero recon files)
                stripe: [],   // Stripe charges
                revolut: []   // Revolut orders
            },
            stats: {
                total: 0,
                unprocessed: 0,
                assigned: 0,
                duplicate: 0,
                review: 0,
                failed: 0
            }
        };

        await fs.writeFile(filepath, JSON.stringify(initialData, null, 2));
        console.log(`✅ Created new assignment file: ${filepath}`);
    }

    /**
     * Load current month's assignment data
     */
    async loadAssignments() {
        const filepath = await this.ensureFileExists();
        const content = await fs.readFile(filepath, 'utf8');
        return JSON.parse(content);
    }

    /**
     * Save assignment data
     */
    async saveAssignments(data) {
        const filepath = await this.ensureFileExists();

        // Update metadata
        data.metadata.lastUpdated = new Date().toISOString();

        // Recalculate stats
        data.stats = this.calculateStats(data.transactions);

        await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    }

    /**
     * Calculate statistics from transactions
     */
    calculateStats(transactions) {
        const allTransactions = [
            ...transactions.boi,
            ...transactions.stripe,
            ...transactions.revolut
        ];

        const stats = {
            total: allTransactions.length,
            unprocessed: 0,
            assigned: 0,
            duplicate: 0,
            review: 0,
            failed: 0
        };

        allTransactions.forEach(txn => {
            const status = txn.assignStatus || 'unprocessed';
            if (stats.hasOwnProperty(status)) {
                stats[status]++;
            }
        });

        return stats;
    }

    /**
     * Add or update BOI transaction
     * Uses dataId from Xero recon file
     */
    async addBoiTransaction(dataId, amount, date, description, reference) {
        const data = await this.loadAssignments();

        // Check if already exists
        const existing = data.transactions.boi.find(t => t.id === dataId);

        if (existing) {
            // Update existing
            existing.lastUpdated = new Date().toISOString();
            return existing;
        } else {
            // Add new
            const newTxn = {
                id: dataId,                          // Xero dataId
                source: 'boi',
                amount: typeof amount === 'number' ? amount : parseFloat(amount.replace(/,/g, '')),
                date,
                description,
                reference,
                assignStatus: 'unprocessed',         // unprocessed, assigned, duplicate, review, failed
                fideloPaymentId: null,               // Set when assigned
                fideloStudentId: null,               // Set when matched
                fideloInvoice: null,                 // Set when matched
                addedAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                notes: null
            };

            data.transactions.boi.push(newTxn);
            await this.saveAssignments(data);
            return newTxn;
        }
    }

    /**
     * Add or update Stripe transaction
     * Uses Stripe charge ID (ch_xxx or py_xxx)
     */
    async addStripeTransaction(chargeId, amount, date, customerName = null) {
        const data = await this.loadAssignments();

        const existing = data.transactions.stripe.find(t => t.id === chargeId);

        if (existing) {
            existing.lastUpdated = new Date().toISOString();
            return existing;
        } else {
            const newTxn = {
                id: chargeId,                        // Stripe charge ID
                source: 'stripe',
                amount,
                date,
                customerName,                        // Optional - for reference only
                assignStatus: 'unprocessed',
                fideloPaymentId: null,
                fideloStudentId: null,
                fideloInvoice: null,
                addedAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                notes: null
            };

            data.transactions.stripe.push(newTxn);
            await this.saveAssignments(data);
            return newTxn;
        }
    }

    /**
     * Add or update Revolut transaction
     * Uses Revolut order ID
     */
    async addRevolutTransaction(orderId, amount, date, customerName = null) {
        const data = await this.loadAssignments();

        const existing = data.transactions.revolut.find(t => t.id === orderId);

        if (existing) {
            existing.lastUpdated = new Date().toISOString();
            return existing;
        } else {
            const newTxn = {
                id: orderId,                         // Revolut order ID
                source: 'revolut',
                amount,
                date,
                customerName,                        // Optional - for reference only
                assignStatus: 'unprocessed',
                fideloPaymentId: null,
                fideloStudentId: null,
                fideloInvoice: null,
                addedAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                notes: null
            };

            data.transactions.revolut.push(newTxn);
            await this.saveAssignments(data);
            return newTxn;
        }
    }

    /**
     * Update transaction status after assignment attempt
     */
    async updateStatus(source, txnId, status, details = {}) {
        const data = await this.loadAssignments();

        const txn = data.transactions[source].find(t => t.id === txnId);

        if (!txn) {
            throw new Error(`Transaction ${txnId} not found in ${source}`);
        }

        // Update status
        txn.assignStatus = status;
        txn.lastUpdated = new Date().toISOString();

        // Update Fidelo details if provided
        if (details.fideloPaymentId) txn.fideloPaymentId = details.fideloPaymentId;
        if (details.fideloStudentId) txn.fideloStudentId = details.fideloStudentId;
        if (details.fideloInvoice) txn.fideloInvoice = details.fideloInvoice;
        if (details.notes) txn.notes = details.notes;

        await this.saveAssignments(data);
        return txn;
    }

    /**
     * Get all unprocessed transactions from all sources
     */
    async getUnprocessedTransactions() {
        const data = await this.loadAssignments();

        const unprocessed = {
            boi: data.transactions.boi.filter(t => t.assignStatus === 'unprocessed'),
            stripe: data.transactions.stripe.filter(t => t.assignStatus === 'unprocessed'),
            revolut: data.transactions.revolut.filter(t => t.assignStatus === 'unprocessed')
        };

        return unprocessed;
    }

    /**
     * Check if transaction has been processed
     */
    async isProcessed(source, txnId) {
        const data = await this.loadAssignments();
        const txn = data.transactions[source].find(t => t.id === txnId);
        return txn ? txn.assignStatus !== 'unprocessed' : false;
    }

    /**
     * Sync BOI transactions from Xero recon file
     * Reads from: /scripts/xero/recon/2025/11-nov-txns.json
     */
    async syncBoiFromXeroRecon() {
        const fs = require('fs').promises;
        const path = require('path');

        try {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth() + 1;
            const monthName = now.toLocaleString('en-US', { month: 'short' }).toLowerCase();

            const xeroReconFile = path.join(__dirname, `../xero/recon/${year}/${month}-${monthName}-txns.json`);

            console.log(`\n📥 Syncing BOI transactions from: ${month}-${monthName}-txns.json`);

            // Check if file exists
            try {
                await fs.access(xeroReconFile);
            } catch {
                console.log(`   ⚠️  Xero recon file not found: ${xeroReconFile}`);
                console.log(`   Skipping BOI transactions for this month`);
                return 0;
            }

            // Load Xero recon data
            const content = await fs.readFile(xeroReconFile, 'utf8');
            const data = JSON.parse(content);

            // Filter for RECEIVE transactions only (money in)
            const receiveTransactions = data.transactions.filter(t => t.type === 'RECEIVE');

            console.log(`   Found ${receiveTransactions.length} RECEIVE transactions in Xero recon file`);

            // Add each to tracker
            let synced = 0;
            for (const txn of receiveTransactions) {
                await this.addBoiTransaction(
                    txn.dataId,
                    txn.amountReceived || txn.amount,
                    txn.date,
                    txn.description,
                    txn.reference
                );
                synced++;
            }

            console.log(`   ✅ Synced ${synced} BOI transactions to tracker`);
            return synced;

        } catch (error) {
            console.error('❌ Error syncing BOI transactions:', error.message);
            return 0;
        }
    }

    /**
     * Sync Stripe transactions from API
     * @param {Array} stripeTransactions - Array of Stripe transaction objects from API
     */
    async syncStripeFromApi(stripeTransactions) {
        try {
            console.log(`\n📥 Syncing ${stripeTransactions.length} Stripe transactions to tracker...`);

            let synced = 0;
            for (const txn of stripeTransactions) {
                await this.addStripeTransaction(
                    txn.id,         // Stripe charge ID
                    txn.amount,
                    txn.date,
                    txn.customerName
                );
                synced++;
            }

            console.log(`   ✅ Synced ${synced} Stripe transactions`);
            return synced;

        } catch (error) {
            console.error('❌ Error syncing Stripe transactions:', error.message);
            return 0;
        }
    }

    /**
     * Sync Revolut transactions from API
     * @param {Array} revolutTransactions - Array of Revolut transaction objects from API
     */
    async syncRevolutFromApi(revolutTransactions) {
        try {
            console.log(`\n📥 Syncing ${revolutTransactions.length} Revolut transactions to tracker...`);

            let synced = 0;
            for (const txn of revolutTransactions) {
                await this.addRevolutTransaction(
                    txn.id,         // Revolut order ID
                    txn.amount,
                    txn.date,
                    txn.customerName
                );
                synced++;
            }

            console.log(`   ✅ Synced ${synced} Revolut transactions`);
            return synced;

        } catch (error) {
            console.error('❌ Error syncing Revolut transactions:', error.message);
            return 0;
        }
    }

    /**
     * Sync BOI transactions that were already loaded from Xero recon file
     * @param {Array} transactions - BOI transactions with id, amount, date, description, reference
     */
    async syncBoiFromApi(transactions) {
        console.log(`\n📥 Syncing ${transactions.length} BOI transactions (pre-loaded from Xero recon)...`);

        let added = 0;
        for (const txn of transactions) {
            const existing = await this.isProcessed('boi', txn.id);
            if (!existing) {
                await this.addBoiTransaction(txn.id, txn.amount, txn.date, txn.description, txn.reference);
                added++;
            }
        }

        console.log(`   ✅ Added ${added} new BOI transactions (${transactions.length - added} already tracked)`);
        return added;
    }

    /**
     * Sync all financial sources (convenience method)
     * @param {Object} options - { boiTransactions, stripeTransactions, revolutTransactions }
     */
    async syncAllSources(options = {}) {
        const { boiTransactions = [], stripeTransactions = [], revolutTransactions = [] } = options;

        console.log('\n═══════════════════════════════════════════');
        console.log('SYNCING FINANCIAL SOURCES TO TRACKER');
        console.log('═══════════════════════════════════════════');

        const stats = {
            boi: 0,
            stripe: 0,
            revolut: 0
        };

        // Sync BOI - use provided transactions if available, otherwise read from Xero recon file
        if (boiTransactions.length > 0) {
            stats.boi = await this.syncBoiFromApi(boiTransactions);
        } else {
            stats.boi = await this.syncBoiFromXeroRecon();
        }

        // Sync Stripe if provided
        if (stripeTransactions.length > 0) {
            stats.stripe = await this.syncStripeFromApi(stripeTransactions);
        }

        // Sync Revolut if provided
        if (revolutTransactions.length > 0) {
            stats.revolut = await this.syncRevolutFromApi(revolutTransactions);
        }

        console.log('\n📊 Sync Summary:');
        console.log(`   BOI: ${stats.boi}`);
        console.log(`   Stripe: ${stats.stripe}`);
        console.log(`   Revolut: ${stats.revolut}`);
        console.log(`   Total: ${stats.boi + stats.stripe + stats.revolut}\n`);

        return stats;
    }
}

module.exports = AssignmentTracker;
