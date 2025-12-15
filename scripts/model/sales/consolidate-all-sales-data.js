/**
 * Consolidate all sales data for dashboard:
 * - B2B CAC (partner commissions) from Fidelo
 * - Hourly rates by channel/session from Fidelo
 * - Xero costs (ads, software, marketing trips)
 * - Sara's salary schedule
 */

const fs = require('fs');
const path = require('path');

// Diego's salary schedule (B2C costs)
const DIEGO_SALARY_2022 = {
    '01': 477.60, '02': 798.49, '03': 1485.30, '04': 1913.84, '05': 2074.06, '06': 1803.26,
    '07': 2143.78, '08': 2033.85, '09': 2184.00, '10': 2044.57, '11': 2186.68, '12': 2859.30
};

const DIEGO_SALARY_2023 = {
    '01': 2500, '02': 2500, '03': 2500, '04': 2500, '05': 2500, '06': 2500,
    '07': 3500.60, '08': 2522.94, '09': 2163.65, '10': 2048.32, '11': 1915.64, '12': 2381.69
};

const DIEGO_SALARY_2024 = {
    '01': 2257.23, '02': 2347.01, '03': 2322.95, '04': 2309.62, '05': 3472.43, '06': 2373.54,
    '07': 2796.17, '08': 2374.07, '09': 2447.00, '10': 2517.98, '11': 2695.93, '12': 2007.82
};

// Sara's salary schedule (B2C costs)
const SARA_SALARY_2024 = {
    '01': 0, '02': 533.70, '03': 1410.00, '04': 1300.00, '05': 1500.00, '06': 1200.00,
    '07': 1200.00, '08': 1500.00, '09': 1380.00, '10': 1200.00, '11': 1500.00, '12': 0
};

const SARA_SALARY_2025 = {
    '01': 1500, '02': 1500, '03': 0, '04': 2500, '05': 2805.35, '06': 2500,
    '07': 2500, '08': 2500, '09': 2500, '10': 2500, '11': 0, '12': 0
};

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];

async function consolidateAllData() {
    console.log('================================================================================');
    console.log('CONSOLIDATING ALL SALES DATA');
    console.log('================================================================================\n');

    const consolidated = {};

    for (const year of YEARS) {
        console.log(`Processing ${year}...`);

        // Determine Diego's and Sara's salaries for this year
        let diegoSalary = 0;
        let saraSalary = 0;

        if (year === 2022) {
            diegoSalary = DIEGO_SALARY_2022;
        } else if (year === 2023) {
            diegoSalary = DIEGO_SALARY_2023;
        } else if (year === 2024) {
            diegoSalary = DIEGO_SALARY_2024;
            saraSalary = SARA_SALARY_2024;
        } else if (year === 2025) {
            saraSalary = SARA_SALARY_2025;
        }

        const yearData = {
            year,
            hourlyRates: loadHourlyRates(year),
            b2bCAC: loadB2BCAC(year),
            b2cSales: loadB2CSales(year),
            xeroCosts: loadXeroCosts(year),
            salaries: {
                b2c: {
                    diego: diegoSalary,
                    sara: saraSalary
                }
            }
        };

        consolidated[year] = yearData;
    }

    // Save consolidated data
    const outputPath = path.join(__dirname, 'consolidated-sales-data.js');
    const jsOutput = `// Auto-generated consolidated sales data
// Generated: ${new Date().toISOString()}

const SALES_DATA = ${JSON.stringify(consolidated, null, 2)};

// For use in browser
if (typeof window !== 'undefined') {
    window.SALES_DATA = SALES_DATA;
}

// For use in Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SALES_DATA;
}
`;

    fs.writeFileSync(outputPath, jsOutput);
    console.log(`\n✓ Consolidated data saved to: ${outputPath}`);

    // Display summary
    console.log('\n================================================================================');
    console.log('SUMMARY');
    console.log('================================================================================\n');

    YEARS.forEach(year => {
        const data = consolidated[year];
        console.log(`${year}:`);
        if (data.hourlyRates) {
            console.log(`  Morning B2C: €${data.hourlyRates.rates.morning.b2c}/hr`);
            console.log(`  Morning B2B: €${data.hourlyRates.rates.morning.b2b}/hr`);
        }
        if (data.b2bCAC) {
            console.log(`  B2B CAC: €${data.b2bCAC.total.commissions.toFixed(2)} (${data.b2bCAC.total.bookings} bookings)`);
        }
        if (data.xeroCosts) {
            console.log(`  B2C Ads: €${data.xeroCosts.totals.b2cAds.toFixed(2)}`);
        }
        console.log('');
    });
}

function loadHourlyRates(year) {
    try {
        const filePath = path.join(__dirname, `../../fidelo/hourly/${year}/hourly-rates-${year}.json`);
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.log(`  Warning: No hourly rates for ${year}`);
        return null;
    }
}

function loadB2BCAC(year) {
    try {
        const filePath = path.join(__dirname, `../../fidelo/hourly/${year}/b2b-cac-${year}.json`);
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.log(`  Warning: No B2B CAC for ${year}`);
        return null;
    }
}

function loadB2CSales(year) {
    try {
        const filePath = path.join(__dirname, `../../fidelo/hourly/${year}/b2c-sales-${year}.json`);
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.log(`  Warning: No B2C sales for ${year}`);
        return null;
    }
}

function loadXeroCosts(year) {
    try {
        const filePath = path.join(__dirname, `xero-costs-${year}.json`);
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.log(`  Warning: No Xero costs for ${year}`);
        return null;
    }
}

// Run
consolidateAllData().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
});
