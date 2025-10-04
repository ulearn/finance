const mysql = require('mysql2/promise');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Version 1: Fidelo Payments API sync with dynamic field creation

console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '[SET]' : '[NOT SET]');

class FideloPaymentsSync {
    constructor() {
        this.connection = null;
        this.tableName = 'payments';
        this.apiToken = '9feb2576ba97b2743550120aa5dd935c';
        this.apiUrl = 'https://ulearn.fidelo.com/api/1.0/gui2/4e289ca973cc2b424d58ec10197bd160/search';
    }

    async connect() {
        try {
            this.connection = await mysql.createConnection({
                host: process.env.DB_HOST,
                port: process.env.DB_PORT,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME
            });
            console.log('Connected to MySQL database');
        } catch (error) {
            console.error('MySQL connection failed:', error.message);
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
            const createTableSQL = `
                CREATE TABLE IF NOT EXISTS ${this.tableName} (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    payment_id INT UNIQUE,
                    sync_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_payment_id (payment_id),
                    INDEX idx_sync_date (sync_date)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `;
            
            await this.connection.execute(createTableSQL);
            console.log(`Table ${this.tableName} created or already exists`);
            
        } catch (error) {
            console.error('Error creating table:', error.message);
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

    getMySQLType(value) {
        if (value === null || value === undefined) {
            return 'TEXT';
        }
        
        if (typeof value === 'boolean') {
            return 'BOOLEAN';
        }
        
        if (typeof value === 'number') {
            return Number.isInteger(value) ? 'INT' : 'DECIMAL(15,2)';
        }
        
        if (typeof value === 'string') {
            // Check if it's a date
            if (value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) || 
                value.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                return 'DATETIME';
            }
            
            return 'TEXT';
        }
        
        if (Array.isArray(value) || typeof value === 'object') {
            return 'TEXT';
        }
        
        return 'TEXT';
    }

    cleanFieldValue(fieldName, value) {
        if (value === null || value === undefined) {
            return null;
        }
        
        // Handle email fields specially to preserve format
        if (fieldName.includes('email')) {
            if (Array.isArray(value)) {
                return value.filter(item => item !== null && item !== undefined && item !== '').join(', ');
            }
            if (typeof value === 'string') {
                let cleaned = value;
                cleaned = cleaned.replace(/<br\s*\/?>/gi, ', ');
                cleaned = cleaned.replace(/<[^>]*>/g, '');
                cleaned = cleaned.replace(/,\s+/g, ', ');
                cleaned = cleaned.replace(/\s+,/g, ',');
                cleaned = cleaned.trim();
                return cleaned;
            }
            return value;
        }
        
        // Handle arrays
        if (Array.isArray(value)) {
            return value.filter(item => item !== null && item !== undefined && item !== '').join(', ');
        }
        
        // Handle objects
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
            
            // Convert HTML line breaks to comma-separated values
            cleaned = cleaned.replace(/<br\s*\/?>/gi, ', ');
            
            // Remove HTML tags
            cleaned = cleaned.replace(/<[^>]*>/g, '');
            
            // Fix character encoding issues
            cleaned = cleaned.replace(/â‚¬/g, '€');
            cleaned = cleaned.replace(/Ã¡/g, 'á');
            cleaned = cleaned.replace(/Ã­/g, 'í');
            cleaned = cleaned.replace(/Ã©/g, 'é');
            cleaned = cleaned.replace(/Ã³/g, 'ó');
            cleaned = cleaned.replace(/Ãº/g, 'ú');
            cleaned = cleaned.replace(/Ã±/g, 'ñ');
            
            // Clean up multiple commas, leading/trailing commas, and extra spaces
            cleaned = cleaned.replace(/,\s*,+/g, ',');
            cleaned = cleaned.replace(/^,\s*/, '');
            cleaned = cleaned.replace(/,\s*$/, '');
            cleaned = cleaned.replace(/\s+/g, ' ');
            cleaned = cleaned.trim();
            
            return cleaned;
        }
        
        return value;
    }

    async addMissingColumns(paymentData) {
        const existingColumns = await this.getExistingColumns();
        const newColumns = [];
        
        for (const [fieldName, value] of Object.entries(paymentData)) {
            if (!existingColumns.includes(fieldName)) {
                const mysqlType = this.getMySQLType(value);
                newColumns.push({ name: fieldName, type: mysqlType });
            }
        }
        
        if (newColumns.length > 0) {
            console.log(`Adding ${newColumns.length} new columns to ${this.tableName}...`);
            
            for (const column of newColumns) {
                try {
                    const alterSQL = `ALTER TABLE ${this.tableName} ADD COLUMN \`${column.name}\` ${column.type}`;
                    await this.connection.execute(alterSQL);
                    console.log(`Added column: ${column.name} (${column.type})`);
                } catch (error) {
                    console.error(`Error adding column ${column.name}:`, error.message);
                }
            }
        }
    }

    prepareValue(value) {
        if (value === null || value === undefined) {
            return null;
        }
        
        if (typeof value === 'boolean') {
            return value;
        }
        
        if (typeof value === 'number') {
            return value;
        }
        
        if (typeof value === 'string') {
            // Convert date formats
            if (value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
                return new Date(value);
            }
            if (value.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                const [day, month, year] = value.split('/');
                return new Date(`${year}-${month}-${day}`);
            }
            return value;
        }
        
        if (Array.isArray(value) || typeof value === 'object') {
            try {
                return JSON.stringify(value);
            } catch (error) {
                return String(value);
            }
        }
        
        return String(value);
    }

    async insertOrUpdatePayment(paymentData) {
        try {
            // Add missing columns first
            await this.addMissingColumns(paymentData);
            
            // Clean and prepare data
            const cleanedData = {};
            for (const [fieldName, value] of Object.entries(paymentData)) {
                const cleanedValue = this.cleanFieldValue(fieldName, value);
                cleanedData[fieldName] = this.prepareValue(cleanedValue);
            }
            
            const fields = Object.keys(cleanedData);
            const values = Object.values(cleanedData);
            const placeholders = fields.map(() => '?').join(', ');
            const updateClause = fields.map(field => `\`${field}\` = VALUES(\`${field}\`)`).join(', ');
            
            const sql = `
                INSERT INTO ${this.tableName} (${fields.map(f => `\`${f}\``).join(', ')})
                VALUES (${placeholders})
                ON DUPLICATE KEY UPDATE
                ${updateClause},
                sync_date = CURRENT_TIMESTAMP
            `;
            
            await this.connection.execute(sql, values);
            console.log(`Synced payment ID: ${paymentData.payment_id || paymentData.id}`);
            
        } catch (error) {
            console.error(`Error syncing payment:`, error.message);
            throw error;
        }
    }

    async getFideloPayments(startDate, endDate) {
        try {
            console.log(`Fetching Fidelo payments from ${startDate} to ${endDate}...`);
            
            // Format dates for Fidelo API (YYYY-MM-DD format for filter[date])
            const queryParams = new URLSearchParams({
                '_token': this.apiToken,
                'filter[search]': '',
                'filter[date]': `${startDate},${endDate}`
            });
            
            const fullUrl = `${this.apiUrl}?${queryParams.toString()}`;
            
            console.log('Request URL:', fullUrl.replace(this.apiToken, '[TOKEN]'));
            
            const response = await axios.get(fullUrl, {
                headers: {
                    'Accept': 'application/json'
                },
                timeout: 30000
            });
            
            if (response.data && response.data.entries) {
                const payments = Object.values(response.data.entries);
                console.log(`Found ${payments.length} payments`);
                return payments;
            }
            
            console.log('No payments found in response');
            return [];
            
        } catch (error) {
            console.error('Error fetching Fidelo payments:', error.message);
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', JSON.stringify(error.response.data, null, 2));
            }
            throw error;
        }
    }

    async syncPayments(startDate, endDate) {
        try {
            await this.connect();
            await this.createTable();
            
            const payments = await this.getFideloPayments(startDate, endDate);
            
            console.log(`\nSyncing ${payments.length} payments to MySQL...`);
            
            for (const payment of payments) {
                // Debug: log available fields to find unique identifier
                console.log('Payment fields:', Object.keys(payment).slice(0, 10).join(', '));
                
                // Try to find a unique identifier from common field names
                if (!payment.payment_id) {
                    payment.payment_id = payment.id || 
                                       payment['ts_i.id'] || 
                                       payment.receipt_number || 
                                       payment.transaction_code ||
                                       payment.document_number;
                }
                
                console.log(`Processing payment with ID: ${payment.payment_id}`);
                
                await this.insertOrUpdatePayment(payment);
            }
            
            console.log('\nPayments sync completed successfully!');
            
        } catch (error) {
            console.error('Payments sync failed:', error.message);
            throw error;
        } finally {
            await this.disconnect();
        }
    }
}

// Export for use as module
module.exports = FideloPaymentsSync;

// CLI usage
if (require.main === module) {
    const sync = new FideloPaymentsSync();
    
    // Default to September 1-7, 2025 or accept command line arguments
    const startDate = process.argv[2] || '2025-09-01';
    const endDate = process.argv[3] || '2025-09-07';
    
    sync.syncPayments(startDate, endDate)
        .then(() => {
            console.log('Fidelo payments sync completed');
            process.exit(0);
        })
        .catch(error => {
            console.error('Fidelo payments sync failed:', error.message);
            process.exit(1);
        });
}