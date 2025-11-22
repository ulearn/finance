const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const XeroAuth = require('../../scripts/xero/recon/xero-auth');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
puppeteer.use(StealthPlugin());

async function completeReconTest() {
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
  await new Promise(r => setTimeout(r, 2000));

  console.log('Step 3: Fill Account');
  await page.type(`${lineSelector} .info.c2 input[placeholder="Choose the account..."]`, 'Subscriptions', { delay: 100 });
  await new Promise(r => setTimeout(r, 1500));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 2000));

  console.log('Step 4: Fill Description');
  await page.type(`${lineSelector} .info.c2 input[placeholder="Enter a description..."]`, 'Audible', { delay: 50 });
  await new Promise(r => setTimeout(r, 1000));

  console.log('Step 5: Looking for OK button...');
  const okButtonSelector = `${lineSelector} .ok a.okayButton`;
  
  const okState = await page.evaluate((sel) => {
    const btn = document.querySelector(sel);
    if (!btn) return { exists: false };
    return {
      exists: true,
      visible: btn.offsetParent !== null,
      disabled: btn.classList.contains('disabled') || btn.hasAttribute('disabled'),
      classes: btn.className,
      text: btn.textContent
    };
  }, okButtonSelector);
  
  console.log('OK button state:', JSON.stringify(okState));

  if (okState.exists) {
    console.log('Step 6: Clicking OK button...');
    try {
      await page.waitForSelector(okButtonSelector, { timeout: 5000, visible: true });
      await page.click(okButtonSelector);
      await new Promise(r => setTimeout(r, 3000));
      console.log('✅ SUCCESS - Clicked OK');
    } catch (e) {
      console.log('❌ Error clicking:', e.message);
    }
  } else {
    console.log('❌ OK button does not exist!');
    const screenshot = path.join(logsDir, 'no-ok-button.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    console.log('Screenshot:', screenshot);
  }

  await browser.close();
}

completeReconTest().catch(console.error);
