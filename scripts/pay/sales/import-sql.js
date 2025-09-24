// Version 6 - Specifically for your CSV format with debugging
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const mysql = require('mysql2/promise');
const fs = require('fs');
const csv = require('csv-parser');

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
    
    // Check if table exists
    try {
        await connection.execute('SELECT 1 FROM sales_data LIMIT 1');
        console.log('Table exists');
    } catch (error) {
        // Table doesn't exist, create it
        console.log('Creating table...');
        const createSQL = `
            CREATE TABLE sales_data (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ${dbColumns.map(col => `\`${col}\` TEXT`).join(',\n                ')},
                import_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    
    // Import data one row at a time for better error handling
    console.log(`\nImporting ${results.length} rows...`);
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < results.length; i++) {
        const row = results[i];
        
        // Get values in the same order as headers
        const values = headers.map(header => {
            const value = row[header];
            return (value === undefined || value === null || value === '') ? null : String(value);
        });
        
        // Build INSERT statement
        const placeholders = dbColumns.map(() => '?').join(', ');
        const insertSQL = `INSERT INTO sales_data (${dbColumns.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`;
        
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
            }
        }
    }
    
    console.log(`\n\nImport complete:`);
    console.log(`  ✓ Success: ${successCount} rows`);
    if (errorCount > 0) {
        console.log(`  ✗ Failed: ${errorCount} rows`);
    }
    
    // Get summary
    try {
        const [summary] = await connection.execute('SELECT COUNT(*) as total FROM sales_data');
        console.log(`  Total in database: ${summary[0].total} rows`);
        
        // Check B2B vs B2C if agent column exists
        try {
            const [distribution] = await connection.execute(`
                SELECT 
                    COUNT(CASE WHEN agent IS NOT NULL AND agent != '' THEN 1 END) as b2b,
                    COUNT(CASE WHEN agent IS NULL OR agent = '' THEN 1 END) as b2c
                FROM sales_data
            `);
            console.log(`  B2B (with agent): ${distribution[0].b2b}`);
            console.log(`  B2C (no agent): ${distribution[0].b2c}`);
        } catch (e) {
            // Agent column might not exist with that name
        }
    } catch (e) {
        console.log('Could not get summary');
    }
    
    await connection.end();
}

async function main() {
    try {
        // Import 2024 data
        await importCSV('/home/hub/public_html/fins/scripts/pay/sales/data/01-12-2024_pay_detail_24.09.2025.csv');
        
        // Import 2025 data
        await importCSV('/home/hub/public_html/fins/scripts/pay/sales/data/01-08-2025_pay_detail_24.09.2025.csv');
        
        console.log('\n' + '='.repeat(60));
        console.log('✓ All imports complete!');
        
    } catch (error) {
        console.error('\nFatal error:', error);
    }
}

main();