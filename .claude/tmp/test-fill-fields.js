const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const XeroAuth = require('../../scripts/xero/recon/xero-auth');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

puppeteer.use(StealthPlugin());

async function testFillFields() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const logsDir = path.join(__dirname, '../../scripts/xero/recon/logs');
  const auth = new XeroAuth(page, logsDir);
  await auth.login();

  await new Promise(resolve => setTimeout(resolve, 5000));
  const reconcileButtonSelector = 'a[data-automationid="reconcileBankItems"]';
  await page.waitForSelector(reconcileButtonSelector, { timeout: 10000 });
  await page.click(reconcileButtonSelector);
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(resolve => setTimeout(resolve, 3000));

  const dataId = '3318dd9fbc574d37b7a90475b5d3f986';
  const lineSelector = `#statementLines .line[data-id="${dataId}"]`;
  
  console.log('1. Clicking Create tab...');
  const createTabSelector = `${lineSelector} .tabs a.t2`;
  await page.waitForSelector(createTabSelector, { timeout: 5000 });
  await page.click(createTabSelector);
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('2. Filling Contact field...');
  const contactSelector = `${lineSelector} .info.c2 input[placeholder="Name of the contact..."]`;
  await page.waitForSelector(contactSelector, { timeout: 5000 });
  await page.click(contactSelector);
  await page.type(contactSelector, 'Audible - CARD', { delay: 100 });
  await new Promise(resolve => setTimeout(resolve, 1500));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('3. Checking if OK button still exists...');
  const okExists1 = await page.evaluate((sel) => {
    return document.querySelector(sel + ' .ok a.okayButton') !== null;
  }, lineSelector);
  console.log(`   OK button exists: ${okExists1}`);

  if (!okExists1) {
    const screenshot = path.join(logsDir, 'after-contact-fill.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    console.log(`   Screenshot: ${screenshot}`);
  }

  console.log('4. Filling Account field...');
  const accountSelector = `${lineSelector} .info.c2 input[placeholder="Choose the account..."]`;
  await page.waitForSelector(accountSelector, { timeout: 5000 });
  await page.click(accountSelector);
  await page.type(accountSelector, 'Subscriptions', { delay: 100 });
  await new Promise(resolve => setTimeout(resolve, 1500));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('5. Checking if OK button still exists...');
  const okExists2 = await page.evaluate((sel) => {
    return document.querySelector(sel + ' .ok a.okayButton') !== null;
  }, lineSelector);
  console.log(`   OK button exists: ${okExists2}`);

  if (!okExists2) {
    const screenshot = path.join(logsDir, 'after-account-fill.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    console.log(`   Screenshot: ${screenshot}`);
  }

  console.log('6. Filling Description field...');
  const descriptionSelector = `${lineSelector} .info.c2 input[placeholder="Enter a description..."]`;
  await page.waitForSelector(descriptionSelector, { timeout: 5000 });
  await page.click(descriptionSelector);
  await page.type(descriptionSelector, 'P0801GB  7.99@1.20650', { delay: 50 });
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('7. Final check for OK button...');
  const okExists3 = await page.evaluate((sel) => {
    return document.querySelector(sel + ' .ok a.okayButton') !== null;
  }, lineSelector);
  console.log(`   OK button exists: ${okExists3}`);

  if (!okExists3) {
    const screenshot = path.join(logsDir, 'after-description-fill.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    console.log(`   Screenshot: ${screenshot}`);
  }

  await browser.close();
}

testFillFields().catch(console.error);
