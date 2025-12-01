const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/home/hub/public_html/fins/scripts/assign/2025/11-nov-assign.json', 'utf8'));

console.log('TRACKER STATS:');
console.log(JSON.stringify(data.stats, null, 2));

console.log('\n\nBREAKDOWN BY STATUS:');
const allTxns = [...data.transactions.boi, ...data.transactions.stripe, ...data.transactions.revolut];

const byStatus = {};
allTxns.forEach(t => {
    if (!byStatus[t.assignStatus]) byStatus[t.assignStatus] = [];
    byStatus[t.assignStatus].push(`${t.source}: €${t.amount} - ${(t.description || t.customerName || 'Unknown').substring(0, 40)}`);
});

Object.keys(byStatus).sort().forEach(status => {
    console.log(`\n${status.toUpperCase()} (${byStatus[status].length}):`);
    byStatus[status].forEach(desc => console.log(`  - ${desc}`));
});
