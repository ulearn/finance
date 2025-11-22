const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const XeroAuth = require('../../scripts/xero/recon/xero-auth');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
puppeteer.use(StealthPlugin());

async function testWithChecks() {
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

  const checkFormVisible = async (step) => {
    const state = await page.evaluate((sel) => {
      const line = document.querySelector(sel);
      if (!line) return { exists: false };
      
      return {
        exists: true,
        createTabActive: line.querySelector('.tabs a.t2.active') !== null,
        createFormVisible: line.querySelector('.info.c2') !== null,
        okButtonExists: line.querySelector('.ok a.okayButton') !== null
      };
    }, lineSelector);
    
    console.log(`After ${step}:`, JSON.stringify(state));
    return state;
  };

  console.log('Step 1: Click Create tab');
  await page.click(`${lineSelector} .tabs a.t2`);
  await new Promise(r => setTimeout(r, 1000));
  await checkFormVisible('Create tab click');

  console.log('\nStep 2: Fill Contact');
  await page.type(`${lineSelector} .info.c2 input[placeholder="Name of the contact..."]`, 'Audible - CARD', { delay: 100 });
  await checkFormVisible('Contact typing');
  
  await new Promise(r => setTimeout(r, 1500));
  await page.keyboard.press('ArrowDown');
  await checkFormVisible('Contact ArrowDown');
  
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 2000));
  await checkFormVisible('Contact Enter');

  console.log('\nStep 3: Fill Account');
  const accountVisible = await checkFormVisible('Before Account field');
  if (!accountVisible.createFormVisible) {
    console.log('❌ Form collapsed before Account field!');
    const screenshot = path.join(logsDir, 'form-collapsed.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    console.log('Screenshot:', screenshot);
    await browser.close();
    return;
  }

  await page.type(`${lineSelector} .info.c2 input[placeholder="Choose the account..."]`, 'Subscriptions', { delay: 100 });
  await checkFormVisible('Account typing');
  
  await new Promise(r => setTimeout(r, 1500));
  await page.keyboard.press('ArrowDown');
  await checkFormVisible('Account ArrowDown');
  
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 2000));
  await checkFormVisible('Account Enter');

  console.log('\n✅ Test complete');
  await browser.close();
}

testWithChecks().catch(console.error);
