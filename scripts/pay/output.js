// Final Payroll Output API
// Location: /home/hub/public_html/fins/scripts/pay/final-output.js

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');

// Database connection helper
async function getConnection() {
    return await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });
}

/**
 * Get available payroll periods (monthly)
 * Returns authorized periods from payroll_authorizations table
 */
router.get('/periods', async (req, res) => {
    let connection;
    try {
        connection = await getConnection();

        // Get authorized payroll periods
        const [periods] = await connection.execute(`
            SELECT
                month_name as month,
                date_from as from_date,
                date_to as to_date,
                authorized,
                authorized_at
            FROM payroll_authorizations
            WHERE authorized = TRUE
            ORDER BY date_from ASC
            LIMIT 12
        `);

        const formattedPeriods = periods.map(p => {
            // Format dates properly without timezone conversion issues
            const formatDate = (date) => {
                const d = new Date(date);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            return {
                month: p.month,
                from: formatDate(p.from_date),
                to: formatDate(p.to_date),
                authorized: p.authorized === 1,
                authorizedAt: p.authorized_at
            };
        });

        res.json({
            success: true,
            periods: formattedPeriods
        });
    } catch (error) {
        console.error('Error fetching periods:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * Get teacher payroll data for a period
 * Returns snapshot data if authorized, otherwise calculates live data
 */
router.get('/teachers', async (req, res) => {
    let connection;
    try {
        const { dateFrom, dateTo } = req.query;

        if (!dateFrom || !dateTo) {
            return res.status(400).json({
                success: false,
                error: 'dateFrom and dateTo are required'
            });
        }

        connection = await getConnection();

        // Check if there's an authorized snapshot for this period
        const [authRows] = await connection.execute(`
            SELECT id, authorized FROM payroll_authorizations
            WHERE date_from = ? AND date_to = ? AND authorized = TRUE
        `, [dateFrom, dateTo]);

        if (authRows.length > 0) {
            // Return snapshot data
            const authId = authRows[0].id;
            const [snapshots] = await connection.execute(`
                SELECT * FROM payroll_snapshots
                WHERE authorization_id = ? AND section = 'teachers'
                ORDER BY employee_name
            `, [authId]);

            const teacherPayrollData = snapshots.map(snap => {
                // Parse additional_data JSON (or use as-is if already parsed by MySQL driver)
                const additionalData = snap.additional_data ?
                    (typeof snap.additional_data === 'string' ? JSON.parse(snap.additional_data) : snap.additional_data)
                    : {};

                return {
                    teacher_name: snap.employee_name,
                    email: snap.employee_email,
                    pps_number: additionalData.pps_number || 'N/A',
                    total_hours: parseFloat(snap.hours) || 0,
                    average_rate: parseFloat(snap.rate) || 0,
                    leave_taken: parseFloat(snap.leave_hours) || 0,
                    total_pay: parseFloat(snap.total_pay) || 0,
                    sick_days_taken: parseFloat(additionalData.sick_days_taken) || 0,
                    sick_leave_hours: parseFloat(additionalData.sick_leave_hours) || 0,
                    other: parseFloat(additionalData.other) || 0,
                    impact_bonus: parseFloat(additionalData.impact_bonus) || 0
                };
            });

            // Calculate totals including all components
            const totalHours = teacherPayrollData.reduce((sum, t) => sum + t.total_hours, 0);
            const totalLeave = teacherPayrollData.reduce((sum, t) => sum + t.leave_taken, 0);
            const totalLeaveEuro = teacherPayrollData.reduce((sum, t) => sum + (t.average_rate * t.leave_taken), 0);
            const totalSickLeaveEuro = teacherPayrollData.reduce((sum, t) => sum + (t.average_rate * t.sick_leave_hours * 0.70), 0);
            const totalOther = teacherPayrollData.reduce((sum, t) => sum + t.other, 0);
            const totalImpactBonus = teacherPayrollData.reduce((sum, t) => sum + t.impact_bonus, 0);
            const totalBasePay = teacherPayrollData.reduce((sum, t) => sum + t.total_pay, 0);
            const grandTotal = totalBasePay + totalLeaveEuro + totalSickLeaveEuro + totalOther + totalImpactBonus;

            return res.json({
                success: true,
                data: {
                    teachers: teacherPayrollData,
                    totalHours: totalHours,
                    totalLeave: totalLeave,
                    totalLeaveEuro: totalLeaveEuro,
                    totalSickLeaveEuro: totalSickLeaveEuro,
                    totalOther: totalOther,
                    totalImpactBonus: totalImpactBonus,
                    totalBasePay: totalBasePay,
                    grandTotal: grandTotal
                },
                source: 'snapshot'
            });
        }

        // No snapshot - calculate live data (for preview purposes)

        // Get all teachers with email addresses
        const [teachers] = await connection.execute(`
            SELECT DISTINCT email, firstname
            FROM teacher_payments
            WHERE email IS NOT NULL AND email != ''
            ORDER BY firstname
        `);

        // Get weeks in the period
        const [weeks] = await connection.execute(`
            SELECT DISTINCT select_value as week
            FROM teacher_payments
            WHERE STR_TO_DATE(SUBSTRING_INDEX(SUBSTRING_INDEX(select_value, ', ', -1), ' – ', 1), '%d/%m/%Y') >= ?
            AND STR_TO_DATE(SUBSTRING_INDEX(select_value, ' – ', -1), '%d/%m/%Y') <= ?
            ORDER BY STR_TO_DATE(SUBSTRING_INDEX(SUBSTRING_INDEX(select_value, ', ', -1), ' – ', 1), '%d/%m/%Y')
        `, [dateFrom, dateTo]);

        const weekList = weeks.map(w => w.week);

        // Fetch leave data from Zoho
        const ZohoLeaveSync = require('../zoho/leave-sync');
        const leaveSync = new ZohoLeaveSync();
        const leaveData = {};

        for (const teacher of teachers) {
            const employee = await leaveSync.getEmployeeByEmail(teacher.email);
            if (employee) {
                const periodLeave = await leaveSync.getEmployeeLeaveDataForPeriod(
                    employee.employeeId,
                    dateFrom,
                    dateTo
                );
                leaveData[teacher.email] = periodLeave.leaveTaken;
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Calculate monthly totals per teacher
        const teacherPayrollData = [];
        let totalHours = 0;
        let totalLeave = 0;
        let totalLeaveEuro = 0;
        let totalPay = 0;

        for (const teacher of teachers) {
            let periodTotalHours = 0;
            let periodTotalPay = 0;
            let rateSum = 0;
            let rateCount = 0;

            // Get data for each week
            for (const week of weekList) {
                const [weekData] = await connection.execute(`
                    SELECT
                        hours,
                        hours_included_this_month,
                        weekly_pay,
                        can_auto_populate,
                        CAST(hours AS DECIMAL(10,2)) * rate as total_salary,
                        rate
                    FROM teacher_payments
                    WHERE email = ?
                    AND select_value = ?
                `, [teacher.email, week]);

                if (weekData.length > 0) {
                    const wd = weekData[0];
                    const hoursToInclude = wd.hours_included_this_month !== null
                        ? parseFloat(wd.hours_included_this_month)
                        : (wd.can_auto_populate ? parseFloat(wd.hours) : 0);

                    periodTotalHours += hoursToInclude;

                    if (wd.weekly_pay !== null) {
                        periodTotalPay += parseFloat(wd.weekly_pay);
                    } else if (wd.can_auto_populate) {
                        periodTotalPay += parseFloat(wd.total_salary || 0);
                    }

                    if (wd.rate > 0) {
                        rateSum += parseFloat(wd.rate);
                        rateCount++;
                    }
                }
            }

            const leaveTaken = leaveData[teacher.email] || 0;
            const averageRate = rateCount > 0 ? rateSum / rateCount : 0;
            const leaveEuro = averageRate * leaveTaken;

            if (periodTotalHours > 0) {
                teacherPayrollData.push({
                    teacher_name: teacher.firstname,
                    total_hours: periodTotalHours,
                    average_rate: averageRate,
                    leave_taken: leaveTaken,
                    total_pay: periodTotalPay
                });

                totalHours += periodTotalHours;
                totalLeave += leaveTaken;
                totalLeaveEuro += leaveEuro;
                totalPay += periodTotalPay;
            }
        }

        res.json({
            success: true,
            data: {
                teachers: teacherPayrollData,
                totalHours: totalHours,
                totalLeave: totalLeave,
                totalLeaveEuro: totalLeaveEuro,
                totalPay: totalPay
            }
        });
    } catch (error) {
        console.error('Error fetching teacher payroll:', error);
        console.error('Error stack:', error.stack);
        console.error('Error message:', error.message);
        console.error('Error toString:', error.toString());
        res.status(500).json({
            success: false,
            error: error.message || error.toString() || 'Unknown error'
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * Get sales staff payroll data for a month
 * Returns snapshot data if authorized, otherwise calculates live data
 */
router.get('/sales', async (req, res) => {
    let connection;
    try {
        const { month, dateFrom, dateTo } = req.query; // e.g., "May 2025"

        if (!month) {
            return res.status(400).json({
                success: false,
                error: 'month parameter is required'
            });
        }

        connection = await getConnection();

        // Check if there's an authorized snapshot for this period
        if (dateFrom && dateTo) {
            const [authRows] = await connection.execute(`
                SELECT id, authorized FROM payroll_authorizations
                WHERE date_from = ? AND date_to = ? AND authorized = TRUE
            `, [dateFrom, dateTo]);

            if (authRows.length > 0) {
                // Return snapshot data
                const authId = authRows[0].id;

                const [b2cSnap] = await connection.execute(`
                    SELECT * FROM payroll_snapshots
                    WHERE authorization_id = ? AND section = 'sales_b2c'
                    LIMIT 1
                `, [authId]);

                const [b2bSnap] = await connection.execute(`
                    SELECT * FROM payroll_snapshots
                    WHERE authorization_id = ? AND section = 'sales_b2b'
                    LIMIT 1
                `, [authId]);

                const b2cData = b2cSnap.length > 0 ?
                    (typeof b2cSnap[0].additional_data === 'string' ? JSON.parse(b2cSnap[0].additional_data) : b2cSnap[0].additional_data)
                    : null;
                const b2bData = b2bSnap.length > 0 ?
                    (typeof b2bSnap[0].additional_data === 'string' ? JSON.parse(b2bSnap[0].additional_data) : b2bSnap[0].additional_data)
                    : null;

                return res.json({
                    success: true,
                    data: {
                        b2c: {
                            name: b2cSnap.length > 0 ? b2cSnap[0].employee_name : 'Diego',
                            baseSalary: b2cData ? parseFloat(b2cData.baseSalary) : 0,
                            commission: b2cData ? parseFloat(b2cData.commission) : 0,
                            totalPaid: b2cSnap.length > 0 ? parseFloat(b2cSnap[0].total_pay) : 0
                        },
                        b2b: {
                            name: b2bSnap.length > 0 ? b2bSnap[0].employee_name : 'Cenker',
                            baseSalary: b2bData ? parseFloat(b2bData.baseSalary) : 0,
                            commission: b2bData ? parseFloat(b2bData.commission) : 0,
                            totalPaid: b2bSnap.length > 0 ? parseFloat(b2bSnap[0].total_pay) : 0
                        }
                    },
                    source: 'snapshot'
                });
            }
        }

        // No snapshot - calculate live data (for preview purposes)
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
        const [monthName, year] = month.split(' ');
        const currentMonthIdx = monthNames.indexOf(monthName);
        const previousMonthIdx = currentMonthIdx === 0 ? 11 : currentMonthIdx - 1;
        const previousMonthName = monthNames[previousMonthIdx].toUpperCase().substring(0, 3);

        // Get B2C base salary
        const [b2cBase] = await connection.execute(`
            SELECT monthly_salary
            FROM sales_base_salaries
            WHERE employee_name = 'Diego'
            AND channel = 'b2c'
            LIMIT 1
        `);

        // Get B2B base salary
        const [b2bBase] = await connection.execute(`
            SELECT monthly_salary
            FROM sales_base_salaries
            WHERE employee_name = 'Cenker'
            AND channel = 'b2b'
            LIMIT 1
        `);

        // Get B2C commission for previous month
        const [b2cComm] = await connection.execute(`
            SELECT commission_net
            FROM sales_commissions_monthly
            WHERE channel = 'b2c'
            AND month = ?
            AND year = ?
        `, [previousMonthName, year]);

        // Get B2B commission for previous month
        const [b2bComm] = await connection.execute(`
            SELECT commission_net
            FROM sales_commissions_monthly
            WHERE channel = 'b2b'
            AND month = ?
            AND year = ?
        `, [previousMonthName, year]);

        const b2cBaseSalary = b2cBase.length > 0 ? parseFloat(b2cBase[0].monthly_salary) : 0;
        const b2cCommission = b2cComm.length > 0 ? parseFloat(b2cComm[0].commission_net) : 0;
        const b2cTotalPaid = b2cBaseSalary + b2cCommission;

        const b2bBaseSalary = b2bBase.length > 0 ? parseFloat(b2bBase[0].monthly_salary) : 0;
        const b2bCommission = b2bComm.length > 0 ? parseFloat(b2bComm[0].commission_net) : 0;
        const b2bTotalPaid = b2bBaseSalary + b2bCommission;

        res.json({
            success: true,
            data: {
                b2c: {
                    name: 'Diego',
                    baseSalary: b2cBaseSalary,
                    commission: b2cCommission,
                    totalPaid: b2cTotalPaid
                },
                b2b: {
                    name: 'Cenker',
                    baseSalary: b2bBaseSalary,
                    commission: b2bCommission,
                    totalPaid: b2bTotalPaid
                }
            }
        });
    } catch (error) {
        console.error('Error fetching sales payroll:', error);
        console.error('Error stack:', error.stack);
        console.error('Error message:', error.message);
        console.error('Error toString:', error.toString());
        res.status(500).json({
            success: false,
            error: error.message || error.toString() || 'Unknown error'
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * Get authorization status for a period
 */
router.get('/auth-status', async (req, res) => {
    let connection;
    try {
        const { dateFrom, dateTo } = req.query;

        if (!dateFrom || !dateTo) {
            return res.status(400).json({
                success: false,
                error: 'dateFrom and dateTo are required'
            });
        }

        connection = await getConnection();

        // Check if payroll_authorizations table exists, if not create it
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS payroll_authorizations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                date_from DATE NOT NULL,
                date_to DATE NOT NULL,
                month_name VARCHAR(50),
                authorized BOOLEAN DEFAULT FALSE,
                authorized_by VARCHAR(100),
                authorized_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY period_unique (date_from, date_to)
            )
        `);

        // Create payroll_snapshots table for storing frozen payroll data
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS payroll_snapshots (
                id INT AUTO_INCREMENT PRIMARY KEY,
                authorization_id INT NOT NULL,
                section VARCHAR(50) NOT NULL,
                employee_name VARCHAR(100),
                employee_email VARCHAR(100),
                hours DECIMAL(10,2),
                rate DECIMAL(10,2),
                leave_hours DECIMAL(10,2),
                leave_euro DECIMAL(10,2),
                total_pay DECIMAL(10,2),
                additional_data JSON,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (authorization_id) REFERENCES payroll_authorizations(id) ON DELETE CASCADE,
                INDEX idx_auth_section (authorization_id, section)
            )
        `);

        const [rows] = await connection.execute(`
            SELECT * FROM payroll_authorizations
            WHERE date_from = ? AND date_to = ?
        `, [dateFrom, dateTo]);

        if (rows.length === 0) {
            res.json({
                success: true,
                status: {
                    authorized: false,
                    authorizedBy: null,
                    authorizedAt: null
                }
            });
        } else {
            res.json({
                success: true,
                status: {
                    authorized: rows[0].authorized === 1,
                    authorizedBy: rows[0].authorized_by,
                    authorizedAt: rows[0].authorized_at
                }
            });
        }
    } catch (error) {
        console.error('Error fetching auth status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * Authorize payroll for a period - saves snapshot and marks as authorized
 */
router.post('/authorize', async (req, res) => {
    let connection;
    try {
        const { dateFrom, dateTo, month, teacherData, salesData } = req.body;

        if (!dateFrom || !dateTo || !teacherData) {
            return res.status(400).json({
                success: false,
                error: 'dateFrom, dateTo, and teacherData are required'
            });
        }

        connection = await getConnection();

        // Start transaction
        await connection.beginTransaction();

        try {
            // Insert or update authorization
            const [authResult] = await connection.execute(`
                INSERT INTO payroll_authorizations
                (date_from, date_to, month_name, authorized, authorized_by, authorized_at)
                VALUES (?, ?, ?, TRUE, 'System Admin', NOW())
                ON DUPLICATE KEY UPDATE
                    authorized = TRUE,
                    authorized_by = 'System Admin',
                    authorized_at = NOW(),
                    month_name = ?
            `, [dateFrom, dateTo, month, month]);

            // Get the authorization ID
            const [authRow] = await connection.execute(`
                SELECT id FROM payroll_authorizations
                WHERE date_from = ? AND date_to = ?
            `, [dateFrom, dateTo]);

            const authId = authRow[0].id;

            // Delete existing snapshots for this authorization
            await connection.execute(`
                DELETE FROM payroll_snapshots
                WHERE authorization_id = ?
            `, [authId]);

            // Insert teacher payroll snapshots
            for (const teacher of teacherData.teachers) {
                const leaveEuro = teacher.average_rate * teacher.leave_taken;
                const sickLeaveEuro = teacher.average_rate * (teacher.sick_leave_hours || 0) * 0.70;

                // Store additional fields in JSON
                const additionalData = JSON.stringify({
                    sick_days_taken: teacher.sick_days_taken || 0,
                    sick_leave_hours: teacher.sick_leave_hours || 0,
                    sick_leave_euro: sickLeaveEuro,
                    other: teacher.other || 0,
                    impact_bonus: teacher.impact_bonus || 0,
                    pps_number: teacher.pps_number || null
                });

                await connection.execute(`
                    INSERT INTO payroll_snapshots
                    (authorization_id, section, employee_name, employee_email, hours, rate,
                     leave_hours, leave_euro, total_pay, additional_data)
                    VALUES (?, 'teachers', ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    authId,
                    teacher.teacher_name,
                    teacher.email || null,
                    teacher.total_hours,
                    teacher.average_rate,
                    teacher.leave_taken,
                    leaveEuro,
                    teacher.total_pay,
                    additionalData
                ]);
            }

            // Insert sales staff snapshots if provided
            if (salesData) {
                // B2C Diego
                await connection.execute(`
                    INSERT INTO payroll_snapshots
                    (authorization_id, section, employee_name, employee_email, hours, rate,
                     leave_hours, leave_euro, total_pay, additional_data)
                    VALUES (?, 'sales_b2c', ?, NULL, NULL, NULL, NULL, NULL, ?, ?)
                `, [
                    authId,
                    salesData.b2c.name,
                    salesData.b2c.totalPaid,
                    JSON.stringify({
                        baseSalary: salesData.b2c.baseSalary,
                        commission: salesData.b2c.commission
                    })
                ]);

                // B2B Cenker
                await connection.execute(`
                    INSERT INTO payroll_snapshots
                    (authorization_id, section, employee_name, employee_email, hours, rate,
                     leave_hours, leave_euro, total_pay, additional_data)
                    VALUES (?, 'sales_b2b', ?, NULL, NULL, NULL, NULL, NULL, ?, ?)
                `, [
                    authId,
                    salesData.b2b.name,
                    salesData.b2b.totalPaid,
                    JSON.stringify({
                        baseSalary: salesData.b2b.baseSalary,
                        commission: salesData.b2b.commission
                    })
                ]);
            }

            // Commit transaction
            await connection.commit();

            res.json({
                success: true,
                message: `Payroll for ${month} has been authorized and snapshot saved`,
                authorizationId: authId
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        }
    } catch (error) {
        console.error('Error authorizing payroll:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * Retract payroll authorization for a period
 */
router.post('/retract', async (req, res) => {
    let connection;
    try {
        const { dateFrom, dateTo } = req.body;

        if (!dateFrom || !dateTo) {
            return res.status(400).json({
                success: false,
                error: 'dateFrom and dateTo are required'
            });
        }

        connection = await getConnection();

        await connection.execute(`
            UPDATE payroll_authorizations
            SET authorized = FALSE,
                authorized_by = NULL,
                authorized_at = NULL
            WHERE date_from = ? AND date_to = ?
        `, [dateFrom, dateTo]);

        res.json({
            success: true,
            message: 'Payroll authorization has been retracted'
        });
    } catch (error) {
        console.error('Error retracting authorization:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

module.exports = router;
