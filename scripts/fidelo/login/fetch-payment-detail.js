// Fidelo Payment Detail API - Fetch and Import
// Version 2.0 - Programmatic login + fetch + database import
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const axios = require('axios');
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

class FideloPaymentDetailImporter {
    constructor() {
        this.baseURL = 'https://ulearn.fidelo.com';
        this.loginEndpoint = '/api/1.0/login';
        this.paymentDetailKey = 'e012597a49e0b3d0306f48e499505673';
        this.timeout = 60000; // 60 second timeout for large data requests
        
        // Login credentials from environment
        this.username = process.env.FIDELO_USERNAME || 'paul@ulearn.ie';
        this.password = process.env.FIDELO_PASSWORD;
        
        this.sessionToken = null;
        this.cookies = null;
    }
    
    // Step 1: Programmatic login
    async login() {
        console.log('\n=== Step 1: Logging into Fidelo ===');
        
        const loginUrl = `${this.baseURL}${this.loginEndpoint}`;
        const loginData = new URLSearchParams({
            username: this.username,
            password: this.password,
            submit: 'Login'
        });
        
        try {
            const response = await axios.post(loginUrl, loginData.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                maxRedirects: 0,
                validateStatus: (status) => status === 302 || status === 200,
                timeout: this.timeout
            });
            
            // Extract cookies and session token
            const setCookieHeader = response.headers['set-cookie'];
            if (setCookieHeader) {
                this.cookies = setCookieHeader.map(cookie => cookie.split(';')[0]).join('; ');
                
                // Extract session token from cookies or response
                const sessionMatch = this.cookies.match(/PHPSESSID=([^;]+)/);
                if (sessionMatch) {
                    this.sessionToken = sessionMatch[1];
                }
                
                console.log('✓ Login successful');
                console.log('  Session established:', this.sessionToken ? 'Yes' : 'No');
                return true;
            }
            
            console.log('✗ Login failed - no session cookie');
            return false;
            
        } catch (error) {
            console.log('✗ Login error:', error.message);
            return false;
        }
    }
    
    // Step 2: Fetch Payment Detail data
    async fetchPaymentDetail(dateFrom, dateTo) {
        console.log('\n=== Step 2: Fetching Payment Detail Data ===');
        console.log(`Date range: ${dateFrom} to ${dateTo}`);
        
        if (!this.cookies) {
            console.log('✗ Not logged in - please login first');
            return null;
        }
        
        // Build the API URL with date filters
        const apiUrl = `${this.baseURL}/api/1.0/gui2/${this.paymentDetailKey}/search`;
        
        // Format dates for Fidelo (DD/MM/YYYY)
        const fromParts = dateFrom.split('-');
        const toParts = dateTo.split('-');
        const fideloFromDate = `${fromParts[2]}/${fromParts[1]}/${fromParts[0]}`;
        const fideloToDate = `${toParts[2]}/${toParts[1]}/${toParts[0]}`;
        
        const params = new URLSearchParams({
            'filter[search_time_from_1]': fideloFromDate,
            'filter[search_time_until_1]': fideloToDate,
            'filter[timefilter_basedon]': 'kip.payment_date',
            'limit': '1000',  // Get up to 1000 records
            'offset': '0'
        });
        
        const fullUrl = `${apiUrl}?${params}`;
        console.log('API URL:', fullUrl);
        
        try {
            const response = await axios.get(fullUrl, {
                headers: {
                    'Cookie': this.cookies,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Referer': 'https://ulearn.fidelo.com/'
                },
                timeout: this.timeout,
                validateStatus: (status) => true
            });
            
            if (response.status === 200) {
                console.log('✓ Data received successfully');
                
                // Check the response structure
                if (response.data && response.data.data && response.data.data.body) {
                    const recordCount = response.data.data.body.length;
                    console.log(`  Records found: ${recordCount}`);
                    return response.data;
                } else {
                    console.log('  Warning: Unexpected data structure');
                    return response.data;
                }
            } else {
                console.log(`✗ Error: HTTP ${response.status}`);
                return null;
            }
            
        } catch (error) {
            console.log('✗ Fetch error:', error.message);
            return null;
        }
    }
    
    // Step 3: Import data to MySQL
    async importToDatabase(jsonData) {
        console.log('\n=== Step 3: Importing to MySQL Database ===');
        
        if (!jsonData || !jsonData.data || !jsonData.data.body) {
            console.log('✗ No valid data to import');
            return false;
        }
        
        const payments = jsonData.data.body;
        console.log(`Processing ${payments.length} payment records...`);
        
        // Connect to database
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'hub',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'hub_payroll',
            port: process.env.DB_PORT || 3306,
            charset: 'utf8mb4'
        });
        
        let successCount = 0;
        let updateCount = 0;
        let errorCount = 0;
        
        for (const payment of payments) {
            const items = payment.items;
            if (!items || items.length === 0) continue;
            
            // Extract and clean data
            const paymentData = this.extractPaymentData(items);
            
            try {
                // Check if record exists
                const [existing] = await connection.execute(
                    'SELECT id FROM sales_data WHERE receipt_number = ?',
                    [paymentData.receipt_number]
                );
                
                if (existing.length > 0) {
                    // Update existing
                    await this.updatePaymentRecord(connection, paymentData);
                    updateCount++;
                } else {
                    // Insert new
                    await this.insertPaymentRecord(connection, paymentData);
                    successCount++;
                }
                
            } catch (error) {
                errorCount++;
                if (errorCount <= 5) {
                    console.log(`  Error: ${error.message} (Receipt: ${paymentData.receipt_number})`);
                }
            }
        }
        
        console.log('\nImport Summary:');
        console.log(`  ✓ New records: ${successCount}`);
        console.log(`  ✓ Updated: ${updateCount}`);
        if (errorCount > 0) {
            console.log(`  ✗ Errors: ${errorCount}`);
        }
        
        await connection.end();
        return true;
    }
    
    // Helper: Extract payment data from items array
    extractPaymentData(items) {
        const extractText = (item) => {
            if (!item) return null;
            if (typeof item === 'string') return item;
            if (item.text !== undefined) return item.text;
            if (item.original !== undefined) return item.original;
            return null;
        };
        
        const parseDate = (dateStr) => {
            if (!dateStr || dateStr === '') return null;
            if (dateStr.includes('/')) {
                const [day, month, year] = dateStr.split('/');
                if (year && month && day) {
                    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                }
            }
            if (dateStr.includes('-') && dateStr.length === 10) {
                return dateStr;
            }
            return null;
        };
        
        const cleanCurrency = (value) => {
            if (!value || value === '') return '0.00';
            let cleaned = value.replace(/[€\s]/g, '');
            const isNegative = cleaned.includes('-');
            cleaned = cleaned.replace('-', '');
            cleaned = cleaned.replace(',', '.');
            const num = parseFloat(cleaned);
            if (isNaN(num)) return '0.00';
            return isNegative ? `-${num.toFixed(2)}` : num.toFixed(2);
        };
        
        return {
            surname: extractText(items[0]),
            first_name: extractText(items[1]),
            invoice_numbers: extractText(items[2]),
            student_id: extractText(items[3]),
            payment_method: extractText(items[4]),
            salesperson: extractText(items[6]),
            group: extractText(items[7]),
            student_status: extractText(items[8]),
            agent: extractText(items[9]),
            agency_category: extractText(items[10]),
            agency_number: extractText(items[11]),
            course: extractText(items[12]),
            end: parseDate(extractText(items[13])),
            start: parseDate(extractText(items[14])),
            accommodation: extractText(items[15]),
            start_date: parseDate(extractText(items[16])),
            end_1: parseDate(extractText(items[17])),
            note: extractText(items[18]),
            receipt_number: extractText(items[19]),
            amount: cleanCurrency(extractText(items[20])),
            course_1: cleanCurrency(extractText(items[21])),
            accommodation_1: cleanCurrency(extractText(items[22])),
            transfer: cleanCurrency(extractText(items[23])),
            insurance: cleanCurrency(extractText(items[24])),
            additional_course_fees: cleanCurrency(extractText(items[25])),
            additional_accommodation_fees: cleanCurrency(extractText(items[26])),
            general_additional_fees: cleanCurrency(extractText(items[27])),
            manually_entered_positions: cleanCurrency(extractText(items[28])),
            overpayment: cleanCurrency(extractText(items[29])),
            date: parseDate(extractText(items[30])),
            date_tmp: parseDate(extractText(items[30])),
            method: extractText(items[31]),
            paid_by: extractText(items[32]),
            type: extractText(items[33])
        };
    }
    
    // Helper: Insert new payment record
    async insertPaymentRecord(connection, data) {
        const sql = `
            INSERT INTO sales_data (
                surname, first_name, invoice_numbers, student_id, payment_method,
                salesperson, \`group\`, student_status, agent, agency_category,
                agency_number, course, end, start, accommodation, start_date, end_1,
                note, receipt_number, amount, course_1, accommodation_1, transfer,
                insurance, additional_course_fees, additional_accommodation_fees,
                general_additional_fees, manually_entered_positions, overpayment,
                date, date_tmp, method, paid_by, type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const values = [
            data.surname, data.first_name, data.invoice_numbers, data.student_id,
            data.payment_method, data.salesperson, data.group, data.student_status,
            data.agent, data.agency_category, data.agency_number, data.course,
            data.end, data.start, data.accommodation, data.start_date, data.end_1,
            data.note, data.receipt_number, data.amount, data.course_1,
            data.accommodation_1, data.transfer, data.insurance,
            data.additional_course_fees, data.additional_accommodation_fees,
            data.general_additional_fees, data.manually_entered_positions,
            data.overpayment, data.date, data.date_tmp, data.method,
            data.paid_by, data.type
        ];
        
        await connection.execute(sql, values);
    }
    
    // Helper: Update existing payment record
    async updatePaymentRecord(connection, data) {
        const sql = `
            UPDATE sales_data SET
                surname = ?, first_name = ?, invoice_numbers = ?, student_id = ?,
                payment_method = ?, salesperson = ?, \`group\` = ?, student_status = ?,
                agent = ?, agency_category = ?, agency_number = ?, course = ?,
                end = ?, start = ?, accommodation = ?, start_date = ?, end_1 = ?,
                note = ?, amount = ?, course_1 = ?, accommodation_1 = ?,
                transfer = ?, insurance = ?, additional_course_fees = ?,
                additional_accommodation_fees = ?, general_additional_fees = ?,
                manually_entered_positions = ?, overpayment = ?, date = ?, date_tmp = ?,
                method = ?, paid_by = ?, type = ?
            WHERE receipt_number = ?
        `;
        
        const values = [
            data.surname, data.first_name, data.invoice_numbers, data.student_id,
            data.payment_method, data.salesperson, data.group, data.student_status,
            data.agent, data.agency_category, data.agency_number, data.course,
            data.end, data.start, data.accommodation, data.start_date, data.end_1,
            data.note, data.amount, data.course_1, data.accommodation_1,
            data.transfer, data.insurance, data.additional_course_fees,
            data.additional_accommodation_fees, data.general_additional_fees,
            data.manually_entered_positions, data.overpayment, data.date,
            data.date_tmp, data.method, data.paid_by, data.type,
            data.receipt_number
        ];
        
        await connection.execute(sql, values);
    }
    
    // Main execution method
    async run(dateFrom, dateTo) {
        console.log('========================================');
        console.log('FIDELO PAYMENT DETAIL IMPORT v2.0');
        console.log('========================================');
        
        try {
            // Step 1: Login
            const loginSuccess = await this.login();
            if (!loginSuccess) {
                throw new Error('Login failed - check credentials');
            }
            
            // Step 2: Fetch data
            const paymentData = await this.fetchPaymentDetail(dateFrom, dateTo);
            if (!paymentData) {
                throw new Error('Failed to fetch payment data');
            }
            
            // Optional: Save to file for debugging
            const saveToFile = process.argv.includes('--save');
            if (saveToFile) {
                const filename = `payment-detail-${dateFrom}-to-${dateTo}.json`;
                await fs.writeFile(filename, JSON.stringify(paymentData, null, 2));
                console.log(`\n✓ Data saved to: ${filename}`);
            }
            
            // Step 3: Import to database
            await this.importToDatabase(paymentData);
            
            console.log('\n========================================');
            console.log('✓ IMPORT COMPLETED SUCCESSFULLY');
            console.log('========================================');
            
        } catch (error) {
            console.error('\n✗ Import failed:', error.message);
            process.exit(1);
        }
    }
}

// Main execution
async function main() {
    // Get date range from command line or use defaults
    const dateFrom = process.argv[2] || '2025-09-01';
    const dateTo = process.argv[3] || '2025-10-01';
    
    console.log('Usage: node fetch-payment-detail.js [from-date] [to-date] [--save]');
    console.log('Example: node fetch-payment-detail.js 2025-09-01 2025-10-01 --save\n');
    
    const importer = new FideloPaymentDetailImporter();
    await importer.run(dateFrom, dateTo);
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = FideloPaymentDetailImporter;