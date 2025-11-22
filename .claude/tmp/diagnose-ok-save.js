const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const XeroAuth = require('../../scripts/xero/recon/xero-auth');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
puppeteer.use(StealthPlugin());

async function diagnoseOkSave() {
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
  await page.type(`${lineSelector} .info.c2 input[placeholder="Enter a description..."]`, 'Audible Sub', { delay: 50 });
  await new Promise(r => setTimeout(r, 1000));

  console.log('Step 5: Screenshot before OK');
  await page.screenshot({ path: path.join(logsDir, 'diagnose-before-ok.png'), fullPage: true });

  const okButtonSelector = `${lineSelector} .ok a.okayButton`;
  await page.waitForFunction(
    (sel) => {
      const btn = document.querySelector(sel);
      return btn && btn.offsetParent !== null && !btn.classList.contains('disabled');
    },
    { timeout: 10000 },
    okButtonSelector
  );

  console.log('Step 6: Click OK');
  await page.click(okButtonSelector);

  console.log('Step 7: Wait and check what happened...');
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(logsDir, 'diagnose-after-ok-2s.png'), fullPage: true });

  const postClickState = await page.evaluate((dataId) => {
    const line = document.querySelector(`#statementLines .line[data-id="${dataId}"]`);
    if (!line) return { lineExists: false };

    return {
      lineExists: true,
      hasCreateForm: line.querySelector('.info.c2') !== null,
      hasOkButton: line.querySelector('.ok a.okayButton') !== null,
      isExpanded: line.querySelector('.expanded') !== null,
      classes: line.className
    };
  }, dataId);

  console.log('State after OK click:', JSON.stringify(postClickState, null, 2));

  await new Promise(r => setTimeout(r, 5000));
  await page.screenshot({ path: path.join(logsDir, 'diagnose-after-ok-7s.png'), fullPage: true });

  const finalState = await page.evaluate((dataId) => {
    const line = document.querySelector(`#statementLines .line[data-id="${dataId}"]`);
    if (!line) return { lineExists: false, lineGone: true };

    return {
      lineExists: true,
      lineGone: false,
      hasCreateForm: line.querySelector('.info.c2') !== null,
      hasOkButton: line.querySelector('.ok a.okayButton') !== null,
      classes: line.className
    };
  }, dataId);

  console.log('Final state (7s after):', JSON.stringify(finalState, null, 2));

  console.log('\nScreenshots saved:');
  console.log('  - diagnose-before-ok.png');
  console.log('  - diagnose-after-ok-2s.png');
  console.log('  - diagnose-after-ok-7s.png');

  await browser.close();
}

diagnoseOkSave().catch(console.error);
