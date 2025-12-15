const data = require('./2017/01-2017.json');
const invoices = data.invoices;

let totalCourseFees = 0;
let totalAccomm = 0;
let totalOther = 0;
let courseCount = 0;

invoices.forEach(inv => {
  inv.lineItems.forEach(item => {
    const desc = item.description.toLowerCase();

    const isCourse = (desc.includes('week') || desc.includes('hour')) &&
                     !desc.includes('accommodation') &&
                     !desc.includes('apartment') &&
                     !desc.includes('homestay') &&
                     !desc.includes('residence') &&
                     !desc.includes('supplement') &&
                     !desc.includes('insurance') &&
                     !desc.includes('exam') &&
                     !desc.includes('registration') &&
                     !desc.includes('transfer') &&
                     !desc.includes('placement');

    const isAccomm = desc.includes('accommodation') || desc.includes('apartment') ||
                     desc.includes('homestay') || desc.includes('residence');

    if (isCourse) {
      totalCourseFees += item.nadc;
      courseCount++;
    } else if (isAccomm) {
      totalAccomm += item.nadc;
    } else {
      totalOther += item.nadc;
    }
  });
});

console.log('January 2017 Revenue Breakdown:');
console.log('');
console.log('Course Fees (NADC):', '€' + totalCourseFees.toFixed(2));
console.log('Course line items:', courseCount);
console.log('');
console.log('Accommodation:', '€' + totalAccomm.toFixed(2));
console.log('Other (insurance, exams, etc):', '€' + totalOther.toFixed(2));
console.log('');
console.log('Total:', '€' + (totalCourseFees + totalAccomm + totalOther).toFixed(2));
console.log('Total in file:', '€' + data.summary.totalRevenue.toFixed(2));
