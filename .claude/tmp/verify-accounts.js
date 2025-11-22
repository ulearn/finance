const fs = require('fs');

// Load Chart of Accounts
const coa = JSON.parse(fs.readFileSync('Docs/Xero/chart-of-accounts.json', 'utf8'));

// Load Decisions File
const decisions = JSON.parse(fs.readFileSync('scripts/xero/recon/ai-decisions/2025-jan-decisions.json', 'utf8'));

// Create lookup map
const accountMap = {};
coa.accounts.forEach(acc => {
  if (acc.code) {
    accountMap[acc.code] = acc.name;
  }
});

// Verify each decision
let allCorrect = true;
decisions.decisions.forEach((decision, idx) => {
  if (decision.action !== 'EXCLUDE' && decision.action !== 'SKIP') {
    const code = decision.accountCode;
    const nameInDecision = decision.accountName;
    const nameInCOA = accountMap[code];

    if (!nameInCOA) {
      console.log(`❌ Transaction ${idx + 1}: Code "${code}" NOT FOUND in Chart of Accounts!`);
      allCorrect = false;
    } else if (nameInCOA !== nameInDecision) {
      console.log(`❌ Transaction ${idx + 1}: Code "${code}"`);
      console.log(`   Decision says: "${nameInDecision}"`);
      console.log(`   COA says:      "${nameInCOA}"`);
      allCorrect = false;
    }
  }
});

if (allCorrect) {
  console.log('✅ ALL ACCOUNT CODES AND NAMES ARE CORRECT!');
  console.log('');
  console.log('Unique accounts used:');
  const uniqueAccounts = new Set();
  decisions.decisions.forEach(d => {
    if (d.action === 'CREATE') {
      uniqueAccounts.add(`${d.accountCode} = ${d.accountName}`);
    }
  });
  Array.from(uniqueAccounts).sort().forEach(acc => console.log(`  ${acc}`));
}
