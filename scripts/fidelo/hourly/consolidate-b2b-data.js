/**
 * Consolidate all B2B CAC data into a single file for the dashboard
 */

const fs = require('fs');
const path = require('path');

const years = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
const consolidated = {};

years.forEach(year => {
    try {
        const filePath = path.join(__dirname, `${year}/b2b-cac-${year}.json`);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        consolidated[year] = data;
    } catch (e) {
        console.error(`Warning: Could not load ${year} data: ${e.message}`);
    }
});

// Output as JavaScript object for embedding in dashboard
const outputPath = path.join(__dirname, '../../model/sales/b2b-cac-data.js');
const jsOutput = `// Auto-generated B2B CAC data from Fidelo hourly analysis
// Generated: ${new Date().toISOString()}

const B2B_CAC_DATA = ${JSON.stringify(consolidated, null, 2)};

// For use in browser
if (typeof window !== 'undefined') {
    window.B2B_CAC_DATA = B2B_CAC_DATA;
}

// For use in Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = B2B_CAC_DATA;
}
`;

fs.writeFileSync(outputPath, jsOutput);
console.log(`✓ Consolidated B2B CAC data saved to: ${outputPath}`);
console.log(`✓ Years included: ${Object.keys(consolidated).join(', ')}`);
