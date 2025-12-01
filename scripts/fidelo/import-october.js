// Quick import for October 2025 data
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Import the main function
const importModule = require('./import-sql.js');

// We'll call the importCSV function directly
async function importOctober() {
    // Since import-sql.js exports nothing, we need to use a different approach
    // Let's just run node with the file path as argument
    const { spawn } = require('child_process');
    
    console.log('Importing October 2025 data...');
    console.log('File: /home/hub/www/fins/scripts/fidelo/data/incoming_payments_detail_25.11.2025.csv');
}

importOctober();
