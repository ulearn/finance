/**
 * Payment Detail API - Direct API Integration
 * Location: /home/hub/public_html/fins/scripts/fidelo/payment-detail-api.js
 * 
 * Uses direct API approach that Fidelo support confirmed is working
 * Syncs payment detail data to MySQL database
 */

const mysql = require('mysql2/promise');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

class PaymentDetailAPI {
    constructor() {
        this.connection = null;
        this.tableName = 'payment_details';
        
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
        
        // Timeout for API requests (30 seconds)
        this.timeout = 30000;
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
            const createTableSQL = `
                CREATE TABLE IF NOT EXISTS ${this.tableName} (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    booking_id VARCHAR(100),
                    payment_date DATE,
                    payment_amount DECIMAL(10,2),
                    payment_method VARCHAR(100),
                    payment_status VARCHAR(50),
                    payment_reference VARCHAR(200),
                    currency VARCHAR(10),
                    course_fee DECIMAL(10,2),
                    accommodation_fee DECIMAL(10,2),
                    other_fees DECIMAL(10,2),
                    total_amount DECIMAL(10,2),
                    student_name VARCHAR(200),
                    student_email VARCHAR(200),
                    agency_name VARCHAR(200),
                    notes TEXT,
                    raw_data JSON,
                    sync_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    
                    INDEX idx_booking (booking_id),
                    INDEX idx_payment_date (payment_date),
                    INDEX idx_student (student_email)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `;
            
            await this.connection.execute(createTableSQL);
            console.log(`✅ Table ${this.tableName} created or already exists`);
            
        } catch (error) {
            console.error('❌ Error creating table:', error.message);
            throw error;
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
            console.log(`\\n📊 Fetching Payment Detail data from ${startDate} to ${endDate}...`);
            
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
            
            const response = await axios.post(url, formData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Cookie': this.getCookieString()
                },
                timeout: this.timeout,
                validateStatus: (status) => status < 500
            });
            
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
            if (error.code === 'ETIMEDOUT') {
                console.error('❌ Request timed out after 30 seconds');
            } else {
                console.error('❌ Error fetching payment details:', error.message);
            }
            throw error;
        }
    }

    parsePaymentRecord(record) {
        // Parse a payment record from Fidelo format to our database format
        // This will need to be adjusted based on actual field names from the API
        
        const parsed = {
            booking_id: record.booking_id || record.id || null,
            payment_date: this.parseDate(record.payment_date || record.date),
            payment_amount: this.parseAmount(record.payment_amount || record.amount),
            payment_method: record.payment_method || record.method || null,
            payment_status: record.payment_status || record.status || 'unknown',
            payment_reference: record.payment_reference || record.reference || null,
            currency: record.currency || 'EUR',
            course_fee: this.parseAmount(record.course_fee || record.course_amount),
            accommodation_fee: this.parseAmount(record.accommodation_fee || record.acc_amount),
            other_fees: this.parseAmount(record.other_fees || record.extras),
            total_amount: this.parseAmount(record.total || record.total_amount),
            student_name: this.cleanString(record.student_name || record.name),
            student_email: this.cleanString(record.student_email || record.email),
            agency_name: this.cleanString(record.agency_name || record.agency),
            notes: this.cleanString(record.notes || record.comment),
            raw_data: JSON.stringify(record)
        };
        
        // Calculate total if not provided
        if (!parsed.total_amount && (parsed.course_fee || parsed.accommodation_fee)) {
            parsed.total_amount = (parsed.course_fee || 0) + (parsed.accommodation_fee || 0) + (parsed.other_fees || 0);
        }
        
        return parsed;
    }

    parseDate(dateStr) {
        if (!dateStr) return null;
        
        // Handle DD/MM/YYYY format
        if (dateStr.match(/^\\d{2}\\/\\d{2}\\/\\d{4}$/)) {
            const [day, month, year] = dateStr.split('/');
            return `${year}-${month}-${day}`;
        }
        
        // Handle ISO format
        if (dateStr.match(/^\\d{4}-\\d{2}-\\d{2}/)) {
            return dateStr.substring(0, 10);
        }
        
        return null;
    }

    parseAmount(value) {
        if (!value) return 0;
        if (typeof value === 'number') return value;
        
        // Remove currency symbols and convert to number
        const cleaned = String(value).replace(/[^0-9.-]/g, '');
        return parseFloat(cleaned) || 0;
    }

    cleanString(value) {
        if (!value) return null;
        if (typeof value !== 'string') return String(value);
        
        // Remove HTML tags
        let cleaned = value.replace(/<[^>]*>/g, '');
        
        // Fix character encoding
        cleaned = cleaned.replace(/â‚¬/g, '€');
        cleaned = cleaned.replace(/&amp;/g, '&');
        cleaned = cleaned.replace(/&lt;/g, '<');
        cleaned = cleaned.replace(/&gt;/g, '>');
        
        return cleaned.trim();
    }

    async insertPaymentRecord(record) {
        try {
            const sql = `
                INSERT INTO ${this.tableName} (
                    booking_id, payment_date, payment_amount, payment_method,
                    payment_status, payment_reference, currency, course_fee,
                    accommodation_fee, other_fees, total_amount, student_name,
                    student_email, agency_name, notes, raw_data
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const values = [
                record.booking_id, record.payment_date, record.payment_amount,
                record.payment_method, record.payment_status, record.payment_reference,
                record.currency, record.course_fee, record.accommodation_fee,
                record.other_fees, record.total_amount, record.student_name,
                record.student_email, record.agency_name, record.notes, record.raw_data
            ];
            
            await this.connection.execute(sql, values);
            
        } catch (error) {
            console.error('Error inserting payment record:', error.message);
            throw error;
        }
    }

    async syncPaymentDetails(startDate, endDate) {
        try {
            console.log('='.repeat(60));
            console.log('PAYMENT DETAIL API SYNC');
            console.log('='.repeat(60));
            
            await this.connect();
            await this.createTable();
            
            const paymentData = await this.fetchPaymentDetailData(startDate, endDate);
            
            if (!paymentData || Object.keys(paymentData).length === 0) {
                console.log('No payment data to sync');
                return { success: false, recordsProcessed: 0 };
            }
            
            console.log(`\\n💾 Processing ${Object.keys(paymentData).length} payment records...`);
            
            let processedCount = 0;
            let errorCount = 0;
            
            for (const [key, record] of Object.entries(paymentData)) {
                try {
                    const parsed = this.parsePaymentRecord(record);
                    await this.insertPaymentRecord(parsed);
                    processedCount++;
                    
                    if (processedCount % 10 === 0) {
                        console.log(`   Processed ${processedCount} records...`);
                    }
                } catch (error) {
                    errorCount++;
                    console.error(`   Error processing record ${key}:`, error.message);
                }
            }
            
            console.log('\\n' + '='.repeat(60));
            console.log('SYNC COMPLETE');
            console.log(`✅ Successfully processed: ${processedCount} records`);
            if (errorCount > 0) {
                console.log(`⚠️ Errors encountered: ${errorCount} records`);
            }
            console.log('='.repeat(60));
            
            return {
                success: true,
                recordsProcessed: processedCount,
                errors: errorCount
            };
            
        } catch (error) {
            console.error('Sync failed:', error.message);
            throw error;
        } finally {
            await this.disconnect();
        }
    }

    // Test function to verify API connectivity
    async testConnection() {
        try {
            console.log('\\n🔧 Testing Payment Detail API connection...');
            
            // Test with a single day
            const testDate = '2025-09-01';
            const data = await this.fetchPaymentDetailData(testDate, testDate);
            
            if (data && Object.keys(data).length > 0) {
                console.log('✅ API connection successful!');
                console.log(`   Sample record keys: ${Object.keys(Object.values(data)[0]).slice(0, 5).join(', ')}`);
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
}

// Export for use as module
module.exports = PaymentDetailAPI;

// CLI usage
if (require.main === module) {
    const api = new PaymentDetailAPI();
    
    // Parse command line arguments
    const command = process.argv[2] || 'test';
    
    if (command === 'test') {
        // Test API connection
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
                console.log('Sync completed:', result);
                process.exit(result.success ? 0 : 1);
            })
            .catch(error => {
                console.error('Sync failed:', error.message);
                process.exit(1);
            });
            
    } else {
        console.log('Usage:');
        console.log('  node payment-detail-api.js test                    # Test API connection');
        console.log('  node payment-detail-api.js sync [start] [end]      # Sync date range');
        console.log('');
        console.log('Example:');
        console.log('  node payment-detail-api.js sync 2025-09-01 2025-09-30');
        process.exit(0);
    }
}
