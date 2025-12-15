const data = require('./2017/01-2017.json');

const cats = {};
data.invoices.forEach(inv => {
    if (inv.courses) {
        inv.courses.forEach(c => {
            if (!cats[c.category]) cats[c.category] = [];
            if (!cats[c.category].includes(c.name)) cats[c.category].push(c.name);
        });
    }
});

console.log('All course categories and names in Jan 2017:');
console.log('');
Object.keys(cats).sort().forEach(cat => {
    console.log(cat + ':');
    cats[cat].forEach(name => console.log('  - ' + name));
    console.log('');
});
