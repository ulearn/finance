const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const XeroAuth = require('../../scripts/xero/recon/xero-auth');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
puppeteer.use(StealthPlugin());

async function manualRecon() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const logsDir = path.join(__dirname, '../../scripts/xero/recon/logs');
  const auth = new XeroAuth(page, logsDir);
  await auth.login();

  await new Promise(r => setTimeout(r, 5000));
  await page.waitForSelector('a[data-automationid="reconcileBankItems"]', { timeout: 10000 });
  await page.click('a[data-automationid="reconcileBankItems"]');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  const dataId = '3318dd9fbc574d37b7a90475b5d3f986';
  const lineSelector = `#statementLines .line[data-id="${dataId}"]`;

  console.log('Step 1: Click Create tab');
  await page.click(`${lineSelector} .tabs a.t2`);
  await new Promise(r => setTimeout(r, 1000));

  console.log('Step 2: Fill Contact');
  await page.type(`${lineSelector} .info.c2 input[placeholder="Name of the contact..."]`, 'Audible - CARD', { delay: 100 });
  await new Promise(r => setTimeout(r, 1500));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 1000));

  console.log('Step 3: Fill Account');
  await page.type(`${lineSelector} .info.c2 input[placeholder="Choose the account..."]`, 'Subscriptions', { delay: 100 });
  await new Promise(r => setTimeout(r, 1500));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 1000));

  console.log('Step 4: Fill Category (Expense)');
  try {
    const costsSelector = `${lineSelector} input[title="Costs"]`;
    const exists = await page.$(costsSelector);
    if (exists) {
      await page.click(costsSelector);
      await page.type(costsSelector, 'Expense', { delay: 100 });
      await new Promise(r => setTimeout(r, 1500));
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 1000));
      console.log('  Category filled');
    } else {
      console.log('  Category field not found');
    }
  } catch (e) {
    console.log('  Category error:', e.message);
  }

  console.log('Step 5: Fill Description');
  await page.type(`${lineSelector} .info.c2 input[placeholder="Enter a description..."]`, 'P0801GB  7.99@1.20650', { delay: 50 });
  await new Promise(r => setTimeout(r, 1000));

  console.log('Step 6: Wait for OK button');
  const okButtonSelector = `${lineSelector} .ok a.okayButton`;
  try {
    await page.waitForSelector(okButtonSelector, { timeout: 10000, visible: true });
    console.log('  OK button found!');
    
    await page.waitForFunction(
      (sel) => {
        const btn = document.querySelector(sel);
        return btn && !btn.classList.contains('disabled');
      },
      { timeout: 10000 },
      okButtonSelector
    );
    console.log('  OK button enabled!');
    
    await page.click(okButtonSelector);
    console.log('  OK button clicked!');
    await new Promise(r => setTimeout(r, 3000));
    console.log('✅ SUCCESS');
  } catch (e) {
    console.log('❌ FAILED:', e.message);
    const screenshot = path.join(logsDir, 'manual-recon-fail.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    console.log('Screenshot:', screenshot);
  }

  await browser.close();
}

manualRecon().catch(console.error);
