/**
 * Xero Authentication Module
 * Location: /home/hub/public_html/fins/scripts/xero/recon/xero-auth.js
 *
 * Purpose: Handle Xero login with email, password, and TOTP 2FA
 *
 * Usage:
 *   const XeroAuth = require('./xero-auth');
 *   const auth = new XeroAuth(page, logsDir);
 *   await auth.login();
 */

const { TOTP } = require('otpauth');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

class XeroAuth {
  constructor(page, logsDir) {
    this.page = page;
    this.logsDir = logsDir;

    // Credentials from .env
    this.email = process.env.XERO_EMAIL;
    this.password = process.env.XERO_PASSWORD;
    this.totpSecret = process.env.XERO_TOTP_SECRET;

    // TOTP generator
    this.totp = new TOTP({
      issuer: 'Xero',
      label: this.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: this.totpSecret
    });
  }

  /**
   * Generate current TOTP code
   */
  generateTOTP() {
    return this.totp.generate();
  }

  /**
   * Save screenshot with timestamp
   */
  async saveScreenshot(name) {
    const timestamp = Date.now();
    const filename = `${name}-${timestamp}.png`;
    const filepath = path.join(this.logsDir, filename);
    await this.page.screenshot({ path: filepath, fullPage: true });
    console.log(`📸 Screenshot saved: ${filename}`);
  }

  /**
   * Save page HTML with timestamp
   */
  async savePageHTML(name) {
    const timestamp = Date.now();
    const filename = `${name}-${timestamp}.html`;
    const filepath = path.join(this.logsDir, filename);
    const html = await this.page.content();
    await fs.writeFile(filepath, html, 'utf8');
    console.log(`📄 Page HTML saved: ${filename}`);
  }

  /**
   * Main login flow
   */
  async login() {
    try {
      console.log('🔐 Starting Xero login process...');

      // Navigate to Xero login page
      console.log('   → Navigating to login page...');
      await this.page.goto('https://login.xero.com/', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await this.saveScreenshot('login-page');

      // Enter email
      console.log('   → Entering email...');
      const emailSelector = 'input[data-automationid="Username--input"]';
      await this.page.waitForSelector(emailSelector, { timeout: 10000 });
      await this.page.type(emailSelector, this.email, { delay: 100 });

      // Submit (press Enter)
      await new Promise(resolve => setTimeout(resolve, 500));
      await this.page.keyboard.press('Enter');

      // Wait for password page
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Enter password
      console.log('   → Entering password...');
      const passwordSelector = 'input[data-automationid="PassWord--input"]';
      await this.page.waitForSelector(passwordSelector, { timeout: 10000 });
      await this.page.type(passwordSelector, this.password, { delay: 100 });

      // Submit (press Enter)
      await new Promise(resolve => setTimeout(resolve, 500));
      await this.page.keyboard.press('Enter');

      await this.saveScreenshot('post-login');

      // Wait for 2FA page
      console.log('   → Waiting for 2FA page...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if 2FA is required
      const totpSelector = 'input[data-automationid="auth-onetimepassword--input"]';

      try {
        await this.page.waitForSelector(totpSelector, { timeout: 5000 });

        await this.savePageHTML('2fa-page');

        // Generate and enter TOTP code
        console.log('   → Generating TOTP code...');
        const code = this.generateTOTP();
        console.log(`   → Entering 2FA code: ${code}`);

        await this.page.type(totpSelector, code, { delay: 100 });

        // Submit 2FA form - use the exact Xero selector
        const submitSelector = 'button[data-automationid="auth-submitcodebutton"]';
        await this.page.waitForSelector(submitSelector, { timeout: 5000 });
        await this.page.click(submitSelector);

        await this.saveScreenshot('post-2fa');

        // Wait for dashboard to load
        console.log('   → Waiting for dashboard...');
        await this.page.waitForNavigation({
          waitUntil: 'networkidle2',
          timeout: 30000
        });

      } catch (error) {
        // 2FA might not be required (already authenticated)
        console.log('   ℹ️  2FA not required (may already be authenticated)');
      }

      // Verify we're logged in by checking for dashboard elements
      await new Promise(resolve => setTimeout(resolve, 3000));

      const currentUrl = this.page.url();
      if (currentUrl.includes('dashboard') || currentUrl.includes('xero.com/app')) {
        console.log('✅ Login successful!');
        console.log(`   Current URL: ${currentUrl}`);
        return true;
      } else {
        throw new Error(`Login verification failed. Current URL: ${currentUrl}`);
      }

    } catch (error) {
      console.error('❌ Login failed:', error.message);
      await this.saveScreenshot('login-error');
      throw error;
    }
  }
}

module.exports = XeroAuth;

// CLI test mode
if (require.main === module) {
  const puppeteer = require('puppeteer-extra');
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteer.use(StealthPlugin());

  console.log('Testing Xero Authentication...\n');

  (async () => {
    let browser;
    try {
      const logsDir = path.join(__dirname, 'logs');
      await fs.mkdir(logsDir, { recursive: true });

      browser = await puppeteer.launch({
        headless: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled'
        ]
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      const auth = new XeroAuth(page, logsDir);
      await auth.login();

      console.log('\n✅ Test completed successfully!');
      console.log('   Check logs/ directory for screenshots');

      await new Promise(resolve => setTimeout(resolve, 5000));

    } catch (error) {
      console.error('\n❌ Test failed:', error.message);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  })();
}
