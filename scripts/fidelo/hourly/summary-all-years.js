/**
 * Summary of All Years 2017-2024
 */

const years = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

console.log('================================================================================');
console.log('HOURLY RATE ANALYSIS - ALL YEARS SUMMARY');
console.log('================================================================================');
console.log('');

let totalMorning = 0;
let totalAfternoon = 0;

years.forEach(year => {
    try {
        const data = require(`./${year}/all-courses-${year}.json`);
        const morningRev = data.summary.morning.revenue;
        const afternoonRev = data.summary.afternoon.revenue;

        totalMorning += morningRev;
        totalAfternoon += afternoonRev;

        console.log(`${year}:`);
        console.log(`  Morning:   ${data.summary.morning.count.toString().padStart(4)} bookings  €${morningRev.toFixed(2).padStart(12)}`);
        console.log(`  Afternoon: ${data.summary.afternoon.count.toString().padStart(4)} bookings  €${afternoonRev.toFixed(2).padStart(12)}`);
        console.log('');
    } catch (e) {
        console.log(`${year}: File not found or error`);
        console.log('');
    }
});

console.log('================================================================================');
console.log('TOTALS:');
console.log(`  Morning revenue:   €${totalMorning.toFixed(2)}`);
console.log(`  Afternoon revenue: €${totalAfternoon.toFixed(2)}`);
console.log(`  Combined:          €${(totalMorning + totalAfternoon).toFixed(2)}`);
console.log('================================================================================');
