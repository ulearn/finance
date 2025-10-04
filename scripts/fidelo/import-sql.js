// Version 8 - CSV import to payment_detail table (shared with payment-detail-api.js)
// Location: /home/hub/public_html/fins/scripts/fidelo/import-sql.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mysql = require('mysql2/promise');
const fs = require('fs');
const csv = require('csv-parser');

// Helper function to parse dates from various formats
function parseDate(dateStr) {
    if (!dateStr || dateStr === '') return null;
    
    // Check if this contains multiple dates separated by commas
    if (dateStr.includes(',')) {
        // Split and try to parse the first date only
        const dates = dateStr.split(',').map(d => d.trim());
        if (dates.length > 0) {
            return parseDate(dates[0]); // Recursively parse the first date
        }
    }
    
    // Handle DD/MM/YYYY format
    if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const [day, month, year] = dateStr.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    // Handle D/M/YYYY or DD/M/YYYY or D/MM/YYYY format
    if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        const [day, month, year] = dateStr.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    // Handle YYYY-MM-DD format (already correct)
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dateStr;
    }
    
    // Handle MM/DD/YYYY format (American)
    if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/) && parseInt(dateStr.split('/')[0]) > 12) {
        // If first part is > 12, it's likely DD/MM/YYYY
        const [day, month, year] = dateStr.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    console.log(`Warning: Unrecognized date format: ${dateStr}`);
    return null;
}

async function testCSVParsing(filePath) {
    console.log(`\nTesting CSV parsing for: ${filePath}`);
    
    return new Promise((resolve, reject) => {
        const results = [];
        let headers = [];
        
        fs.createReadStream(filePath)
            .pipe(csv({
                separator: ',',
                quote: '"',
                escape: '"',
                skipLinesWithError: false,
                strict: false  // This is important - allows flexible parsing
            }))
            .on('headers', (hdrs) => {
                headers = hdrs;
                console.log(`Headers (${hdrs.length}):`, hdrs.slice(0, 5).join(' | '));
            })
            .on('data', (data) => {
                results.push(data);
                if (results.length === 1) {
                    console.log('First row sample:', Object.keys(data).slice(0, 5));
                    console.log('First row values:', Object.values(data).slice(0, 5));
                }
            })
            .on('end', () => {
                console.log(`Successfully parsed ${results.length} rows`);
                resolve({ headers, results });
            })
            .on('error', (err) => {
                console.error('CSV parsing error:', err);
                reject(err);
            });
    });
}

async function importCSV(filePath) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Starting import: ${filePath}`);
    console.log(`Target table: payment_detail (v8)`);
    
    // Parse CSV first
    let csvData;
    try {
        csvData = await testCSVParsing(filePath);
    } catch (error) {
        console.error('Failed to parse CSV:', error);
        return;
    }
    
    const { headers, results } = csvData;
    
    if (results.length === 0) {
        console.log('No data to import');
        return;
    }
    
    // Connect to database
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306,
        charset: 'utf8mb4'
    });
    
    // Create safe column names mapping
    const columnMap = {};
    const dbColumns = [];
    
    headers.forEach((header, index) => {
        // Create a safe column name for the database
        let safeName = header
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        
        // Ensure unique names
        if (!safeName) safeName = `col_${index}`;
        
        // Handle duplicates
        let finalName = safeName;
        let counter = 1;
        while (dbColumns.includes(finalName)) {
            finalName = `${safeName}_${counter}`;
            counter++;
        }
        
        columnMap[header] = finalName;
        dbColumns.push(finalName);
    });
    
    console.log(`\nCreated ${dbColumns.length} database columns`);
    console.log('Date columns detected:', dbColumns.filter(col => col.includes('date')).join(', '));
    
    // Check if table exists
    try {
        await connection.execute('SELECT 1 FROM payment_detail LIMIT 1');
        console.log('Table payment_detail exists');
    } catch (error) {
        // Table doesn't exist, create it
        console.log('Creating table payment_detail...');
        const createSQL = `
            CREATE TABLE payment_detail (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ${dbColumns.map(col => {
                    // Critical: date field MUST be DATE type for payment date tracking
                    if (col === 'date') {
                        console.log(`  ✓ Setting ${col} as DATE type (payment date - critical field)`);
                        return `\`${col}\` DATE`;
                    }
                    // Other date-like fields can also be DATE
                    if (col === 'date_tmp' || col.includes('_date') || col === 'start' || col === 'end' || col === 'end_1') {
                        console.log(`  Setting ${col} as DATE type`);
                        return `\`${col}\` DATE`;
                    }
                    return `\`${col}\` TEXT`;
                }).join(',\n                ')},
                import_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                import_source VARCHAR(100) DEFAULT 'csv',
                KEY idx_date (date)  -- Index on the critical date field
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `;
        
        try {
            await connection.execute(createSQL);
            console.log('Table created successfully');
        } catch (createError) {
            console.error('Failed to create table:', createError.message);
            await connection.end();
            return;
        }
    }
    
    // Add any missing columns
    const [existingColumns] = await connection.execute(
        `SHOW COLUMNS FROM payment_detail`
    );
    const existingColumnNames = existingColumns.map(col => col.Field);
    
    for (const dbCol of dbColumns) {
        if (!existingColumnNames.includes(dbCol)) {
            // Critical: date column MUST be DATE type
            const columnType = (dbCol === 'date') ? 'DATE' :
                              (dbCol === 'date_tmp' || dbCol.includes('_date') || 
                               dbCol === 'start' || dbCol === 'end' || dbCol === 'end_1') ? 'DATE' : 'TEXT';
            
            try {
                await connection.execute(`ALTER TABLE payment_detail ADD COLUMN \`${dbCol}\` ${columnType}`);
                console.log(`Added column: ${dbCol} (${columnType})${dbCol === 'date' ? ' - CRITICAL payment date field' : ''}`);
            } catch (alterError) {
                // Column might already exist
            }
        }
    }
    
    // Import data one row at a time for better error handling
    console.log(`\nImporting ${results.length} rows...`);
    let successCount = 0;
    let errorCount = 0;
    let dateParseWarnings = 0;
    
    for (let i = 0; i < results.length; i++) {
        const row = results[i];
        
        // Get values in the same order as headers
        const values = headers.map((header, index) => {
            const value = row[header];
            const colName = dbColumns[index];
            
            // CRITICAL: Special handling for the payment date column
            if (colName === 'date') {
                const parsedDate = parseDate(value);
                if (value && !parsedDate) {
                    dateParseWarnings++;
                    if (dateParseWarnings <= 5) {
                        console.log(`\n  ⚠️ CRITICAL - Payment date parse warning - Row ${i + 1}: "${value}"`);
                    }
                }
                return parsedDate;
            }
            
            // Other date columns
            if (colName === 'date_tmp' || colName.includes('_date') || colName === 'start' || colName === 'end' || colName === 'end_1') {
                const parsedDate = parseDate(value);
                if (value && !parsedDate) {
                    dateParseWarnings++;
                    if (dateParseWarnings <= 5) {
                        console.log(`\n  Date parse warning - Row ${i + 1}, Column ${colName}: "${value}"`);
                    }
                }
                return parsedDate;
            }
            
            return (value === undefined || value === null || value === '') ? null : String(value);
        });
        
        // Build INSERT statement
        const placeholders = dbColumns.map(() => '?').join(', ');
        const insertSQL = `INSERT INTO payment_detail (${dbColumns.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`;
        
        try {
            await connection.execute(insertSQL, values);
            successCount++;
            
            if (successCount % 100 === 0) {
                process.stdout.write(`\rImported: ${successCount}/${results.length}`);
            }
        } catch (error) {
            errorCount++;
            if (errorCount <= 5) {
                console.log(`\nRow ${i + 1} error: ${error.message}`);
                console.log('Sample data:', values.slice(0, 3));
                
                // Debug: check column count
                console.log(`Columns expected: ${dbColumns.length}, Values provided: ${values.length}`);
                
                // Check for date issues specifically
                const dateColumns = dbColumns.filter((col, idx) => {
                    return col === 'date' || col === 'date_tmp' || col.includes('_date');
                });
                if (dateColumns.length > 0 && error.message.includes('Incorrect date value')) {
                    console.log('Date column values:', dateColumns.map(col => {
                        const idx = dbColumns.indexOf(col);
                        return `${col}: "${values[idx]}"`;
                    }).join(', '));
                }
            }
        }
    }
    
    console.log(`\n\nImport complete:`);
    console.log(`  ✓ Success: ${successCount} rows`);
    if (errorCount > 0) {
        console.log(`  ✗ Failed: ${errorCount} rows`);
    }
    if (dateParseWarnings > 5) {
        console.log(`  ⚠ Date parse warnings: ${dateParseWarnings} (first 5 shown)`);
    }
    
    // Get summary
    try {
        const [summary] = await connection.execute('SELECT COUNT(*) as total FROM payment_detail WHERE import_source = "csv"');
        console.log(`  Total CSV imports in database: ${summary[0].total} rows`);
        
        // Check B2B vs B2C if agent column exists
        try {
            const [distribution] = await connection.execute(`
                SELECT 
                    COUNT(CASE WHEN agent IS NOT NULL AND agent != '' THEN 1 END) as b2b,
                    COUNT(CASE WHEN agent IS NULL OR agent = '' THEN 1 END) as b2c
                FROM payment_detail
                WHERE import_source = 'csv'
            `);
            console.log(`  B2B (with agent): ${distribution[0].b2b}`);
            console.log(`  B2C (no agent): ${distribution[0].b2c}`);
        } catch (e) {
            // Agent column might not exist with that name
        }
        
        // Check date range if date column exists
        try {
            const [dateRange] = await connection.execute(`
                SELECT 
                    MIN(date) as earliest,
                    MAX(date) as latest,
                    COUNT(CASE WHEN date IS NULL THEN 1 END) as null_dates
                FROM payment_detail
                WHERE import_source = 'csv'
            `);
            console.log(`  Date range: ${dateRange[0].earliest} to ${dateRange[0].latest}`);
            if (dateRange[0].null_dates > 0) {
                console.log(`  ⚠ Records with null dates: ${dateRange[0].null_dates}`);
            }
        } catch (e) {
            // Date column might not exist
        }
    } catch (e) {
        console.log('Could not get summary:', e.message);
    }
    
    await connection.end();
}

async function main() {
    try {
       
        // 2024
        await importCSV('/home/hub/public_html/fins/scripts/fidelo/data/01-12-2024_Pay_Detail_04.10.2025.csv');
        
        // Import 2025 data
        await importCSV('/home/hub/public_html/fins/scripts/fidelo/data/01-09-2025_Pay_Detail_04.10.2025.csv');
        
        console.log('\n' + '='.repeat(60));
        console.log('✓ All imports complete to payment_detail table!');
        
    } catch (error) {
        console.error('\nFatal error:', error);
    }
}

main();