// index.js v3 - Fixed with correct import-api.js path
require('dotenv').config();

// Set up logging with auto-rotation (only if logger exists)
let logger = null;
try {
  logger = require('./logger');
  logger.setupLogger();
} catch (error) {
  console.warn('⚠️ Logger not found, using console logging');
  logger = {
    getLogStats: () => ({ message: 'Console logging active' })
  };
}

const express = require('express');
const path = require('path');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Import routers - using the correct file names
const dashboardRouter = require('./scripts/pay/sales/dashboard');
const teacherDashboardRouter = require('./scripts/pay/hourly/dashboard');
const payrollOutputRouter = require('./scripts/pay/output');
const zohoCallbackRouter = require('./scripts/zoho/oauth-callback');
// Note: import-api.js exists but may need to export a router
// const apiImportRouter = require('./scripts/pay/sales/import-api');

// Basic route to test
app.get('/', (req, res) => {
  res.send('Fins App is Working! Node.js ' + process.version);
});

app.get('/fins', (req, res) => {
  res.json({ 
    status: 'working', 
    time: new Date(),
    node_version: process.version,
    dashboards: {
      management: '/fins/scripts/pay/sales/dashboard.html',
      b2c_diego: '/fins/scripts/pay/sales/b2c-diego.html',
      b2b_cenker: '/fins/scripts/pay/sales/b2b-cenker.html'
    },
    api: {
      dashboard: {
        management: '/fins/scripts/pay/sales/dashboard',
        b2c: '/fins/scripts/pay/sales/dashboard/b2c',
        b2b: '/fins/scripts/pay/sales/dashboard/b2b',
        test: '/fins/scripts/pay/sales/dashboard/test'
      },
      import: {
        status: 'import-api.js available at /scripts/pay/sales/import-api.js'
      }
    }
  });
});

// Dashboard API routes
app.use('/fins/scripts/pay/sales/dashboard', dashboardRouter);
app.use('/fins/scripts/pay/hourly/dashboard', teacherDashboardRouter);
app.use('/fins/scripts/pay/output', payrollOutputRouter);

// Zoho OAuth and API routes
const ZohoPeopleAPI = require('./scripts/zoho/people-api');
const ZohoLeaveSync = require('./scripts/zoho/leave-sync');

app.use('/fins/payroll/zoho/callback', zohoCallbackRouter);

// Get Zoho authorization URL
app.get('/fins/payroll/zoho/auth-url', (req, res) => {
  const zohoAPI = new ZohoPeopleAPI();
  res.json({
    success: true,
    authUrl: zohoAPI.getAuthorizationUrl()
  });
});

// Search employee by email
app.get('/fins/payroll/zoho/search-employee', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email required' });
    }

    const zohoAPI = new ZohoPeopleAPI();
    const employee = await zohoAPI.searchEmployeeByEmail(email);

    res.json({
      success: true,
      employee: employee
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search employee by name
app.get('/fins/payroll/zoho/search-by-name', async (req, res) => {
  try {
    const { firstName, lastName } = req.query;
    if (!firstName || !lastName) {
      return res.status(400).json({ success: false, error: 'firstName and lastName required' });
    }

    const zohoAPI = new ZohoPeopleAPI();
    const employee = await zohoAPI.searchEmployeeByName(firstName, lastName);

    res.json({
      success: !!employee,
      employee: employee,
      message: employee ? 'Employee found' : 'Employee not found'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get leave data for a single teacher by email
app.get('/fins/payroll/zoho/leave/get', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email required' });
    }

    const leaveSync = new ZohoLeaveSync();
    const result = await leaveSync.updateTeacherLeaveData(email);

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sync leave data for all teachers
app.post('/fins/payroll/zoho/leave/sync-all', async (req, res) => {
  try {
    const leaveSync = new ZohoLeaveSync();
    const result = await leaveSync.syncAllTeachersLeave();

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Xero OAuth and API routes
const XeroAPIClient = require('./scripts/xero/xero-client');

// Xero OAuth callback
app.get('/fins/xero/callback', async (req, res) => {
  try {
    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    if (!req.query.code) {
      return res.status(400).send('Authorization code missing');
    }

    const xeroClient = new XeroAPIClient();
    const success = await xeroClient.exchangeCodeForTokens(fullUrl);

    if (success) {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Xero Authorization Success</title>
          <style>
            body { font-family: Arial; padding: 50px; text-align: center; }
            .success { color: green; font-size: 24px; margin-bottom: 20px; }
            .info { color: #666; }
          </style>
        </head>
        <body>
          <div class="success">✓ Xero Authorization Successful!</div>
          <div class="info">You can now close this window and return to the dashboard.</div>
        </body>
        </html>
      `);
    } else {
      res.status(500).send('Failed to exchange authorization code');
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send(`Authorization failed: ${error.message}`);
  }
});

// Get Xero authorization URL
app.get('/fins/xero/auth-url', async (req, res) => {
  try {
    const xeroClient = new XeroAPIClient();
    const authUrl = await xeroClient.getAuthorizationUrl();
    res.json({
      success: true,
      authUrl: authUrl
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get organization info
app.get('/fins/xero/organization', async (req, res) => {
  try {
    const xeroClient = new XeroAPIClient();
    const orgs = await xeroClient.getOrganizationInfo();
    res.json({
      success: true,
      organizations: orgs
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get bank transactions
app.get('/fins/xero/bank-transactions', async (req, res) => {
  try {
    const xeroClient = new XeroAPIClient();
    const transactions = await xeroClient.getBankTransactions({
      where: req.query.where,
      order: req.query.order,
      page: req.query.page
    });
    res.json({
      success: true,
      data: transactions
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get invoices
app.get('/fins/xero/invoices', async (req, res) => {
  try {
    const xeroClient = new XeroAPIClient();
    const invoices = await xeroClient.getInvoices({
      where: req.query.where,
      statuses: req.query.statuses,
      page: req.query.page
    });
    res.json({
      success: true,
      data: invoices
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get payments
app.get('/fins/xero/payments', async (req, res) => {
  try {
    const xeroClient = new XeroAPIClient();
    const payments = await xeroClient.getPayments({
      where: req.query.where,
      page: req.query.page
    });
    res.json({
      success: true,
      data: payments
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get bank accounts
app.get('/fins/xero/bank-accounts', async (req, res) => {
  try {
    const xeroClient = new XeroAPIClient();
    const accounts = await xeroClient.getBankAccounts();
    res.json({
      success: true,
      data: accounts
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get contacts
app.get('/fins/xero/contacts', async (req, res) => {
  try {
    const xeroClient = new XeroAPIClient();
    const contacts = await xeroClient.getContacts({
      where: req.query.where,
      page: req.query.page,
      includeArchived: req.query.includeArchived === 'true'
    });
    res.json({
      success: true,
      data: contacts
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Google OAuth and API routes
const GoogleAPIClient = require('./scripts/google/client');

// Google OAuth callback
app.get('/fins/google/callback', async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send('Authorization code missing');
    }

    const googleClient = new GoogleAPIClient();
    const success = await googleClient.exchangeCodeForTokens(code);

    if (success) {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Authorization Success</title>
          <style>
            body { font-family: Arial; padding: 50px; text-align: center; }
            .success { color: green; font-size: 24px; margin-bottom: 20px; }
            .info { color: #666; }
          </style>
        </head>
        <body>
          <div class="success">✓ Google Authorization Successful!</div>
          <div class="info">You can now close this window and return to the dashboard.</div>
        </body>
        </html>
      `);
    } else {
      res.status(500).send('Failed to exchange authorization code');
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send(`Authorization failed: ${error.message}`);
  }
});

// Get Google authorization URL
app.get('/fins/google/auth-url', (req, res) => {
  try {
    const googleClient = new GoogleAPIClient();
    const authUrl = googleClient.getAuthorizationUrl();
    res.json({
      success: true,
      authUrl: authUrl
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// List Google Drive files
app.get('/fins/google/drive/files', async (req, res) => {
  try {
    const googleClient = new GoogleAPIClient();
    const files = await googleClient.listDriveFiles({
      q: req.query.q,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize) : 100,
      pageToken: req.query.pageToken
    });
    res.json({
      success: true,
      data: files
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search Google Sites
app.get('/fins/google/sites/search', async (req, res) => {
  try {
    const googleClient = new GoogleAPIClient();
    const sites = await googleClient.searchGoogleSites(req.query.name);
    res.json({
      success: true,
      data: sites
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get file content from Drive
app.get('/fins/google/drive/file/:fileId', async (req, res) => {
  try {
    const googleClient = new GoogleAPIClient();
    const content = await googleClient.getFileContent(req.params.fileId);
    res.json({
      success: true,
      data: content
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export Google file (Docs/Sheets/Slides)
app.get('/fins/google/drive/export/:fileId', async (req, res) => {
  try {
    const googleClient = new GoogleAPIClient();
    const mimeType = req.query.mimeType || 'text/html';
    const content = await googleClient.exportFile(req.params.fileId, mimeType);
    res.json({
      success: true,
      data: content
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// If import-api.js exports a router, uncomment this:
// app.use('/fins/scripts/pay/sales/api', apiImportRouter);

// Serve dashboard HTML files
app.get('/fins/scripts/pay/sales/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'scripts/pay/sales/dashboard.html'));
});

app.get('/fins/scripts/pay/sales/b2c-diego.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'scripts/pay/sales/b2c-diego.html'));
});

app.get('/fins/scripts/pay/sales/b2b-cenker.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'scripts/pay/sales/b2b-cenker.html'));
});

// Teacher Payroll Dashboard HTML
app.get('/fins/scripts/pay/hourly/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'scripts/pay/hourly/dashboard.html'));
});

// Payroll Output Dashboard HTML
app.get('/fins/scripts/pay/output.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'scripts/pay/output.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ 
    error: 'Internal Server Error', 
    message: err.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found', 
    path: req.path 
  });
});

// For Phusion Passenger
if (typeof(PhusionPassenger) !== 'undefined') {
  app.listen('passenger');
  console.log('Fins app started under Phusion Passenger');
} else {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

module.exports = app;