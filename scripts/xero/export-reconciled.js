// Export Reconciled Bank Transactions for Learning
// Location: /home/hub/public_html/fins/scripts/xero/export-reconciled.js
// Purpose: Download all reconciled transactions by year for pattern learning

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const XeroAPIClient = require('./xero-client');
const fs = require('fs').promises;
const path = require('path');

class ReconciledTransactionExporter {
    constructor() {
        this.xeroClient = new XeroAPIClient();
        this.outputDir = path.join(__dirname, '../../Docs/Xero/learning-data');
    }

    async ensureOutputDir() {
        await fs.mkdir(this.outputDir, { recursive: true });
    }

    /**
     * Get all reconciled bank transactions for a specific year
     */
    async getReconciledTransactionsForYear(year) {
        console.log(`\n=== Fetching reconciled transactions for ${year} ===\n`);

        const where = `Date>=DateTime(${year},1,1)&&Date<=DateTime(${year},12,31)&&IsReconciled==true`;

        let allTransactions = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            console.log(`  Fetching page ${page}...`);

            const response = await this.xeroClient.getBankTransactions({
                where,
                page
            });

            if (response.bankTransactions && response.bankTransactions.length > 0) {
                allTransactions = allTransactions.concat(response.bankTransactions);
                console.log(`    Got ${response.bankTransactions.length} transactions`);
                page++;

                // Xero typically returns 100 per page, if less than 100 we're done
                if (response.bankTransactions.length < 100) {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        }

        console.log(`\n✓ Total ${year} reconciled transactions: ${allTransactions.length}`);
        return allTransactions;
    }

    /**
     * Convert transactions to learning-friendly format
     */
    convertToLearningFormat(transactions) {
        return transactions.map(tx => {
            const lineItem = tx.lineItems && tx.lineItems.length > 0 ? tx.lineItems[0] : null;

            return {
                // Transaction identifiers
                date: tx.date,
                bankTransactionID: tx.bankTransactionID,

                // Bank details
                bankAccount: tx.bankAccount?.name || '',
                bankAccountCode: tx.bankAccount?.code || '',

                // Transaction details
                type: tx.type, // RECEIVE or SPEND
                reference: tx.reference || '',
                total: parseFloat(tx.total || 0),

                // Contact
                contactName: tx.contact?.name || '',
                contactID: tx.contact?.contactID || '',

                // Line item (what it was reconciled to)
                accountCode: lineItem?.accountCode || '',
                accountName: lineItem?.accountName || '',
                description: lineItem?.description || '',
                lineAmount: lineItem ? parseFloat(lineItem.lineAmount || 0) : 0,
                taxType: lineItem?.taxType || '',

                // All line items (for multi-line transactions)
                lineItemCount: tx.lineItems?.length || 0,
                allLineItems: tx.lineItems?.map(li => ({
                    accountCode: li.accountCode,
                    accountName: li.accountName,
                    description: li.description,
                    amount: parseFloat(li.lineAmount || 0),
                    taxType: li.taxType
                })) || [],

                // Metadata
                status: tx.status,
                currencyCode: tx.currencyCode,
                updatedDateUTC: tx.updatedDateUTC
            };
        });
    }

    /**
     * Convert to CSV format
     */
    convertToCSV(transactions) {
        const headers = [
            'Date', 'Type', 'BankAccount', 'ContactName', 'Reference',
            'Total', 'AccountCode', 'AccountName', 'Description',
            'LineAmount', 'TaxType', 'Status', 'BankTransactionID'
        ];

        const rows = transactions.map(tx => {
            const lineItem = tx.lineItems && tx.lineItems.length > 0 ? tx.lineItems[0] : {};
            const date = tx.date ? (typeof tx.date === 'string' ? tx.date.split('T')[0] : new Date(tx.date).toISOString().split('T')[0]) : '';

            return [
                date,
                tx.type || '',
                tx.bankAccount?.name || '',
                tx.contact?.name || '',
                (tx.reference || '').replace(/"/g, '""'), // Escape quotes
                tx.total || 0,
                lineItem.accountCode || '',
                lineItem.accountName || '',
                (lineItem.description || '').replace(/"/g, '""'),
                lineItem.lineAmount || 0,
                lineItem.taxType || '',
                tx.status || '',
                tx.bankTransactionID || ''
            ].map(v => `"${v}"`).join(',');
        });

        return [headers.join(','), ...rows].join('\n');
    }

    /**
     * Export year's data
     */
    async exportYear(year) {
        await this.ensureOutputDir();

        // Fetch transactions
        const transactions = await this.getReconciledTransactionsForYear(year);

        if (transactions.length === 0) {
            console.log(`No transactions found for ${year}`);
            return;
        }

        // Convert to learning format
        const learningData = this.convertToLearningFormat(transactions);

        // Save JSON (full detail)
        const jsonFile = path.join(this.outputDir, `${year}-reconciled.json`);
        await fs.writeFile(jsonFile, JSON.stringify(learningData, null, 2));
        console.log(`✓ Saved JSON: ${jsonFile}`);

        // Save CSV (simple format)
        const csvData = this.convertToCSV(transactions);
        const csvFile = path.join(this.outputDir, `${year}-reconciled.csv`);
        await fs.writeFile(csvFile, csvData);
        console.log(`✓ Saved CSV: ${csvFile}`);

        // Summary
        const byAccountCode = {};
        learningData.forEach(tx => {
            const code = tx.accountCode || 'NONE';
            byAccountCode[code] = (byAccountCode[code] || 0) + 1;
        });

        console.log(`\nAccount Code Distribution:`);
        Object.entries(byAccountCode)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .forEach(([code, count]) => {
                console.log(`  ${code}: ${count} transactions`);
            });
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log('Usage: node export-reconciled.js <year> [year2] [year3]...');
        console.log('Example: node export-reconciled.js 2023 2024 2025');
        process.exit(1);
    }

    const years = args.map(y => parseInt(y));
    const exporter = new ReconciledTransactionExporter();

    (async () => {
        for (const year of years) {
            try {
                await exporter.exportYear(year);
            } catch (error) {
                console.error(`Error exporting ${year}:`, error.message);
            }
        }
    })();
}

module.exports = ReconciledTransactionExporter;
