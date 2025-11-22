// Verify Host Family Contacts in Xero
// Location: /home/hub/public_html/fins/scripts/xero/verify-hosts.js

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

async function verifyHosts() {
    const baseUrl = 'https://hub.ulearnschool.com/fins';

    // Load host families list
    const hostsFile = path.join(__dirname, '../../Docs/Xero/host-families-list.txt');
    const hostsContent = await fs.readFile(hostsFile, 'utf8');
    const hostNames = hostsContent.split('\n').filter(n => n.trim());

    console.log(`\nChecking ${hostNames.length} host families in Xero...\n`);

    // Fetch all contacts from Xero
    const response = await axios.get(`${baseUrl}/xero/contacts`);
    const xeroContacts = response.data.contacts;

    console.log(`Total Xero contacts: ${xeroContacts.length}\n`);

    const results = {
        found: [],
        notFound: [],
        possibleMatches: []
    };

    // Check each host
    for (const hostName of hostNames) {
        const normalizedHost = hostName.trim().toUpperCase();

        // Try exact match
        let match = xeroContacts.find(c =>
            c.name && c.name.toUpperCase() === normalizedHost
        );

        if (match) {
            results.found.push({
                hostName,
                xeroName: match.name,
                contactID: match.contactID,
                email: match.emailAddress || 'No email',
                groups: match.contactGroups?.map(g => g.name).join(', ') || 'No groups'
            });
            continue;
        }

        // Try partial match (might have prefix like "AP")
        match = xeroContacts.find(c =>
            c.name && c.name.toUpperCase().includes(normalizedHost)
        );

        if (match) {
            results.possibleMatches.push({
                hostName,
                xeroName: match.name,
                contactID: match.contactID,
                email: match.emailAddress || 'No email',
                groups: match.contactGroups?.map(g => g.name).join(', ') || 'No groups'
            });
            continue;
        }

        // Not found
        results.notFound.push(hostName);
    }

    // Print results
    console.log('=== RESULTS ===\n');
    console.log(`✓ Found (exact match): ${results.found.length}`);
    console.log(`⚠ Possible matches: ${results.possibleMatches.length}`);
    console.log(`✗ Not found: ${results.notFound.length}\n`);

    if (results.found.length > 0) {
        console.log('\n--- FOUND IN XERO ---');
        results.found.forEach(h => {
            console.log(`✓ ${h.hostName}`);
            console.log(`  Xero: ${h.xeroName}`);
            console.log(`  Groups: ${h.groups}`);
            console.log(`  Email: ${h.email}\n`);
        });
    }

    if (results.possibleMatches.length > 0) {
        console.log('\n--- POSSIBLE MATCHES (verify manually) ---');
        results.possibleMatches.forEach(h => {
            console.log(`⚠ ${h.hostName}`);
            console.log(`  Xero: ${h.xeroName}`);
            console.log(`  Groups: ${h.groups}\n`);
        });
    }

    if (results.notFound.length > 0) {
        console.log('\n--- NOT FOUND IN XERO ---');
        results.notFound.forEach(h => console.log(`✗ ${h}`));
    }

    // Save results
    const outputFile = path.join(__dirname, '../../Docs/Xero/host-verification-results.json');
    await fs.writeFile(outputFile, JSON.stringify(results, null, 2));
    console.log(`\n✓ Results saved to: ${outputFile}`);

    return results;
}

if (require.main === module) {
    verifyHosts()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Error:', error.message);
            process.exit(1);
        });
}

module.exports = { verifyHosts };
