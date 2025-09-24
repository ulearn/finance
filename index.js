require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Import dashboard router
const dashboardRouter = require('./scripts/pay/sales/dashboard');

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
      management: '/fins/scripts/pay/sales/dashboard',
      b2c: '/fins/scripts/pay/sales/dashboard/b2c',
      b2b: '/fins/scripts/pay/sales/dashboard/b2b'
    }
  });
});

// Dashboard API routes
app.use('/fins/scripts/pay/sales/dashboard', dashboardRouter);

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
} else {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

module.exports = app;