#!/usr/bin/env node

/**
 * Xero Bank Feed Refresh Script
 * Location: /home/hub/public_html/fins/scripts/xero/recon/refresh-bank-feed.js
 *
 * Purpose: Automate clicking "Refresh Bank Feed" for BOI account
 * This runs 15 minutes before pull-txns.js to ensure fresh transaction data
 *
 * Usage: node refresh-bank-feed.js
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const XeroAuth = require('./xero-auth');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

puppeteer.use(StealthPlugin());

class BankFeedRefresher {
  constructor() {
    this.browser = null;
    this.page = null;
    this.logsDir = path.join(__dirname, 'logs');
    // BOI account ID from your reconciliation URL
    this.accountID = '93D5D790E7A14C9D9CF28B68DB272970';
  }

  async init() {
    console.log('🔄 Xero Bank Feed Refresher');
    console.log('='.repeat(80));
    console.log('Target: BOI Account');
    console.log('');

    await fs.mkdir(this.logsDir, { recursive: true });

    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security'
      ],
      timeout: 60000
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

  async navigateToAccount() {
    console.log('🏦 Navigating to BOI Account...');

    const accountUrl = `https://go.xero.com/BankRec/BankRec.aspx?accountID=${this.accountID}`;

    await this.page.goto(accountUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify we're on the correct account page
    const accountInfo = await this.page.evaluate(() => {
      const heading = document.querySelector('h1, .account-name, [data-testid="account-name"]');
      return heading ? heading.textContent.trim() : 'Unknown';
    });

    console.log(`✓ Account page loaded: ${accountInfo}`);
    console.log('');
  }

  async clickRefreshBankFeed() {
    console.log('🔄 Looking for Refresh Bank Feed link...');

    try {
      // The link is: <a href="javascript:" onclick="ChartOfAccounts.refreshBankFeedV2(...)">Refresh Bank Feed</a>
      // We need to find and click this link directly

      // Search for the link containing "Refresh Bank Feed" text
      const refreshLink = await this.page.evaluateHandle(() => {
        const links = Array.from(document.querySelectorAll('a'));
        return links.find(link =>
          link.textContent.trim() === 'Refresh Bank Feed' &&
          link.onclick !== null
        );
      });

      if (!refreshLink) {
        // Try searching all links with the text
        console.log('  Searching for Refresh Bank Feed link...');
        const links = await this.page.$$('a');
        let found = false;

        for (const link of links) {
          const text = await this.page.evaluate(el => el.textContent.trim(), link);
          if (text === 'Refresh Bank Feed') {
            console.log(`  ✓ Found link: "${text}"`);
            await link.click();
            found = true;
            break;
          }
        }

        if (!found) {
          throw new Error('Refresh Bank Feed link not found');
        }
      } else {
        console.log('  ✓ Found Refresh Bank Feed link');
        await refreshLink.click();
      }

      console.log('✓ Refresh Bank Feed clicked');

      // The page might reload/refresh - wait for navigation or reload
      try {
        await Promise.race([
          this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }),
          new Promise(resolve => setTimeout(resolve, 5000))
        ]);
        console.log('  Page reloaded after refresh');
      } catch (e) {
        console.log('  No page reload detected');
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Take screenshot after clicking to see what happened
      const afterClickPath = path.join(this.logsDir, `after-refresh-click-${Date.now()}.png`);
      await this.page.screenshot({ path: afterClickPath, fullPage: true });
      console.log(`📸 Screenshot after click: ${afterClickPath}`);

      // Save HTML to see what's on the page
      const afterClickHtml = path.join(this.logsDir, `after-refresh-click-${Date.now()}.html`);
      const html = await this.page.content();
      await fs.writeFile(afterClickHtml, html);
      console.log(`📄 HTML saved: ${afterClickHtml}`);

      // Check for modal/popup that might need interaction
      console.log('  Checking for modal/popup...');
      const hasModal = await this.page.evaluate(() => {
        const modal = document.querySelector('.modal, .popup, [role="dialog"], .x-window');
        return modal ? true : false;
      });

      if (hasModal) {
        console.log('  ⚠️  Modal detected - may need to click confirm/OK button');

        // Try to find and click any "OK", "Refresh", "Continue" button
        const clicked = await this.page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, a, .button'));
          const confirmBtn = buttons.find(btn => {
            const text = btn.textContent.toLowerCase();
            return text.includes('ok') || text.includes('refresh') || text.includes('continue') || text.includes('confirm');
          });
          if (confirmBtn) {
            confirmBtn.click();
            return true;
          }
          return false;
        });

        if (clicked) {
          console.log('  ✓ Clicked confirmation button');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Check for success message, modal, or redirect
      console.log('  Checking for feedback...');

      // Look for success message
      const feedback = await this.page.evaluate(() => {
        // Look for the specific success message
        const paragraphs = Array.from(document.querySelectorAll('p'));
        const refreshMsg = paragraphs.find(p =>
          p.textContent.includes('bank feed') &&
          p.textContent.includes('being refreshed')
        );

        if (refreshMsg) {
          return {
            type: 'success',
            text: refreshMsg.textContent.trim(),
            found: true
          };
        }

        // Check for modal/popup
        const modal = document.querySelector('.modal, .popup, [role="dialog"]');
        if (modal) {
          return { type: 'modal', text: modal.textContent.substring(0, 200), found: true };
        }

        // Check for any message containing "refresh"
        const allText = document.body.textContent;
        if (allText.includes('being refreshed')) {
          const match = allText.match(/.{0,80}being refreshed.{0,80}/i);
          return { type: 'text', text: match ? match[0] : 'Found "being refreshed"', found: true };
        }

        return { type: 'none', text: 'No visible feedback found', found: false };
      });

      if (feedback.found) {
        console.log(`  ✅ Success: ${feedback.text}`);
      } else {
        console.log(`  ⚠️  ${feedback.text}`);
      }

      // Wait for any background processing
      console.log('  Waiting for background refresh to complete...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Take final screenshot
      const finalPath = path.join(this.logsDir, `refresh-complete-${Date.now()}.png`);
      await this.page.screenshot({ path: finalPath, fullPage: true });
      console.log(`📸 Final screenshot: ${finalPath}`);

      console.log('✓ Bank feed refresh initiated');
      console.log('');

    } catch (error) {
      console.error('❌ Failed to click Refresh Bank Feed:', error.message);

      // Take screenshot for debugging
      const errorScreenshot = path.join(this.logsDir, `error-refresh-feed-${Date.now()}.png`);
      await this.page.screenshot({ path: errorScreenshot, fullPage: true });
      console.error(`📸 Error screenshot: ${errorScreenshot}`);

      // Save HTML for debugging
      const htmlPath = path.join(this.logsDir, `error-refresh-feed-${Date.now()}.html`);
      const html = await this.page.content();
      await fs.writeFile(htmlPath, html);
      console.error(`📄 HTML saved: ${htmlPath}`);

      throw error;
    }
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
      await this.navigateToAccount();
      // Skip clickManageAccount - Refresh link is directly on the page
      await this.clickRefreshBankFeed();

      console.log('='.repeat(80));
      console.log('✅ BANK FEED REFRESH COMPLETE');
      console.log('='.repeat(80));
      console.log('');
      console.log('ℹ️  Note: It may take a few minutes for new transactions to appear in Xero.');
      console.log('   Recommend waiting 10-15 minutes before running pull-txns.js');
      console.log('');

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

// Run the refresher
const refresher = new BankFeedRefresher();
refresher.run()
  .then(() => {
    console.log('✓ Refresh complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Failed:', error.message);
    process.exit(1);
  });
