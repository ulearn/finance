// Fidelo Payment Detail API - Fetch and Import
// Version 4.0 - Using session-login.js (same as Teacher Hourly Payroll)
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const axios = require('axios');
const https = require('https');
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
const sessionLogin = require('./session-login');

class FideloPaymentDetailImporter {
    constructor() {
        this.baseURL = 'https://ulearn.fidelo.com';
        this.paymentDetailKey = 'e012597a49e0b3d0306f48e499505673';
        this.paymentDetailPageUrl = 'https://ulearn.fidelo.com/gui2/page/Ts_inquiry_payment_details';
        this.instanceHash = null;

        // Create axios client (same as teacher payroll)
        this.client = axios.create({
            timeout: 60000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            })
        });
    }

    /**
     * Extract instance_hash from Payment Detail page
     */
    async getInstanceHash() {
        try {
            console.log('Extracting instance hash...');

            const response = await this.client.get(this.paymentDetailPageUrl, {
                headers: { 'Cookie': sessionLogin.getCookieString() }
            });

            if (response.status !== 200) {
                console.log(`✗ Page returned status: ${response.status}`);
                return null;
            }

            // Pattern: aGUI['e012597a49e0b3d0306f48e499505673'].instance_hash = 'HASH';
            const pattern = new RegExp(`aGUI\\['${this.paymentDetailKey}'\\]\\.instance_hash\\s*=\\s*'([A-Z0-9]+)'`);
            const match = response.data.match(pattern);

            if (match) {
                this.instanceHash = match[1];
                console.log(`✓ Instance hash found: ${this.instanceHash.substring(0, 10)}...`);
                return this.instanceHash;
            }

            console.log('✗ Could not extract instance hash');
            return null;

        } catch (error) {
            console.log('✗ Error getting instance hash:', error.message);
            return null;
        }
    }

    // Step 2: Fetch Payment Detail data
    async fetchPaymentDetail(dateFrom, dateTo) {
        console.log('\n=== Step 2: Fetching Payment Detail Data ===');
        console.log(`Date range: ${dateFrom} to ${dateTo}`);

        if (!this.instanceHash) {
            console.log('✗ No instance hash - call getInstanceHash() first');
            return null;
        }

        // Format dates for Fidelo (DD/MM/YYYY)
        const fromParts = dateFrom.split('-');
        const toParts = dateTo.split('-');
        const fideloFromDate = `${fromParts[2]}/${fromParts[1]}/${fromParts[0]}`;
        const fideloToDate = `${toParts[2]}/${toParts[1]}/${toParts[0]}`;

        // Build POST data (same pattern as teacher payroll)
        const formData = new URLSearchParams({
            hash: this.paymentDetailKey,
            instance_hash: this.instanceHash,
            frontend_view: '0',
            task: 'loadTable',
            loadBars: '0',
            'filter[search_time_from_1]': fideloFromDate,
            'filter[search_time_until_1]': fideloToDate,
            'filter[timefilter_basedon]': 'kip.payment_date',
            'limit': '1000',
            'offset': '0'
        });

        try {
            const response = await this.client.post('https://ulearn.fidelo.com/gui2/request', formData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Cookie': sessionLogin.getCookieString(),
                    'Referer': this.paymentDetailPageUrl,
                    'Origin': 'https://ulearn.fidelo.com',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

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

        } catch (error) {
            console.log('✗ Fetch error:', error.message);
            return null;
        }
    }
    
    // Step 3: Import data to MySQL
    async importToDatabase(jsonData) {
        console.log('\n=== Step 3: Importing to MySQL Database ===');

        // Handle both API response structures
        let payments, headers;
        if (jsonData && jsonData.data && jsonData.data.body) {
            payments = jsonData.data.body;
            headers = jsonData.data.head;
        } else if (jsonData && jsonData.body) {
            payments = jsonData.body;
            headers = jsonData.head;
        } else {
            console.log('✗ No valid data to import');
            return false;
        }

        // Build column index map from headers using db_column + db_alias
        const columnMap = {};
        if (headers && Array.isArray(headers)) {
            headers.forEach((header, index) => {
                if (header.db_column) {
                    // Use db_column + db_alias as key to handle duplicates
                    const key = header.db_alias ? `${header.db_column}_${header.db_alias}` : header.db_column;
                    columnMap[key] = index;

                    // Also store by title for easier lookup
                    if (header.title) {
                        columnMap[`title_${header.title}`] = index;
                    }
                }
            });
            console.log(`Mapped ${Object.keys(columnMap).length} columns from headers`);
        }

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

            // Extract and clean data using column map
            const paymentData = this.extractPaymentData(items, columnMap);

            try {
                // Check if record exists
                const [existing] = await connection.execute(
                    'SELECT id FROM payment_detail WHERE receipt_number = ?',
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
    
    // Helper: Extract payment data from items array using column map
    extractPaymentData(items, columnMap) {
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

        // Helper to get item by column name
        const getByColumn = (columnName) => {
            const index = columnMap[columnName];
            return index !== undefined ? items[index] : null;
        };

        return {
            surname: extractText(getByColumn('lastname_tc_c')),
            first_name: extractText(getByColumn('firstname_tc_c')),
            invoice_numbers: extractText(getByColumn('document_numbers')),
            student_id: extractText(getByColumn('lastname_tc_c_n')),
            payment_method: extractText(getByColumn('payment_method')),
            salesperson: extractText(getByColumn('sales_person_id')),
            group: extractText(getByColumn('short_ts_g')),
            student_status: extractText(getByColumn('status_id_ts_i')),
            agent: extractText(getByColumn('ext_1_ka')),
            agency_category: extractText(getByColumn('name_ka_c')),
            agency_number: extractText(getByColumn('number_ts_an')),
            course: extractText(getByColumn('course_amount')), // Use course_amount (matches CSV format)
            end: parseDate(extractText(getByColumn('course_dates_until'))),
            start: parseDate(extractText(getByColumn('course_dates_from'))),
            accommodation: extractText(getByColumn('accommodation_names_short')),
            start_date: parseDate(extractText(getByColumn('accommodation_dates_from'))),
            end_1: parseDate(extractText(getByColumn('accommodation_dates_until'))),
            note: extractText(getByColumn('comment')),
            receipt_number: extractText(getByColumn('receipt_number')),
            amount: extractText(getByColumn('total_amount')), // Keep raw with € symbol
            course_1: extractText(getByColumn('course_amount')), // Same as course for compatibility
            accommodation_1: extractText(getByColumn('accommodation_amount')),
            transfer: extractText(getByColumn('transfer_amount')),
            insurance: extractText(getByColumn('insurance_amount')),
            additional_course_fees: extractText(getByColumn('additional_course_amount')),
            additional_accommodation_fees: extractText(getByColumn('additional_accommodation_amount')),
            general_additional_fees: extractText(getByColumn('additional_general_amount')),
            manually_entered_positions: extractText(getByColumn('extraPosition_amount')),
            overpayment: extractText(getByColumn('amount_inquiry_kipo')),
            date: parseDate(extractText(getByColumn('date'))),
            method: extractText(getByColumn('name_kpm')),
            paid_by: extractText(getByColumn('sender')),
            type: extractText(getByColumn('type_id_kip'))
        };
    }
    
    // Helper: Insert new payment record
    async insertPaymentRecord(connection, data) {
        const sql = `
            INSERT INTO payment_detail (
                surname, first_name, invoice_numbers, student_id, payment_method,
                salesperson, \`group\`, student_status, agent, agency_category,
                agency_number, course, end, start, accommodation, start_date, end_1,
                note, receipt_number, amount, course_1, accommodation_1, transfer,
                insurance, additional_course_fees, additional_accommodation_fees,
                general_additional_fees, manually_entered_positions, overpayment,
                date, method, paid_by, type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            data.overpayment, data.date, data.method,
            data.paid_by, data.type
        ];

        await connection.execute(sql, values);
    }
    
    // Helper: Update existing payment record
    async updatePaymentRecord(connection, data) {
        const sql = `
            UPDATE payment_detail SET
                surname = ?, first_name = ?, invoice_numbers = ?, student_id = ?,
                payment_method = ?, salesperson = ?, \`group\` = ?, student_status = ?,
                agent = ?, agency_category = ?, agency_number = ?, course = ?,
                end = ?, start = ?, accommodation = ?, start_date = ?, end_1 = ?,
                note = ?, amount = ?, course_1 = ?, accommodation_1 = ?,
                transfer = ?, insurance = ?, additional_course_fees = ?,
                additional_accommodation_fees = ?, general_additional_fees = ?,
                manually_entered_positions = ?, overpayment = ?, date = ?,
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
            data.method, data.paid_by, data.type,
            data.receipt_number
        ];

        await connection.execute(sql, values);
    }
    
    // Main execution method
    async run(dateFrom, dateTo) {
        console.log('========================================');
        console.log('FIDELO PAYMENT DETAIL IMPORT v4.0');
        console.log('========================================');

        try {
            // Step 1: Login using session-login.js (try saved session first)
            console.log('\n=== Step 1: Authenticating with Fidelo ===');

            // Try to load existing session
            const sessionLoaded = sessionLogin.loadSession();
            if (sessionLoaded) {
                console.log('✓ Using saved session');
            } else {
                // No saved session or expired - do fresh login
                console.log('No valid saved session, logging in...');
                const loginSuccess = await sessionLogin.login();
                if (!loginSuccess) {
                    throw new Error('Login failed - check credentials');
                }
            }

            // Step 1.5: Get instance hash
            const instanceHash = await this.getInstanceHash();
            if (!instanceHash) {
                throw new Error('Failed to get instance hash');
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