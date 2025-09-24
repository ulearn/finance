const app = require('./index.js');
const request = require('http');

// Make a request to the dashboard endpoint
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/fins/scripts/pay/sales/dashboard',
  method: 'GET'
};

const req = request.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.end();
