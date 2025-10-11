// Teacher Hourly Payroll Dashboard API
// Location: /home/hub/public_html/fins/scripts/pay/hourly/dashboard.js
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const payrollPeriods = require('./payroll-periods');

/**
 * Get database connection
 */
async function getConnection() {
    return await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'hub_payroll',
        port: process.env.DB_PORT || 3306
    });
}

/**
 * GET /api/teachers/periods
 * Get all available payroll periods
 */
router.get('/periods', async (req, res) => {
    try {
        const current = payrollPeriods.getCurrentPeriod();
        res.json({
            success: true,
            data: {
                periods: payrollPeriods.PAYROLL_PERIODS_2025,
                current: current
            }
        });
    } catch (error) {
        console.error('Error fetching periods:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/teachers/data
 * Fetch all teacher payment data grouped by teacher and week
 */
router.get('/data', async (req, res) => {
    let connection;
    try {
        connection = await getConnection();

        const query = `
            SELECT
                t.fidelo_id,
                t.select_value as week,
                t.days,
                t.firstname as teacher_name,
                t.email,
                t.pps_number,
                t.classname as class_name,
                t.course_list as courses,
                t.count_bookings as student_count,
                t.lessons,
                t.hours,
                t.single_amount as rate_per_lesson,
                t.amount as salary_amount,
                t.costcategory_id as cost_category,
                t.can_auto_populate,
                t.auto_populate_reason,
                t.hours_included_this_month,
                t.weekly_pay,
                t.leave_hours,
                t.sick_days,
                t.other,
                t.impact_bonus,
                t.manager_checked,
                t.import_date
            FROM teacher_payments t
            INNER JOIN (
                SELECT
                    firstname,
                    select_value,
                    classname,
                    days,
                    MAX(import_date) as latest_import
                FROM teacher_payments
                WHERE firstname NOT IN ('DOS, ULearn', 'ADoS, ULearn')
                GROUP BY firstname, select_value, classname, days
            ) latest
            ON t.firstname = latest.firstname
            AND t.select_value = latest.select_value
            AND t.classname = latest.classname
            AND t.days = latest.days
            AND t.import_date = latest.latest_import
            WHERE t.firstname NOT IN ('DOS, ULearn', 'ADoS, ULearn')
            ORDER BY t.select_value ASC, t.firstname ASC
        `;

        const [rows] = await connection.execute(query);

        // Helper function to reverse "Surname, First Name" to "First Name Surname"
        const reverseName = (name) => {
            if (!name || !name.includes(',')) return name;
            const parts = name.split(',').map(p => p.trim());
            return parts.length === 2 ? `${parts[1]} ${parts[0]}` : name;
        };

        // Group data by teacher and week
        const teacherData = {};
        const weeks = new Set();

        rows.forEach(row => {
            const teacher = reverseName(row.teacher_name);
            const week = row.week;

            weeks.add(week);

            if (!teacherData[teacher]) {
                teacherData[teacher] = {
                    teacher_name: teacher,
                    email: row.email,
                    pps_number: row.pps_number || 'N/A',
                    weeks: {},
                    total_hours: 0,
                    average_rate: 0,
                    total_pay: 0
                };
            }

            // Parse numeric values
            const hours = parseFloat(row.hours) || 0;
            const rateMatch = row.rate_per_lesson?.match(/[\d.]+/);
            const rate = rateMatch ? parseFloat(rateMatch[0]) : 0;
            const salaryMatch = row.salary_amount?.match(/[\d.]+/);
            const salary = salaryMatch ? parseFloat(salaryMatch[0]) : 0;

            // Aggregate week data for this teacher
            if (!teacherData[teacher].weeks[week]) {
                teacherData[teacher].weeks[week] = {
                    total_hours: 0,
                    total_salary: 0,
                    rate: rate,
                    can_auto_populate: row.can_auto_populate,
                    auto_populate_reason: row.auto_populate_reason,
                    hours_included_this_month: row.hours_included_this_month || null,
                    weekly_pay: row.weekly_pay || null,
                    leave_hours: row.leave_hours || 0,
                    sick_days: row.sick_days || 0,
                    other: row.other || 0,
                    impact_bonus: row.impact_bonus || 0,
                    manager_checked: row.manager_checked || 0,
                    classes: []
                };
            } else {
                // Update can_auto_populate to most restrictive (if any row is 0, set to 0)
                if (row.can_auto_populate === 0) {
                    teacherData[teacher].weeks[week].can_auto_populate = 0;
                    teacherData[teacher].weeks[week].auto_populate_reason = row.auto_populate_reason;
                }
                // Update manager_checked to true if any row is checked
                if (row.manager_checked === 1) {
                    teacherData[teacher].weeks[week].manager_checked = 1;
                }
            }

            teacherData[teacher].weeks[week].total_hours += hours;
            teacherData[teacher].weeks[week].total_salary += salary;
            teacherData[teacher].weeks[week].classes.push({
                class_name: row.class_name,
                hours: hours,
                students: row.student_count,
                days: row.days
            });
        });

        // Calculate totals
        Object.values(teacherData).forEach(teacher => {
            let totalHours = 0;
            let totalPay = 0;
            let rateSum = 0;
            let rateCount = 0;

            Object.values(teacher.weeks).forEach(week => {
                const hoursToInclude = week.hours_included_this_month !== null
                    ? parseFloat(week.hours_included_this_month)
                    : (week.can_auto_populate ? week.total_hours : 0);

                totalHours += hoursToInclude;

                if (week.weekly_pay !== null) {
                    totalPay += parseFloat(week.weekly_pay);
                } else if (week.can_auto_populate) {
                    totalPay += week.total_salary;
                }

                if (week.rate > 0) {
                    rateSum += week.rate;
                    rateCount++;
                }
            });

            teacher.total_hours = totalHours;
            teacher.total_pay = totalPay;
            teacher.average_rate = rateCount > 0 ? rateSum / rateCount : 0;
        });

        res.json({
            success: true,
            data: {
                teachers: Object.values(teacherData),
                weeks: Array.from(weeks).sort()
            }
        });

    } catch (error) {
        console.error('Error fetching teacher data:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * POST /api/teachers/update-hours
 * Update hours_included_this_month, weekly_pay, leave_hours, sick_days, other, and impact_bonus for a specific teacher/week
 */
router.post('/update-hours', async (req, res) => {
    let connection;
    try {
        const { teacher_name, week, hours_included, weekly_pay, leave_hours, sick_days, other, impact_bonus } = req.body;

        if (!teacher_name || !week) {
            return res.status(400).json({
                success: false,
                error: 'teacher_name and week are required'
            });
        }

        connection = await getConnection();

        // Reverse name back to "Surname, First Name" format for database lookup
        const reverseNameBack = (name) => {
            if (!name || !name.includes(' ')) return name;
            const parts = name.split(' ');
            if (parts.length === 2) {
                return `${parts[1]}, ${parts[0]}`;
            }
            // Handle names with more than 2 parts (e.g., "First Middle Last")
            const lastName = parts[parts.length - 1];
            const firstNames = parts.slice(0, -1).join(' ');
            return `${lastName}, ${firstNames}`;
        };

        const dbName = reverseNameBack(teacher_name);

        const query = `
            UPDATE teacher_payments
            SET
                hours_included_this_month = ?,
                weekly_pay = ?,
                leave_hours = ?,
                sick_days = ?,
                other = ?,
                impact_bonus = ?,
                manager_checked = 1,
                updated_at = NOW()
            WHERE firstname = ? AND select_value = ?
        `;

        await connection.execute(query, [
            hours_included,
            weekly_pay,
            leave_hours || 0,
            sick_days || 0,
            other || 0,
            impact_bonus || 0,
            dbName,
            week
        ]);

        res.json({
            success: true,
            message: 'Hours updated successfully'
        });

    } catch (error) {
        console.error('Error updating hours:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * GET /api/teachers/summary
 * Get final payroll summary (Teacher | Hours | Rate | Pay)
 */
router.get('/summary', async (req, res) => {
    let connection;
    try {
        connection = await getConnection();

        const query = `
            SELECT
                firstname as teacher_name,
                MAX(email) as email,
                SUM(COALESCE(hours_included_this_month,
                    CASE WHEN can_auto_populate = 1 THEN CAST(hours AS DECIMAL(10,2)) ELSE 0 END)) as total_hours,
                AVG(CAST(REPLACE(REPLACE(single_amount, '€', ''), ',', '.') AS DECIMAL(10,2))) as average_rate,
                SUM(COALESCE(weekly_pay,
                    CASE WHEN can_auto_populate = 1 THEN CAST(REPLACE(REPLACE(amount, '€', ''), ',', '.') AS DECIMAL(10,2)) ELSE 0 END)) as total_pay,
                SUM(COALESCE(leave_hours, 0)) as leave_hours_fidelo,
                MAX(COALESCE(sick_days, 0)) as sick_days,
                MAX(COALESCE(leave_taken, 0)) as leave_taken,
                MAX(COALESCE(leave_balance, 0)) as leave_balance
            FROM teacher_payments
            WHERE firstname NOT IN ('DOS, ULearn', 'ADoS, ULearn')
            GROUP BY firstname
            HAVING total_hours > 0
            ORDER BY firstname ASC
        `;

        const [rows] = await connection.execute(query);

        // Helper function to reverse "Surname, First Name" to "First Name Surname"
        const reverseName = (name) => {
            if (!name || !name.includes(',')) return name;
            const parts = name.split(',').map(p => p.trim());
            return parts.length === 2 ? `${parts[1]} ${parts[0]}` : name;
        };

        // Reverse names in results
        rows.forEach(row => {
            row.teacher_name = reverseName(row.teacher_name);
        });

        res.json({
            success: true,
            data: rows
        });

    } catch (error) {
        console.error('Error fetching summary:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * POST /api/teachers/refresh
 * Trigger data refresh from Fidelo API
 */
/**
 * POST /api/teachers/update-email
 * Update teacher email
 */
router.post('/update-email', async (req, res) => {
    let connection;
    try {
        const { teacher_name, email } = req.body;

        if (!teacher_name) {
            return res.status(400).json({
                success: false,
                error: 'teacher_name is required'
            });
        }

        connection = await getConnection();

        // Reverse name back to "Surname, First Name" format
        const reverseNameBack = (name) => {
            if (!name || !name.includes(' ')) return name;
            const parts = name.split(' ');
            if (parts.length === 2) {
                return `${parts[1]}, ${parts[0]}`;
            }
            const lastName = parts[parts.length - 1];
            const firstNames = parts.slice(0, -1).join(' ');
            return `${lastName}, ${firstNames}`;
        };

        const dbName = reverseNameBack(teacher_name);

        await connection.execute(
            `UPDATE teacher_payments SET email = ?, updated_at = NOW() WHERE firstname = ?`,
            [email || null, dbName]
        );

        res.json({
            success: true,
            message: 'Email updated successfully'
        });

    } catch (error) {
        console.error('Error updating email:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * POST /api/teachers/update-pps
 * Update teacher PPS number
 */
router.post('/update-pps', async (req, res) => {
    let connection;
    try {
        const { teacher_name, pps_number } = req.body;

        if (!teacher_name) {
            return res.status(400).json({
                success: false,
                error: 'teacher_name is required'
            });
        }

        connection = await getConnection();

        // Reverse name back to "Surname, First Name" format
        const reverseNameBack = (name) => {
            if (!name || !name.includes(' ')) return name;
            const parts = name.split(' ');
            if (parts.length === 2) {
                return `${parts[1]}, ${parts[0]}`;
            }
            const lastName = parts[parts.length - 1];
            const firstNames = parts.slice(0, -1).join(' ');
            return `${lastName}, ${firstNames}`;
        };

        const dbName = reverseNameBack(teacher_name);

        await connection.execute(
            `UPDATE teacher_payments SET pps_number = ?, updated_at = NOW() WHERE firstname = ?`,
            [pps_number || null, dbName]
        );

        res.json({
            success: true,
            message: 'PPS number updated successfully'
        });

    } catch (error) {
        console.error('Error updating PPS:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

router.post('/refresh', async (req, res) => {
    try {
        const { dateFrom, dateTo } = req.body;

        console.log(`[REFRESH REQUEST] Received refresh request for ${dateFrom} to ${dateTo}`);

        if (!dateFrom || !dateTo) {
            console.log('[REFRESH ERROR] Missing dateFrom or dateTo');
            return res.status(400).json({
                success: false,
                error: 'dateFrom and dateTo are required (format: YYYY-MM-DD)'
            });
        }

        // Spawn the import process
        const { spawn } = require('child_process');
        const scriptPath = require('path').join(__dirname, '../../fidelo/login/pay-teach.js');

        console.log(`[REFRESH] Spawning process: node ${scriptPath} ${dateFrom} ${dateTo}`);

        const childProcess = spawn('node', [scriptPath, dateFrom, dateTo], {
            detached: true,
            stdio: 'ignore'
        });

        childProcess.unref();

        console.log(`[REFRESH] Background process spawned with PID: ${childProcess.pid}`);

        res.json({
            success: true,
            message: 'Data refresh initiated',
            dateRange: { from: dateFrom, to: dateTo }
        });

    } catch (error) {
        console.error('[REFRESH ERROR]', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/teachers/reset-week
 * Reset week to allow Fidelo to overwrite on next refresh
 */
/**
 * GET /api/teachers/leave-for-period
 * Get leave taken for all teachers in a specific period
 */
router.get('/leave-for-period', async (req, res) => {
    let connection;
    try {
        const { dateFrom, dateTo, forceRefresh } = req.query;

        if (!dateFrom || !dateTo) {
            return res.status(400).json({
                success: false,
                error: 'dateFrom and dateTo query parameters are required (format: YYYY-MM-DD)'
            });
        }

        connection = await getConnection();

        // Get all teachers with email addresses
        const [teachers] = await connection.execute(`
            SELECT DISTINCT email, firstname
            FROM teacher_payments
            WHERE email IS NOT NULL AND email != ''
            ORDER BY firstname
        `);

        const ZohoLeaveSync = require('../../zoho/leave-sync');
        const leaveSync = new ZohoLeaveSync({ forceRefresh: forceRefresh === 'true' });

        const leaveData = {};

        // For each teacher, get their leave taken in the period
        for (const teacher of teachers) {
            try {
                console.log(`\n[LEAVE API] Processing ${teacher.email} for period ${dateFrom} to ${dateTo}`);

                // Get employee from Zoho
                const employee = await leaveSync.getEmployeeByEmail(teacher.email);

                if (employee) {
                    console.log(`[LEAVE API] Found employee: ${employee.firstName} ${employee.lastName} (ID: ${employee.employeeId})`);

                    // Get leave data for this specific period
                    const periodLeave = await leaveSync.getEmployeeLeaveDataForPeriod(
                        employee.employeeId,
                        dateFrom,
                        dateTo
                    );

                    console.log(`[LEAVE API] Leave taken: ${periodLeave.leaveTaken}h, Sick leave: ${periodLeave.sickLeaveTaken}h`);

                    // Store by EMAIL (reliable identifier) - now includes both leave and sick leave
                    leaveData[teacher.email] = {
                        leave: periodLeave.leaveTaken,
                        sick: periodLeave.sickLeaveTaken
                    };

                    console.log(`[LEAVE API] Stored as: ${teacher.email} = ${periodLeave.leaveTaken}h leave, ${periodLeave.sickLeaveTaken}h sick`);
                } else {
                    console.log(`[LEAVE API] Employee not found in Zoho: ${teacher.email}`);
                }

                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.error(`[LEAVE API] Error fetching leave for ${teacher.email}:`, error.message);
            }
        }

        await connection.end();

        res.json({
            success: true,
            data: leaveData,
            period: { from: dateFrom, to: dateTo }
        });

    } catch (error) {
        console.error('Error fetching leave for period:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * GET /api/teachers/pps-for-teachers
 * Get PPS numbers for all teachers from Zoho
 * Returns: { "email@example.com": "1234567A", ... }
 */
router.get('/pps-for-teachers', async (req, res) => {
    let connection;
    try {
        connection = await getConnection();

        // Get all teachers with email addresses
        const [teachers] = await connection.execute(`
            SELECT DISTINCT email, firstname
            FROM teacher_payments
            WHERE email IS NOT NULL AND email != ''
            ORDER BY firstname
        `);

        const ZohoPeopleAPI = require('../../zoho/people-api');
        const zohoAPI = new ZohoPeopleAPI();

        // Load tokens
        const loaded = await zohoAPI.loadTokens();
        if (!loaded) {
            return res.status(500).json({
                success: false,
                error: 'Zoho authentication required'
            });
        }

        // Fetch all employees from Zoho at once
        const axios = require('axios');
        const response = await axios.get(`${zohoAPI.baseUrl}/forms/P_EmployeeView/records`, {
            headers: {
                'Authorization': `Zoho-oauthtoken ${zohoAPI.accessToken}`
            }
        });

        let zohoEmployees = [];
        if (response.data && Array.isArray(response.data)) {
            zohoEmployees = response.data;
        } else if (response.data && response.data.response && response.data.response.result) {
            zohoEmployees = Array.isArray(response.data.response.result)
                ? response.data.response.result
                : [response.data.response.result];
        }

        // Create email to PPS lookup map
        const ppsData = {};
        zohoEmployees.forEach(emp => {
            const email = emp.EMPLOYEEMAILALIAS || emp['Email ID'];
            const pps = emp.PPS || emp.pps;
            if (email && pps) {
                ppsData[email] = pps;
            }
        });

        console.log(`[PPS API] Found PPS for ${Object.keys(ppsData).length} employees`);

        // Update database with PPS numbers
        for (const teacher of teachers) {
            const pps = ppsData[teacher.email];
            if (pps) {
                await connection.execute(`
                    UPDATE teacher_payments
                    SET pps_number = ?
                    WHERE email = ?
                `, [pps, teacher.email]);
                console.log(`[PPS API] Updated ${teacher.email} with PPS: ${pps}`);
            }
        }

        await connection.end();

        res.json({
            success: true,
            data: ppsData,
            count: Object.keys(ppsData).length
        });

    } catch (error) {
        console.error('Error fetching PPS numbers:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * GET /api/teachers/leave-by-weeks
 * Get leave/sick days broken down by week for all teachers with emails
 * Returns: { "email@example.com": { "Week 14, 31/03/2025 – 06/04/2025": { leave: 7.5, sick: 0 }, ... }, ... }
 */
router.get('/leave-by-weeks', async (req, res) => {
    let connection;
    try {
        const { weeks } = req.query; // Triple-pipe separated list of week strings

        if (!weeks) {
            return res.status(400).json({
                success: false,
                error: 'weeks query parameter is required (triple-pipe separated week strings)'
            });
        }

        const weekList = weeks.split('|||');

        connection = await getConnection();

        // Get all teachers with email addresses
        const [teachers] = await connection.execute(`
            SELECT DISTINCT email, firstname
            FROM teacher_payments
            WHERE email IS NOT NULL AND email != ''
            ORDER BY firstname
        `);

        const ZohoLeaveSync = require('../../zoho/leave-sync');
        const leaveSync = new ZohoLeaveSync();

        const leaveByEmailAndWeek = {};

        // For each teacher
        for (const teacher of teachers) {
            try {
                console.log(`\n[LEAVE BY WEEKS] Processing ${teacher.email}`);

                // Get employee from Zoho
                const employee = await leaveSync.getEmployeeByEmail(teacher.email);

                if (!employee) {
                    console.log(`[LEAVE BY WEEKS] Employee not found in Zoho: ${teacher.email}`);
                    continue;
                }

                leaveByEmailAndWeek[teacher.email] = {};

                // For each week, get leave data for that week's date range
                for (const week of weekList) {
                    // Parse week string: "Week 14, 31/03/2025 – 06/04/2025"
                    const match = week.match(/Week \d+, (\d{2})\/(\d{2})\/(\d{4})\s*–\s*(\d{2})\/(\d{2})\/(\d{4})/);

                    if (!match) {
                        console.log(`[LEAVE BY WEEKS] Could not parse week: ${week}`);
                        continue;
                    }

                    const weekStart = `${match[3]}-${match[2]}-${match[1]}`; // YYYY-MM-DD
                    const weekEnd = `${match[6]}-${match[5]}-${match[4]}`;

                    // Get leave for this specific week
                    const periodLeave = await leaveSync.getEmployeeLeaveDataForPeriod(
                        employee.employeeId,
                        weekStart,
                        weekEnd
                    );

                    leaveByEmailAndWeek[teacher.email][week] = {
                        leave: periodLeave.leaveTaken,
                        sick: periodLeave.sickLeaveTaken
                    };

                    console.log(`[LEAVE BY WEEKS] ${week}: ${periodLeave.leaveTaken}h leave, ${periodLeave.sickLeaveTaken}h sick`);
                }

                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.error(`[LEAVE BY WEEKS] Error fetching leave for ${teacher.email}:`, error.message);
            }
        }

        await connection.end();

        res.json({
            success: true,
            data: leaveByEmailAndWeek
        });

    } catch (error) {
        console.error('Error fetching leave by weeks:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * POST /api/teachers/update-leave-balances
 * Calculate and update leave balances in Zoho for a payroll period
 * Formula: new_balance = start_balance + leave_accrued - leave_taken
 */
router.post('/update-leave-balances', async (req, res) => {
    try {
        const { dateFrom, dateTo, updateDate } = req.body;

        if (!dateFrom || !dateTo) {
            return res.status(400).json({
                success: false,
                error: 'dateFrom and dateTo are required (format: YYYY-MM-DD)'
            });
        }

        // Default updateDate to dateTo (last day of period, which should be the last Wednesday)
        const finalUpdateDate = updateDate || dateTo;

        console.log(`[BALANCE UPDATE] Starting balance update for period ${dateFrom} to ${dateTo}`);

        const ZohoLeaveSync = require('../../zoho/leave-sync');
        const leaveSync = new ZohoLeaveSync();

        const result = await leaveSync.updateAllLeaveBalancesForPeriod(
            dateFrom,
            dateTo,
            finalUpdateDate
        );

        res.json(result);

    } catch (error) {
        console.error('Error updating leave balances:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/reset-week', async (req, res) => {
    let connection;
    try {
        const { teacher_name, week } = req.body;

        if (!teacher_name || !week) {
            return res.status(400).json({
                success: false,
                error: 'teacher_name and week are required'
            });
        }

        connection = await getConnection();

        // Reverse name back to "Surname, First Name" format for database lookup
        const reverseNameBack = (name) => {
            if (!name || !name.includes(' ')) return name;
            const parts = name.split(' ');
            if (parts.length === 2) {
                return `${parts[1]}, ${parts[0]}`;
            }
            const lastName = parts[parts.length - 1];
            const firstNames = parts.slice(0, -1).join(' ');
            return `${lastName}, ${firstNames}`;
        };

        const dbName = reverseNameBack(teacher_name);

        // Clear manager edits so Fidelo can overwrite
        const query = `
            UPDATE teacher_payments
            SET
                hours_included_this_month = NULL,
                weekly_pay = NULL,
                manager_checked = 0,
                updated_at = NOW()
            WHERE firstname = ? AND select_value = ?
        `;

        await connection.execute(query, [dbName, week]);

        res.json({
            success: true,
            message: 'Week reset successfully'
        });

    } catch (error) {
        console.error('Error resetting week:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

module.exports = router;
