// Parse Bank Rules from Xero export
// Location: /home/hub/public_html/fins/scripts/xero/parse-bank-rules.js

const fs = require('fs').promises;
const path = require('path');

async function parseBankRules() {
    const rulesFile = path.join(__dirname, '../../Docs/Xero/Bank Rules/Bank-Rule-List.md');
    const content = await fs.readFile(rulesFile, 'utf8');

    const rules = {
        hostFamilies: [],
        employees: [],
        vendors: [],
        utilities: [],
        software: [],
        other: []
    };

    const lines = content.split('\n');
    let currentRule = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Skip empty lines
        if (!line) continue;

        // Check if it's a rule name line (follows pattern of previous number)
        if (!line.match(/^\d+$/) && line.length > 0) {
            const ruleName = line;

            // Categorize by type
            if (ruleName.startsWith('Accomm Host')) {
                const hostName = ruleName.replace(/^Accomm Hosts? ?(-|TO)? ?/, '').trim();
                rules.hostFamilies.push({
                    name: hostName,
                    ruleName: ruleName,
                    category: 'Host Family',
                    account: 'A100 - Accomm - Host Pay',
                    taxRate: 'Tax Exempt (0%)',
                    pattern: `TO ${hostName}`
                });
            }
            else if (ruleName.startsWith('Employee')) {
                const employeeName = ruleName.replace(/^Employee ?(-|TO)? ?/, '').trim();
                rules.employees.push({
                    name: employeeName,
                    ruleName: ruleName,
                    category: 'Employee',
                    account: 'Payroll/Wages',
                    pattern: employeeName
                });
            }
            else if (ruleName === 'Payroll') {
                rules.employees.push({
                    name: 'Payroll',
                    ruleName: ruleName,
                    category: 'Payroll',
                    account: 'Payroll/Wages'
                });
            }
            else if (ruleName.includes('Google') || ruleName.includes('Adobe') ||
                     ruleName.includes('Software') || ruleName.includes('MailChimp') ||
                     ruleName.includes('GitHub') || ruleName.includes('Spotify') ||
                     ruleName.includes('Buffer') || ruleName.includes('ToutApp')) {
                rules.software.push({
                    name: ruleName,
                    ruleName: ruleName,
                    category: 'Software/SaaS',
                    account: 'Technology/Software'
                });
            }
            else if (ruleName.includes('Bord Gais') || ruleName.includes('ELECTRIC') ||
                     ruleName.includes('Flogas') || ruleName.includes('Telephone')) {
                rules.utilities.push({
                    name: ruleName,
                    ruleName: ruleName,
                    category: 'Utilities',
                    account: 'Utilities'
                });
            }
            else if (ruleName.includes('Rent') || ruleName.includes('Insurance') ||
                     ruleName.includes('Bank Charges') || ruleName.includes('Tax Payment')) {
                rules.vendors.push({
                    name: ruleName,
                    ruleName: ruleName,
                    category: 'General Expense',
                    account: 'Operating Expenses'
                });
            }
            else {
                rules.other.push({
                    name: ruleName,
                    ruleName: ruleName,
                    category: 'Other'
                });
            }
        }
    }

    return rules;
}

// Export structured rules
async function exportRules() {
    const rules = await parseBankRules();

    console.log('\n=== Bank Rules Summary ===\n');
    console.log(`Host Families: ${rules.hostFamilies.length}`);
    console.log(`Employees: ${rules.employees.length}`);
    console.log(`Software/SaaS: ${rules.software.length}`);
    console.log(`Utilities: ${rules.utilities.length}`);
    console.log(`General Vendors: ${rules.vendors.length}`);
    console.log(`Other: ${rules.other.length}`);
    console.log(`\nTotal Rules: ${Object.values(rules).reduce((sum, arr) => sum + arr.length, 0)}`);

    // Save to JSON
    const outputFile = path.join(__dirname, '../../Docs/Xero/bank-rules-structured.json');
    await fs.writeFile(outputFile, JSON.stringify(rules, null, 2));
    console.log(`\n✓ Saved to: ${outputFile}`);

    // Export host family names list
    const hostNames = rules.hostFamilies.map(h => h.name).sort();
    const hostsFile = path.join(__dirname, '../../Docs/Xero/host-families-list.txt');
    await fs.writeFile(hostsFile, hostNames.join('\n'));
    console.log(`✓ Host families list: ${hostsFile}`);

    return rules;
}

if (require.main === module) {
    exportRules()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Error:', error);
            process.exit(1);
        });
}

module.exports = { parseBankRules, exportRules };
