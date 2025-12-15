const data = require('./2017/01-2017.json');

let found = false;
for (let inv of data.invoices) {
    if (inv.invoiceNumber === 'D2017051') {
        console.log('Invoice D2017051 (raw extraction):');
        console.log('');
        console.log('Courses array:');
        inv.courses.forEach(c => {
            console.log('  Category:', c.category);
            console.log('  Name:', c.name);
            console.log('  Hours:', c.hours);
            console.log('  Weeks:', c.weeks);
            console.log('');
        });
        console.log('Line Items:');
        inv.lineItems.forEach(item => {
            console.log('  -', item.description);
            console.log('    Amount:', item.amount, '| NADC:', item.nadc);
        });
        found = true;
        break;
    }
}

if (!found) {
    console.log('Invoice not found in Jan 2017');
}
