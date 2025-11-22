const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const XeroAuth = require('../../scripts/xero/recon/xero-auth');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

puppeteer.use(StealthPlugin());

async function checkOkSelector() {
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
  const createTabSelector = `${lineSelector} .tabs a.t2`;
  await page.waitForSelector(createTabSelector, { timeout: 5000 });
  await page.click(createTabSelector);
  await new Promise(resolve => setTimeout(resolve, 2000));

  const found = await page.evaluate((selector) => {
    const wrongSelector = `${selector} .ok a.okayButton`;
    const rightSelector = `${selector} a.okayButton`;
    
    return {
      wrongSelector: document.querySelector(wrongSelector) !== null,
      rightSelector: document.querySelector(rightSelector) !== null,
      okParent: document.querySelector(`${selector} .ok`) !== null
    };
  }, lineSelector);

  console.log(JSON.stringify(found, null, 2));
  await browser.close();
}

checkOkSelector().catch(console.error);
