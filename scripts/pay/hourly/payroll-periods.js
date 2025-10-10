// Payroll Period Definitions
// Location: /home/hub/public_html/fins/scripts/pay/hourly/payroll-periods.js
// Payroll runs on the last Thursday of each month, includes up to & including Wednesday

const PAYROLL_PERIODS_2025 = [
    { period: 1, month: 'JAN', from: '2025-01-02', to: '2025-01-29', weeks: 5, fideloFrom: '2024-12-30', fideloTo: '2025-02-03' },
    { period: 2, month: 'FEB', from: '2025-01-30', to: '2025-02-26', weeks: 5, fideloFrom: '2025-01-27', fideloTo: '2025-03-03' },
    { period: 3, month: 'MAR', from: '2025-02-27', to: '2025-03-26', weeks: 5, fideloFrom: '2025-02-24', fideloTo: '2025-03-31' },
    { period: 4, month: 'APR', from: '2025-03-27', to: '2025-04-30', weeks: 6, fideloFrom: '2025-03-24', fideloTo: '2025-05-05' },
    { period: 5, month: 'MAY', from: '2025-05-01', to: '2025-05-28', weeks: 5, fideloFrom: '2025-04-28', fideloTo: '2025-06-02' },
    { period: 6, month: 'JUN', from: '2025-05-29', to: '2025-06-25', weeks: 5, fideloFrom: '2025-05-26', fideloTo: '2025-06-30' },
    { period: 7, month: 'JUL', from: '2025-06-26', to: '2025-07-30', weeks: 6, fideloFrom: '2025-06-23', fideloTo: '2025-08-04' },
    { period: 8, month: 'AUG', from: '2025-07-31', to: '2025-08-27', weeks: 5, fideloFrom: '2025-07-28', fideloTo: '2025-09-01' },
    { period: 9, month: 'SEP', from: '2025-08-28', to: '2025-09-24', weeks: 5, fideloFrom: '2025-08-25', fideloTo: '2025-09-29' },
    { period: 10, month: 'OCT', from: '2025-09-25', to: '2025-10-29', weeks: 6, fideloFrom: '2025-09-22', fideloTo: '2025-11-03' },
    { period: 11, month: 'NOV', from: '2025-10-30', to: '2025-11-26', weeks: 5, fideloFrom: '2025-10-27', fideloTo: '2025-12-01' },
    { period: 12, month: 'DEC', from: '2025-11-27', to: '2025-12-31', weeks: 6, fideloFrom: '2025-11-24', fideloTo: '2026-01-05' }
];

/**
 * Get current payroll period
 * @returns {Object|null} - Current period or null
 */
function getCurrentPeriod() {
    const today = new Date().toISOString().split('T')[0];
    return PAYROLL_PERIODS_2025.find(p => today >= p.from && today <= p.to) || null;
}

/**
 * Get period by month name or number
 * @param {string|number} monthIdentifier - Month name (JAN) or period number (1-12)
 * @returns {Object|null}
 */
function getPeriodByMonth(monthIdentifier) {
    if (typeof monthIdentifier === 'number') {
        return PAYROLL_PERIODS_2025.find(p => p.period === monthIdentifier) || null;
    }
    return PAYROLL_PERIODS_2025.find(p => p.month === monthIdentifier.toUpperCase()) || null;
}

/**
 * Get next period
 * @param {number} currentPeriod - Current period number
 * @returns {Object|null}
 */
function getNextPeriod(currentPeriod) {
    return PAYROLL_PERIODS_2025.find(p => p.period === currentPeriod + 1) || null;
}

/**
 * Get previous period
 * @param {number} currentPeriod - Current period number
 * @returns {Object|null}
 */
function getPreviousPeriod(currentPeriod) {
    return PAYROLL_PERIODS_2025.find(p => p.period === currentPeriod - 1) || null;
}

module.exports = {
    PAYROLL_PERIODS_2025,
    getCurrentPeriod,
    getPeriodByMonth,
    getNextPeriod,
    getPreviousPeriod
};
