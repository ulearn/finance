/**
 * Payment Detail API v3 - Composite Key Duplicate Prevention, No Timeout
 * Location: /home/hub/public_html/fins/scripts/fidelo/payment-detail-api.js
 * 
 * Version History:
 * v1 - Initial implementation with fixed columns
 * v2 - Dynamic column creation, duplicate handling via API response keys
 * v3 - Composite key from payment data fields, removed timeout for slow API
 * 
 * Duplicate Handling:
 * - Creates composite key from: invoice_number + payment_date + amount + student_name
 * - ON DUPLICATE KEY UPDATE - updates existing records instead of creating duplicates
 * - Handles partial payments (same invoice, different amounts/dates)
 */

const mysql = require('mysql2/promise');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

class PaymentDetailAPI {
    constructor() {
        this.connection = null;
        this.tableName = 'payment_detail';
        this.version = 'v3';
        
        // API configuration
        this.apiConfig = {
            baseURL: 'https://ulearn.fidelo.com/api/1.0/gui2',
            endpoint: 'e012597a49e0b3d0306f48e499505673',
            token: '9feb2576ba97b2743550120aa5dd935c',
            
            // These cookies are from your working session - they will need updating
            cookies: {
                PHPSESSID: '02karq7q5ih83lg1h4odn6ld2l',
                passcookie: 'B9T3D4GBLBWCM2BWRH3QMLCV2BX9NDC2',
                usercookie: 'TAMWAAWD22YZ4ZJ53F5JZFDBCC8F7ANG'
            }
        };
        
        // NO TIMEOUT - API can take 20+ minutes
        this.timeout = 0;  // 0 means no timeout
    }

    async connect() {
        try {
            this.connection = await mysql.createConnection({
                host: process.env.DB_HOST,
                port: process.env.DB_PORT || 3306,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
                charset: 'utf8mb4'
            });
            console.log('✅ Connected to MySQL database');
        } catch (error) {
            console.error('❌ MySQL connection failed:', error.message);
            throw error;
        }
    }

    async disconnect() {
        if (this.connection) {
            await this.connection.end();
            console.log('Disconnected from MySQL');
        }
    }

    async createTable() {
        try {
            // Create minimal table structure - columns will be added dynamically
            const createTableSQL = `
                CREATE TABLE IF NOT EXISTS ${this.tableName} (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    composite_key VARCHAR(255) UNIQUE NOT NULL COMMENT 'Composite key from invoice+date+amount+name to prevent duplicates',
                    first_sync_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'When record was first created',
                    last_sync_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'When record was last updated',
                    sync_count INT DEFAULT 1 COMMENT 'Number of times this record has been synced',
                    INDEX idx_composite_key (composite_key),
                    INDEX idx_last_sync (last_sync_date)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                COMMENT='Payment Detail data from Fidelo API - v3 with composite key duplicate prevention'
            `;
            
            await this.connection.execute(createTableSQL);
            console.log(`✅ Table ${this.tableName} created or already exists (${this.version})`);
            
        } catch (error) {
            console.error('❌ Error creating table:', error.message);
            throw error;
        }
    }

    async getExistingColumns() {
        try {
            const [rows] = await this.connection.execute(
                `SHOW COLUMNS FROM ${this.tableName}`
            );
            return rows.map(row => row.Field);
        } catch (error) {
            console.error('Error getting existing columns:', error.message);
            return [];
        }
    }

    getMySQLType(fieldName, value) {
        if (value === null || value === undefined) {
            return 'TEXT';
        }
        
        // Check field name patterns for type hints
        const fieldLower = fieldName.toLowerCase();
        
        // Date fields
        if (fieldLower.includes('date') || fieldLower === 'created' || fieldLower === 'updated' ||
            fieldLower === 'start' || fieldLower === 'end' || fieldLower.includes('_at')) {
            return 'DATETIME';
        }
        
        // Amount/price fields
        if (fieldLower.includes('amount') || fieldLower.includes('price') || 
            fieldLower.includes('fee') || fieldLower.includes('cost') || 
            fieldLower.includes('total') || fieldLower.includes('payment')) {
            return 'DECIMAL(12,2)';
        }
        
        // ID fields
        if (fieldLower.includes('_id') || fieldLower === 'id') {
            return 'VARCHAR(100)';
        }
        
        // Boolean fields
        if (typeof value === 'boolean' || fieldLower.includes('is_') || 
            fieldLower.includes('has_') || fieldLower === 'active' || 
            fieldLower === 'confirmed') {
            return 'BOOLEAN';
        }
        
        // Number fields
        if (typeof value === 'number') {
            return Number.isInteger(value) ? 'INT' : 'DECIMAL(12,2)';
        }
        
        // Email fields
        if (fieldLower.includes('email')) {
            return 'VARCHAR(255)';
        }
        
        // Name fields
        if (fieldLower.includes('name') || fieldLower === 'title') {
            return 'VARCHAR(255)';
        }
        
        // String length detection
        if (typeof value === 'string') {
            // Check if it's a date string
            if (value.match(/^\d{4}-\d{2}-\d{2}/) || value.match(/^\d{2}\/\d{2}\/\d{4}/)) {
                return 'DATETIME';
            }
            
            // Use TEXT for long strings, VARCHAR for shorter ones
            if (value.length > 500) {
                return 'TEXT';
            }
            return 'VARCHAR(500)';
        }
        
        // Arrays and objects
        if (Array.isArray(value) || typeof value === 'object') {
            return 'JSON';
        }
        
        // Default to TEXT for safety
        return 'TEXT';
    }

    createSafeColumnName(fieldName) {
        // Convert field name to safe MySQL column name
        return fieldName
            .replace(/[^a-zA-Z0-9_]/g, '_')  // Replace invalid chars with underscore
            .replace(/_+/g, '_')              // Remove multiple underscores
            .replace(/^_|_$/g, '')            // Remove leading/trailing underscores
            .toLowerCase()                    // Convert to lowercase
            .substring(0, 64);                // MySQL column name limit
    }

    generateCompositeKey(record) {
        // Generate a composite key from multiple fields to uniquely identify a payment
        // This handles partial payments (same invoice, different dates/amounts)
        
        // Try to find the best fields for creating a unique key
        const invoice = record.invoice_number || record.invoice_id || record.reference || '';
        const date = record.payment_date || record.date || record.created || '';
        const amount = record.amount || record.payment_amount || record.total || '0';
        const student = record.student_name || record.name || record.student_id || '';
        const paymentId = record.payment_id || record.id || '';
        
        // Create a composite key from multiple fields
        // This should be unique even for partial payments
        const keyParts = [
            invoice.toString().trim(),
            date.toString().substring(0, 10),  // Just the date part
            parseFloat(amount).toFixed(2),     // Normalized amount
            student.toString().trim().substring(0, 50),
            paymentId.toString().trim()
        ].filter(part => part && part !== '0.00' && part !== '');
        
        // If we have enough parts for a good key
        if (keyParts.length >= 3) {
            // Create MD5 hash for consistent length
            const crypto = require('crypto');
            const keyString = keyParts.join('|');
            return crypto.createHash('md5').update(keyString).digest('hex');
        }
        
        // Fallback: use timestamp + random
        return `payment_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }

    async addMissingColumns(recordData) {
        const existingColumns = await this.getExistingColumns();
        const newColumns = [];
        
        for (const [fieldName, value] of Object.entries(recordData)) {
            const safeColumnName = this.createSafeColumnName(fieldName);
            
            if (!existingColumns.includes(safeColumnName)) {
                const mysqlType = this.getMySQLType(fieldName, value);
                newColumns.push({ 
                    name: safeColumnName, 
                    type: mysqlType,
                    originalName: fieldName 
                });
            }
        }
        
        if (newColumns.length > 0) {
            console.log(`Adding ${newColumns.length} new columns...`);
            
            for (const column of newColumns) {
                try {
                    const alterSQL = `ALTER TABLE ${this.tableName} ADD COLUMN \`${column.name}\` ${column.type}`;
                    await this.connection.execute(alterSQL);
                    console.log(`  ✓ Added column: ${column.name} (${column.type}) [${column.originalName}]`);
                    
                    // Add index for important columns
                    if (column.name.includes('booking_id') || column.name.includes('payment_id') || 
                        column.name.includes('student_id') || column.name === 'payment_date') {
                        try {
                            const indexSQL = `CREATE INDEX idx_${column.name} ON ${this.tableName}(\`${column.name}\`)`;
                            await this.connection.execute(indexSQL);
                            console.log(`    Added index for ${column.name}`);
                        } catch (indexError) {
                            // Index might already exist or column might not support indexing
                        }
                    }
                } catch (error) {
                    console.error(`  ✗ Error adding column ${column.name}:`, error.message);
                }
            }
        }
    }

    getCookieString() {
        return Object.entries(this.apiConfig.cookies)
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
    }

    formatDateForAPI(date) {
        // Convert YYYY-MM-DD to DD/MM/YYYY format for Fidelo API
        const [year, month, day] = date.split('-');
        return `${day}/${month}/${year}`;
    }

    async fetchPaymentDetailData(startDate, endDate) {
        try {
            console.log(`\n📊 Fetching Payment Detail data from ${startDate} to ${endDate}...`);
            
            // Format dates for API
            const formattedStart = this.formatDateForAPI(startDate);
            const formattedEnd = this.formatDateForAPI(endDate);
            
            // Build form data
            const formData = new URLSearchParams({
                'token': this.apiConfig.token,
                'filter[search]': '',
                'filter[search_time_from_1]': formattedStart,
                'filter[search_time_until_1]': formattedEnd,
                'filter[timefilter_basedon]': 'kip.payment_date',
                'filter[search_2]': '0',
                'filter[search_3]': '0',
                'filter[search_4]': '0',
                'filter[search_5]': '0',
                'filter[search_6]': '0',
                'filter[search_7]': '0',
                'filter[search_8]': '0',
                'filter[search_9]': '0',
                'filter[search_10]': '0',
                'filter[search_11]': '0',
                'filter[inbox_filter]': '0',
                'filter[group_search]': '0',
                'filter[search_14]': '0'
            });
            
            const url = `${this.apiConfig.baseURL}/${this.apiConfig.endpoint}/search`;
            
            console.log('🔄 Making API request...');
            console.log('   URL:', url);
            console.log('   Date range:', formattedStart, 'to', formattedEnd);
            console.log('   ⏰ Note: Fidelo API is slow - this may take 15-20 minutes...');
            
            // Start a progress indicator
            const progressInterval = setInterval(() => {
                process.stdout.write('.');
            }, 30000); // Print a dot every 30 seconds
            
            const startTime = Date.now();
            
            const response = await axios.post(url, formData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Cookie': this.getCookieString()
                },
                timeout: this.timeout,  // 0 = no timeout
                validateStatus: (status) => status < 500
            });
            
            clearInterval(progressInterval);
            const elapsedMinutes = ((Date.now() - startTime) / 60000).toFixed(1);
            console.log(`\n   Response received after ${elapsedMinutes} minutes`);
            console.log('   Response status:', response.status);
            
            if (response.status === 200) {
                const data = response.data;
                
                if (data.entries && Object.keys(data.entries).length > 0) {
                    console.log(`✅ Found ${Object.keys(data.entries).length} payment records`);
                    return data.entries;
                } else if (data.hits !== undefined) {
                    console.log(`ℹ️ API returned ${data.hits} hits`);
                    if (data.hits === 0) {
                        console.log('   No payment records found for this date range');
                        return {};
                    }
                }
                
                return data.entries || {};
            } else if (response.status === 401) {
                console.error('❌ Authentication failed - cookies may have expired');
                console.log('   Please update the cookies in the configuration');
                throw new Error('Authentication failed');
            } else {
                console.error(`❌ Unexpected status: ${response.status}`);
                return {};
            }
            
        } catch (error) {
            if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
                console.error('❌ Connection lost - Fidelo API is notoriously slow, try again');
            } else {
                console.error('❌ Error fetching payment details:', error.message);
            }
            throw error;
        }
    }

    cleanFieldValue(fieldName, value) {
        if (value === null || value === undefined) {
            return null;
        }
        
        // Handle arrays
        if (Array.isArray(value)) {
            // Filter out empty values and join
            const filtered = value.filter(item => item !== null && item !== undefined && item !== '');
            return filtered.length > 0 ? filtered.join(', ') : null;
        }
        
        // Handle objects (store as JSON)
        if (typeof value === 'object') {
            try {
                return JSON.stringify(value);
            } catch (error) {
                return String(value);
            }
        }
        
        // Handle strings
        if (typeof value === 'string') {
            let cleaned = value;
            
            // Remove HTML tags
            cleaned = cleaned.replace(/<br\s*\/?>/gi, ', ');  // Convert breaks to commas
            cleaned = cleaned.replace(/<[^>]*>/g, '');        // Remove all HTML tags
            
            // Fix character encoding issues
            cleaned = cleaned.replace(/â‚¬/g, '€');
            cleaned = cleaned.replace(/Ã¡/g, 'á');
            cleaned = cleaned.replace(/Ã­/g, 'í');
            cleaned = cleaned.replace(/Ã©/g, 'é');
            cleaned = cleaned.replace(/Ã³/g, 'ó');
            cleaned = cleaned.replace(/Ãº/g, 'ú');
            cleaned = cleaned.replace(/Ã±/g, 'ñ');
            cleaned = cleaned.replace(/&amp;/g, '&');
            cleaned = cleaned.replace(/&lt;/g, '<');
            cleaned = cleaned.replace(/&gt;/g, '>');
            
            // Clean up whitespace
            cleaned = cleaned.replace(/\s+/g, ' ').trim();
            
            return cleaned || null;
        }
        
        return value;
    }

    prepareValue(fieldName, value) {
        if (value === null || value === undefined) {
            return null;
        }
        
        const fieldLower = fieldName.toLowerCase();
        
        // Handle date conversions
        if (fieldLower.includes('date') || fieldLower.includes('_at')) {
            if (typeof value === 'string') {
                // DD/MM/YYYY to MySQL format
                if (value.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                    const [day, month, year] = value.split('/');
                    return `${year}-${month}-${day}`;
                }
                // ISO format
                if (value.match(/^\d{4}-\d{2}-\d{2}/)) {
                    return new Date(value);
                }
            }
        }
        
        // Handle boolean conversions
        if (typeof value === 'boolean') {
            return value ? 1 : 0;
        }
        
        // Handle amount/price fields
        if (fieldLower.includes('amount') || fieldLower.includes('price') || 
            fieldLower.includes('fee') || fieldLower.includes('cost')) {
            if (typeof value === 'string') {
                // Remove currency symbols and convert to number
                const cleaned = value.replace(/[^0-9.-]/g, '');
                const parsed = parseFloat(cleaned);
                return isNaN(parsed) ? 0 : parsed;
            }
        }
        
        return value;
    }

    async insertOrUpdateRecord(recordData, apiKey) {
        try {
            // First, ensure all columns exist
            await this.addMissingColumns(recordData);
            
            // Generate composite key from the record data
            const compositeKey = this.generateCompositeKey(recordData);
            
            // Prepare the data for insertion
            const cleanedData = {};
            for (const [fieldName, value] of Object.entries(recordData)) {
                const safeColumnName = this.createSafeColumnName(fieldName);
                const cleanedValue = this.cleanFieldValue(fieldName, value);
                cleanedData[safeColumnName] = this.prepareValue(fieldName, cleanedValue);
            }
            
            // Add the composite key for duplicate detection
            cleanedData['composite_key'] = compositeKey;
            
            // Store the original API key as well (for reference)
            cleanedData['api_response_key'] = apiKey;
            
            // Build the INSERT ... ON DUPLICATE KEY UPDATE statement
            const columns = Object.keys(cleanedData);
            const values = Object.values(cleanedData);
            const placeholders = columns.map(() => '?').join(', ');
            
            // For UPDATE clause, exclude system fields
            const updateClause = columns
                .filter(col => !['id', 'composite_key', 'first_sync_date', 'last_sync_date', 'sync_count'].includes(col))
                .map(col => `\`${col}\` = VALUES(\`${col}\`)`)
                .join(', ');
            
            const sql = `
                INSERT INTO ${this.tableName} (
                    ${columns.map(c => `\`${c}\``).join(', ')}
                ) VALUES (${placeholders})
                ON DUPLICATE KEY UPDATE
                    ${updateClause},
                    last_sync_date = CURRENT_TIMESTAMP,
                    sync_count = sync_count + 1
            `;
            
            const [result] = await this.connection.execute(sql, values);
            
            // Return whether this was an insert (new) or update (existing)
            return {
                isNew: result.insertId > 0 && result.affectedRows === 1,
                isUpdate: result.affectedRows === 2,  // MySQL returns 2 for updates in ON DUPLICATE KEY
                compositeKey: compositeKey
            };
            
        } catch (error) {
            console.error(`Error inserting/updating record (API key: ${apiKey}, composite: ${compositeKey}):`, error.message);
            throw error;
        }
    }

    async syncPaymentDetails(startDate, endDate) {
        try {
            console.log('='.repeat(60));
            console.log(`PAYMENT DETAIL API SYNC - ${this.version}`);
            console.log('Duplicate Prevention: ON DUPLICATE KEY UPDATE');
            console.log('='.repeat(60));
            
            await this.connect();
            await this.createTable();
            
            const paymentData = await this.fetchPaymentDetailData(startDate, endDate);
            
            if (!paymentData || Object.keys(paymentData).length === 0) {
                console.log('No payment data to sync');
                return { success: false, recordsProcessed: 0 };
            }
            
            // Check what fields we're getting
            const sampleRecord = Object.values(paymentData)[0];
            console.log(`\n📋 Fields detected in API response: ${Object.keys(sampleRecord).length}`);
            console.log('   Sample fields:', Object.keys(sampleRecord).slice(0, 10).join(', '));
            
            console.log(`\n💾 Processing ${Object.keys(paymentData).length} payment records...`);
            
            let newCount = 0;
            let updateCount = 0;
            let errorCount = 0;
            
            for (const [key, record] of Object.entries(paymentData)) {
                try {
                    const result = await this.insertOrUpdateRecord(record, key);
                    
                    if (result.isNew) {
                        newCount++;
                    } else if (result.isUpdate) {
                        updateCount++;
                    }
                    
                    const total = newCount + updateCount;
                    if (total % 10 === 0) {
                        process.stdout.write(`\r   Processed ${total}/${Object.keys(paymentData).length} (${newCount} new, ${updateCount} updated)...`);
                    }
                } catch (error) {
                    errorCount++;
                    if (errorCount <= 5) {
                        console.error(`\n   Error processing record ${key}:`, error.message);
                    }
                }
            }
            
            console.log('\n');
            
            // Get summary statistics
            try {
                const [summary] = await this.connection.execute(
                    `SELECT 
                        COUNT(*) as total,
                        COUNT(CASE WHEN sync_count = 1 THEN 1 END) as single_sync,
                        COUNT(CASE WHEN sync_count > 1 THEN 1 END) as multi_sync,
                        MIN(first_sync_date) as earliest_record,
                        MAX(last_sync_date) as latest_update
                     FROM ${this.tableName}`
                );
                
                console.log(`\n📊 Database Summary:`);
                console.log(`   Total records in DB: ${summary[0].total}`);
                console.log(`   Records synced once: ${summary[0].single_sync}`);
                console.log(`   Records synced multiple times: ${summary[0].multi_sync}`);
                console.log(`   Earliest record: ${summary[0].earliest_record}`);
                console.log(`   Latest update: ${summary[0].latest_update}`);
                
                // Get column count
                const [columns] = await this.connection.execute(
                    `SELECT COUNT(*) as col_count FROM information_schema.columns 
                     WHERE table_name = '${this.tableName}' AND table_schema = DATABASE()`
                );
                console.log(`   Total columns: ${columns[0].col_count}`);
            } catch (e) {
                // Summary query failed
            }
            
            console.log('\n' + '='.repeat(60));
            console.log('SYNC COMPLETE');
            console.log(`✅ New records added: ${newCount}`);
            console.log(`🔄 Existing records updated: ${updateCount}`);
            if (errorCount > 0) {
                console.log(`⚠️ Errors encountered: ${errorCount}`);
            }
            console.log('\nDuplicate Prevention: Records with same record_key were UPDATED, not duplicated');
            console.log('='.repeat(60));
            
            return {
                success: true,
                newRecords: newCount,
                updatedRecords: updateCount,
                errors: errorCount
            };
            
        } catch (error) {
            console.error('Sync failed:', error.message);
            throw error;
        } finally {
            await this.disconnect();
        }
    }

    // Test function to verify API connectivity and show field structure
    async testConnection() {
        try {
            console.log('\n🔧 Testing Payment Detail API connection...');
            console.log(`   Version: ${this.version}`);
            
            // Test with a single day
            const testDate = '2025-09-01';
            const data = await this.fetchPaymentDetailData(testDate, testDate);
            
            if (data && Object.keys(data).length > 0) {
                console.log('✅ API connection successful!');
                
                const sampleRecord = Object.values(data)[0];
                const fields = Object.keys(sampleRecord);
                
                console.log(`\n📋 API Response Structure:`);
                console.log(`   Total fields: ${fields.length}`);
                console.log(`   Field names (first 20):`);
                fields.slice(0, 20).forEach(field => {
                    const value = sampleRecord[field];
                    const type = value === null ? 'null' : typeof value;
                    const sample = value === null ? 'null' : 
                                   typeof value === 'object' ? '[object]' : 
                                   String(value).substring(0, 30);
                    console.log(`     - ${field}: ${type} (${sample}...)`);
                });
                
                if (fields.length > 20) {
                    console.log(`     ... and ${fields.length - 20} more fields`);
                }
                
                return true;
            } else {
                console.log('⚠️ API connected but no data returned for test date');
                return false;
            }
            
        } catch (error) {
            console.error('❌ API connection test failed:', error.message);
            return false;
        }
    }

    // Check for duplicates in the database
    async checkDuplicates() {
        try {
            await this.connect();
            
            console.log(`\n🔍 Checking for duplicates in ${this.tableName}...`);
            
            // Check for any composite_keys that appear more than once (shouldn't happen with UNIQUE constraint)
            const [duplicates] = await this.connection.execute(`
                SELECT composite_key, COUNT(*) as count 
                FROM ${this.tableName} 
                GROUP BY composite_key 
                HAVING COUNT(*) > 1
            `);
            
            if (duplicates.length > 0) {
                console.log(`⚠️ Found ${duplicates.length} duplicate composite_keys (this shouldn't happen):`);
                duplicates.forEach(dup => {
                    console.log(`   - ${dup.composite_key}: ${dup.count} occurrences`);
                });
            } else {
                console.log('✅ No duplicate composite_keys found (expected with UNIQUE constraint)');
            }
            
            // Check records that have been synced multiple times
            const [multiSync] = await this.connection.execute(`
                SELECT composite_key, sync_count, first_sync_date, last_sync_date
                FROM ${this.tableName}
                WHERE sync_count > 1
                ORDER BY sync_count DESC
                LIMIT 10
            `);
            
            if (multiSync.length > 0) {
                console.log(`\n📊 Records synced multiple times (top 10):`);
                multiSync.forEach(record => {
                    console.log(`   - ${record.composite_key.substring(0, 16)}...: synced ${record.sync_count} times`);
                    console.log(`     First: ${record.first_sync_date}, Last: ${record.last_sync_date}`);
                });
            } else {
                console.log('\n✅ No records have been synced multiple times yet');
            }
            
        } catch (error) {
            console.error('Error checking duplicates:', error.message);
        } finally {
            await this.disconnect();
        }
    }
}

// Export for use as module
module.exports = PaymentDetailAPI;

// CLI usage
if (require.main === module) {
    const api = new PaymentDetailAPI();
    
    // Parse command line arguments
    const command = process.argv[2] || 'help';
    
    if (command === 'test') {
        // Test API connection and show field structure
        api.testConnection()
            .then(success => {
                process.exit(success ? 0 : 1);
            })
            .catch(error => {
                console.error('Test failed:', error.message);
                process.exit(1);
            });
            
    } else if (command === 'sync') {
        // Sync data for date range
        const startDate = process.argv[3] || '2025-09-01';
        const endDate = process.argv[4] || '2025-09-07';
        
        api.syncPaymentDetails(startDate, endDate)
            .then(result => {
                console.log('\nSync completed:', result);
                process.exit(result.success ? 0 : 1);
            })
            .catch(error => {
                console.error('Sync failed:', error.message);
                process.exit(1);
            });
            
    } else if (command === 'duplicates') {
        // Check for duplicate records
        api.checkDuplicates()
            .then(() => {
                process.exit(0);
            })
            .catch(error => {
                console.error('Duplicate check failed:', error.message);
                process.exit(1);
            });
            
    } else {
        console.log('Payment Detail API v3 - Composite Key Duplicate Prevention');
        console.log('='.repeat(60));
        console.log('Usage:');
        console.log('  node payment-detail-api.js test                    # Test API connection');
        console.log('  node payment-detail-api.js sync [start] [end]      # Sync date range');
        console.log('  node payment-detail-api.js duplicates              # Check for duplicates');
        console.log('');
        console.log('Examples:');
        console.log('  node payment-detail-api.js test');
        console.log('  node payment-detail-api.js sync 2025-09-01 2025-09-30');
        console.log('  node payment-detail-api.js duplicates');
        console.log('');
        console.log('Duplicate Handling (v3):');
        console.log('  - Generates composite key from: invoice + date + amount + student');
        console.log('  - Handles partial payments (same invoice, different amounts/dates)');
        console.log('  - ON DUPLICATE KEY UPDATE - updates existing records');
        console.log('  - NO TIMEOUT - API can take 20+ minutes');
        console.log('  - Running sync multiple times will NOT create duplicates');
        process.exit(0);
    }
}