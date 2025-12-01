const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/home/hub/public_html/fins/scripts/assign/2025/12-dec-tracker.json', 'utf8'));

console.log('UNKNOWN / NO MATCH TRANSACTIONS (Manual Review Required):');
console.log('='.repeat(80));

const allTxns = [...data.transactions.boi, ...data.transactions.stripe, ...data.transactions.revolut];

// Filter for review status where we couldn't identify the student
const unknownTxns = allTxns.filter(t =>
    t.assignStatus === 'review' && (!t.fideloStudentId || !t.fideloInvoice)
);

console.log(`\nFound ${unknownTxns.length} transactions with no match found:\n`);

unknownTxns.forEach((t, i) => {
    const desc = t.description || t.customerName || 'Unknown';
    const source = t.source.toUpperCase();
    console.log(`${i+1}. [${source}] €${t.amount} - ${desc}`);
    console.log(`   Date: ${t.date}`);
    console.log(`   Reference: ${t.reference || 'N/A'}`);
    console.log(`   ID: ${t.id}`);
    console.log('');
});

console.log('='.repeat(80));
console.log(`TOTAL: ${unknownTxns.length} transactions requiring manual investigation`);
console.log('');
console.log('BREAKDOWN BY SOURCE:');
const bySource = {};
unknownTxns.forEach(t => {
    if (!bySource[t.source]) bySource[t.source] = 0;
    bySource[t.source]++;
});
Object.keys(bySource).forEach(source => {
    console.log(`  ${source.toUpperCase()}: ${bySource[source]}`);
});

console.log('\n' + '='.repeat(80));
console.log('TOTAL AMOUNT UNMATCHED: €' + unknownTxns.reduce((sum, t) => sum + t.amount, 0).toFixed(2));
