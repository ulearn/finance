// Monthly Payroll Component
// Separate component for Monthly Payroll view to keep dashboard.html manageable

// Format currency with thousand separators
const formatCurrency = (amount) => {
    return '€' + parseFloat(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

window.MonthlyPayrollComponent = function({ data, selectedMonthlyPeriod, onDataRefresh }) {
    const [leaveData, setLeaveData] = React.useState(null);
    const [ppsData, setPpsData] = React.useState(null);
    const [monthlyAdjustments, setMonthlyAdjustments] = React.useState(null);
    const [loadingLeave, setLoadingLeave] = React.useState(false);
    const [loadingPPS, setLoadingPPS] = React.useState(false);
    const [updatingBalances, setUpdatingBalances] = React.useState(false);
    const [authorizingPayroll, setAuthorizingPayroll] = React.useState(false);
    const [editingCell, setEditingCell] = React.useState(null); // {teacherName, field}
    const [editingPPS, setEditingPPS] = React.useState(null); // teacherName being edited

    // Fetch leave, PPS, and monthly adjustments when period changes
    React.useEffect(() => {
        if (selectedMonthlyPeriod) {
            fetchLeaveDataForPeriod();
            fetchPPSData();
            fetchMonthlyAdjustments();
        }
    }, [selectedMonthlyPeriod]);

    const fetchLeaveDataForPeriod = async (forceRefresh = false) => {
        if (!selectedMonthlyPeriod) return;

        setLoadingLeave(true);
        try {
            const url = `/fins/scripts/pay/hourly/dashboard/leave-for-period?dateFrom=${selectedMonthlyPeriod.from}&dateTo=${selectedMonthlyPeriod.to}${forceRefresh ? '&forceRefresh=true' : ''}`;
            console.log(forceRefresh ? '[MONTH.JS] FORCE REFRESH - Fetching leave data...' : '[MONTH.JS] Fetching leave data...');

            const response = await fetch(url);
            const result = await response.json();

            if (result.success) {
                console.log('[MONTH.JS] Leave data received:', result.data);
                console.log('[MONTH.JS] Leave data keys:', Object.keys(result.data));
                setLeaveData(result.data);
            } else {
                console.error('Error fetching leave data:', result.error);
                setLeaveData({});
            }
        } catch (error) {
            console.error('Error fetching leave data:', error);
            setLeaveData({});
        } finally {
            setLoadingLeave(false);
        }
    };

    const fetchPPSData = async () => {
        setLoadingPPS(true);
        try {
            console.log('[MONTH.JS] Fetching PPS data from Zoho...');
            const response = await fetch('/fins/scripts/pay/hourly/dashboard/pps-for-teachers');
            const result = await response.json();

            if (result.success) {
                console.log('[MONTH.JS] PPS data received:', result.data);
                console.log('[MONTH.JS] PPS count:', result.count);
                setPpsData(result.data);

                // Refresh the main data to get updated PPS from database
                if (onDataRefresh) {
                    await onDataRefresh();
                }
            } else {
                console.error('Error fetching PPS data:', result.error);
                setPpsData({});
            }
        } catch (error) {
            console.error('Error fetching PPS data:', error);
            setPpsData({});
        } finally {
            setLoadingPPS(false);
        }
    };

    const updateLeaveBalances = async () => {
        if (!selectedMonthlyPeriod) return;

        if (!confirm(`Update leave balances in Zoho for ${selectedMonthlyPeriod.month}?\n\nThis will:\n1. Calculate leave accrued (8% of hours worked)\n2. Subtract leave taken\n3. Update each teacher's balance in Zoho\n\nNote: This may take a few minutes.\n\nContinue?`)) {
            return;
        }

        setUpdatingBalances(true);
        try {
            const response = await fetch('/fins/scripts/pay/hourly/dashboard/update-leave-balances', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dateFrom: selectedMonthlyPeriod.from,
                    dateTo: selectedMonthlyPeriod.to,
                    updateDate: selectedMonthlyPeriod.to
                })
            });

            const result = await response.json();

            if (result.success) {
                alert(`Leave balance update complete!\n\n✓ Success: ${result.successCount}\n✗ Failed: ${result.failCount}\n\nTotal processed: ${result.totalProcessed}`);
            } else {
                alert('Error updating leave balances: ' + result.error);
            }
        } catch (error) {
            alert('Error updating leave balances: ' + error.message);
        } finally {
            setUpdatingBalances(false);
        }
    };

    const fetchMonthlyAdjustments = async () => {
        if (!selectedMonthlyPeriod) return;

        try {
            const [month, year] = selectedMonthlyPeriod.month.split(' ');
            const response = await fetch(`/fins/scripts/pay/hourly/dashboard/monthly-adjustments?month=${encodeURIComponent(month)}&year=${year}`);
            const result = await response.json();

            if (result.success) {
                console.log('[MONTH.JS] Monthly adjustments received:', result.data);
                setMonthlyAdjustments(result.data);
            } else {
                console.error('Error fetching monthly adjustments:', result.error);
                setMonthlyAdjustments({});
            }
        } catch (error) {
            console.error('Error fetching monthly adjustments:', error);
            setMonthlyAdjustments({});
        }
    };

    const saveMonthlyAdjustment = async (teacherName, field, value) => {
        try {
            console.log(`[MONTH.JS] Saving monthly ${field} for ${teacherName}: ${value}`);

            const [month, year] = selectedMonthlyPeriod.month.split(' ');

            const response = await fetch('/fins/scripts/pay/hourly/dashboard/update-monthly-adjustment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    teacher_name: teacherName,
                    month: month,
                    year: parseInt(year),
                    field: field,
                    value: parseFloat(value)
                })
            });

            const result = await response.json();
            if (!result.success) {
                console.error('Failed to update monthly adjustment:', result.error);
                alert('Error: ' + result.error);
            } else {
                console.log(`[MONTH.JS] Monthly adjustment saved successfully`);

                // Refresh monthly adjustments
                await fetchMonthlyAdjustments();
            }
        } catch (error) {
            console.error('Error saving monthly adjustment:', error);
            alert('Error saving: ' + error.message);
        }
    };

    const updateTeacherPPS = async (teacherName, ppsNumber) => {
        try {
            console.log('[MONTH.JS] Updating PPS for:', teacherName, 'with value:', ppsNumber);
            const response = await fetch('/fins/scripts/pay/hourly/dashboard/update-pps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    teacher_name: teacherName,
                    pps_number: ppsNumber
                })
            });
            const result = await response.json();
            console.log('[MONTH.JS] PPS update result:', result);
            if (result.success) {
                // Refresh data in background (don't await to avoid jarring page refresh)
                if (onDataRefresh) {
                    onDataRefresh();
                }
            } else {
                alert('Error updating PPS: ' + result.error);
            }
        } catch (err) {
            console.error('[MONTH.JS] Error updating PPS:', err);
            alert('Error updating PPS: ' + err.message);
        }
    };

    const authorizePayroll = async () => {
        if (!selectedMonthlyPeriod) return;

        if (!confirm(`Authorize payroll for ${selectedMonthlyPeriod.month}?\n\nThis will:\n1. Save a snapshot of all teacher payroll data\n2. Mark the period as AUTHORIZED\n3. Make it available for final processing\n\nContinue?`)) {
            return;
        }

        setAuthorizingPayroll(true);
        try {
            // Prepare teacher data from monthlyData
            const teacherDataForSnapshot = {
                teachers: monthlyData,
                totalHours: monthlyData.reduce((sum, t) => sum + t.total_hours, 0),
                totalLeave: monthlyData.reduce((sum, t) => sum + t.leave_taken, 0),
                totalLeaveEuro: monthlyData.reduce((sum, t) => sum + (t.average_rate * t.leave_taken), 0),
                totalPay: monthlyData.reduce((sum, t) => sum + t.total_pay, 0)
            };

            // Fetch sales data for the same period
            const salesResponse = await fetch(`/fins/scripts/pay/output/sales?month=${selectedMonthlyPeriod.month}&dateFrom=${selectedMonthlyPeriod.from}&dateTo=${selectedMonthlyPeriod.to}`);
            const salesResult = await salesResponse.json();

            const response = await fetch('/fins/scripts/pay/output/authorize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dateFrom: selectedMonthlyPeriod.from,
                    dateTo: selectedMonthlyPeriod.to,
                    month: selectedMonthlyPeriod.month,
                    teacherData: teacherDataForSnapshot,
                    salesData: salesResult.success ? salesResult.data : null
                })
            });

            const result = await response.json();

            if (result.success) {
                alert(`Payroll authorized successfully!\n\nSnapshot saved with ID: ${result.authorizationId}\n\nThis payroll period has been marked as authorized and is now available for final processing.`);
            } else {
                alert('Error authorizing payroll: ' + result.error);
            }
        } catch (error) {
            alert('Error authorizing payroll: ' + error.message);
        } finally {
            setAuthorizingPayroll(false);
        }
    };

    if (!data || !selectedMonthlyPeriod) {
        return null;
    }

    // Filter weeks for selected month
    const isWeekInPeriod = (weekString) => {
        const match = weekString.match(/Week \d+, (\d{2})\/(\d{2})\/(\d{4})\s*–\s*(\d{2})\/(\d{2})\/(\d{4})/);
        if (!match) return false;
        const weekStart = `${match[3]}-${match[2]}-${match[1]}`;
        const weekEnd = `${match[6]}-${match[5]}-${match[4]}`;
        return weekStart <= selectedMonthlyPeriod.to && weekEnd >= selectedMonthlyPeriod.from;
    };

    const filteredWeeks = data.weeks.filter(isWeekInPeriod);

    // Calculate monthly totals per teacher
    const monthlyData = data.teachers.map(teacher => {
        let periodTotalHours = 0;
        let periodTotalPay = 0;
        let rateSum = 0;
        let rateCount = 0;

        filteredWeeks.forEach(week => {
            const weekData = teacher.weeks[week];
            if (weekData) {
                const hoursToInclude = weekData.hours_included_this_month !== null
                    ? parseFloat(weekData.hours_included_this_month)
                    : (weekData.can_auto_populate ? weekData.total_hours : 0);

                periodTotalHours += hoursToInclude;

                if (weekData.weekly_pay !== null) {
                    periodTotalPay += parseFloat(weekData.weekly_pay);
                } else if (weekData.can_auto_populate) {
                    periodTotalPay += weekData.total_salary;
                }

                if (weekData.rate > 0) {
                    rateSum += weekData.rate;
                    rateCount++;
                }
            }
        });

        // Get leave and sick leave taken from Zoho data (if available) - lookup by EMAIL
        console.log(`[MONTH.JS] Looking up leave for: "${teacher.teacher_name}" (email: ${teacher.email})`);
        console.log('[MONTH.JS] Available keys in leaveData:', leaveData ? Object.keys(leaveData) : 'null');

        const leaveFromZoho = leaveData && teacher.email && leaveData[teacher.email]
            ? (typeof leaveData[teacher.email] === 'object' ? leaveData[teacher.email].leave : leaveData[teacher.email])
            : 0;

        // Sick leave from Zoho is in DAYS (not hours)
        const sickDaysFromZoho = leaveData && teacher.email && leaveData[teacher.email] && typeof leaveData[teacher.email] === 'object'
            ? leaveData[teacher.email].sick
            : 0;

        // Calculate sick leave hours: sick days × average hours per day
        // Average hours per day = total hours in period / number of working days
        const workingDaysInPeriod = filteredWeeks.length * 5;
        const avgHoursPerDay = workingDaysInPeriod > 0 ? periodTotalHours / workingDaysInPeriod : 0;
        const sickLeaveHours = sickDaysFromZoho * avgHoursPerDay;

        console.log(`[MONTH.JS] Leave found for ${teacher.email}: ${leaveFromZoho}h leave, ${sickDaysFromZoho} sick days`);
        console.log(`[MONTH.JS] Sick leave calculation: ${sickDaysFromZoho} days × ${avgHoursPerDay.toFixed(2)} avg h/day = ${sickLeaveHours.toFixed(2)} hours`);

        // Get monthly adjustments from the new table (NOT from weekly data)
        // Reverse name back to "Surname, First Name" format for lookup
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
        const dbName = reverseNameBack(teacher.teacher_name);

        const adjustments = monthlyAdjustments && monthlyAdjustments[dbName]
            ? monthlyAdjustments[dbName]
            : { other: 0, impact_bonus: 0 };

        return {
            teacher_name: teacher.teacher_name,
            email: teacher.email,
            pps_number: teacher.pps_number || 'N/A',  // Will be populated from Zoho
            total_hours: periodTotalHours,
            average_rate: rateCount > 0 ? rateSum / rateCount : 0,
            total_pay: periodTotalPay,
            leave_taken: leaveFromZoho,
            sick_days_taken: sickDaysFromZoho,  // Store days for display
            sick_leave_hours: sickLeaveHours,    // Store calculated hours for payment
            avg_hours_per_day: avgHoursPerDay,   // Store for reference
            other: adjustments.other,
            impact_bonus: adjustments.impact_bonus
        };
    }).filter(t => t.total_hours > 0);

    return (
        <div className="summary-section">
            <h2>
                Monthly Payroll - {selectedMonthlyPeriod.month}
                {loadingLeave && <span style={{marginLeft: '10px', fontSize: '14px', color: '#7f8c8d'}}>Fetching leave data...</span>}
                {loadingPPS && <span style={{marginLeft: '10px', fontSize: '14px', color: '#7f8c8d'}}>Fetching PPS...</span>}
            </h2>
            <div style={{marginBottom: '15px', display: 'flex', gap: '15px', alignItems: 'center'}}>
                <button
                    onClick={() => fetchLeaveDataForPeriod(true)}
                    disabled={loadingLeave}
                    style={{
                        padding: '10px 20px',
                        background: loadingLeave ? '#95a5a6' : '#e67e22',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: loadingLeave ? 'not-allowed' : 'pointer',
                        fontSize: '14px'
                    }}
                >
                    {loadingLeave ? 'Refreshing...' : '🔄 Force Refresh Leave'}
                </button>
                <button
                    onClick={updateLeaveBalances}
                    disabled={updatingBalances}
                    style={{
                        padding: '10px 20px',
                        background: updatingBalances ? '#95a5a6' : '#16a085',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: updatingBalances ? 'not-allowed' : 'pointer',
                        fontSize: '14px'
                    }}
                >
                    {updatingBalances ? 'Updating Balances...' : 'Update Leave Balances in Zoho'}
                </button>
                <button
                    onClick={authorizePayroll}
                    disabled={authorizingPayroll || loadingLeave}
                    style={{
                        padding: '10px 20px',
                        background: authorizingPayroll ? '#95a5a6' : 'linear-gradient(135deg, #27ae60 0%, #229954 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: (authorizingPayroll || loadingLeave) ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: '600'
                    }}
                >
                    {authorizingPayroll ? 'Authorizing...' : '✓ Authorize Payroll'}
                </button>
                <span style={{fontSize: '13px', color: '#7f8c8d', fontStyle: 'italic'}}>
                    Formula: new_balance = start_balance + leave_accrued (8%) - leave_taken
                </span>
            </div>
            <table className="summary-table">
                <thead>
                    <tr>
                        <th rowSpan="2">Teacher</th>
                        <th rowSpan="2">PPS</th>
                        <th rowSpan="2">Hours</th>
                        <th rowSpan="2">Rate</th>
                        <th colSpan="5" className="leave-header">LEAVE</th>
                        <th rowSpan="2">Other</th>
                        <th rowSpan="2" style={{backgroundColor: '#ffd700', fontWeight: '600', color: '#000'}}>
                            <div style={{lineHeight: '1.2'}}>Impact<br/>Bonus</div>
                        </th>
                        <th rowSpan="2">Total Pay</th>
                    </tr>
                    <tr>
                        <th className="leave-subheader">Accrued (8%)</th>
                        <th className="leave-subheader">Leave (Zoho)</th>
                        <th className="leave-subheader">Leave €</th>
                        <th className="leave-subheader">Sick Days</th>
                        <th className="leave-subheader">Sick €</th>
                    </tr>
                </thead>
                <tbody>
                    {monthlyData.map((teacher, idx) => {
                        const leaveEuro = teacher.average_rate * teacher.leave_taken;
                        const sickLeaveEuro = teacher.average_rate * teacher.sick_leave_hours * 0.70; // 70% of standard rate
                        const finalTotalPay = teacher.total_pay + teacher.other + teacher.impact_bonus + leaveEuro + sickLeaveEuro;
                        return (
                            <tr key={idx}>
                                <td>{teacher.teacher_name}</td>
                                <td
                                    onClick={() => {
                                        console.log('[MONTH.JS] PPS cell clicked for:', teacher.teacher_name, 'Current PPS:', teacher.pps_number, 'Setting editingPPS to:', idx);
                                        setEditingPPS(idx);
                                    }}
                                    style={{
                                        fontSize: '13px',
                                        color: teacher.pps_number === 'N/A' ? '#e74c3c' : 'inherit',
                                        cursor: 'pointer',
                                        backgroundColor: editingPPS === idx ? '#fff3cd' : 'transparent'
                                    }}
                                >
                                    {editingPPS === idx ? (
                                        <input
                                            type="text"
                                            defaultValue={teacher.pps_number === 'N/A' ? '' : teacher.pps_number}
                                            placeholder="PPS Number"
                                            style={{width: '100%', padding: '4px', fontSize: '13px', border: '1px solid #3498db'}}
                                            onBlur={(e) => {
                                                updateTeacherPPS(teacher.teacher_name, e.target.value);
                                                setEditingPPS(null);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    updateTeacherPPS(teacher.teacher_name, e.target.value);
                                                    setEditingPPS(null);
                                                } else if (e.key === 'Escape') {
                                                    setEditingPPS(null);
                                                }
                                            }}
                                            autoFocus
                                        />
                                    ) : (
                                        <span style={{textDecoration: teacher.pps_number === 'N/A' ? 'underline dotted' : 'none'}}>
                                            {teacher.pps_number === 'N/A' ? 'Click to add PPS' : teacher.pps_number}
                                        </span>
                                    )}
                                </td>
                                <td>{teacher.total_hours.toFixed(2)}h</td>
                                <td>{formatCurrency(teacher.average_rate)}</td>
                                <td className="leave-cell">
                                    {(teacher.total_hours * 0.08).toFixed(2)}h
                                </td>
                                <td className="leave-cell">
                                    {loadingLeave ? (
                                        <span style={{color: '#7f8c8d'}}>Loading...</span>
                                    ) : (
                                        `${teacher.leave_taken.toFixed(2)}h`
                                    )}
                                </td>
                                <td className="leave-cell">{formatCurrency(leaveEuro)}</td>
                                <td className="leave-cell">
                                    {loadingLeave ? (
                                        <span style={{color: '#7f8c8d'}}>Loading...</span>
                                    ) : (
                                        `${teacher.sick_days_taken.toFixed(2)} days`
                                    )}
                                </td>
                                <td className="leave-cell">{formatCurrency(sickLeaveEuro)}</td>
                                <td
                                    onClick={() => {
                                        console.log('[MONTH.JS] Other cell clicked for:', teacher.teacher_name, 'Current value:', teacher.other);
                                        setEditingCell({ teacherName: teacher.teacher_name, field: 'other' });
                                        console.log('[MONTH.JS] editingCell set to:', { teacherName: teacher.teacher_name, field: 'other' });
                                    }}
                                    style={{cursor: 'pointer', backgroundColor: editingCell?.teacherName === teacher.teacher_name && editingCell?.field === 'other' ? '#fff3cd' : 'transparent'}}
                                >
                                    {editingCell?.teacherName === teacher.teacher_name && editingCell?.field === 'other' ? (
                                        <input
                                            type="number"
                                            step="0.01"
                                            defaultValue={teacher.other}
                                            placeholder="0.00"
                                            onBlur={(e) => {
                                                console.log('[MONTH.JS] Other input blur, value:', e.target.value);
                                                const newValue = parseFloat(e.target.value) || 0;
                                                saveMonthlyAdjustment(teacher.teacher_name, 'other', newValue);
                                                setEditingCell(null);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    console.log('[MONTH.JS] Other input Enter pressed');
                                                    e.target.blur();
                                                } else if (e.key === 'Escape') {
                                                    console.log('[MONTH.JS] Other input Escape pressed');
                                                    setEditingCell(null);
                                                }
                                            }}
                                            autoFocus
                                            style={{width: '100%', border: '1px solid #3498db', padding: '4px', fontSize: '14px'}}
                                        />
                                    ) : (
                                        formatCurrency(teacher.other)
                                    )}
                                </td>
                                <td
                                    onClick={() => {
                                        console.log('[MONTH.JS] Impact Bonus cell clicked for:', teacher.teacher_name, 'Current value:', teacher.impact_bonus);
                                        setEditingCell({ teacherName: teacher.teacher_name, field: 'impact_bonus' });
                                        console.log('[MONTH.JS] editingCell set to:', { teacherName: teacher.teacher_name, field: 'impact_bonus' });
                                    }}
                                    style={{
                                        backgroundColor: editingCell?.teacherName === teacher.teacher_name && editingCell?.field === 'impact_bonus' ? '#fff3cd' : '#ffd700',
                                        fontWeight: '600',
                                        color: '#000',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {editingCell?.teacherName === teacher.teacher_name && editingCell?.field === 'impact_bonus' ? (
                                        <input
                                            type="number"
                                            step="0.01"
                                            defaultValue={teacher.impact_bonus}
                                            placeholder="0.00"
                                            onBlur={(e) => {
                                                console.log('[MONTH.JS] Impact Bonus input blur, value:', e.target.value);
                                                const newValue = parseFloat(e.target.value) || 0;
                                                saveMonthlyAdjustment(teacher.teacher_name, 'impact_bonus', newValue);
                                                setEditingCell(null);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    console.log('[MONTH.JS] Impact Bonus input Enter pressed');
                                                    e.target.blur();
                                                } else if (e.key === 'Escape') {
                                                    console.log('[MONTH.JS] Impact Bonus input Escape pressed');
                                                    setEditingCell(null);
                                                }
                                            }}
                                            autoFocus
                                            style={{width: '100%', border: '1px solid #3498db', padding: '4px', fontSize: '14px', fontWeight: '600'}}
                                        />
                                    ) : (
                                        formatCurrency(teacher.impact_bonus)
                                    )}
                                </td>
                                <td><strong>{formatCurrency(finalTotalPay)}</strong></td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};
