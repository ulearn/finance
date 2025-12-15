/**
 * Check how many 2017 INVOICE DATES appear in each year's data
 */

const years = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

console.log('Checking for invoices dated 2017-* across all years...');
console.log('');

let total2017Invoices = 0;
let total2017Revenue = 0;

years.forEach(year => {
    try {
        const data = require(`./${year}/all-courses-${year}.json`);

        const morning2017 = data.data.morning.filter(b => b.invoiceDate.startsWith('2017-'));
        const afternoon2017 = data.data.afternoon.filter(b => b.invoiceDate.startsWith('2017-'));

        const count = morning2017.length + afternoon2017.length;
        const revenue = morning2017.reduce((sum, b) => sum + b.courseFeeNADC, 0) +
                       afternoon2017.reduce((sum, b) => sum + b.courseFeeNADC, 0);

        if (count > 0) {
            console.log(`${year} data contains: ${count} bookings with 2017 invoice dates, €${revenue.toFixed(2)}`);
            total2017Invoices += count;
            total2017Revenue += revenue;
        }
    } catch (e) {
        // Skip
    }
});

console.log('');
console.log('================================================================================');
console.log(`TOTAL bookings with 2017 invoice dates: ${total2017Invoices}`);
console.log(`TOTAL revenue with 2017 invoice dates: €${total2017Revenue.toFixed(2)}`);
console.log('================================================================================');
