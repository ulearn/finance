const data = require('./2017/01-2017.json');

let processedCount = 0;
let droppedCount = 0;
let droppedExamples = [];

data.invoices.forEach(inv => {
  let courseItems = [];

  inv.lineItems.forEach(item => {
    const desc = item.description.toLowerCase();
    const hasWeek = desc.includes('week');
    const hasHour = desc.includes('hour');

    const isExcluded = desc.includes('supplement') ||
                      desc.includes('accommodation') ||
                      desc.includes('apartment') ||
                      desc.includes('host family') ||
                      desc.includes('homestay') ||
                      desc.includes('residence') ||
                      desc.includes('placement') ||
                      desc.includes('exam') ||
                      desc.includes('insurance') ||
                      desc.includes('health') ||
                      desc.includes('pel') ||
                      desc.includes('registration') ||
                      desc.includes('arrival') ||
                      desc.includes('transfer') ||
                      desc.includes('book') ||
                      desc.includes('material') ||
                      desc.includes('evening') ||
                      desc.includes('after work');

    if ((hasWeek || hasHour) && !isExcluded) {
      const weeksMatch = item.description.match(/(\d+)\s+week/i);
      const weeks = weeksMatch ? parseInt(weeksMatch[1]) : 0;

      courseItems.push({
        description: item.description,
        weeks: weeks,
        nadc: item.nadc
      });
    }
  });

  if (courseItems.length > 0) {
    const totalWeeks = courseItems.reduce((sum, c) => sum + c.weeks, 0);

    if (totalWeeks > 0) {
      processedCount++;
    } else {
      droppedCount++;
      if (droppedExamples.length < 10) {
        droppedExamples.push({
          invoice: inv.invoiceNumber,
          courses: courseItems
        });
      }
    }
  }
});

console.log('January 2017 Processing Analysis:');
console.log('');
console.log('Invoices WITH courses that have weeks > 0:', processedCount);
console.log('Invoices WITH courses but weeks = 0:', droppedCount);
console.log('');
console.log('Examples of dropped invoices (courses with 0 weeks):');
droppedExamples.forEach(ex => {
  console.log('');
  console.log('Invoice:', ex.invoice);
  ex.courses.forEach(c => {
    console.log('  -', c.description);
    console.log('    Weeks:', c.weeks, '| NADC: €' + c.nadc);
  });
});
