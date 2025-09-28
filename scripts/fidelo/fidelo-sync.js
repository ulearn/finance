const mysql = require('mysql2/promise');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Version 21: Complete email field bypass to prevent corruption during cleaning

// Debug environment variables
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '[SET]' : '[NOT SET]');

// Version 1: Dynamic MySQL sync with column creation

class FideloSync {
    constructor() {
        this.connection = null;
        this.tableName = 'bookings';
        this.extTableName = 'bookings_ext';
        
        // Define logical split: accommodation and payment fields go to extension table
        this.extensionTableFields = [
            // Accommodation fields
            'accommodation_provider_id', 'acc_allergies', 'accommodation_name', 'accommodation_room',
            'accommodation_bed', 'accommodation_room_bed', 'accommodation_details', 'accommodation_street',
            'accommodation_address_addon', 'accommodation_share_with', 'accommodation_zip', 'accommodation_city',
            'accommodation_tel', 'accommodation_tel2', 'accommodation_mobile', 'accommodation_email',
            'accommodation_contact_en', 'accommodation_description_en', 'accommodation_customer_agency_confirmed',
            'accommodation_provider_confirmed', 'accommodation_allocation_changed', 'first_accommodation_allocation',
            'accommodation_allocations', 'has_accommodation_allocation', 'accommodation_customer_agency_is_confirmed',
            'accommodation_provider_is_confirmed',
            
            // Payment and financial fields
            'currency_id', 'currency_id_original', 'payment_reminder', 'amount', 'amount_original', 
            'amount_initial', 'amount_initial_original', 'open_payment_prior_to_arrival',
            'open_payment_prior_to_arrival_original', 'open_payment_at_school', 'open_payment_at_school_original',
            'payments', 'payments_original', 'payments_local', 'payments_local_original', 'amount_open',
            'amount_open_original', 'amount_refund', 'amount_refund_original', 'paymentterms_info',
            'paymentterms_info_original', 'paymentterms_next_date', 'paymentterms_next_amount', 
            
            // Document and sponsor fields
            'pdf_netto', 'pdf_brutto', 'pdf_loa', 'sponsored', 'sponsored_original', 'sponsor_name', 
            'sponsor_id_number', 'sponsoring_fg_from', 'sponsoring_fg_until', 'sponsoring_fg_has_upload', 
            'sponsoring_fg_has_upload_original',
            
            // Additional fields that cause row size issues - move to extension table
            'course_category_original', 'course_ids_original', 'accommodation_category_original',
            'accommodation_from_original', 'accommodation_until_original', 'accommodation_details_original',
            'accommodation_description_en_original', 'paymentterms_next_amount_original', 'profile_picture',
            'transfer_until_original'
        ];
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
            // Create main table
            const createTableSQL = `
                CREATE TABLE IF NOT EXISTS ${this.tableName} (
                    id INT PRIMARY KEY,
                    sync_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `;
            
            await this.connection.execute(createTableSQL);
            console.log(`Table ${this.tableName} created or already exists`);
            
            // Create extension table
            const createExtTableSQL = `
                CREATE TABLE IF NOT EXISTS ${this.extTableName} (
                    id INT PRIMARY KEY,
                    sync_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (id) REFERENCES ${this.tableName}(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `;
            
            await this.connection.execute(createExtTableSQL);
            console.log(`Extension table ${this.extTableName} created or already exists`);
            
        } catch (error) {
            console.error('Error creating table:', error.message);
            throw error;
        }
    }

    async getExistingColumns() {
        try {
            // Get columns from main table
            const [mainRows] = await this.connection.execute(
                `SHOW COLUMNS FROM ${this.tableName}`
            );
            const mainColumns = mainRows.map(row => ({
                name: row.Field,
                table: 'main'
            }));
            
            // Get columns from extension table
            const [extRows] = await this.connection.execute(
                `SHOW COLUMNS FROM ${this.extTableName}`
            );
            const extColumns = extRows.map(row => ({
                name: row.Field,
                table: 'ext'
            }));
            
            return [...mainColumns, ...extColumns];
            
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
            
            // Force TEXT for everything to avoid JSON columns and row size issues
            return 'TEXT';
        }
        
        // Force arrays and objects to TEXT instead of JSON
        if (Array.isArray(value) || typeof value === 'object') {
            return 'TEXT';
        }
        
        return 'TEXT';
    }

    cleanFieldValue(fieldName, value) {
        if (value === null || value === undefined) {
            return null;
        }
        
        // COMPLETE BYPASS FOR EMAIL FIELDS - BUT CLEAN HTML PROPERLY
        if (fieldName === 'email' || fieldName.includes('email')) {
            if (Array.isArray(value)) {
                return value.filter(item => item !== null && item !== undefined && item !== '').join(', ');
            }
            if (typeof value === 'string') {
                let cleaned = value;
                // Convert <br> tags to commas first
                cleaned = cleaned.replace(/<br\s*\/?>/gi, ', ');
                // Remove HTML tags (including the onclick links)
                cleaned = cleaned.replace(/<[^>]*>/g, '');
                // Clean up spacing around commas
                cleaned = cleaned.replace(/,\s+/g, ', ');
                cleaned = cleaned.replace(/\s+,/g, ',');
                cleaned = cleaned.trim();
                return cleaned;
            }
            return value;
        }
        
        // Handle arrays - convert to comma-separated strings
        if (Array.isArray(value)) {
            // Filter out empty/null values and join properly
            return value.filter(item => item !== null && item !== undefined && item !== '').join(', ');
        }
        
        // Handle objects - stringify but prefer comma separation for simple arrays
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
            
            // Remove ALL HTML tags including complex ones with attributes
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
            cleaned = cleaned.replace(/,\s*,+/g, ',');          // Multiple commas
            cleaned = cleaned.replace(/^,\s*/, '');             // Leading comma
            cleaned = cleaned.replace(/,\s*$/, '');             // Trailing comma
            cleaned = cleaned.replace(/\s+/g, ' ');             // Multiple spaces
            cleaned = cleaned.trim();
            
            return cleaned;
        }
        
        return value;
    }

    async addMissingColumns(bookingData) {
        const existingColumns = await this.getExistingColumns();
        const existingColumnNames = existingColumns.map(col => col.name);
        
        const newColumns = [];
        
        for (const [fieldName, value] of Object.entries(bookingData)) {
            if (!existingColumnNames.includes(fieldName)) {
                const mysqlType = this.getMySQLType(value);
                
                // Determine table based on logical field grouping
                const targetTable = this.extensionTableFields.includes(fieldName) ? 'ext' : 'main';
                
                newColumns.push({ 
                    name: fieldName, 
                    type: mysqlType, 
                    table: targetTable 
                });
            }
        }
        
        if (newColumns.length > 0) {
            const mainCount = newColumns.filter(c => c.table === 'main').length;
            const extCount = newColumns.filter(c => c.table === 'ext').length;
            console.log(`Adding ${newColumns.length} new columns (${mainCount} to core booking, ${extCount} to accommodation/payments)...`);
            
            for (const column of newColumns) {
                try {
                    const tableName = column.table === 'main' ? this.tableName : this.extTableName;
                    const alterSQL = `ALTER TABLE ${tableName} ADD COLUMN \`${column.name}\` ${column.type}`;
                    await this.connection.execute(alterSQL);
                    console.log(`Added column: ${column.name} (${column.type}) to ${column.table} table`);
                } catch (error) {
                    console.error(`Error adding column ${column.name} to ${column.table} table:`, error.message);
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
        
        // Arrays and objects should have been cleaned by cleanFieldValue already
        if (Array.isArray(value) || typeof value === 'object') {
            try {
                return JSON.stringify(value);
            } catch (error) {
                console.warn(`Failed to stringify object, storing as string:`, error.message);
                return String(value);
            }
        }
        
        return String(value);
    }

    async insertOrUpdateBooking(bookingData) {
        try {
            // Add missing columns first
            await this.addMissingColumns(bookingData);
            
            // Get current column distribution
            const existingColumns = await this.getExistingColumns();
            
            // Split data between main and extension tables
            const mainData = {};
            const extData = { id: bookingData.id }; // Extension table needs the ID for foreign key
            
            for (const [fieldName, value] of Object.entries(bookingData)) {
                const columnInfo = existingColumns.find(col => col.name === fieldName);
                
                if (columnInfo) {
                    // Debug logging for email fields
                    if (fieldName === 'email' || fieldName.includes('email')) {
                        console.log(`DEBUG ${fieldName}: Original value:`, JSON.stringify(value));
                    }
                    
                    // Clean the field value before storing
                    const cleanedValue = this.cleanFieldValue(fieldName, value);
                    
                    if (fieldName === 'email' || fieldName.includes('email')) {
                        console.log(`DEBUG ${fieldName}: After cleaning:`, JSON.stringify(cleanedValue));
                    }
                    
                    const preparedValue = this.prepareValue(cleanedValue);
                    
                    if (fieldName === 'email' || fieldName.includes('email')) {
                        console.log(`DEBUG ${fieldName}: After preparing:`, JSON.stringify(preparedValue));
                    }
                    
                    if (columnInfo.table === 'main') {
                        mainData[fieldName] = preparedValue;
                    } else {
                        extData[fieldName] = preparedValue;
                    }
                }
            }
            
            // Insert/update main table
            if (Object.keys(mainData).length > 0) {
                const mainFields = Object.keys(mainData);
                const mainValues = Object.values(mainData);
                const mainPlaceholders = mainFields.map(() => '?').join(', ');
                const mainUpdateClause = mainFields.map(field => `\`${field}\` = VALUES(\`${field}\`)`).join(', ');
                
                const mainSQL = `
                    INSERT INTO ${this.tableName} (${mainFields.map(f => `\`${f}\``).join(', ')})
                    VALUES (${mainPlaceholders})
                    ON DUPLICATE KEY UPDATE
                    ${mainUpdateClause},
                    sync_date = CURRENT_TIMESTAMP
                `;
                
                await this.connection.execute(mainSQL, mainValues);
            }
            
            // Insert/update extension table
            if (Object.keys(extData).length > 1) { // More than just the ID
                const extFields = Object.keys(extData);
                const extValues = Object.values(extData);
                const extPlaceholders = extFields.map(() => '?').join(', ');
                const extUpdateClause = extFields.map(field => `\`${field}\` = VALUES(\`${field}\`)`).join(', ');
                
                const extSQL = `
                    INSERT INTO ${this.extTableName} (${extFields.map(f => `\`${f}\``).join(', ')})
                    VALUES (${extPlaceholders})
                    ON DUPLICATE KEY UPDATE
                    ${extUpdateClause},
                    sync_date = CURRENT_TIMESTAMP
                `;
                
                await this.connection.execute(extSQL, extValues);
            }
            
            console.log(`Synced booking ID: ${bookingData.id} (${Object.keys(mainData).length} main fields, ${Object.keys(extData).length - 1} ext fields)`);
            
        } catch (error) {
            console.error(`Error syncing booking ${bookingData.id}:`, error.message);
            throw error;
        }
    }

    async getFideloBookings(startDate, endDate) {
        try {
            console.log(`Fetching Fidelo bookings from ${startDate} to ${endDate}...`);
            
            const response = await axios.get('https://ulearn.fidelo.com/api/1.1/ts/bookings', {
                headers: {
                    'Authorization': 'Bearer 54b1c34031393ae0bafb5cd4874deb17',
                    'Accept': 'application/json'
                },
                decompress: true,
                timeout: 30000
            });
            
            if (response.data.entries) {
                const allEntries = response.data.entries;
                const start = new Date(startDate + 'T00:00:00.000Z');
                const end = new Date(endDate + 'T23:59:59.999Z');
                
                const filteredBookings = [];
                
                Object.keys(allEntries).forEach(key => {
                    const booking = allEntries[key];
                    const createdDate = new Date(booking.created_original);
                    
                    if (createdDate >= start && createdDate <= end) {
                        // Clean the booking data
                        const cleanBooking = { ...booking };
                        
                        // Remove large binary data
                        if (cleanBooking.profile_picture && cleanBooking.profile_picture.includes('base64')) {
                            cleanBooking.profile_picture = '[REMOVED]';
                        }
                        
                        // DON'T clean email HTML here - let cleanFieldValue handle it
                        
                        filteredBookings.push(cleanBooking);
                    }
                });
                
                console.log(`Found ${filteredBookings.length} bookings in date range`);
                return filteredBookings;
            }
            
            return [];
            
        } catch (error) {
            console.error('Error fetching Fidelo bookings:', error.message);
            throw error;
        }
    }

    async syncBookings(startDate, endDate) {
        try {
            await this.connect();
            await this.createTable();
            
            const bookings = await this.getFideloBookings(startDate, endDate);
            
            console.log(`\nSyncing ${bookings.length} bookings to MySQL...`);
            
            for (const booking of bookings) {
                await this.insertOrUpdateBooking(booking);
            }
            
            console.log('\nSync completed successfully!');
            
        } catch (error) {
            console.error('Sync failed:', error.message);
            throw error;
        } finally {
            await this.disconnect();
        }
    }
}

// Export for use as module
module.exports = FideloSync;

// CLI usage
if (require.main === module) {
    const sync = new FideloSync();
    
    // Default to August 1-7, 2025 or accept command line arguments
    const startDate = process.argv[2] || '2025-08-01';
    const endDate = process.argv[3] || '2025-08-07';
    
    sync.syncBookings(startDate, endDate)
        .then(() => {
            console.log('Fidelo sync completed');
            process.exit(0);
        })
        .catch(error => {
            console.error('Fidelo sync failed:', error.message);
            process.exit(1);
        });
}