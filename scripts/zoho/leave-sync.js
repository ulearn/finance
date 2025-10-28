// Zoho People Leave Synchronization
// Location: /home/hub/public_html/fins/scripts/zoho/leave-sync.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mysql = require('mysql2/promise');
const ZohoPeopleAPI = require('./people-api');
const axios = require('axios');

class ZohoLeaveSync {
    constructor(options = {}) {
        this.zohoAPI = new ZohoPeopleAPI();
        this.hourlyLeaveTypeId = '20211000000126019'; // Hourly Leave type ID
        this.sickLeaveTypeName = 'Sick Leave'; // Sick Leave type name (from Zoho)
        this.employeeCache = null; // Cache for all employees
        this.cacheTimestamp = null; // When cache was created
        this.cacheTTL = 60 * 60 * 1000; // Cache for 60 minutes
        this.forceRefresh = options.forceRefresh || false; // Bypass cache if true
    }

    /**
     * Get database connection
     */
    async getConnection() {
        return await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });
    }

    /**
     * Get all employees from Zoho (with caching)
     * @returns {Promise<Array>} - Array of all employees
     */
    async getAllEmployees() {
        // Return cached data if still valid (unless forceRefresh is set)
        if (!this.forceRefresh && this.employeeCache && this.cacheTimestamp &&
            (Date.now() - this.cacheTimestamp < this.cacheTTL)) {
            console.log('[ZOHO CACHE] Using cached employee list');
            return this.employeeCache;
        }

        try {
            await this.zohoAPI.loadTokens();
            console.log(this.forceRefresh ? '[ZOHO API] FORCE REFRESH - Fetching all employees...' : '[ZOHO API] Fetching all employees...');

            // Get all employees
            const response = await axios.get(`${this.zohoAPI.baseUrl}/forms/P_EmployeeView/records`, {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${this.zohoAPI.accessToken}`
                }
            });

            if (response.data && Array.isArray(response.data)) {
                // Cache the results
                this.employeeCache = response.data;
                this.cacheTimestamp = Date.now();
                console.log(`[ZOHO CACHE] Cached ${response.data.length} employees`);
                return response.data;
            }

            return [];
        } catch (error) {
            // Try token refresh once
            if (error.response?.status === 401) {
                await this.zohoAPI.refreshAccessToken();
                return await this.getAllEmployees();
            }
            console.error('ERROR: Error getting all employees:', error.response?.data || error.message);

            // If we have cached data and hit API limit, return the cache instead of empty array
            if (this.employeeCache && error.response?.data?.response?.errors?.code === 7073) {
                console.log('[ZOHO CACHE] API limit exceeded - using stale cache');
                return this.employeeCache;
            }

            // If no cache available, return empty array
            return [];
        }
    }

    /**
     * Get employee ID from Zoho by email (uses cache)
     * @param {string} email - Employee email
     * @returns {Promise<Object|null>} - Employee data with ID
     */
    async getEmployeeByEmail(email) {
        try {
            const allEmployees = await this.getAllEmployees();

            const employee = allEmployees.find(emp =>
                emp['Email ID']?.toLowerCase() === email.toLowerCase()
            );

            if (employee) {
                return {
                    employeeId: employee.EmployeeID || employee.recordId,
                    fullRecordId: employee.recordId,
                    firstName: employee['First Name'],
                    lastName: employee['Last Name'],
                    email: employee['Email ID']
                };
            }

            return null;
        } catch (error) {
            console.error('Error getting employee:', error.message);
            return null;
        }
    }

    /**
     * Get leave records for employee within a specific date range
     * @param {string} employeeId - Zoho employee ID
     * @param {string} dateFrom - Start date (YYYY-MM-DD) - optional
     * @param {string} dateTo - End date (YYYY-MM-DD) - optional
     * @returns {Promise<Object>} - Leave data (taken hours and balance)
     */
    async getEmployeeLeaveDataForPeriod(employeeId, dateFrom = null, dateTo = null) {
        try {
            await this.zohoAPI.loadTokens();

            // Get all leave records for this employee
            const response = await axios.get(`${this.zohoAPI.baseUrl.replace('/api', '/people/api')}/forms/leave/getRecords`, {
                params: {
                    sEmpID: employeeId
                },
                headers: {
                    'Authorization': `Zoho-oauthtoken ${this.zohoAPI.accessToken}`
                }
            });

            const leaveRecords = response.data.response.result || [];

            // Calculate total "Hourly Leave" and "Sick Leave Hours" taken in the specified period
            let totalHourlyLeaveTaken = 0;
            let totalSickLeaveTaken = 0;

            // Helper function to parse Zoho dates
            const parseZohoDate = (dateStr) => {
                const parts = dateStr.split('-');
                const months = {
                    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
                    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
                    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
                };
                return `${parts[2]}-${months[parts[1]]}-${parts[0]}`;
            };

            for (const record of leaveRecords) {
                const recordId = Object.keys(record)[0];
                const leaveData = record[recordId][0];

                // Extract employee ID from the Employee_ID field (format: "Name EmployeeID")
                const employeeIdFromRecord = leaveData.Employee_ID ?
                    leaveData.Employee_ID.split(' ').pop() : null;

                // Log ALL leave types for this employee for debugging
                if (employeeIdFromRecord === employeeId.toString()) {
                    console.log(`[ZOHO LEAVE] Employee ${employeeId}: LeaveType="${leaveData.Leavetype}", Status="${leaveData.ApprovalStatus}", Days=${leaveData.Daystaken}, From=${leaveData.From}, To=${leaveData.To}`);
                }

                // Only count records for THIS specific employee AND Approved status
                if (employeeIdFromRecord === employeeId.toString() &&
                    leaveData.ApprovalStatus === 'Approved') {

                    const fromDate = leaveData.From; // Format: "01-Aug-2025"
                    const toDate = leaveData.To;
                    const leaveType = leaveData.Leavetype;

                    // Check if leave falls within the date range
                    if (fromDate) {
                        const leaveStartISO = parseZohoDate(fromDate);
                        const leaveEndISO = toDate ? parseZohoDate(toDate) : leaveStartISO;

                        // Check if leave overlaps with requested period
                        let hasOverlap = true;
                        if (dateFrom && dateTo) {
                            // Leave overlaps if: leaveStart <= dateTo AND leaveEnd >= dateFrom
                            hasOverlap = leaveStartISO <= dateTo && leaveEndISO >= dateFrom;
                        }

                        if (hasOverlap) {
                            const daysTaken = parseFloat(leaveData.Daystaken || 0);

                            // Calculate how many days of this leave fall within the payroll period
                            const periodStart = new Date(dateFrom);
                            const periodEnd = new Date(dateTo);
                            const leaveStart = new Date(leaveStartISO);
                            const leaveEnd = new Date(leaveEndISO);

                            // Find the overlap boundaries
                            const overlapStart = leaveStart > periodStart ? leaveStart : periodStart;
                            const overlapEnd = leaveEnd < periodEnd ? leaveEnd : periodEnd;

                            // Calculate days in overlap (inclusive)
                            const daysInOverlap = Math.floor((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;

                            // Calculate total days in leave period (inclusive)
                            const totalDaysInLeave = Math.floor((leaveEnd - leaveStart) / (1000 * 60 * 60 * 24)) + 1;

                            // Prorate the hours: only count the portion that falls within this period
                            const proratedAmount = (daysInOverlap / totalDaysInLeave) * daysTaken;

                            // Categorize by leave type
                            if (leaveType === 'Hourly Leave') {
                                totalHourlyLeaveTaken += proratedAmount;
                                if (proratedAmount < daysTaken) {
                                    console.log(`[ZOHO LEAVE] ✓ Added ${proratedAmount.toFixed(2)}h to Hourly Leave (${leaveStartISO} to ${leaveEndISO}, prorated ${daysInOverlap}/${totalDaysInLeave} days) - Total: ${totalHourlyLeaveTaken}h`);
                                } else {
                                    console.log(`[ZOHO LEAVE] ✓ Added ${proratedAmount.toFixed(2)}h to Hourly Leave (${leaveStartISO} to ${leaveEndISO}) - Total: ${totalHourlyLeaveTaken}h`);
                                }
                            } else if (leaveType === this.sickLeaveTypeName) {
                                totalSickLeaveTaken += proratedAmount;
                                if (proratedAmount < daysTaken) {
                                    console.log(`[ZOHO LEAVE] ✓ Added ${proratedAmount.toFixed(2)} DAYS to Sick Leave (${leaveStartISO} to ${leaveEndISO}, prorated ${daysInOverlap}/${totalDaysInLeave} days) - Total: ${totalSickLeaveTaken} days`);
                                } else {
                                    console.log(`[ZOHO LEAVE] ✓ Added ${proratedAmount.toFixed(2)} DAYS to Sick Leave (${leaveStartISO} to ${leaveEndISO}) - Total: ${totalSickLeaveTaken} days`);
                                }
                            } else {
                                console.log(`[ZOHO LEAVE] ⚠ Unknown leave type: "${leaveType}" (Expected: "Hourly Leave" or "${this.sickLeaveTypeName}") - not counted`);
                            }
                        } else {
                            console.log(`[ZOHO LEAVE] ✗ Leave outside period: ${leaveStartISO} to ${leaveEndISO} (period: ${dateFrom} to ${dateTo})`);
                        }
                    }
                }
            }

            // Get leave balance from Zoho API (current balance, not period-specific)
            let leaveBalance = 0;

            try {
                const balanceResponse = await axios.get(`${this.zohoAPI.baseUrl.replace('/api', '/people/api')}/leave/getLeaveTypeDetails`, {
                    params: {
                        userId: employeeId
                    },
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${this.zohoAPI.accessToken}`
                    }
                });

                // Parse balance from response
                if (balanceResponse.data && balanceResponse.data.response) {
                    const leaveTypes = balanceResponse.data.response.result || [];
                    const hourlyLeaveType = leaveTypes.find(lt => lt.Name === 'Hourly Leave');
                    if (hourlyLeaveType) {
                        leaveBalance = parseFloat(hourlyLeaveType.BalanceCount || 0);
                    }
                }
            } catch (balanceError) {
                console.log(`Could not fetch balance API for employee ${employeeId}:`, balanceError.response?.data?.errors?.message || balanceError.message);
            }

            console.log(`[ZOHO LEAVE SUMMARY] Period ${dateFrom} to ${dateTo}:`);
            console.log(`  - Hourly Leave: ${totalHourlyLeaveTaken}h`);
            console.log(`  - Sick Leave: ${totalSickLeaveTaken} days`);
            console.log(`  - Leave Balance: ${leaveBalance}h`);

            return {
                leaveTaken: totalHourlyLeaveTaken,
                sickLeaveTaken: totalSickLeaveTaken, // This is in DAYS
                leaveBalance: leaveBalance
            };
        } catch (error) {
            // Try token refresh once
            if (error.response?.status === 401) {
                await this.zohoAPI.refreshAccessToken();
                return await this.getEmployeeLeaveDataForPeriod(employeeId, dateFrom, dateTo);
            }
            console.error('Error getting leave data for period:', error.response?.data || error.message);
            return {
                leaveTaken: 0,
                sickLeaveTaken: 0,
                leaveBalance: 0
            };
        }
    }

    /**
     * Get leave records for employee (year-to-date)
     * @param {string} employeeId - Zoho employee ID
     * @returns {Promise<Object>} - Leave data (taken hours and balance)
     */
    async getEmployeeLeaveData(employeeId) {
        try {
            await this.zohoAPI.loadTokens();

            // Get all leave records for this employee
            const response = await axios.get(`${this.zohoAPI.baseUrl.replace('/api', '/people/api')}/forms/leave/getRecords`, {
                params: {
                    sEmpID: employeeId
                },
                headers: {
                    'Authorization': `Zoho-oauthtoken ${this.zohoAPI.accessToken}`
                }
            });

            const leaveRecords = response.data.response.result || [];

            // Calculate total "Hourly Leave" (in hours) and "Sick Leave" (in days) taken in 2025
            // NOTE: Hourly Leave is stored as hours in Zoho, Sick Leave is stored as days
            let totalHourlyLeaveTaken = 0;
            let totalSickDaysTaken = 0; // This is in DAYS, not hours
            const currentYear = new Date().getFullYear().toString();

            for (const record of leaveRecords) {
                const recordId = Object.keys(record)[0];
                const leaveData = record[recordId][0];

                // Extract employee ID from the Employee_ID field (format: "Name EmployeeID")
                const employeeIdFromRecord = leaveData.Employee_ID ?
                    leaveData.Employee_ID.split(' ').pop() : null;

                // Only count records for THIS specific employee AND Approved status
                if (employeeIdFromRecord === employeeId.toString() &&
                    leaveData.ApprovalStatus === 'Approved') {
                    const fromDate = leaveData.From;
                    const leaveType = leaveData.Leavetype;

                    // Check if this year
                    if (fromDate && fromDate.includes(currentYear)) {
                        const amountTaken = parseFloat(leaveData.Daystaken || 0);

                        if (leaveType === 'Hourly Leave') {
                            // Hourly Leave: stored as hours in Zoho
                            totalHourlyLeaveTaken += amountTaken;
                        } else if (leaveType === this.sickLeaveTypeName) {
                            // Sick Leave: stored as DAYS in Zoho (e.g., 1.0, 0.5, 0.25)
                            totalSickDaysTaken += amountTaken;
                        }
                    }
                }
            }

            // Get leave balance from Zoho API
            let leaveBalance = 0;
            let leaveTakenFromZoho = 0;

            try {
                const balanceResponse = await axios.get(`${this.zohoAPI.baseUrl.replace('/api', '/people/api')}/leave/getLeaveTypeDetails`, {
                    params: {
                        userId: employeeId
                    },
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${this.zohoAPI.accessToken}`
                    }
                });

                // Parse balance from response
                if (balanceResponse.data && balanceResponse.data.response) {
                    const leaveTypes = balanceResponse.data.response.result || [];
                    const hourlyLeaveType = leaveTypes.find(lt => lt.Name === 'Hourly Leave');
                    if (hourlyLeaveType) {
                        // BalanceCount = Available balance (e.g., 58.72)
                        leaveBalance = parseFloat(hourlyLeaveType.BalanceCount || 0);
                        // AvailedCount = Leave taken/booked (e.g., 30)
                        leaveTakenFromZoho = parseFloat(hourlyLeaveType.AvailedCount || 0);
                    }
                }
            } catch (balanceError) {
                console.log(`Could not fetch balance API for employee ${employeeId}:`, balanceError.response?.data?.errors?.message || balanceError.message);
                // If balance API fails, fall back to calculated leave taken from records
            }

            // Use Zoho's AvailedCount if available, otherwise use calculated from records
            const finalLeaveTaken = leaveTakenFromZoho > 0 ? leaveTakenFromZoho : totalHourlyLeaveTaken;

            return {
                leaveTaken: finalLeaveTaken,
                sickDaysTaken: totalSickDaysTaken, // DAYS, not hours
                leaveBalance: leaveBalance
            };
        } catch (error) {
            // Try token refresh once
            if (error.response?.status === 401) {
                await this.zohoAPI.refreshAccessToken();
                return await this.getEmployeeLeaveData(employeeId);
            }
            console.error('Error getting leave data:', error.response?.data || error.message);
            return {
                leaveTaken: 0,
                sickDaysTaken: 0,
                leaveBalance: 0
            };
        }
    }

    /**
     * Update leave data for a single teacher in database
     * @param {string} email - Teacher email
     * @returns {Promise<Object>} - Update result
     */
    async updateTeacherLeaveData(email) {
        const connection = await this.getConnection();

        try {
            console.log(`\n=== Processing ${email} ===`);

            // Get employee from Zoho
            const employee = await this.getEmployeeByEmail(email);

            if (!employee) {
                console.log(`✗ Employee not found in Zoho: ${email}`);
                return {
                    success: false,
                    email: email,
                    error: 'Employee not found in Zoho'
                };
            }

            console.log(`✓ Found: ${employee.firstName} ${employee.lastName} (ID: ${employee.employeeId})`);

            // Get leave data
            const leaveData = await this.getEmployeeLeaveData(employee.employeeId);
            console.log(`  Leave taken: ${leaveData.leaveTaken}h`);
            console.log(`  Sick days taken: ${leaveData.sickDaysTaken} days`);
            console.log(`  Leave balance: ${leaveData.leaveBalance}h`);

            // Update database - store sick leave as DAYS
            await connection.execute(`
                UPDATE teacher_payments
                SET leave_taken = ?,
                    sick_days = ?,
                    leave_balance = ?,
                    updated_at = NOW()
                WHERE email = ?
            `, [leaveData.leaveTaken, leaveData.sickDaysTaken, leaveData.leaveBalance, email]);

            console.log(`✓ Database updated`);

            await connection.end();

            return {
                success: true,
                email: email,
                employeeName: `${employee.firstName} ${employee.lastName}`,
                leaveTaken: leaveData.leaveTaken,
                sickDaysTaken: leaveData.sickDaysTaken,
                leaveBalance: leaveData.leaveBalance
            };
        } catch (error) {
            await connection.end();
            console.error(`Error updating leave for ${email}:`, error.message);
            return {
                success: false,
                email: email,
                error: error.message
            };
        }
    }

    /**
     * Calculate and update leave balance for a payroll period
     * Formula: new_balance = start_balance + leave_accrued - leave_taken
     * @param {string} email - Teacher email
     * @param {string} dateFrom - Period start date (YYYY-MM-DD)
     * @param {string} dateTo - Period end date (YYYY-MM-DD)
     * @param {string} updateDate - Date to record the balance update (usually last Wednesday of month)
     * @returns {Promise<Object>} - Update result
     */
    async calculateAndUpdateLeaveBalance(email, dateFrom, dateTo, updateDate) {
        try {
            console.log(`\n=== Calculating leave balance for ${email} ===`);
            console.log(`Period: ${dateFrom} to ${dateTo}`);
            console.log(`Update date: ${updateDate}`);

            // Get employee from Zoho
            const employee = await this.getEmployeeByEmail(email);

            if (!employee) {
                return {
                    success: false,
                    email: email,
                    error: 'Employee not found in Zoho'
                };
            }

            console.log(`✓ Found: ${employee.firstName} ${employee.lastName} (ID: ${employee.employeeId})`);

            // Get balance as of the START of the period (not current balance)
            const startBalance = await this.zohoAPI.getLeaveBalanceAsOfDate(
                employee.fullRecordId,
                this.hourlyLeaveTypeId,
                dateFrom
            );
            console.log(`Start Balance (as of ${dateFrom}): ${startBalance}h`);

            // Get leave taken during this period
            const periodLeave = await this.getEmployeeLeaveDataForPeriod(
                employee.employeeId,
                dateFrom,
                dateTo
            );
            const leaveTaken = periodLeave.leaveTaken;
            console.log(`Leave Taken (period): ${leaveTaken}h`);

            // Calculate leave accrued (8% of hours worked)
            const connection = await this.getConnection();
            const [rows] = await connection.execute(`
                SELECT SUM(
                    COALESCE(hours_included_this_month,
                        CASE WHEN can_auto_populate = 1
                            THEN CAST(hours AS DECIMAL(10,2))
                            ELSE 0
                        END)
                ) as total_hours
                FROM teacher_payments
                WHERE email = ?
                AND select_value IN (
                    SELECT DISTINCT select_value
                    FROM teacher_payments
                    WHERE STR_TO_DATE(SUBSTRING_INDEX(SUBSTRING_INDEX(select_value, ', ', -1), ' – ', 1), '%d/%m/%Y') >= ?
                    AND STR_TO_DATE(SUBSTRING_INDEX(select_value, ' – ', -1), '%d/%m/%Y') <= ?
                )
            `, [email, dateFrom, dateTo]);

            const hoursWorked = parseFloat(rows[0]?.total_hours || 0);
            const leaveAccrued = hoursWorked * 0.08;
            console.log(`Hours Worked (period): ${hoursWorked.toFixed(2)}h`);
            console.log(`Leave Accrued (8%): ${leaveAccrued.toFixed(2)}h`);

            await connection.end();

            // Calculate new balance
            const newBalance = startBalance + leaveAccrued - leaveTaken;
            console.log(`\nCalculation: ${startBalance} + ${leaveAccrued.toFixed(2)} - ${leaveTaken} = ${newBalance.toFixed(2)}h`);

            // Update balance in Zoho
            console.log(`\nUpdating balance in Zoho...`);

            // Format date as dd-MMM-yyyy for Zoho API
            const dateObj = new Date(updateDate);
            const formattedDate = dateObj.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });

            const updateSuccess = await this.zohoAPI.updateEmployeeLeaveBalance(
                employee.fullRecordId || employee.employeeId,
                this.hourlyLeaveTypeId,
                newBalance,
                formattedDate,
                `Payroll period ${dateFrom} to ${dateTo}`
            );

            if (updateSuccess) {
                console.log(`✓ Balance updated successfully in Zoho`);

                return {
                    success: true,
                    email: email,
                    employeeName: `${employee.firstName} ${employee.lastName}`,
                    startBalance: startBalance,
                    hoursWorked: hoursWorked,
                    leaveAccrued: leaveAccrued,
                    leaveTaken: leaveTaken,
                    newBalance: newBalance,
                    updateDate: updateDate
                };
            } else {
                console.log(`✗ Failed to update balance in Zoho`);
                return {
                    success: false,
                    email: email,
                    error: 'Failed to update balance in Zoho'
                };
            }

        } catch (error) {
            console.error(`Error calculating/updating balance for ${email}:`, error.message);
            return {
                success: false,
                email: email,
                error: error.message
            };
        }
    }

    /**
     * Calculate and update leave balances for all teachers in a payroll period
     * @param {string} dateFrom - Period start date (YYYY-MM-DD)
     * @param {string} dateTo - Period end date (YYYY-MM-DD)
     * @param {string} updateDate - Date to record the balance update (last Wednesday of month)
     * @returns {Promise<Object>} - Update results
     */
    async updateAllLeaveBalancesForPeriod(dateFrom, dateTo, updateDate) {
        const connection = await this.getConnection();

        try {
            // Get only teachers who worked during this specific payroll period
            const [teachers] = await connection.execute(`
                SELECT DISTINCT email, firstname
                FROM teacher_payments
                WHERE email IS NOT NULL AND email != ''
                AND select_value IN (
                    SELECT DISTINCT select_value
                    FROM teacher_payments
                    WHERE STR_TO_DATE(SUBSTRING_INDEX(SUBSTRING_INDEX(select_value, ', ', -1), ' – ', 1), '%d/%m/%Y') >= ?
                    AND STR_TO_DATE(SUBSTRING_INDEX(select_value, ' – ', -1), '%d/%m/%Y') <= ?
                )
                ORDER BY firstname
            `, [dateFrom, dateTo]);

            console.log(`\n=== Updating leave balances for ${teachers.length} teachers who worked in this period ===`);
            console.log(`Period: ${dateFrom} to ${dateTo}`);
            console.log(`Update date: ${updateDate}\n`);

            const results = [];
            let successCount = 0;
            let failCount = 0;

            for (const teacher of teachers) {
                const result = await this.calculateAndUpdateLeaveBalance(
                    teacher.email,
                    dateFrom,
                    dateTo,
                    updateDate
                );

                results.push(result);

                if (result.success) {
                    successCount++;
                } else {
                    failCount++;
                }

                // Rate limiting: wait 500ms between requests
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            await connection.end();

            console.log(`\n=== Balance Update Complete ===`);
            console.log(`✓ Success: ${successCount}`);
            console.log(`✗ Failed: ${failCount}`);

            return {
                success: true,
                period: { from: dateFrom, to: dateTo, updateDate: updateDate },
                totalProcessed: teachers.length,
                successCount: successCount,
                failCount: failCount,
                results: results
            };

        } catch (error) {
            await connection.end();
            console.error('Error updating leave balances:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Sync leave data for all teachers with email addresses
     * @returns {Promise<Object>} - Sync results
     */
    async syncAllTeachersLeave() {
        const connection = await this.getConnection();

        try {
            // Get all teachers with email addresses
            const [teachers] = await connection.execute(`
                SELECT DISTINCT email, firstname
                FROM teacher_payments
                WHERE email IS NOT NULL AND email != ''
                ORDER BY firstname
            `);

            console.log(`\n=== Starting leave sync for ${teachers.length} teachers ===\n`);

            const results = [];
            let successCount = 0;
            let failCount = 0;

            for (const teacher of teachers) {
                const result = await this.updateTeacherLeaveData(teacher.email);
                results.push(result);

                if (result.success) {
                    successCount++;
                } else {
                    failCount++;
                }

                // Rate limiting: wait 500ms between requests
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            await connection.end();

            console.log(`\n=== Sync Complete ===`);
            console.log(`✓ Success: ${successCount}`);
            console.log(`✗ Failed: ${failCount}`);

            return {
                success: true,
                totalProcessed: teachers.length,
                successCount: successCount,
                failCount: failCount,
                results: results
            };
        } catch (error) {
            await connection.end();
            console.error('Error syncing leave data:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = ZohoLeaveSync;
