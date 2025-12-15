/**
 * Filter Software/Hosting transactions to exclude non-sales software
 * Exclude: Zoho, HRM, Fidelo, MiniExtensions, Xero, LUCIDCHART, Adobe
 */

const fs = require('fs');
const path = require('path');

// Software to EXCLUDE (not sales-related)
const EXCLUDED_KEYWORDS = [
    'zoho',
    'hrm',
    'fidelo',
    'miniextensions',
    'xero',
    'lucidchart',
    'adobe',
    'payroll',
    'accounting',
    'bookkeeping',
    'zoom',  // Video conferencing - operational
    'tradingview',  // Financial charts - not sales
    'carbonite',  // Backup - operational
    'flickr',  // Photo storage - not sales
    'lastpass',  // Password manager - operational
    'receipt bank',  // Accounting tool
    'spotify',  // Music - not sales
    'playstation',  // Entertainment - not sales
    'audible',  // Audiobooks - not sales
    'youtube premium',  // Not sales
    'occulus',  // VR - not sales
    'viber',  // Personal communication
    'github',  // Development - operational
    'claude ai',  // AI tool - operational
    'gtmhub',  // OKR software - operational
    'wrike',  // Project management - operational
    'airtable',  // Database - operational (unless used for CRM)
    'myinterview',  // HR tool
    'koinly',  // Crypto tax - accounting
    'cointracking',  // Crypto tax - accounting
    'fathom',  // Analytics (could be sales, but unlikely)
    'pitney bowes',  // Postage - operational
    'duronic',  // Equipment brand - not software
    'lycamobile',  // Phone service - operational
    'storage world',  // Physical storage - not software
    'expenses app',  // Expense tracking - accounting
    'skype credits'  // Communication - operational
];

// Software that IS sales-related (for reference)
const SALES_KEYWORDS = [
    'hubspot',
    'mailchimp',
    'sendgrid',
    'twilio',
    'stripe',
    'calendly',
    'zapier',
    'intercom',
    'drift',
    'chat',
    'crm',
    'marketing',
    'email campaign',
    'messagebird',  // SMS/messaging - likely sales
    'toutapp',  // Email tracking - sales
    'highrise',  // CRM - sales
    'zopim',  // Live chat - sales
    'wistia',  // Video hosting - likely sales/marketing
    'gmelius',  // Email collaboration - could be sales
    'buffer',  // Social media scheduling - marketing
    'cookiebot',  // GDPR compliance - customer-facing
    'hosting',  // Web hosting - customer-facing
    'domain',  // Domain registration - customer-facing
    'godaddy',  // Hosting/domain - customer-facing
    'ssl',  // Security certificates - customer-facing
    'sucuri',  // Website security - customer-facing
    'make.com',  // Automation - could be sales
    'cazoomi'  // Integration - could be sales
];

function analyzeSoftwareTransactions() {
    console.log('\n================================================================================');
    console.log('FILTERING SOFTWARE TRANSACTIONS - SALES-ONLY');
    console.log('================================================================================\n');

    const csvPath = path.join(__dirname, 'ULearn_Limited_-_Software-Account_Transactions.csv');
    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.split('\n');

    // Find the header row
    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Date,Source,Description')) {
            headerIndex = i;
            break;
        }
    }

    if (headerIndex === -1) {
        console.error('Could not find header row');
        return;
    }

    console.log(`Found header at line ${headerIndex + 1}\n`);

    // Parse transactions
    const transactions = [];
    let inDataSection = false;

    for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Skip section headers
        if (line.startsWith('Software / Hosting,')) {
            inDataSection = true;
            continue;
        }

        if (!inDataSection) continue;

        const parts = line.split(',');
        if (parts.length < 10) continue;

        const date = parts[0];
        const source = parts[1];
        const description = parts[2];
        const reference = parts[3];
        const currency = parts[4];
        const debitSource = parseFloat(parts[5]) || 0;
        const creditSource = parseFloat(parts[6]) || 0;
        const debitEUR = parseFloat(parts[7]) || 0;
        const creditEUR = parseFloat(parts[8]) || 0;

        if (!date) continue; // Skip if no date

        transactions.push({
            date,
            source,
            description,
            reference,
            currency,
            debitSource,
            creditSource,
            debitEUR,
            creditEUR,
            amount: debitEUR || creditEUR
        });
    }

    console.log(`Total transactions: ${transactions.length}\n`);

    // Categorize transactions
    const excluded = [];
    const included = [];
    const uncertain = [];

    transactions.forEach(txn => {
        const searchText = `${txn.description} ${txn.reference}`.toLowerCase();

        const isExcluded = EXCLUDED_KEYWORDS.some(keyword => searchText.includes(keyword));
        const isSales = SALES_KEYWORDS.some(keyword => searchText.includes(keyword));

        if (isExcluded) {
            excluded.push(txn);
        } else if (isSales || searchText.includes('sales') || searchText.includes('marketing')) {
            included.push(txn);
        } else {
            uncertain.push(txn);
        }
    });

    console.log(`EXCLUDED (Non-sales): ${excluded.length} transactions`);
    console.log(`INCLUDED (Sales): ${included.length} transactions`);
    console.log(`UNCERTAIN: ${uncertain.length} transactions\n`);

    // Show excluded summary
    console.log('=== EXCLUDED SOFTWARE (by vendor) ===\n');
    const excludedByVendor = groupByVendor(excluded);
    Object.entries(excludedByVendor)
        .sort((a, b) => b[1].total - a[1].total)
        .forEach(([vendor, data]) => {
            console.log(`${vendor.padEnd(40)} | €${data.total.toFixed(2).padStart(12)} | ${data.count} txns`);
        });

    console.log(`\n${'TOTAL EXCLUDED'.padEnd(40)} | €${excluded.reduce((sum, t) => sum + t.amount, 0).toFixed(2).padStart(12)}`);

    // Show included summary
    console.log('\n=== INCLUDED SOFTWARE (Sales-related, by vendor) ===\n');
    const includedByVendor = groupByVendor(included);
    Object.entries(includedByVendor)
        .sort((a, b) => b[1].total - a[1].total)
        .forEach(([vendor, data]) => {
            console.log(`${vendor.padEnd(40)} | €${data.total.toFixed(2).padStart(12)} | ${data.count} txns`);
        });

    console.log(`\n${'TOTAL INCLUDED'.padEnd(40)} | €${included.reduce((sum, t) => sum + t.amount, 0).toFixed(2).padStart(12)}`);

    // Show uncertain for manual review
    if (uncertain.length > 0) {
        console.log('\n=== UNCERTAIN - NEEDS MANUAL REVIEW ===\n');
        const uncertainByVendor = groupByVendor(uncertain);
        Object.entries(uncertainByVendor)
            .sort((a, b) => b[1].total - a[1].total)
            .forEach(([vendor, data]) => {
                console.log(`${vendor.padEnd(40)} | €${data.total.toFixed(2).padStart(12)} | ${data.count} txns`);
            });

        console.log(`\n${'TOTAL UNCERTAIN'.padEnd(40)} | €${uncertain.reduce((sum, t) => sum + t.amount, 0).toFixed(2).padStart(12)}`);
    }

    // Calculate by year
    console.log('\n=== SALES SOFTWARE COSTS BY YEAR ===\n');
    calculateByYear(included);

    return { excluded, included, uncertain };
}

function groupByVendor(transactions) {
    const grouped = {};

    transactions.forEach(txn => {
        // Extract vendor name from description
        let vendor = extractVendorName(txn.description);

        if (!grouped[vendor]) {
            grouped[vendor] = { count: 0, total: 0 };
        }
        grouped[vendor].count++;
        grouped[vendor].total += txn.amount;
    });

    return grouped;
}

function extractVendorName(description) {
    // Try to extract vendor name from description
    const desc = description.toLowerCase();

    // Common patterns
    if (desc.includes('hubspot')) return 'HubSpot';
    if (desc.includes('mailchimp')) return 'MailChimp';
    if (desc.includes('sendgrid')) return 'SendGrid';
    if (desc.includes('twilio')) return 'Twilio';
    if (desc.includes('stripe')) return 'Stripe';
    if (desc.includes('google')) return 'Google';
    if (desc.includes('microsoft') || desc.includes('office')) return 'Microsoft';
    if (desc.includes('aws') || desc.includes('amazon')) return 'AWS';
    if (desc.includes('hosting') || desc.includes('domain')) return 'Hosting/Domain';
    if (desc.includes('ssl') || desc.includes('certificate')) return 'SSL/Security';

    // Extract from start of description
    const parts = description.split(' - ');
    if (parts.length > 0) {
        return parts[0].trim();
    }

    return description.substring(0, 40);
}

function calculateByYear(transactions) {
    const byYear = {};

    transactions.forEach(txn => {
        // Extract year from date (format: "02 Jan 2017")
        const parts = txn.date.split(' ');
        const year = parts[2];

        if (!year) return;

        if (!byYear[year]) {
            byYear[year] = { total: 0, count: 0, byMonth: {} };
        }

        byYear[year].total += txn.amount;
        byYear[year].count++;

        // Also track by month
        const month = parts[1];
        if (!byYear[year].byMonth[month]) {
            byYear[year].byMonth[month] = 0;
        }
        byYear[year].byMonth[month] += txn.amount;
    });

    // Display
    Object.keys(byYear).sort().forEach(year => {
        const data = byYear[year];
        console.log(`${year}: €${data.total.toFixed(2)} (${data.count} transactions)`);
    });

    // Save detailed breakdown to JSON
    const outputPath = path.join(__dirname, 'sales-software-costs-by-year.json');
    fs.writeFileSync(outputPath, JSON.stringify(byYear, null, 2));
    console.log(`\n✓ Saved detailed breakdown to: ${outputPath}`);
}

// Run
analyzeSoftwareTransactions();
