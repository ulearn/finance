/**
 * Calculate average hourly rates by Year, Session, and Channel
 * B2C = Direct students
 * B2B = Agent students
 */

const fs = require('fs');
const path = require('path');

function calculateHourlyRates(year) {
    try {
        const dataFile = path.join(__dirname, `${year}/all-courses-${year}.json`);
        const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

        console.log(`\n================================================================================`);
        console.log(`HOURLY RATES BY CHANNEL - ${year}`);
        console.log(`================================================================================\n`);

        const results = {
            year,
            morning: {
                b2c: { totalRevenue: 0, totalHours: 0, count: 0, avgRate: 0 },
                b2b: { totalRevenue: 0, totalHours: 0, count: 0, avgRate: 0 }
            },
            afternoon: {
                b2c: { totalRevenue: 0, totalHours: 0, count: 0, avgRate: 0 },
                b2b: { totalRevenue: 0, totalHours: 0, count: 0, avgRate: 0 }
            }
        };

        // Process morning courses
        if (data.data.morning) {
            data.data.morning.forEach(booking => {
                const channel = booking.studentType === 'direct' ? 'b2c' : 'b2b';
                results.morning[channel].totalRevenue += booking.courseFeeNADC || 0;
                results.morning[channel].totalHours += booking.totalHours || 0;
                results.morning[channel].count++;
            });
        }

        // Process afternoon courses
        if (data.data.afternoon) {
            data.data.afternoon.forEach(booking => {
                const channel = booking.studentType === 'direct' ? 'b2c' : 'b2b';
                results.afternoon[channel].totalRevenue += booking.courseFeeNADC || 0;
                results.afternoon[channel].totalHours += booking.totalHours || 0;
                results.afternoon[channel].count++;
            });
        }

        // Calculate average rates
        ['morning', 'afternoon'].forEach(session => {
            ['b2c', 'b2b'].forEach(channel => {
                const data = results[session][channel];
                if (data.totalHours > 0) {
                    data.avgRate = data.totalRevenue / data.totalHours;
                }
            });
        });

        // Display results
        console.log('MORNING SESSION:');
        console.log(`  B2C (Direct):  ${results.morning.b2c.count} students, ${results.morning.b2c.totalHours} hrs, €${results.morning.b2c.avgRate.toFixed(2)}/hr`);
        console.log(`  B2B (Agent):   ${results.morning.b2b.count} students, ${results.morning.b2b.totalHours} hrs, €${results.morning.b2b.avgRate.toFixed(2)}/hr`);

        console.log('\nAFTERNOON SESSION:');
        console.log(`  B2C (Direct):  ${results.afternoon.b2c.count} students, ${results.afternoon.b2c.totalHours} hrs, €${results.afternoon.b2c.avgRate.toFixed(2)}/hr`);
        console.log(`  B2B (Agent):   ${results.afternoon.b2b.count} students, ${results.afternoon.b2b.totalHours} hrs, €${results.afternoon.b2b.avgRate.toFixed(2)}/hr`);

        // Save to file
        const output = {
            year,
            generatedAt: new Date().toISOString(),
            rates: {
                morning: {
                    b2c: parseFloat(results.morning.b2c.avgRate.toFixed(2)),
                    b2b: parseFloat(results.morning.b2b.avgRate.toFixed(2))
                },
                afternoon: {
                    b2c: parseFloat(results.afternoon.b2c.avgRate.toFixed(2)),
                    b2b: parseFloat(results.afternoon.b2b.avgRate.toFixed(2))
                }
            },
            details: results
        };

        const outputPath = path.join(__dirname, `${year}/hourly-rates-${year}.json`);
        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
        console.log(`\n✓ Saved to: ${outputPath}`);

        return output;

    } catch (error) {
        console.error(`Error processing ${year}:`, error.message);
        return null;
    }
}

// Run if called directly
if (require.main === module) {
    const year = process.argv[2] || '2024';
    calculateHourlyRates(year);
}

module.exports = calculateHourlyRates;
