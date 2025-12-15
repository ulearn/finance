/**
 * Process 2025 sales data from 2025-full-year.json
 */

const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync('2025-full-year.json', 'utf8'));

console.log('Processing 2025 sales data...');
console.log(`Total bookings: ${data.summary.totalBookings}\n`);

// Initialize
const hourlyRates = {
    morning: { b2c: { totalRevenue: 0, totalHours: 0, count: 0 }, b2b: { totalRevenue: 0, totalHours: 0, count: 0 } },
    afternoon: { b2c: { totalRevenue: 0, totalHours: 0, count: 0 }, b2b: { totalRevenue: 0, totalHours: 0, count: 0 } }
};

const b2bByMonth = {};
const b2cByMonth = {};

// Process bookings
data.results.forEach(booking => {
    const isMorning = booking.courseName.toLowerCase().includes('morning');
    const isB2B = booking.hasAgent === true || booking.studentType === 'agent';
    const channel = isB2B ? 'b2b' : 'b2c';
    const session = isMorning ? 'morning' : 'afternoon';

    hourlyRates[session][channel].totalRevenue += booking.courseFeeNADC || 0;
    hourlyRates[session][channel].totalHours += booking.totalHours || 0;
    hourlyRates[session][channel].count++;

    if (booking.invoiceDate) {
        const monthIndex = parseInt(booking.invoiceDate.split('-')[1]) - 1;
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const month = months[monthIndex];

        if (isB2B) {
            if (!b2bByMonth[month]) b2bByMonth[month] = { commissions: 0, bookings: 0 };
            b2bByMonth[month].commissions += booking.commission || 0;
            b2bByMonth[month].bookings++;
        } else {
            if (!b2cByMonth[month]) b2cByMonth[month] = { salesWon: 0 };
            b2cByMonth[month].salesWon++;
        }
    }
});

// Calculate rates
['morning', 'afternoon'].forEach(session => {
    ['b2c', 'b2b'].forEach(channel => {
        const d = hourlyRates[session][channel];
        d.avgRate = d.totalHours > 0 ? d.totalRevenue / d.totalHours : 0;
    });
});

// Save hourly rates
const hourlyRatesOutput = {
    year: '2025',
    generatedAt: new Date().toISOString(),
    rates: {
        morning: {
            b2c: parseFloat(hourlyRates.morning.b2c.avgRate.toFixed(2)),
            b2b: parseFloat(hourlyRates.morning.b2b.avgRate.toFixed(2))
        },
        afternoon: {
            b2c: parseFloat(hourlyRates.afternoon.b2c.avgRate.toFixed(2)),
            b2b: parseFloat(hourlyRates.afternoon.b2b.avgRate.toFixed(2))
        }
    },
    details: hourlyRates
};

fs.writeFileSync('hourly-rates-2025.json', JSON.stringify(hourlyRatesOutput, null, 2));
console.log('✓ hourly-rates-2025.json');

// Save B2B CAC
const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const b2bMonthly = months.map(month => ({
    month,
    commissions: b2bByMonth[month]?.commissions || 0,
    bookings: b2bByMonth[month]?.bookings || 0
}));

const totalCommissions = b2bMonthly.reduce((s, m) => s + m.commissions, 0);
const totalBookings = b2bMonthly.reduce((s, m) => s + m.bookings, 0);

fs.writeFileSync('b2b-cac-2025.json', JSON.stringify({
    year: '2025',
    generatedAt: new Date().toISOString(),
    monthly: b2bMonthly,
    total: { commissions: totalCommissions, bookings: totalBookings }
}, null, 2));
console.log('✓ b2b-cac-2025.json');

// Save B2C Sales
const b2cMonthly = months.map(month => ({
    month,
    salesWon: b2cByMonth[month]?.salesWon || 0
}));

const totalB2CSales = b2cMonthly.reduce((s, m) => s + m.salesWon, 0);

fs.writeFileSync('b2c-sales-2025.json', JSON.stringify({
    year: '2025',
    generatedAt: new Date().toISOString(),
    monthly: b2cMonthly,
    total: { salesWon: totalB2CSales }
}, null, 2));
console.log('✓ b2c-sales-2025.json');

console.log(`\nTotal B2B: ${totalBookings} bookings, €${totalCommissions.toFixed(2)}`);
console.log(`Total B2C: ${totalB2CSales} students`);
