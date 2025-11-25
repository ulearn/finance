/**
 * Xero Unreconciled Credit Transactions Fetcher
 * Location: /home/hub/public_html/fins/scripts/incomings/xero-unreconciled-fetcher.js
 *
 * Purpose: Fetch unreconciled credit transactions (incoming payments) from Xero
 *
 * Process:
 * 1. Connect to Xero API via existing client
 * 2. Fetch bank transactions with UNRECONCILED status
 * 3. Filter for CREDIT transactions only (money in)
 * 4. Transform to format expected by payment-assignment-workflow.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const XeroAPIClient = require('../xero/xero-client');

class XeroUnreconciledFetcher {
    constructor() {
        this.xeroClient = new XeroAPIClient();
        this.bankAccountId = '93d5d790-e7a1-4c9d-9cf2-8b68db272970'; // ULearn Limited Current Account
    }

    /**
     * Fetch unreconciled credit transactions from Xero
     */
    async fetchUnreconciledCredits(options = {}) {
        try {
            console.log('═══════════════════════════════════════════');
            console.log('XERO UNRECONCILED CREDITS FETCHER');
            console.log('═══════════════════════════════════════════\n');

            // Ensure Xero tokens are valid
            await this.xeroClient.ensureValidToken();

            console.log('✅ Connected to Xero API');
            console.log(`📊 Fetching unreconciled transactions for account: ${this.bankAccountId}\n`);

            // Fetch bank transactions with UNRECONCILED status
            const where = options.where || `Status=="UNRECONCILED" AND BankAccount.AccountID==GUID("${this.bankAccountId}")`;

            const response = await this.xeroClient.getBankTransactions({
                where: where,
                order: 'Date DESC' // Most recent first
            });

            const allTransactions = response.bankTransactions || [];
            console.log(`📥 Found ${allTransactions.length} unreconciled transactions`);

            // Filter for CREDIT transactions only (money in - TYPE == "RECEIVE")
            const creditTransactions = allTransactions.filter(txn => {
                return txn.type === 'RECEIVE' || txn.type === 'RECEIVE-OVERPAYMENT';
            });

            console.log(`💰 ${creditTransactions.length} are CREDIT transactions (incoming payments)\n`);

            // Transform to workflow format
            const transformedTransactions = creditTransactions.map(txn => this.transformTransaction(txn));

            return {
                success: true,
                count: transformedTransactions.length,
                transactions: transformedTransactions,
                raw: creditTransactions
            };

        } catch (error) {
            console.error('❌ Error fetching unreconciled credits:', error.message);
            return {
                success: false,
                error: error.message,
                count: 0,
                transactions: []
            };
        }
    }

    /**
     * Transform Xero transaction to workflow format
     */
    transformTransaction(xeroTxn) {
        // Xero transaction structure:
        // {
        //   bankTransactionID: "...",
        //   type: "RECEIVE",
        //   date: "2025-01-15T00:00:00",
        //   total: 1667.60,
        //   reference: "...",
        //   isReconciled: false,
        //   status: "UNRECONCILED",
        //   bankAccount: { accountID: "...", code: "..." },
        //   lineItems: [{ description: "...", ... }]
        // }

        const lineItem = xeroTxn.lineItems && xeroTxn.lineItems[0];
        const description = lineItem?.description || xeroTxn.reference || 'No description';

        return {
            // Workflow format
            date: this.formatDate(xeroTxn.date),
            amount: parseFloat(xeroTxn.total),
            description: description,

            // Additional Xero metadata
            xeroTransactionId: xeroTxn.bankTransactionID,
            xeroReference: xeroTxn.reference,
            xeroStatus: xeroTxn.status,
            xeroType: xeroTxn.type,
            xeroUrl: `https://go.xero.com/Bank/ViewTransaction.aspx?bankTransactionID=${xeroTxn.bankTransactionID}`
        };
    }

    /**
     * Format Xero date to YYYY-MM-DD
     */
    formatDate(xeroDate) {
        // Xero returns dates like "2025-01-15T00:00:00"
        if (!xeroDate) return null;

        const date = new Date(xeroDate);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }

    /**
     * Fetch unreconciled credits for a specific date range
     */
    async fetchByDateRange(startDate, endDate) {
        const where = `Status=="UNRECONCILED" AND BankAccount.AccountID==GUID("${this.bankAccountId}") AND Date>=${startDate} AND Date<=${endDate}`;

        return await this.fetchUnreconciledCredits({ where });
    }

    /**
     * Print summary of fetched transactions
     */
    printSummary(result) {
        if (!result.success) {
            console.log('❌ Failed to fetch transactions\n');
            return;
        }

        console.log('═══════════════════════════════════════════');
        console.log('FETCH SUMMARY');
        console.log('═══════════════════════════════════════════');
        console.log(`Total Credit Transactions: ${result.count}`);

        if (result.count > 0) {
            const totalAmount = result.transactions.reduce((sum, txn) => sum + txn.amount, 0);
            console.log(`Total Amount: €${totalAmount.toFixed(2)}`);
            console.log(`\nSample Transactions (first 5):`);

            result.transactions.slice(0, 5).forEach((txn, i) => {
                console.log(`\n${i + 1}. ${txn.date} - €${txn.amount.toFixed(2)}`);
                console.log(`   ${txn.description.substring(0, 60)}${txn.description.length > 60 ? '...' : ''}`);
            });
        }

        console.log('\n═══════════════════════════════════════════\n');
    }
}

// Export for use as module
module.exports = XeroUnreconciledFetcher;

// CLI test mode
if (require.main === module) {
    console.log('Testing Xero Unreconciled Credits Fetcher...\n');

    const fetcher = new XeroUnreconciledFetcher();

    (async () => {
        // Test: Fetch all unreconciled credits
        const result = await fetcher.fetchUnreconciledCredits();

        if (result.success) {
            fetcher.printSummary(result);
            console.log('✅ Test completed successfully!');
        } else {
            console.log('❌ Test failed:', result.error);
        }
    })();
}
