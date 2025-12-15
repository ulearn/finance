/**
 * Verify 2017 Data Quality
 *
 * Checks that the processed data has correct hours calculation
 * and compares Direct vs Agent rates
 */

const data = require('./2017/all-courses-2017.json');
const master = require('./2017/2017-master.json');

console.log('================================================================================');
console.log('2017 DATA QUALITY VERIFICATION');
console.log('================================================================================');
console.log('');

// 1. Check hours calculation
console.log('1. HOURS CALCULATION CHECK');
console.log('-'.repeat(80));

const zeroHours = data.data.morning.filter(b => b.totalHours === 0);
console.log(`Bookings with 0 hours: ${zeroHours.length}`);

if (zeroHours.length > 0) {
    console.log('Examples of 0-hour bookings:');
    zeroHours.slice(0, 5).forEach(b => {
        console.log(`  ${b.invoice}: ${b.weeks} weeks, ${b.totalHours} hours`);
        b.courseItems.forEach(item => {
            console.log(`    - ${item.description}`);
        });
    });
}

// Sample different hour types
const hourTypes = {
    '15': data.data.morning.filter(b => b.courseItems.some(i => i.hoursPerWeek === 15)),
    '20': data.data.morning.filter(b => b.courseItems.some(i => i.hoursPerWeek === 20)),
    '30': data.data.morning.filter(b => b.courseItems.some(i => i.hoursPerWeek === 30))
};

console.log('');
console.log('Bookings by hours per week:');
console.log(`  15 hours/week: ${hourTypes['15'].length} bookings`);
console.log(`  20 hours/week: ${hourTypes['20'].length} bookings`);
console.log(`  30 hours/week: ${hourTypes['30'].length} bookings`);

console.log('');
console.log('Sample 20-hour bookings:');
hourTypes['20'].slice(0, 3).forEach(b => {
    console.log(`  ${b.invoice}: ${b.weeks} weeks × 20hrs = ${b.totalHours}hrs, €${b.ratePerHour.toFixed(2)}/hr`);
    b.courseItems.forEach(item => {
        console.log(`    - ${item.description}`);
    });
});

console.log('');
console.log('Sample 30-hour bookings:');
hourTypes['30'].slice(0, 3).forEach(b => {
    console.log(`  ${b.invoice}: ${b.weeks} weeks × 30hrs = ${b.totalHours}hrs, €${b.ratePerHour.toFixed(2)}/hr`);
    b.courseItems.forEach(item => {
        console.log(`    - ${item.description}`);
    });
});

// 2. Direct vs Agent comparison
console.log('');
console.log('');
console.log('2. DIRECT vs AGENT RATE COMPARISON');
console.log('-'.repeat(80));

const morningDirect = data.data.morning.filter(b => b.studentType === 'direct');
const morningAgent = data.data.morning.filter(b => b.studentType === 'agent');

const directAvgRate = morningDirect.reduce((sum, b) => sum + b.ratePerHour, 0) / morningDirect.length;
const agentAvgRate = morningAgent.reduce((sum, b) => sum + b.ratePerHour, 0) / morningAgent.length;

console.log('Morning courses:');
console.log(`  Direct students: ${morningDirect.length} bookings, avg €${directAvgRate.toFixed(2)}/hr`);
console.log(`  Agent students: ${morningAgent.length} bookings, avg €${agentAvgRate.toFixed(2)}/hr`);
console.log(`  Difference: €${(directAvgRate - agentAvgRate).toFixed(2)}/hr`);

if (directAvgRate <= agentAvgRate) {
    console.log('  ⚠️  WARNING: Direct rate should be higher than Agent rate!');
} else {
    console.log('  ✅ Direct rate is higher than Agent rate (as expected)');
}

// 3. Revenue totals check
console.log('');
console.log('');
console.log('3. REVENUE TOTALS');
console.log('-'.repeat(80));

const masterTotal = master.summary.totalRevenue;
const processedTotal = data.summary.morning.revenue +
                       data.summary.afternoon.revenue +
                       data.summary.accommodation.revenue;

console.log(`Master file total revenue: €${masterTotal.toFixed(2)}`);
console.log(`Processed total (courses + accomm): €${processedTotal.toFixed(2)}`);
console.log(`Difference: €${(masterTotal - processedTotal).toFixed(2)}`);
console.log('(Difference includes registration fees, exams, insurance, etc.)');

// 4. Invoice date distribution
console.log('');
console.log('');
console.log('4. INVOICE DATE DISTRIBUTION');
console.log('-'.repeat(80));

const invoiceMonths = {};
data.data.morning.forEach(b => {
    const month = b.invoiceDate.substring(0, 7);
    invoiceMonths[month] = (invoiceMonths[month] || 0) + 1;
});

const sortedMonths = Object.keys(invoiceMonths).sort();
console.log('Morning course invoices by month:');
sortedMonths.forEach(month => {
    const count = invoiceMonths[month];
    const revenue = data.data.morning
        .filter(b => b.invoiceDate.startsWith(month))
        .reduce((sum, b) => sum + b.courseFeeNADC, 0);
    console.log(`  ${month}: ${count} bookings, €${revenue.toFixed(2)}`);
});

console.log('');
console.log('✅ Verification complete!');
