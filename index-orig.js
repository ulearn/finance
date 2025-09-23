require('dotenv').config();
const express = require('express');
const path = require('path');

// Set up logging with auto-rotation
const logger = require('./logger');
logger.setupLogger();

//===========================================================================//
//  FINS APP CONFIGURATION
//===========================================================================//
console.log('=== Initializing Fins Application ===');

// Initialize modules - these are the handler modules, not routers
const dashboard = require('./scripts/payroll/sales/dashboard');
const b2cDiego = require('./scripts/payroll/sales/b2c-diego');
const b2bCenker = require('./scripts/payroll/sales/b2b-cenker');
const uploadXl = require('./scripts/payroll/sales/upload-xl');

//=========================================================================
// Express Application Setup (Receiving HTTP Requests)
//=========================================================================
const app = express();
const PORT = process.env.PORT || 3001;

// Add Express JSON middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static HTML files from the scripts directory
app.use('/fins/scripts', express.static(path.join(__dirname, 'scripts')));

//=========================================================================
// ROUTES 
//=========================================================================

// Basic status routes
app.get('/', (req, res) => {
  res.send('Fins Dashboard Server Running');
});

app.get('/fins', (req, res) => {
  res.send('Fins API Active');
});

// Since your dashboard.js, b2c-diego.js etc export Express routers, we mount them:
app.use('/fins/scripts/payroll/sales/dashboard', dashboard);
app.use('/fins/scripts/payroll/sales/b2c-diego', b2cDiego);
app.use('/fins/scripts/payroll/sales/b2b-cenker', b2bCenker);
app.use('/fins/scripts/payroll/sales/upload-xl', uploadXl);

//=========================================================================
// Start the server
//=========================================================================
app.listen(PORT, () => {
  console.log(`=== Starting Fins app on http://localhost:${PORT} ===`);
  console.log('Routes configured:');
  console.log('  > GET  /fins');
  console.log('  > GET  /fins/scripts/payroll/sales/dashboard');
  console.log('  > GET  /fins/scripts/payroll/sales/b2c-diego');
  console.log('  > GET  /fins/scripts/payroll/sales/b2b-cenker');
  console.log('  > GET  /fins/scripts/payroll/sales/upload-xl');
});

module.exports = app;