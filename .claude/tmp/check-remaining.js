const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const XeroAuth = require('../../scripts/xero/recon/xero-auth');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

puppeteer.use(StealthPlugin());

async function checkRemaining() {
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

  const lines = await page.evaluate(() => {
    const allLines = Array.from(document.querySelectorAll('#statementLines .line'));
    return allLines.filter(line => {
      const date = line.querySelector('[data-testid="posted-date"]')?.textContent.trim();
      return date && date.includes('Jan 2025');
    }).map(line => ({
      dataId: line.getAttribute('data-id'),
      description: line.querySelector('[data-testid="notes"]')?.textContent.trim().substring(0, 30),
      date: line.querySelector('[data-testid="posted-date"]')?.textContent.trim()
    }));
  });

  console.log(`Found ${lines.length} unreconciled January 2025 transactions:`);
  lines.forEach((line, i) => {
    console.log(`${i + 1}. ${line.date} | ${line.description}... | ${line.dataId}`);
  });

  await browser.close();
}

checkRemaining().catch(console.error);
