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
                fidelo_id,
                select_value as week,
                days,
                firstname as teacher_name,
                classname as class_name,
                course_list as courses,
                count_bookings as student_count,
                lessons,
                hours,
                single_amount as rate_per_lesson,
                amount as salary_amount,
                costcategory_id as cost_category,
                can_auto_populate,
                auto_populate_reason,
                hours_included_this_month,
                weekly_pay,
                leave_hours,
                sick_days,
                manager_checked,
                import_date
            FROM teacher_payments
            WHERE firstname NOT IN ('DOS, ULearn', 'ADoS, ULearn')
            ORDER BY select_value ASC, firstname ASC
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
 * Update hours_included_this_month, weekly_pay, leave_hours, and sick_days for a specific teacher/week
 */
router.post('/update-hours', async (req, res) => {
    let connection;
    try {
        const { teacher_name, week, hours_included, weekly_pay, leave_hours, sick_days } = req.body;

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
                manager_checked = 1,
                updated_at = NOW()
            WHERE firstname = ? AND select_value = ?
        `;

        await connection.execute(query, [
            hours_included,
            weekly_pay,
            leave_hours || 0,
            sick_days || 0,
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
                SUM(COALESCE(sick_days, 0)) as sick_days,
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

module.exports = router;
