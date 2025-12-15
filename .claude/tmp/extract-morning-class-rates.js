const axios = require('axios');
const { getBookingsForDateRange } = require('../../scripts/fidelo/bookings-api');

// Fidelo API configuration
const FIDELO_API_BASE = 'https://ulearn.fidelo.com/api/1.1/ts';
const FIDELO_API_TOKEN = '699c957fb710153384dc0aea54e5dbec';

/**
 * Get detailed booking information including courses
 * Uses API endpoint: /api/1.1/ts/booking/{bookingId}
 */
async function getBookingDetails(bookingId) {
    try {
        const response = await axios.get(`${FIDELO_API_BASE}/booking/${bookingId}`, {
            headers: {
                'Authorization': `Bearer ${FIDELO_API_TOKEN}`,
                'Accept': 'application/json'
            },
            params: {
                include_inactive_services: 1
            },
            decompress: true
        });

        return response.data;
    } catch (error) {
        console.error(`Error fetching booking ${bookingId}:`, error.response?.data || error.message);
        return null;
    }
}

/**
 * Filter courses to get only Morning Classes
 */
function getMorningClasses(courses) {
    if (!courses || !Array.isArray(courses)) {
        return [];
    }

    // Filter for courses with "Morning" in the category
    return courses.filter(course => {
        const category = (course.category || '').toLowerCase();
        return category.includes('morning');
    });
}

/**
 * Calculate hours for a course
 * Morning Classes = 15 hours per week
 */
function calculateCourseHours(course) {
    const weeks = parseInt(course.weeks) || 0;
    const hoursPerWeek = 15; // Morning Classes are 15 hours/week

    return {
        weeks: weeks,
        hoursPerWeek: hoursPerWeek,
        totalHours: weeks * hoursPerWeek
    };
}

/**
 * Calculate rate per hour from invoice items
 */
function calculateRatePerHour(invoices, courseName, totalHours) {
    if (!invoices || !Array.isArray(invoices) || totalHours === 0) {
        return null;
    }

    // Find the invoice item that matches this course
    for (const invoice of invoices) {
        if (!invoice.items || !Array.isArray(invoice.items)) {
            continue;
        }

        for (const item of invoice.items) {
            // Match by description (course name)
            if (item.description && item.description.includes(courseName)) {
                const amount = parseFloat(item.amount) || 0;
                const ratePerHour = amount / totalHours;

                return {
                    amount: amount,
                    hours: totalHours,
                    ratePerHour: ratePerHour,
                    invoiceNumber: invoice.number,
                    description: item.description
                };
            }
        }
    }

    return null;
}

/**
 * Extract Morning Class rates for November bookings
 */
async function extractNovemberMorningClassRates() {
    try {
        console.log('='.repeat(80));
        console.log('EXTRACTING MORNING CLASS RATES - NOVEMBER 2025');
        console.log('='.repeat(80));
        console.log('\nStep 1: Fetching November bookings...\n');

        // Get all bookings for November 2025
        const novemberBookings = await getBookingsForDateRange('2025-11-01', '2025-11-30');

        console.log(`Found ${novemberBookings.hits} bookings in November\n`);
        console.log('Step 2: Fetching detailed course information...\n');

        const results = [];
        let processedCount = 0;
        let morningClassCount = 0;

        // Process each booking
        for (const [key, booking] of Object.entries(novemberBookings.entries)) {
            processedCount++;

            // Show progress
            if (processedCount % 10 === 0) {
                process.stdout.write(`\rProcessed ${processedCount}/${novemberBookings.hits} bookings...`);
            }

            // Get detailed booking information
            const details = await getBookingDetails(booking.id);

            if (!details || !details.data) {
                continue;
            }

            // Extract courses
            const courses = details.data.booking?.courses || [];
            const morningClasses = getMorningClasses(courses);

            if (morningClasses.length === 0) {
                continue;
            }

            morningClassCount++;

            // Process each Morning Class course
            for (const course of morningClasses) {
                const courseHours = calculateCourseHours(course);
                const rateInfo = calculateRatePerHour(
                    details.data.invoices,
                    course.name,
                    courseHours.totalHours
                );

                const result = {
                    bookingId: booking.id,
                    studentName: booking.customer_name,
                    studentEmail: booking.email,
                    courseName: course.name,
                    courseCategory: course.category,
                    courseFrom: course.from,
                    courseUntil: course.until,
                    weeks: courseHours.weeks,
                    hoursPerWeek: courseHours.hoursPerWeek,
                    totalHours: courseHours.totalHours,
                    active: course.active === '1',
                    ...rateInfo
                };

                results.push(result);
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log(`\n\nStep 3: Analysis Complete\n`);
        console.log('='.repeat(80));
        console.log('SUMMARY');
        console.log('='.repeat(80));
        console.log(`Total November Bookings: ${novemberBookings.hits}`);
        console.log(`Bookings with Morning Classes: ${morningClassCount}`);
        console.log(`Total Morning Class Courses: ${results.length}`);

        // Calculate statistics
        const activeResults = results.filter(r => r.active);
        const ratesWithData = activeResults.filter(r => r.ratePerHour);

        if (ratesWithData.length > 0) {
            const totalRevenue = ratesWithData.reduce((sum, r) => sum + (r.amount || 0), 0);
            const totalHours = ratesWithData.reduce((sum, r) => sum + (r.totalHours || 0), 0);
            const avgRate = ratesWithData.reduce((sum, r) => sum + (r.ratePerHour || 0), 0) / ratesWithData.length;

            console.log(`\nActive Morning Classes with Rate Data: ${ratesWithData.length}`);
            console.log(`Total Revenue: €${totalRevenue.toFixed(2)}`);
            console.log(`Total Hours: ${totalHours}`);
            console.log(`Average Rate per Hour: €${avgRate.toFixed(2)}`);
        }

        // Show sample results
        console.log('\n' + '='.repeat(80));
        console.log('SAMPLE RESULTS (First 5 Active Morning Classes)');
        console.log('='.repeat(80));

        activeResults.slice(0, 5).forEach((result, index) => {
            console.log(`\n${index + 1}. ${result.studentName} (Booking #${result.bookingId})`);
            console.log(`   Course: ${result.courseName}`);
            console.log(`   Period: ${result.courseFrom} to ${result.courseUntil} (${result.weeks} weeks)`);
            console.log(`   Hours: ${result.totalHours} (${result.hoursPerWeek}/week)`);

            if (result.ratePerHour) {
                console.log(`   Amount: €${result.amount.toFixed(2)}`);
                console.log(`   Rate per Hour: €${result.ratePerHour.toFixed(2)}`);
                console.log(`   Invoice: ${result.invoiceNumber}`);
            } else {
                console.log(`   ⚠️  No invoice data found`);
            }
        });

        // Export to JSON
        const fs = require('fs').promises;
        const outputFile = '.claude/tmp/november-morning-class-rates.json';
        await fs.writeFile(outputFile, JSON.stringify({
            generatedAt: new Date().toISOString(),
            period: 'November 2025',
            summary: {
                totalBookings: novemberBookings.hits,
                bookingsWithMorningClasses: morningClassCount,
                totalMorningClassCourses: results.length,
                activeCourses: activeResults.length,
                coursesWithRateData: ratesWithData.length
            },
            courses: results
        }, null, 2));

        console.log(`\n\n✅ Data exported to: ${outputFile}`);
        console.log('='.repeat(80));

        return results;

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
    }
}

// Run if called directly
if (require.main === module) {
    extractNovemberMorningClassRates();
}

module.exports = {
    getBookingDetails,
    getMorningClasses,
    calculateCourseHours,
    calculateRatePerHour,
    extractNovemberMorningClassRates
};
