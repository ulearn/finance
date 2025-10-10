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