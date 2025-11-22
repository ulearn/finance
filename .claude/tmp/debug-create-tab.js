#!/usr/bin/env node

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const XeroAuth = require('../../scripts/xero/recon/xero-auth');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

puppeteer.use(StealthPlugin());

async function debugCreateTab() {
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

  console.log('Testing first transaction (Audible)...');
  const dataId = '3318dd9fbc574d37b7a90475b5d3f986';
  const lineSelector = `#statementLines .line[data-id="${dataId}"]`;

  // Click Create tab
  console.log('1. Clicking Create tab...');
  const createTabSelector = `${lineSelector} .tabs a.t2`;
  await page.waitForSelector(createTabSelector, { timeout: 5000 });
  await page.click(createTabSelector);
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Check what elements are now visible
  const elements = await page.evaluate((selector) => {
    const line = document.querySelector(selector);
    if (!line) return { found: false };

    return {
      found: true,
      createTabActive: line.querySelector('.tabs a.t2.active') !== null,
      contactInput: line.querySelector('.info.c2 input[placeholder="Name of the contact..."]') !== null,
      accountInput: line.querySelector('.info.c2 input[placeholder="Choose the account..."]') !== null,
      descriptionInput: line.querySelector('.info.c2 input[placeholder="Enter a description..."]') !== null,
      okButton: line.querySelector('.ok a.okayButton') !== null,
      allInputs: Array.from(line.querySelectorAll('input')).map(input => ({
        placeholder: input.placeholder,
        title: input.title,
        type: input.type
      })),
      allLinks: Array.from(line.querySelectorAll('a')).map(a => ({
        class: a.className,
        text: a.textContent.trim()
      }))
    };
  }, lineSelector);

  console.log('\n=== Elements found after clicking Create tab ===');
  console.log(JSON.stringify(elements, null, 2));

  await browser.close();
}

debugCreateTab().catch(console.error);
