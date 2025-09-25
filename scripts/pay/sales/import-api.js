// /home/hub/public_html/fins/scripts/pay/sales/import-api.js
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const mysql = require('mysql2/promise');
const axios = require('axios');

class FideloAPIImporter {
    constructor() {
        this.baseURL = 'https://ulearn.fidelo.com/api/1.0/gui2';
        this.apiKey = '4e289ca973cc2b424d58ec10197bd160';
        this.token = process.env.FIDELO_API_TOKEN || '9feb2576ba97b2743550120aa5dd935c';
        
        this.dbConfig = {
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306,
            charset: 'utf8mb4'
        };
    }

    async fetchPayments(dateFrom, dateTo, searchTerm = null) {
        try {
            let url = `${this.baseURL}/${this.apiKey}/search?_token=${this.token}`;
            
            const params = new URLSearchParams();
            if (dateFrom) params.append('filter[date_from]', dateFrom);
            if (dateTo) params.append('filter[date_to]', dateTo);
            if (searchTerm) params.append('filter[search]', searchTerm);
            
            if (params.toString()) {
                url += '&' + params.toString();
            }
            
            console.log('Fetching from API:', url);
            const response = await axios.get(url);
            
            return response.data;
        } catch (error) {
            console.error('API fetch error:', error.message);
            throw error;
        }
    }

    parseAmountDocuments(amountDocs) {
        // Parse the amount_documents field: "103098{|}0{|}2342.00000{|}458.40000{|}0.00000"
        if (!amountDocs) return { course_fee: 0, accommodation_fee: 0 };
        
        const parts = amountDocs.split('{|}');
        return {
            course_fee: parseFloat(parts[2] || 0),
            accommodation_fee: parseFloat(parts[3] || 0),
            other_fees: parseFloat(parts[4] || 0)
        };
    }

    transformAPIData(apiEntry) {
        const fees = this.parseAmountDocuments(apiEntry['amount_documents']);
        
        // Determine channel based on agency
        const channel = (apiEntry['ip.agency'] && apiEntry['ip.agency'] !== '') ? 'B2B' : 'B2C';
        
        return {
            // Map API fields to database columns
            surname: apiEntry['ip.lastname'] || '',
            first_name: apiEntry['ip.firstname'] || '',
            invoice_numbers: apiEntry['document_number'] || '',
            student_id: apiEntry['ip.customerNumber'] || '',
            payment_method: apiEntry['kpm.name'] || '',
            salesperson: apiEntry['sales_person_id'] || '',
            agent: apiEntry['ip.agency'] || null,
            agency_number: apiEntry['agency_number'] || null,
            agency_id: apiEntry['ip.agency_id'] || null,
            receipt_number: apiEntry['receipt_number'] || '',
            amount: parseFloat(apiEntry['amount'] || 0),
            course_fee: fees.course_fee,
            accommodation_fee: fees.accommodation_fee,
            other_fees: fees.other_fees,
            date: apiEntry['ip.date'] || null,
            service_from: apiEntry['ip.service_from'] || null,
            transaction_code: apiEntry['transaction_code'] || '',
            nationality: apiEntry['nationality'] || '',
            channel: channel,
            month_year: apiEntry['ip.date'] ? apiEntry['ip.date'].substring(0, 7) : null,
            data_source: 'fidelo_api',
            api_entry_id: apiEntry['ts_i.id'] || null,
            created_timestamp: apiEntry['ip.created'] || null,
            modified_timestamp: apiEntry['ip.changed'] || null
        };
    }

    async saveToDatabase(records) {
        const connection = await mysql.createConnection(this.dbConfig);
        
        try {
            let successCount = 0;
            let errorCount = 0;
            let duplicateCount = 0;
            
            for (const record of records) {
                try {
                    // Check if record already exists (by receipt_number or api_entry_id)
                    const [existing] = await connection.execute(
                        'SELECT id FROM sales_data WHERE receipt_number = ? OR api_entry_id = ?',
                        [record.receipt_number, record.api_entry_id]
                    );
                    
                    if (existing.length > 0) {
                        duplicateCount++;
                        continue;
                    }
                    
                    // Insert new record
                    const insertSQL = `
                        INSERT INTO sales_data (
                            surname, first_name, invoice_numbers, student_id, 
                            payment_method, salesperson, agent, agency_number, agency_id,
                            receipt_number, amount, course_fee, accommodation_fee,
                            date, service_from, transaction_code, nationality,
                            channel, month_year, data_source, api_entry_id,
                            created_timestamp, modified_timestamp
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;
                    
                    await connection.execute(insertSQL, [
                        record.surname, record.first_name, record.invoice_numbers, record.student_id,
                        record.payment_method, record.salesperson, record.agent, record.agency_number, record.agency_id,
                        record.receipt_number, record.amount, record.course_fee, record.accommodation_fee,
                        record.date, record.service_from, record.transaction_code, record.nationality,
                        record.channel, record.month_year, record.data_source, record.api_entry_id,
                        record.created_timestamp, record.modified_timestamp
                    ]);
                    
                    successCount++;
                } catch (error) {
                    errorCount++;
                    console.error(`Error saving record ${record.receipt_number}:`, error.message);
                }
            }
            
            return { 
                success: successCount, 
                errors: errorCount, 
                duplicates: duplicateCount,
                total: records.length 
            };
            
        } finally {
            await connection.end();
        }
    }

    async importDateRange(dateFrom, dateTo) {
        console.log(`\nImporting payments from ${dateFrom} to ${dateTo}`);
        
        try {
            // Fetch from API
            const apiResponse = await this.fetchPayments(dateFrom, dateTo);
            
            if (!apiResponse.entries || apiResponse.hits === 0) {
                console.log('No payments found for date range');
                return { success: 0, errors: 0, duplicates: 0 };
            }
            
            console.log(`Found ${apiResponse.hits} payments`);
            
            // Transform data
            const records = [];
            for (const [id, entry] of Object.entries(apiResponse.entries)) {
                records.push(this.transformAPIData(entry));
            }
            
            // Save to database
            const result = await this.saveToDatabase(records);
            
            console.log(`Import complete:
  ✓ New records: ${result.success}
  ⚠ Duplicates skipped: ${result.duplicates}
  ✗ Errors: ${result.errors}`);
            
            return result;
            
        } catch (error) {
            console.error('Import failed:', error);
            throw error;
        }
    }

    async importToday() {
        const today = new Date().toISOString().split('T')[0];
        return this.importDateRange(today, today);
    }

    async importYesterday() {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];
        return this.importDateRange(dateStr, dateStr);
    }

    async importLastNDays(days) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        return this.importDateRange(
            startDate.toISOString().split('T')[0],
            endDate.toISOString().split('T')[0]
        );
    }
}

// Export for use in routes
module.exports = FideloAPIImporter;

// Allow command line execution
if (require.main === module) {
    const importer = new FideloAPIImporter();
    
    const args = process.argv.slice(2);
    
    if (args[0] === '--today') {
        importer.importToday().then(console.log).catch(console.error);
    } else if (args[0] === '--yesterday') {
        importer.importYesterday().then(console.log).catch(console.error);
    } else if (args[0] === '--days' && args[1]) {
        importer.importLastNDays(parseInt(args[1])).then(console.log).catch(console.error);
    } else if (args[0] === '--range' && args[1] && args[2]) {
        importer.importDateRange(args[1], args[2]).then(console.log).catch(console.error);
    } else {
        console.log(`
Usage:
  node import-api.js --today              Import today's payments
  node import-api.js --yesterday          Import yesterday's payments
  node import-api.js --days N             Import last N days
  node import-api.js --range FROM TO      Import date range (YYYY-MM-DD)
  
Examples:
  node import-api.js --range 2025-09-01 2025-09-02
  node import-api.js --days 7
        `);
    }
}