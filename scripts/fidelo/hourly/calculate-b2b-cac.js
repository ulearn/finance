/**
 * Calculate B2B CAC (Partner Commissions) by month
 * This extracts agent commissions from bookings to show B2B customer acquisition costs
 */

const fs = require('fs');
const path = require('path');

const year = process.argv[2] || '2024';

console.log('================================================================================');
console.log(`B2B CAC (Partner Commissions) - ${year}`);
console.log('================================================================================');
console.log('');

try {
    const dataFile = path.join(__dirname, `${year}/all-courses-${year}.json`);
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

    // Initialize monthly totals
    const monthlyCommissions = {
        '01': { month: 'JAN', commissions: 0, count: 0 },
        '02': { month: 'FEB', commissions: 0, count: 0 },
        '03': { month: 'MAR', commissions: 0, count: 0 },
        '04': { month: 'APR', commissions: 0, count: 0 },
        '05': { month: 'MAY', commissions: 0, count: 0 },
        '06': { month: 'JUN', commissions: 0, count: 0 },
        '07': { month: 'JUL', commissions: 0, count: 0 },
        '08': { month: 'AUG', commissions: 0, count: 0 },
        '09': { month: 'SEP', commissions: 0, count: 0 },
        '10': { month: 'OCT', commissions: 0, count: 0 },
        '11': { month: 'NOV', commissions: 0, count: 0 },
        '12': { month: 'DEC', commissions: 0, count: 0 }
    };

    // Process all bookings (morning + afternoon + accommodation)
    ['morning', 'afternoon', 'accommodation'].forEach(category => {
        if (data.data[category]) {
            data.data[category].forEach(booking => {
                // Only count agent bookings with commissions
                if (booking.studentType === 'agent' && booking.commission > 0 && booking.invoiceDate) {
                    const invoiceMonth = booking.invoiceDate.substring(5, 7); // Extract MM from YYYY-MM-DD
                    if (monthlyCommissions[invoiceMonth]) {
                        monthlyCommissions[invoiceMonth].commissions += booking.commission;
                        monthlyCommissions[invoiceMonth].count++;
                    }
                }
            });
        }
    });

    // Display results
    console.log('Partner Commissions (B2B CAC) by Month:');
    console.log('');
    console.log('MONTH | COMMISSIONS | # BOOKINGS');
    console.log('------|-------------|------------');

    let yearTotal = 0;
    let yearCount = 0;

    Object.keys(monthlyCommissions).forEach(monthKey => {
        const m = monthlyCommissions[monthKey];
        console.log(`${m.month.padEnd(5)} | €${m.commissions.toFixed(2).padStart(10)} | ${String(m.count).padStart(10)}`);
        yearTotal += m.commissions;
        yearCount += m.count;
    });

    console.log('------|-------------|------------');
    console.log(`TOTAL | €${yearTotal.toFixed(2).padStart(10)} | ${String(yearCount).padStart(10)}`);
    console.log('');

    // Output JSON for easy import
    const outputData = {
        year,
        monthly: Object.keys(monthlyCommissions).map(key => ({
            month: monthlyCommissions[key].month,
            commissions: parseFloat(monthlyCommissions[key].commissions.toFixed(2)),
            bookings: monthlyCommissions[key].count
        })),
        total: {
            commissions: parseFloat(yearTotal.toFixed(2)),
            bookings: yearCount
        }
    };

    const outputFile = path.join(__dirname, `${year}/b2b-cac-${year}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
    console.log(`✓ Saved to: ${outputFile}`);

} catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
}
