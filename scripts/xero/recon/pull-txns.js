#!/usr/bin/env node

/**
 * Step 1: Collect Transactions for AI Analysis
 *
 * This script:
 * 1. Logs into Xero
 * 2. Navigates to reconciliation screen
 * 3. Reads all unreconciled transactions (filtered by date if specified)
 * 4. Saves them to a JSON file
 * 5. Exits for Claude to analyze
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const XeroAuth = require('./xero-auth');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

puppeteer.use(StealthPlugin());

class TransactionCollector {
  constructor(options = {}) {
    this.browser = null;
    this.page = null;
    this.logsDir = path.join(__dirname, 'logs');
    this.month = options.month || 'jan';
    this.year = options.year || '2025';
    this.pageNum = options.page || null;
    this.outputDir = path.join(__dirname, this.year);
  }

  getMonthNumber(monthName) {
    const months = {
      'jan': '1', 'feb': '2', 'mar': '3', 'apr': '4',
      'may': '5', 'jun': '6', 'jul': '7', 'aug': '8',
      'sep': '9', 'oct': '10', 'nov': '11', 'dec': '12'
    };
    return months[monthName.toLowerCase()] || '1';
  }

  async init() {
    console.log('🔍 Xero Transaction Collector');
    console.log('='.repeat(80));
    console.log(`📅 Target: ${this.month.toUpperCase()} ${this.year}`);
    console.log('');

    await fs.mkdir(this.logsDir, { recursive: true });
    await fs.mkdir(this.outputDir, { recursive: true });

    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });

    console.log('✓ Browser initialized');
    console.log('');
  }

  async login() {
    const auth = new XeroAuth(this.page, this.logsDir);
    await auth.login();
  }

  async navigateToReconciliation() {
    const baseUrl = 'https://go.xero.com/BankRec/BankRec.aspx?accountID=93D5D790E7A14C9D9CF28B68DB272970';

    // If page not specified, detect the last page (newest transactions)
    if (!this.pageNum) {
      console.log(`🏦 Navigating to Bank Reconciliation (detecting last page)...`);
      await new Promise(resolve => setTimeout(resolve, 5000));

      // First load page 1 to get pagination info
      await this.page.goto(baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Detect last page number from pagination dropdown "Page X of Y"
      const lastPage = await this.page.evaluate(() => {
        // Look for the page selector dropdown with text like "Page 34 of 34"
        const pageSelectors = document.querySelectorAll('.xui-select--content, [class*="select"]');

        for (const selector of pageSelectors) {
          const text = selector.textContent.trim();
          // Match "Page 1 of 34" or "Page 34 of 34" format
          const match = text.match(/Page\s+\d+\s+of\s+(\d+)/i);
          if (match) {
            return parseInt(match[1]);
          }
        }

        return 1;
      });

      console.log(`  ✓ Detected ${lastPage} page(s) of unreconciled transactions`);

      if (lastPage > 1) {
        this.pageNum = lastPage;
        console.log(`  → Navigating to last page (${lastPage}) for newest transactions...`);

        const url = `${baseUrl}&page=${lastPage}`;
        await this.page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });

        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } else {
      // Page number explicitly specified
      console.log(`🏦 Navigating to Bank Reconciliation (Page ${this.pageNum})...`);
      await new Promise(resolve => setTimeout(resolve, 5000));

      const url = `${baseUrl}&page=${this.pageNum}`;
      await this.page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log('✓ Reconciliation screen loaded');
    console.log('');
  }

  isTargetMonth(dateString) {
    // Date format: "30 Jan 2025" or "6 Jan 2025"
    const monthMap = {
      'jan': 'Jan', 'feb': 'Feb', 'mar': 'Mar', 'apr': 'Apr',
      'may': 'May', 'jun': 'Jun', 'jul': 'Jul', 'aug': 'Aug',
      'sep': 'Sep', 'oct': 'Oct', 'nov': 'Nov', 'dec': 'Dec'
    };

    const targetMonth = monthMap[this.month.toLowerCase()];
    return dateString.includes(`${targetMonth} ${this.year}`);
  }

  async loadExistingTransactions() {
    try {
      const monthNum = this.getMonthNumber(this.month);
      const filename = `${monthNum}-${this.month}-txns.json`;
      const filepath = path.join(this.outputDir, filename);

      const data = await fs.readFile(filepath, 'utf8');
      const parsed = JSON.parse(data);
      return parsed.transactions || [];
    } catch (error) {
      // File doesn't exist or can't be read - that's okay
      return [];
    }
  }

  async collectTransactions() {
    console.log(`📋 Collecting ${this.month.toUpperCase()} ${this.year} transactions...`);

    // Load existing transactions to find last known one
    const existingTransactions = await this.loadExistingTransactions();
    const lastKnownDataId = existingTransactions.length > 0
      ? existingTransactions[existingTransactions.length - 1].dataId
      : null;

    if (lastKnownDataId) {
      console.log(`  📌 Last known transaction: ${lastKnownDataId}`);
      console.log(`     (${existingTransactions.length} already collected)`);
    } else {
      console.log(`  📌 No existing transactions - full collection mode`);
    }
    console.log('');

    await this.page.waitForSelector('#statementLines', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // First pass: get basic transaction data
    const allTransactions = await this.page.evaluate(() => {
      const allLines = Array.from(document.querySelectorAll('#statementLines .line'));

      return allLines.map((line, index) => {
        const descElement = line.querySelector('[data-testid="notes"]');
        const dateElement = line.querySelector('[data-testid="posted-date"]');
        const refElement = line.querySelector('[data-testid="reference"]');
        const amountSpentElement = line.querySelector('[data-testid="amount-spent"]');
        const amountReceivedElement = line.querySelector('[data-testid="amount-received"]');

        return {
          index: index,
          dataId: line.getAttribute('data-id'),
          description: descElement ? descElement.textContent.trim() : '',
          date: dateElement ? dateElement.textContent.trim() : '',
          reference: refElement ? refElement.textContent.trim() : '',
          amountSpent: amountSpentElement ? amountSpentElement.textContent.trim() : '',
          amountReceived: amountReceivedElement ? amountReceivedElement.textContent.trim() : '',
          type: amountSpentElement && amountSpentElement.textContent.trim() ? 'SPEND' : 'RECEIVE',
          amount: amountSpentElement && amountSpentElement.textContent.trim() ?
                  amountSpentElement.textContent.trim() :
                  (amountReceivedElement ? amountReceivedElement.textContent.trim() : '0')
        };
      });
    });

    console.log(`  📊 Found ${allTransactions.length} unreconciled transactions on this page`);

    // Find the last known transaction in the list
    let startIndex = 0;
    if (lastKnownDataId) {
      const lastKnownIndex = allTransactions.findIndex(t => t.dataId === lastKnownDataId);
      if (lastKnownIndex !== -1) {
        startIndex = lastKnownIndex + 1; // Start AFTER the last known
        console.log(`  ✓ Found last known transaction at index ${lastKnownIndex}`);
        console.log(`     Collecting ${allTransactions.length - startIndex} new transactions after it`);
      } else {
        console.log(`  ⚠️  Last known transaction not found on this page`);
        console.log(`     This may mean all transactions are new, or you need to check pagination`);
      }
    }
    console.log('');

    // Get only NEW transactions (after last known)
    const newTransactions = allTransactions.slice(startIndex);

    // Filter for target month
    const targetTransactions = newTransactions.filter(t => this.isTargetMonth(t.date));

    console.log(`  ✓ Found ${targetTransactions.length} NEW transactions for ${this.month.toUpperCase()} ${this.year}`);
    console.log(`    (filtered from ${newTransactions.length} new unreconciled)`);

    if (targetTransactions.length > 0) {
      console.log(`  📅 Date range: ${targetTransactions[0].date} to ${targetTransactions[targetTransactions.length - 1].date}`);
    }
    console.log('');

    // Second pass: check for Xero suggestions on target transactions
    console.log(`  📊 Checking for Xero Create Suggestions...`);
    for (const txn of targetTransactions) {
      const suggestion = await this.checkForSuggestion(txn.dataId);
      txn.xeroSuggestion = suggestion;
      if (suggestion && suggestion.hasSuggestion) {
        console.log(`     ✓ ${txn.description.substring(0, 25)}... has suggestion`);
      }
    }

    console.log('');
    return targetTransactions;
  }

  async checkForSuggestion(dataId) {
    try {
      const lineSelector = `#statementLines .line[data-id="${dataId}"]`;
      const createTabSelector = `${lineSelector} .tabs a.t2`;

      // Check if Create tab exists
      const createTabExists = await this.page.$(createTabSelector);
      if (!createTabExists) {
        return null;
      }

      // Click Create tab to reveal any suggestions
      await this.page.click(createTabSelector);
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait for tab to activate

      // Check for pre-filled values
      const suggestion = await this.page.evaluate((selector) => {
        const line = document.querySelector(selector);
        if (!line) return null;

        const contactField = line.querySelector('.info.c2 input[placeholder="Name of the contact..."]');
        const accountField = line.querySelector('.info.c2 input[placeholder="Choose the account..."]');
        const descField = line.querySelector('.info.c2 input[placeholder="Enter a description..."]');

        const contact = contactField ? contactField.value.trim() : '';
        const account = accountField ? accountField.value.trim() : '';
        const description = descField ? descField.value.trim() : '';

        // If any field has a value, there's a suggestion
        if (contact || account || description) {
          return {
            hasSuggestion: true,
            contact: contact || null,
            account: account || null,
            description: description || null
          };
        }

        return null;
      }, lineSelector);

      return suggestion;
    } catch (error) {
      console.log(`     ⚠️  Error checking suggestion: ${error.message}`);
      return null;
    }
  }

  async saveForAIAnalysis(newTransactions) {
    const monthNum = this.getMonthNumber(this.month);
    const filename = `${monthNum}-${this.month}-txns.json`;
    const filepath = path.join(this.outputDir, filename);

    // Load existing transactions
    const existingTransactions = await this.loadExistingTransactions();

    // Merge: existing + new (avoiding duplicates by dataId)
    const existingIds = new Set(existingTransactions.map(t => t.dataId));
    const uniqueNewTransactions = newTransactions.filter(t => !existingIds.has(t.dataId));

    const allTransactions = [...existingTransactions, ...uniqueNewTransactions];

    const data = {
      collectedAt: new Date().toISOString(),
      month: this.month,
      year: this.year,
      count: allTransactions.length,
      transactions: allTransactions,
      status: 'AWAITING_AI_ANALYSIS'
    };

    await fs.writeFile(filepath, JSON.stringify(data, null, 2));

    console.log('💾 Transactions saved for AI analysis');
    console.log(`   File: ${filepath}`);
    console.log('');
    console.log('='.repeat(80));
    console.log('✅ COLLECTION COMPLETE');
    console.log('='.repeat(80));
    console.log('');
    console.log('📊 Summary:');
    console.log(`   Month: ${this.month.toUpperCase()} ${this.year}`);
    console.log(`   Previously Collected: ${existingTransactions.length}`);
    console.log(`   New This Run: ${uniqueNewTransactions.length}`);
    console.log(`   Total Now: ${allTransactions.length}`);
    console.log(`   └─ RECEIVE: ${allTransactions.filter(t => t.type === 'RECEIVE').length}`);
    console.log(`   └─ SPEND: ${allTransactions.filter(t => t.type === 'SPEND').length}`);
    console.log('');
    console.log('📝 Next Step:');
    console.log('   Claude will now analyze these transactions and generate reconciliation decisions.');
    console.log(`   Look for: ${this.year}-${this.month}-decisions.json`);
    console.log('');

    return filepath;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('🔒 Browser closed');
    }
  }

  async run() {
    try {
      await this.init();
      await this.login();
      await this.navigateToReconciliation();

      const transactions = await this.collectTransactions();
      const filepath = await this.saveForAIAnalysis(transactions);

      return filepath;

    } catch (error) {
      console.error('');
      console.error('❌ Error:', error.message);
      console.error('');

      if (this.page) {
        const errorScreenshot = path.join(this.logsDir, `error-${Date.now()}.png`);
        await this.page.screenshot({ path: errorScreenshot, fullPage: true });
        console.error(`📸 Error screenshot: ${errorScreenshot}`);
      }

      throw error;
    } finally {
      await this.close();
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--month' && args[i + 1]) {
    options.month = args[i + 1];
    i++;
  } else if (args[i] === '--year' && args[i + 1]) {
    options.year = args[i + 1];
    i++;
  } else if (args[i] === '--page' && args[i + 1]) {
    options.page = args[i + 1];
    i++;
  }
}

// Run the collector
const collector = new TransactionCollector(options);
collector.run()
  .then((filepath) => {
    console.log('✓ Collection complete');
    console.log(`   File: ${filepath}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Failed:', error.message);
    process.exit(1);
  });
