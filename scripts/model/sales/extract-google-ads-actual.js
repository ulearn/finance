/**
 * Extract actual Google & Other Advertising costs by month from Xero CSV
 * This gives us real ad spend, not accountant's journal adjustments
 */

const fs = require('fs');
const path = require('path');

function extractAdCosts() {
    console.log('\n================================================================================');
    console.log('EXTRACTING ACTUAL AD COSTS FROM XERO CSV');
    console.log('================================================================================\n');

    const csvPath = path.join(__dirname, 'b110-Google&Other Ads.csv');
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

    // Parse transactions by year and month
    const byYear = {};

    for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Skip section headers
        if (line.startsWith('Google Ad (or other advertising')) continue;
        if (line.startsWith('Total Google Ad') || line.startsWith('Total,')) continue;

        // Simple CSV parser that handles quoted values
        const parts = [];
        let current = '';
        let inQuotes = false;

        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                parts.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        parts.push(current); // Add last part

        if (parts.length < 10) continue;

        const date = parts[0];
        const source = parts[1];
        const description = parts[2];
        // Remove quotes and commas from numbers
        const debitEUR = parseFloat(parts[7].replace(/[",]/g, '')) || 0;
        const creditEUR = parseFloat(parts[8].replace(/[",]/g, '')) || 0;

        if (!date) continue;

        // Parse date: "04 Jan 2017"
        const dateParts = date.split(' ');
        if (dateParts.length !== 3) continue;

        const day = dateParts[0];
        let monthName = dateParts[1];
        const year = dateParts[2];

        // Normalize "Sept" to "Sep"
        if (monthName === 'Sept') monthName = 'Sep';

        // Skip journal entries - we want actual ad spend only
        const lowerDesc = description.toLowerCase();
        if (lowerDesc.includes('journal') ||
            lowerDesc.includes('adjustment') ||
            lowerDesc.includes('accrual') ||
            source.toLowerCase().includes('journal')) {
            console.log(`Skipping journal entry: ${date} - ${description} - €${debitEUR}`);
            continue;
        }

        const amount = debitEUR || creditEUR;
        if (amount === 0) continue;

        // Initialize year
        if (!byYear[year]) {
            byYear[year] = {
                total: 0,
                byMonth: {},
                count: 0
            };
        }

        // Initialize month
        if (!byYear[year].byMonth[monthName]) {
            byYear[year].byMonth[monthName] = 0;
        }

        byYear[year].byMonth[monthName] += amount;
        byYear[year].total += amount;
        byYear[year].count++;
    }

    // Display results
    console.log('\n=== AD COSTS BY YEAR ===\n');
    Object.keys(byYear).sort().forEach(year => {
        const data = byYear[year];
        console.log(`${year}: €${data.total.toFixed(2)} (${data.count} transactions)`);

        // Show monthly breakdown for recent years
        if (parseInt(year) >= 2022) {
            console.log('  Monthly breakdown:');
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            months.forEach(month => {
                if (byYear[year].byMonth[month]) {
                    console.log(`    ${month}: €${byYear[year].byMonth[month].toFixed(2)}`);
                }
            });
            console.log('');
        }
    });

    // Save to JSON
    const outputPath = path.join(__dirname, 'actual-ad-costs-by-year.json');
    fs.writeFileSync(outputPath, JSON.stringify(byYear, null, 2));
    console.log(`✓ Saved to: ${outputPath}\n`);

    return byYear;
}

// Run
extractAdCosts();
