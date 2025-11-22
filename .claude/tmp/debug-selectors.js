#!/usr/bin/env node

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const XeroAuth = require('../../scripts/xero/recon/xero-auth');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

puppeteer.use(StealthPlugin());

async function debugSelectors() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  const logsDir = path.join(__dirname, '../../scripts/xero/recon/logs');
  const auth = new XeroAuth(page, logsDir);
  await auth.login();

  // Navigate to reconciliation
  console.log('Navigating to reconciliation...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  const reconcileButtonSelector = 'a[data-automationid="reconcileBankItems"]';
  await page.waitForSelector(reconcileButtonSelector, { timeout: 10000 });
  await page.click(reconcileButtonSelector);

  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('');
  console.log('=== DEBUG: Finding Transaction Lines ===');

  // Get all transaction lines and their data-id attributes
  const lines = await page.evaluate(() => {
    const allLines = Array.from(document.querySelectorAll('#statementLines .line'));
    return allLines.slice(0, 10).map(line => ({
      dataId: line.getAttribute('data-id'),
      description: line.querySelector('[data-testid="notes"]')?.textContent.trim(),
      date: line.querySelector('[data-testid="posted-date"]')?.textContent.trim(),
      amount: line.querySelector('[data-testid="amount-spent"]')?.textContent.trim() ||
              line.querySelector('[data-testid="amount-received"]')?.textContent.trim()
    }));
  });

  console.log('First 10 visible transactions:');
  lines.forEach((line, i) => {
    console.log(`${i + 1}. ${line.date} | ${line.description} | €${line.amount}`);
    console.log(`   data-id: ${line.dataId}`);
  });

  console.log('');
  console.log('Target transaction data-ids:');
  console.log('1. Audible: 3318dd9fbc574d37b7a90475b5d3f986');
  console.log('2. Stripe: 27dc5ed496e34eccb4da49e810415881');
  console.log('3. Flogas: d2932fb9584444ba82454e593d0da8b5');

  await browser.close();
}

debugSelectors().catch(console.error);
