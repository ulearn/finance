const fs = require('fs');
const data = JSON.parse(fs.readFileSync('all-courses-2025.json', 'utf8'));

console.log('Generating B2C sales data from all-courses-2025.json...');

const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const b2cByMonth = {};

// Count B2C students by month from morning and afternoon sessions
['morning', 'afternoon'].forEach(session => {
    if (data.data[session]) {
        data.data[session].forEach(booking => {
            if (booking.studentType === 'direct' && booking.invoiceDate) {
                const monthIndex = parseInt(booking.invoiceDate.split('-')[1]) - 1;
                const month = months[monthIndex];
                
                if (!b2cByMonth[month]) b2cByMonth[month] = { salesWon: 0 };
                b2cByMonth[month].salesWon++;
            }
        });
    }
});

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
console.log(`Total B2C students: ${totalB2CSales}`);

// Display by month
console.log('\nB2C Sales by month:');
b2cMonthly.forEach(m => {
    if (m.salesWon > 0) console.log(`${m.month}: ${m.salesWon} students`);
});
