const { getBookingsForDateRange } = require('../../scripts/fidelo/bookings-api');

async function analyzeBookingRates() {
    try {
        console.log('Fetching November 2025 bookings...\n');

        // Get bookings for November 2025
        const novemberBookings = await getBookingsForDateRange('2025-11-01', '2025-11-30');

        console.log(`Found ${novemberBookings.hits} bookings in November\n`);

        // Analyze first 5 bookings for rate/price information
        const sampleKeys = Object.keys(novemberBookings.entries).slice(0, 5);

        for (const key of sampleKeys) {
            const booking = novemberBookings.entries[key];

            console.log('='.repeat(80));
            console.log(`Booking ID: ${booking.id} | Student: ${booking.customer_name}`);
            console.log('='.repeat(80));

            // Extract relevant financial and course data
            const data = {
                course_name: booking.course_name_en,
                course_weeks: booking.course_weeks,
                course_units: booking.course_units,
                amount_total: booking.amount_total_original,
                amount_payed: booking.amount_payed_original,
                amount_open: booking.amount_open,
                course_from: booking.course_from,
                course_until: booking.course_until,
                document_numbers: booking.document_numbers_invoices
            };

            console.log(JSON.stringify(data, null, 2));

            // Calculate rate per unit if possible
            if (data.course_units && data.amount_total) {
                const ratePerUnit = (data.amount_total / parseFloat(data.course_units)).toFixed(2);
                console.log(`\n💰 Rate per unit: €${ratePerUnit}`);

                if (data.course_weeks) {
                    const euroPerWeek = (data.amount_total / data.course_weeks).toFixed(2);
                    console.log(`💰 Euro per week: €${euroPerWeek}`);
                }
            }

            console.log('\n');
        }

        // Summary statistics
        console.log('\n' + '='.repeat(80));
        console.log('SUMMARY FOR NOVEMBER 2025');
        console.log('='.repeat(80));

        let totalRevenue = 0;
        let totalUnits = 0;
        let totalWeeks = 0;
        let count = 0;

        for (const key of Object.keys(novemberBookings.entries)) {
            const booking = novemberBookings.entries[key];
            if (booking.amount_total_original) {
                totalRevenue += parseFloat(booking.amount_total_original) || 0;
                count++;
            }
            if (booking.course_units) {
                totalUnits += parseFloat(booking.course_units) || 0;
            }
            if (booking.course_weeks) {
                totalWeeks += booking.course_weeks || 0;
            }
        }

        console.log(`Total Bookings: ${novemberBookings.hits}`);
        console.log(`Total Revenue: €${totalRevenue.toFixed(2)}`);
        console.log(`Total Course Units: ${totalUnits}`);
        console.log(`Total Course Weeks: ${totalWeeks}`);

        if (totalUnits > 0) {
            console.log(`\nAverage Rate per Unit: €${(totalRevenue / totalUnits).toFixed(2)}`);
        }
        if (totalWeeks > 0) {
            console.log(`Average Revenue per Week: €${(totalRevenue / totalWeeks).toFixed(2)}`);
        }

    } catch (error) {
        console.error('Error:', error.message);
        console.error(error.stack);
    }
}

analyzeBookingRates();
