#!/usr/bin/env node
const XeroAPIClient = require('../xero-client');

/**
 * Un-reconcile bank transactions by ID via Xero API
 *
 * Usage:
 *   node unreconcile.js <txnID1> <txnID2> ...
 *   node unreconcile.js ids.txt
 *
 * Transaction IDs can be extracted from Xero URLs:
 *   https://go.xero.com/Bank/ViewTransaction.aspx?bankTransactionID=abc123...
 *   -> Use: abc123...
 */

class TransactionUnreconciler {
  constructor() {
    this.xeroClient = new XeroAPIClient();
  }

  async unreconcileTransaction(txnID) {
    try {
      await this.xeroClient.ensureValidToken();

      // First, get the current transaction to verify it exists
      const getResponse = await this.xeroClient.xero.accountingApi.getBankTransaction(
        this.xeroClient.tenantId,
        txnID
      );

      const transaction = getResponse.body.bankTransactions[0];

      if (!transaction) {
        return { success: false, error: 'Transaction not found' };
      }

      console.log(`\n📋 Transaction: ${transaction.reference || 'No ref'} | €${transaction.total}`);
      console.log(`   Date: ${new Date(transaction.date).toLocaleDateString('en-GB')}`);
      console.log(`   Contact: ${transaction.contact?.name || 'N/A'}`);
      console.log(`   Status: ${transaction.status}`);

      if (transaction.status === 'UNRECONCILED') {
        console.log(`   ⏭️  Already unreconciled - skipping`);
        return { success: true, alreadyUnreconciled: true };
      }

      // Update transaction to UNRECONCILED status
      const updateResponse = await this.xeroClient.xero.accountingApi.updateBankTransaction(
        this.xeroClient.tenantId,
        txnID,
        {
          bankTransactions: [{
            bankTransactionID: txnID,
            status: 'UNRECONCILED'
          }]
        }
      );

      console.log(`   ✅ Successfully unreconciled`);

      return { success: true };

    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async run(transactionIDs) {
    try {
      console.log('🔄 Xero Transaction Un-reconciler');
      console.log('═══════════════════════════════════════════════════════════════\n');
      console.log(`Processing ${transactionIDs.length} transaction(s)...\n`);

      const results = {
        successful: 0,
        alreadyUnreconciled: 0,
        failed: 0,
        errors: []
      };

      for (const txnID of transactionIDs) {
        const result = await this.unreconcileTransaction(txnID.trim());

        if (result.success) {
          if (result.alreadyUnreconciled) {
            results.alreadyUnreconciled++;
          } else {
            results.successful++;
          }
        } else {
          results.failed++;
          results.errors.push({ txnID, error: result.error });
        }
      }

      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('📊 SUMMARY');
      console.log('═══════════════════════════════════════════════════════════════\n');
      console.log(`✅ Successfully Unreconciled: ${results.successful}`);
      console.log(`⏭️  Already Unreconciled: ${results.alreadyUnreconciled}`);
      console.log(`❌ Failed: ${results.failed}`);

      if (results.errors.length > 0) {
        console.log('\n❌ ERRORS:\n');
        results.errors.forEach((err, i) => {
          console.log(`${i + 1}. ${err.txnID}`);
          console.log(`   Error: ${err.error}\n`);
        });
      }

      console.log('\n✓ Complete\n');

    } catch (error) {
      console.error('\n✗ Fatal Error:', error.message);
      process.exit(1);
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
Usage:
  node unreconcile.js <txnID1> <txnID2> <txnID3> ...
  node unreconcile.js ids.txt

Examples:
  node unreconcile.js abc123-def456-ghi789
  node unreconcile.js de9699e0-ebe3-4316-b826-90296890733b b4bfa401-2300-4e75-90ea-1456afe82a84

Transaction IDs can be extracted from Xero URLs:
  https://go.xero.com/Bank/ViewTransaction.aspx?bankTransactionID=abc123...
  -> Use: abc123...
`);
  process.exit(1);
}

// Check if first arg is a file
const fs = require('fs');
let transactionIDs = [];

if (args.length === 1 && fs.existsSync(args[0])) {
  // Read from file
  const fileContent = fs.readFileSync(args[0], 'utf-8');
  transactionIDs = fileContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#')); // Skip empty lines and comments
} else {
  // Use command line args
  transactionIDs = args;
}

const unreconciler = new TransactionUnreconciler();
unreconciler.run(transactionIDs);
