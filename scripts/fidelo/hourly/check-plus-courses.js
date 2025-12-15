const master = require('./2017/2017-master.json');

let plusCount = 0;
let examples = [];

master.invoices.forEach(inv => {
    inv.lineItems.forEach(item => {
        const desc = item.description.toLowerCase();
        if ((desc.includes('plus') || desc.includes('gem20')) && !desc.includes('supplement')) {
            plusCount++;
            if (examples.length < 10) examples.push(item.description);
        }
    });
});

console.log('Plus/GEM20 course items:', plusCount);
console.log('');
console.log('Examples:');
examples.forEach(ex => console.log('  -', ex));
