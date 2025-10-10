// Zoho People Leave Synchronization
// Location: /home/hub/public_html/fins/scripts/zoho/leave-sync.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mysql = require('mysql2/promise');
const ZohoPeopleAPI = require('./people-api');
const axios = require('axios');

class ZohoLeaveSync {
    constructor() {
        this.zohoAPI = new ZohoPeopleAPI();
        this.hourlyLeaveTypeId = '20211000000126019'; // Hourly Leave type ID
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
     * Get employee ID from Zoho by email
     * @param {string} email - Employee email
     * @returns {Promise<Object|null>} - Employee data with ID
     */
    async getEmployeeByEmail(email) {
        try {
            await this.zohoAPI.loadTokens();

            // Get all employees
            const response = await axios.get(`${this.zohoAPI.baseUrl}/forms/P_EmployeeView/records`, {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${this.zohoAPI.accessToken}`
                }
            });

            if (response.data && Array.isArray(response.data)) {
                const employee = response.data.find(emp =>
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
            }

            return null;
        } catch (error) {
            // Try token refresh once
            if (error.response?.status === 401) {
                await this.zohoAPI.refreshAccessToken();
                return await this.getEmployeeByEmail(email);
            }
            console.error('Error getting employee:', error.response?.data || error.message);
            return null;
        }
    }

    /**
     * Get leave records for employee
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

            // Calculate total "Hourly Leave" taken in 2025
            let totalHourlyLeaveTaken = 0;
            const currentYear = new Date().getFullYear().toString();

            for (const record of leaveRecords) {
                const recordId = Object.keys(record)[0];
                const leaveData = record[recordId][0];

                // Extract employee ID from the Employee_ID field (format: "Name EmployeeID")
                const employeeIdFromRecord = leaveData.Employee_ID ?
                    leaveData.Employee_ID.split(' ').pop() : null;

                // Only count records for THIS specific employee AND "Hourly Leave" type AND Approved status
                if (employeeIdFromRecord === employeeId.toString() &&
                    leaveData.Leavetype === 'Hourly Leave' &&
                    leaveData.ApprovalStatus === 'Approved') {
                    const fromDate = leaveData.From;
                    // Check if this year
                    if (fromDate && fromDate.includes(currentYear)) {
                        const daysTaken = parseFloat(leaveData.Daystaken || 0);
                        totalHourlyLeaveTaken += daysTaken;
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
            console.log(`  Leave balance: ${leaveData.leaveBalance}h`);

            // Update database
            await connection.execute(`
                UPDATE teacher_payments
                SET leave_taken = ?,
                    leave_balance = ?,
                    updated_at = NOW()
                WHERE email = ?
            `, [leaveData.leaveTaken, leaveData.leaveBalance, email]);

            console.log(`✓ Database updated`);

            await connection.end();

            return {
                success: true,
                email: email,
                employeeName: `${employee.firstName} ${employee.lastName}`,
                leaveTaken: leaveData.leaveTaken,
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
