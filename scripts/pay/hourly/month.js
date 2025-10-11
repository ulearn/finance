// Monthly Payroll Component
// Separate component for Monthly Payroll view to keep dashboard.html manageable

window.MonthlyPayrollComponent = function({ data, selectedMonthlyPeriod }) {
    const [leaveData, setLeaveData] = React.useState(null);
    const [loadingLeave, setLoadingLeave] = React.useState(false);

    // Fetch leave data when period changes
    React.useEffect(() => {
        if (selectedMonthlyPeriod) {
            fetchLeaveDataForPeriod();
        }
    }, [selectedMonthlyPeriod]);

    const fetchLeaveDataForPeriod = async () => {
        if (!selectedMonthlyPeriod) return;

        setLoadingLeave(true);
        try {
            const response = await fetch(
                `/fins/scripts/pay/hourly/dashboard/leave-for-period?dateFrom=${selectedMonthlyPeriod.from}&dateTo=${selectedMonthlyPeriod.to}`
            );
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

        // Get leave taken from Zoho data (if available) - lookup by EMAIL
        console.log(`[MONTH.JS] Looking up leave for: "${teacher.teacher_name}" (email: ${teacher.email})`);
        console.log('[MONTH.JS] Available keys in leaveData:', leaveData ? Object.keys(leaveData) : 'null');
        const leaveTakenFromZoho = leaveData && teacher.email && leaveData[teacher.email]
            ? leaveData[teacher.email]
            : 0;
        console.log(`[MONTH.JS] Leave found for ${teacher.email}: ${leaveTakenFromZoho}h`);

        return {
            teacher_name: teacher.teacher_name,
            total_hours: periodTotalHours,
            average_rate: rateCount > 0 ? rateSum / rateCount : 0,
            total_pay: periodTotalPay,
            leave_taken: leaveTakenFromZoho
        };
    }).filter(t => t.total_hours > 0);

    return (
        <div className="summary-section">
            <h2>
                Monthly Payroll - {selectedMonthlyPeriod.month}
                {loadingLeave && <span style={{marginLeft: '10px', fontSize: '14px', color: '#7f8c8d'}}>Fetching leave data from Zoho...</span>}
            </h2>
            <table className="summary-table">
                <thead>
                    <tr>
                        <th>Teacher</th>
                        <th>Hours</th>
                        <th>Rate</th>
                        <th>Leave (Zoho)</th>
                        <th>Leave €</th>
                        <th>Total Pay</th>
                    </tr>
                </thead>
                <tbody>
                    {monthlyData.map((teacher, idx) => {
                        const leaveEuro = teacher.average_rate * teacher.leave_taken;
                        return (
                            <tr key={idx}>
                                <td>{teacher.teacher_name}</td>
                                <td>{teacher.total_hours.toFixed(2)}h</td>
                                <td>€{teacher.average_rate.toFixed(2)}</td>
                                <td>
                                    {loadingLeave ? (
                                        <span style={{color: '#7f8c8d'}}>Loading...</span>
                                    ) : (
                                        `${teacher.leave_taken.toFixed(2)}h`
                                    )}
                                </td>
                                <td>€{leaveEuro.toFixed(2)}</td>
                                <td><strong>€{teacher.total_pay.toFixed(2)}</strong></td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};
