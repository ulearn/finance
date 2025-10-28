// Fidelo Pay Teachers API - Fetch and Import
// Version 2.0 - Using session-login.js with dynamic table creation
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const sessionLogin = require('./session-login');
const axios = require('axios');
const https = require('https');
const { generateCompositeKey } = require('./generate-composite-key');

class FideloPayTeachersImporter {
    constructor() {
        this.payTeachersKey = '2962d7de1e4d84081eac5d2e261bb197'; // Pay Teachers endpoint
        this.payTeachersPageUrl = 'https://ulearn.fidelo.com/gui2/page/TsAccounting_teacher_payments';
        this.tableName = 'teacher_payments';
        this.instanceHash = null;

        // Create axios client (same as session-login.js)
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
     * Sanitize column names for MySQL
     * @param {string} name - Original column name
     * @returns {string} - Safe column name
     */
    sanitizeColumnName(name) {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }

    /**
     * Create or update the teacher_payments table dynamically
     * @param {Object} connection - MySQL connection
     * @param {Array} headers - Column headers from API response
     */
    async ensureTableExists(connection, headers) {
        // Create safe column names
        const columnMap = {};
        const dbColumns = [];

        headers.forEach((header, index) => {
            let safeName = this.sanitizeColumnName(header.db_column || header.select_column || `col_${index}`);

            // Handle duplicates
            let finalName = safeName;
            let counter = 1;
            while (dbColumns.includes(finalName)) {
                finalName = `${safeName}_${counter}`;
                counter++;
            }

            columnMap[header.db_column || header.select_column] = finalName;
            dbColumns.push(finalName);
        });

        console.log(`\nEnsuring table ${this.tableName} exists with ${dbColumns.length} columns...`);

        // Check if table exists
        try {
            await connection.execute(`SELECT 1 FROM ${this.tableName} LIMIT 1`);
            console.log(`Table ${this.tableName} exists`);
        } catch (error) {
            // Table doesn't exist, create it
            console.log(`Creating table ${this.tableName}...`);
            const createSQL = `
                CREATE TABLE ${this.tableName} (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    fidelo_id INT,
                    fidelo_style VARCHAR(50),
                    ${dbColumns.map(col => `\`${col}\` TEXT`).join(',\n                    ')},
                    can_auto_populate BOOLEAN DEFAULT FALSE,
                    auto_populate_reason VARCHAR(255),
                    hours_included_this_month DECIMAL(10,2),
                    weekly_pay DECIMAL(10,2),
                    leave_hours DECIMAL(10,2) DEFAULT 0,
                    sick_days INT DEFAULT 0,
                    manager_checked TINYINT(1) DEFAULT 0,
                    email VARCHAR(255),
                    import_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY idx_fidelo_id (fidelo_id),
                    KEY idx_import_date (import_date)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `;

            await connection.execute(createSQL);
            console.log('Table created successfully');
        }

        // Check for missing columns and add them
        const [existingColumns] = await connection.execute(`SHOW COLUMNS FROM ${this.tableName}`);
        const existingColumnNames = existingColumns.map(col => col.Field);

        for (const dbCol of dbColumns) {
            if (!existingColumnNames.includes(dbCol)) {
                console.log(`  Adding missing column: ${dbCol}`);
                await connection.execute(`ALTER TABLE ${this.tableName} ADD COLUMN \`${dbCol}\` TEXT`);
            }
        }

        // Add email column if it doesn't exist
        if (!existingColumnNames.includes('email')) {
            console.log('  Adding email column...');
            try {
                await connection.execute(`ALTER TABLE ${this.tableName} ADD COLUMN email VARCHAR(255)`);
            } catch (error) {
                if (error.errno !== 1060) throw error; // Ignore duplicate column error
            }
        }

        // Add leave_taken column if it doesn't exist (from Zoho)
        if (!existingColumnNames.includes('leave_taken')) {
            console.log('  Adding leave_taken column...');
            try {
                await connection.execute(`ALTER TABLE ${this.tableName} ADD COLUMN leave_taken DECIMAL(10,2) DEFAULT 0`);
            } catch (error) {
                if (error.errno !== 1060) throw error; // Ignore duplicate column error
            }
        }

        // Add leave_balance column if it doesn't exist (from Zoho)
        if (!existingColumnNames.includes('leave_balance')) {
            console.log('  Adding leave_balance column...');
            try {
                await connection.execute(`ALTER TABLE ${this.tableName} ADD COLUMN leave_balance DECIMAL(10,2) DEFAULT 0`);
            } catch (error) {
                if (error.errno !== 1060) throw error; // Ignore duplicate column error
            }
        }

        return { columnMap, dbColumns };
    }

    /**
     * Extract instance_hash from Pay Teachers page
     */
    async getInstanceHash() {
        try {
            console.log('Extracting instance hash...');

            const response = await this.client.get(this.payTeachersPageUrl, {
                headers: { 'Cookie': sessionLogin.getCookieString() }
            });

            if (response.status !== 200) {
                console.log(`✗ Page returned status: ${response.status}`);
                return null;
            }

            // Pattern: aGUI['2962d7de1e4d84081eac5d2e261bb197'].instance_hash = 'HASH';
            const pattern = new RegExp(`aGUI\\['${this.payTeachersKey}'\\]\\.instance_hash\\s*=\\s*'([A-Z0-9]+)'`);
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

    /**
     * Fetch Pay Teachers data from Fidelo
     * @param {string} dateFrom - Start date (YYYY-MM-DD)
     * @param {string} dateTo - End date (YYYY-MM-DD)
     * @returns {Promise<Object>} - API response data
     */
    async fetchPayTeachers(dateFrom, dateTo) {
        console.log('\n=== Fetching Pay Teachers Data ===');
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

        const formData = new URLSearchParams({
            hash: this.payTeachersKey,
            instance_hash: this.instanceHash,
            frontend_view: '0',
            task: 'loadTable',
            loadBars: '0',
            'filter[search_time_from_1]': fideloFromDate,
            'filter[search_time_until_1]': fideloToDate,
            'filter[salary_status]': '0',
            'filter[teacher_fiter]': '0',
            'limit': '1000',
            'offset': '0',
            'orderby[db_column]': 'select_value',
            'orderby[order]': 'ASC'
        });

        try {
            const response = await this.client.post('https://ulearn.fidelo.com/gui2/request', formData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Cookie': sessionLogin.getCookieString(),
                    'Referer': this.payTeachersPageUrl,
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

    /**
     * Clean and format data values
     * @param {string} value - Raw value from API
     * @param {string} columnName - Column name to determine cleaning strategy
     * @returns {string} - Cleaned value
     */
    cleanValue(value, columnName) {
        if (!value) return null;

        // Remove HTML tags
        value = value.replace(/<[^>]*>/g, '');

        // Clean currency values (€20.00 per lesson -> 20.00)
        if (columnName.includes('amount') || columnName.includes('salary') ||
            columnName.includes('rate') || columnName.includes('single_amount')) {
            // Extract numeric value with currency symbol
            const match = value.match(/€?\s*(\d+\.?\d*)/);
            if (match) {
                return `€${parseFloat(match[1]).toFixed(2)}`;
            }
        }

        // Clean lesson counts (3.00 Lessons -> 3.00)
        if (columnName === 'lessons') {
            const match = value.match(/(\d+\.?\d*)\s*Lessons?/i);
            if (match) {
                return parseFloat(match[1]).toFixed(2);
            }
        }

        // Clean hours (3h 0m -> 3.00 or keep as is)
        if (columnName === 'hours') {
            const match = value.match(/(\d+)h\s*(\d+)m/);
            if (match) {
                const hours = parseInt(match[1]);
                const minutes = parseInt(match[2]);
                return (hours + minutes / 60).toFixed(2);
            }
        }

        // Clean student count
        if (columnName === 'count_bookings') {
            const match = value.match(/\d+/);
            if (match) {
                return match[0];
            }
        }

        // Return trimmed value
        return value.trim();
    }

    /**
     * Parse days worked and determine if auto-population logic applies
     * @param {string} daysString - Days string like "Monday, Tuesday, Wednesday"
     * @param {string} weekString - Week string like "Week 35, 25/08/2025 – 31/08/2025"
     * @param {boolean} isFirstWeek - Is this the first week of the payroll period?
     * @param {boolean} isLastWeek - Is this the last week of the payroll period?
     * @returns {Object} - { canAutoPopulate, reason, daysWorked }
     */
    parseDaysAndDetermineAutoPopulation(daysString, weekString, isFirstWeek, isLastWeek) {
        if (!daysString) {
            return { canAutoPopulate: false, reason: 'No days data', daysWorked: [] };
        }

        // Parse days into array
        const daysMap = {
            'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5,
            'saturday': 6, 'sunday': 7
        };

        const daysWorked = daysString
            .toLowerCase()
            .split(',')
            .map(d => d.trim())
            .filter(d => daysMap[d])
            .map(d => daysMap[d])
            .sort((a, b) => a - b);

        if (daysWorked.length === 0) {
            return { canAutoPopulate: false, reason: 'Could not parse days', daysWorked: [] };
        }

        // First week logic: Can auto-populate if ONLY Thursday and/or Friday (4, 5)
        if (isFirstWeek) {
            const onlyThursFri = daysWorked.every(day => day >= 4 && day <= 5);
            if (onlyThursFri) {
                return {
                    canAutoPopulate: true,
                    reason: 'First week: Only Thu/Fri worked',
                    daysWorked
                };
            } else {
                return {
                    canAutoPopulate: false,
                    reason: 'First week: Mixed days (needs manual check)',
                    daysWorked
                };
            }
        }

        // Last week logic: Can auto-populate if ONLY Mon/Tue/Wed (1, 2, 3)
        if (isLastWeek) {
            const onlyMonTueWed = daysWorked.every(day => day >= 1 && day <= 3);
            if (onlyMonTueWed) {
                return {
                    canAutoPopulate: true,
                    reason: 'Last week: Only Mon/Tue/Wed worked',
                    daysWorked
                };
            } else {
                return {
                    canAutoPopulate: false,
                    reason: 'Last week: Mixed days (needs manual check)',
                    daysWorked
                };
            }
        }

        // Middle weeks: Always can auto-populate (full weeks)
        return {
            canAutoPopulate: true,
            reason: 'Full week (no cutoff)',
            daysWorked
        };
    }

    /**
     * Parse week string to extract start/end dates
     * @param {string} weekString - e.g. "Week 35, 25/08/2025 – 31/08/2025"
     * @returns {Object|null} - {start: 'YYYY-MM-DD', end: 'YYYY-MM-DD'}
     */
    parseWeekDates(weekString) {
        const match = weekString.match(/Week \d+, (\d{2})\/(\d{2})\/(\d{4})\s*–\s*(\d{2})\/(\d{2})\/(\d{4})/);
        if (!match) return null;

        const [_, dayFrom, monthFrom, yearFrom, dayTo, monthTo, yearTo] = match;
        return {
            start: `${yearFrom}-${monthFrom}-${dayFrom}`,
            end: `${yearTo}-${monthTo}-${dayTo}`
        };
    }

    /**
     * Import teacher payment data to MySQL
     * @param {Object} jsonData - Response data from Fidelo
     * @param {string} payrollFrom - Actual payroll period start date (YYYY-MM-DD)
     * @param {string} payrollTo - Actual payroll period end date (YYYY-MM-DD)
     * @returns {Promise<boolean>}
     */
    async importToDatabase(jsonData, payrollFrom = null, payrollTo = null) {
        console.log('\n=== Importing to MySQL Database ===');

        if (!jsonData || !jsonData.data || !jsonData.data.body) {
            console.log('✗ No valid data to import');
            return false;
        }

        const headers = jsonData.data.head || [];
        const payments = jsonData.data.body;
        console.log(`Processing ${payments.length} teacher payment records...`);

        // Connect to database
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'hub',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'hub_payroll',
            port: process.env.DB_PORT || 3306,
            charset: 'utf8mb4'
        });

        // Ensure table exists with all columns
        const { columnMap, dbColumns } = await this.ensureTableExists(connection, headers);

        let successCount = 0;
        let updateCount = 0;
        let errorCount = 0;

        // Detect first and last week based on payroll period cutoffs (not Fidelo query range)
        const weeks = [...new Set(payments.map(p => p.items[0]?.text || p.items[0]?.original))];

        // Find first/last weeks that overlap with payroll period
        let firstWeek = null;
        let lastWeek = null;

        if (payrollFrom && payrollTo) {
            for (const weekStr of weeks) {
                const weekDates = this.parseWeekDates(weekStr);
                if (!weekDates) continue;

                // Check if week overlaps with payroll period
                if (weekDates.start <= payrollTo && weekDates.end >= payrollFrom) {
                    // First week should have the EARLIEST start date
                    if (!firstWeek || weekDates.start < this.parseWeekDates(firstWeek).start) {
                        firstWeek = weekStr;
                    }
                    // Last week should have the LATEST end date
                    if (!lastWeek || weekDates.end > this.parseWeekDates(lastWeek).end) {
                        lastWeek = weekStr;
                    }
                }
            }
        } else {
            // Fallback to old logic if no payroll dates provided
            firstWeek = weeks[0];
            lastWeek = weeks[weeks.length - 1];
        }

        console.log(`\nDetected ${weeks.length} unique weeks`);
        console.log(`  First week: ${firstWeek}`);
        console.log(`  Last week: ${lastWeek}`);

        for (const payment of payments) {
            const items = payment.items;
            if (!items || items.length === 0) continue;

            try {
                // Extract data dynamically based on headers
                const rowData = {};
                headers.forEach((header, index) => {
                    const columnName = columnMap[header.db_column || header.select_column];
                    const item = items[index];

                    if (item && columnName) {
                        // Get raw value
                        const rawValue = item.text || item.original || null;
                        // Clean and format the value
                        rowData[columnName] = this.cleanValue(rawValue, columnName);
                    }
                });

                // Get week and days info for auto-population logic
                const weekString = items[0]?.text || items[0]?.original || '';
                const daysString = items[1]?.text || items[1]?.original || '';
                const isFirstWeek = weekString === firstWeek;
                const isLastWeek = weekString === lastWeek;

                // Determine auto-population eligibility
                const autoPopInfo = this.parseDaysAndDetermineAutoPopulation(
                    daysString,
                    weekString,
                    isFirstWeek,
                    isLastWeek
                );

                // Generate composite key for reliable deduplication
                const compositeKey = generateCompositeKey(
                    rowData.firstname,
                    rowData.select_value,
                    rowData.classname,
                    rowData.days
                );

                // Build insert/update data
                const recordData = {
                    fidelo_id: payment.id,
                    composite_key: compositeKey,
                    fidelo_style: payment.style || null,
                    can_auto_populate: autoPopInfo.canAutoPopulate,
                    auto_populate_reason: autoPopInfo.reason,
                    ...rowData
                };

                // Check if record exists (unique by composite_key)
                const [existing] = await connection.execute(
                    `SELECT id FROM ${this.tableName} WHERE composite_key = ?`,
                    [compositeKey]
                );

                if (existing.length > 0) {
                    // Update existing - but preserve manual edits (hours_included_this_month, weekly_pay, leave_hours, sick_days, manager_checked)
                    const fieldsToUpdate = Object.keys(recordData)
                        .filter(key => key !== 'composite_key' &&
                                       key !== 'hours_included_this_month' &&
                                       key !== 'weekly_pay' &&
                                       key !== 'leave_hours' &&
                                       key !== 'sick_days' &&
                                       key !== 'manager_checked');

                    if (fieldsToUpdate.length > 0) {
                        const updateFields = fieldsToUpdate.map(key => `\`${key}\` = ?`).join(', ');
                        const values = fieldsToUpdate.map(key => recordData[key]);
                        values.push(compositeKey);

                        await connection.execute(
                            `UPDATE ${this.tableName} SET ${updateFields} WHERE composite_key = ?`,
                            values
                        );
                    }
                    updateCount++;
                } else {
                    // Insert new
                    const fields = Object.keys(recordData).map(k => `\`${k}\``).join(', ');
                    const placeholders = Object.keys(recordData).map(() => '?').join(', ');
                    const values = Object.values(recordData);

                    await connection.execute(
                        `INSERT INTO ${this.tableName} (${fields}) VALUES (${placeholders})`,
                        values
                    );
                    successCount++;
                }

            } catch (error) {
                errorCount++;
                if (errorCount <= 5) {
                    console.log(`  Error: ${error.message} (ID: ${payment.id})`);
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

    /**
     * Main execution method
     * @param {string} dateFrom - Start date (YYYY-MM-DD)
     * @param {string} dateTo - End date (YYYY-MM-DD)
     */
    async run(dateFrom, dateTo) {
        console.log('========================================');
        console.log('FIDELO PAY TEACHERS IMPORT v2.0');
        console.log('========================================');

        try {
            // Step 1: Try to load existing session
            let sessionLoaded = sessionLogin.loadSession();

            if (!sessionLoaded) {
                // No valid session, login fresh
                const loginSuccess = await sessionLogin.login();
                if (!loginSuccess) {
                    throw new Error('Login failed - check credentials');
                }
            }

            // Step 2: Get instance hash (or use loaded one)
            const hash = await this.getInstanceHash();
            if (!hash) {
                // If hash failed, try logging in again
                console.log('Retrying with fresh login...');
                const loginSuccess = await sessionLogin.login();
                if (!loginSuccess) {
                    throw new Error('Login failed - check credentials');
                }
                const retryHash = await this.getInstanceHash();
                if (!retryHash) {
                    throw new Error('Failed to get instance hash');
                }
            }

            // Step 3: Fetch data
            const teacherData = await this.fetchPayTeachers(dateFrom, dateTo);
            if (!teacherData) {
                throw new Error('Failed to fetch teacher payment data');
            }

            // Optional: Save to file for debugging
            const saveToFile = process.argv.includes('--save');
            if (saveToFile) {
                const filename = `pay-teachers-${dateFrom}-to-${dateTo}.json`;
                await fs.writeFile(filename, JSON.stringify(teacherData, null, 2));
                console.log(`\n✓ Data saved to: ${filename}`);
            }

            // Step 4: Detect payroll period from date range
            const path = require('path');
            const payrollPeriods = require(path.join(__dirname, '../../pay/hourly/payroll-periods'));
            const period = payrollPeriods.PAYROLL_PERIODS_2025.find(p =>
                p.fideloFrom === dateFrom && p.fideloTo === dateTo
            );

            const payrollFrom = period ? period.from : null;
            const payrollTo = period ? period.to : null;

            if (period) {
                console.log(`\n📅 Detected payroll period: ${period.month} (${period.from} to ${period.to})`);
            }

            // Import to database
            await this.importToDatabase(teacherData, payrollFrom, payrollTo);

            console.log('\n========================================');
            console.log('✓ IMPORT COMPLETED SUCCESSFULLY');
            console.log('========================================');

        } catch (error) {
            console.error('\n✗ Import failed:', error.message);
            console.error(error.stack);
            process.exit(1);
        }
    }
}

// Main execution
async function main() {
    // Get date range from command line or use defaults
    const dateFrom = process.argv[2] || '2025-08-25';
    const dateTo = process.argv[3] || '2025-11-02';

    console.log('Usage: node pay-teach.js [from-date] [to-date] [--save]');
    console.log('Example: node pay-teach.js 2025-08-25 2025-11-02 --save\n');

    const importer = new FideloPayTeachersImporter();
    await importer.run(dateFrom, dateTo);
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = FideloPayTeachersImporter;
