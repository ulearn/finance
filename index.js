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