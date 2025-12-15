/**
 * Extract Sales & Marketing Costs from Xero
 * B2C: Google Ads, SEO & Online Software Tools
 * B2B: Marketing Trips
 * Software: Sales-related only (excluding: Zoho, HRM, Fidelo, MiniExtensions, Xero, LUCIDCHART, Adobe)
 */

const XeroAPIClient = require('./xero-client.js');
const fs = require('fs');
const path = require('path');

// Software to EXCLUDE (not sales-related)
const EXCLUDED_SOFTWARE = [
    'zoho',
    'hrm',
    'fidelo',
    'miniextensions',
    'xero',
    'lucidchart',
    'adobe'
];

async function extractSalesCosts(year) {
    const xero = new XeroAPIClient();

    try {
        console.log(`\n================================================================================`);
        console.log(`EXTRACTING SALES COSTS FROM XERO - ${year}`);
        console.log(`================================================================================\n`);

        // Get monthly P&L
        const fromDate = `${year}-01-01`;
        const toDate = `${year}-12-31`;

        console.log(`Fetching monthly P&L from ${fromDate} to ${toDate}...\n`);

        const report = await xero.getReport('ProfitAndLoss', {
            fromDate,
            toDate,
            periods: 11, // Max is 11, will get 12 months total (current + 11 comparison periods)
            timeframe: 'MONTH',
            standardLayout: false
        });

        const monthlyCosts = initializeMonthlyData();

        if (report && report.reports && report.reports.length > 0) {
            const pl = report.reports[0];

            // Extract from P&L structure
            extractFromPL(pl.rows, monthlyCosts);
        }

        // Now get detailed transactions for Software/Hosting to filter out non-sales software
        console.log('\nFetching Software/Hosting transactions to filter non-sales software...\n');
        await filterSoftwareCosts(xero, year, monthlyCosts);

        // Display results
        displayResults(year, monthlyCosts);

        // Save to file
        const outputPath = path.join(__dirname, `../model/sales/xero-costs-${year}.json`);
        const output = {
            year,
            generatedAt: new Date().toISOString(),
            monthly: monthlyCosts,
            totals: calculateTotals(monthlyCosts),
            notes: {
                b2cAds: 'Google Ad + SEO & Online Software Tools',
                b2bMarketing: 'Marketing Trips',
                software: 'Software/Hosting excluding: Zoho, HRM, Fidelo, MiniExtensions, Xero, LUCIDCHART, Adobe'
            }
        };

        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
        console.log(`\n✓ Saved to: ${outputPath}`);

        return output;

    } catch (error) {
        console.error(`Error extracting costs for ${year}:`, error.message);
        console.error('Full error:', error);
        if (error.response) {
            console.error('API Response:', JSON.stringify(error.response.body, null, 2));
        }
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
        throw error;
    }
}

function initializeMonthlyData() {
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return months.map(month => ({
        month,
        b2cAds: 0,
        b2bMarketing: 0,
        software: 0
    }));
}

function extractFromPL(rows, monthlyCosts) {
    if (!rows) return;

    rows.forEach(row => {
        if (row.rowType === 'Row' && row.cells && row.cells.length > 1) {
            const accountName = row.cells[0].value || '';
            const lowerName = accountName.toLowerCase();

            // B2C Ads: Google Ad + SEO
            if (lowerName.includes('google ad') ||
                lowerName.includes('seo & online software')) {
                extractMonthlyValues(row.cells, monthlyCosts, 'b2cAds');
            }

            // B2B Marketing: Marketing Trips
            if (lowerName.includes('marketing trips')) {
                extractMonthlyValues(row.cells, monthlyCosts, 'b2bMarketing');
            }

            // Software (we'll filter this later with transaction details)
            if (lowerName.includes('software') && lowerName.includes('hosting')) {
                extractMonthlyValues(row.cells, monthlyCosts, 'software');
            }
        }

        if (row.rows) {
            extractFromPL(row.rows, monthlyCosts);
        }
    });
}

function extractMonthlyValues(cells, monthlyCosts, category) {
    // P&L monthly report with periods: [Account Name, Period1, Period2, ..., Period12]
    // Values are cumulative (Year-to-Date), so we need to calculate monthly differences
    if (!cells || cells.length < 13) return;

    let previousYTD = 0;
    for (let i = 1; i <= 12; i++) {
        const cell = cells[i];
        if (cell && cell.value) {
            const currentYTD = parseFloat(cell.value) || 0;
            const monthlyValue = Math.abs(currentYTD - previousYTD); // Get month-specific value
            monthlyCosts[i - 1][category] += monthlyValue;
            previousYTD = currentYTD;
        }
    }
}

async function filterSoftwareCosts(xero, year, monthlyCosts) {
    try {
        // Get all transactions for Software/Hosting account
        // We need to get the account code first
        const accounts = await xero.getAccounts({
            where: 'Name.Contains("Software") AND Name.Contains("Hosting")'
        });

        if (!accounts || !accounts.accounts || accounts.accounts.length === 0) {
            console.log('Warning: Could not find Software/Hosting account');
            return;
        }

        const softwareAccount = accounts.accounts[0];
        console.log(`Found account: ${softwareAccount.name} (${softwareAccount.code})`);

        // Get transactions for this account
        const fromDate = new Date(`${year}-01-01`);
        const toDate = new Date(`${year}-12-31`);

        // Fetch bank transactions that hit this account
        const where = `Status=="AUTHORISED" AND Date >= DateTime(${year},1,1) AND Date <= DateTime(${year},12,31) AND BankAccount.Code=="${softwareAccount.code}"`;

        const transactions = await xero.getBankTransactions({ where });

        if (transactions && transactions.bankTransactions) {
            console.log(`Found ${transactions.bankTransactions.length} software transactions`);

            // Calculate excluded amounts by month
            const excludedByMonth = Array(12).fill(0);

            transactions.bankTransactions.forEach(txn => {
                const description = (txn.reference || '') + ' ' + (txn.lineItems?.[0]?.description || '');
                const lowerDesc = description.toLowerCase();

                // Check if this is excluded software
                const isExcluded = EXCLUDED_SOFTWARE.some(software => lowerDesc.includes(software));

                if (isExcluded) {
                    const txnDate = new Date(txn.date);
                    const monthIndex = txnDate.getMonth();
                    const amount = Math.abs(txn.total || 0);
                    excludedByMonth[monthIndex] += amount;
                    console.log(`  Excluding: ${description.substring(0, 50)} - €${amount.toFixed(2)} (${txnDate.toISOString().substring(0, 7)})`);
                }
            });

            // Subtract excluded amounts from software costs
            excludedByMonth.forEach((excluded, i) => {
                monthlyCosts[i].software = Math.max(0, monthlyCosts[i].software - excluded);
            });

            const totalExcluded = excludedByMonth.reduce((sum, val) => sum + val, 0);
            console.log(`\nTotal excluded software costs: €${totalExcluded.toFixed(2)}`);
        }

    } catch (error) {
        console.error('Error filtering software costs:', error.message);
        // Continue with unfiltered software costs
    }
}

function calculateTotals(monthlyCosts) {
    return {
        b2cAds: monthlyCosts.reduce((sum, m) => sum + m.b2cAds, 0),
        b2bMarketing: monthlyCosts.reduce((sum, m) => sum + m.b2bMarketing, 0),
        software: monthlyCosts.reduce((sum, m) => sum + m.software, 0)
    };
}

function displayResults(year, monthlyCosts) {
    console.log(`\n${year} Sales & Marketing Costs:`);
    console.log(`\nMONTH | B2C ADS    | B2B MKTG   | SOFTWARE   | TOTAL`);
    console.log(`------|------------|------------|------------|------------`);

    monthlyCosts.forEach(m => {
        const total = m.b2cAds + m.b2bMarketing + m.software;
        console.log(`${m.month.padEnd(5)} | €${m.b2cAds.toFixed(2).padStart(9)} | €${m.b2bMarketing.toFixed(2).padStart(9)} | €${m.software.toFixed(2).padStart(9)} | €${total.toFixed(2).padStart(9)}`);
    });

    const totals = calculateTotals(monthlyCosts);
    const grandTotal = totals.b2cAds + totals.b2bMarketing + totals.software;
    console.log(`------|------------|------------|------------|------------`);
    console.log(`TOTAL | €${totals.b2cAds.toFixed(2).padStart(9)} | €${totals.b2bMarketing.toFixed(2).padStart(9)} | €${totals.software.toFixed(2).padStart(9)} | €${grandTotal.toFixed(2).padStart(9)}`);
}

// Run if called directly
if (require.main === module) {
    const year = process.argv[2] || '2024';
    extractSalesCosts(year).catch(error => {
        console.error('Failed:', error.message);
        process.exit(1);
    });
}

module.exports = extractSalesCosts;
