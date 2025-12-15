const axios = require('axios');
const { getBookingsForDateRange } = require('../../scripts/fidelo/bookings-api');

// Fidelo API configuration
const FIDELO_API_BASE = 'https://ulearn.fidelo.com/api/1.1/ts';
const FIDELO_API_TOKEN = '699c957fb710153384dc0aea54e5dbec';

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
            decompress: true,
            timeout: 30000
        });

        return response.data;
    } catch (error) {
        console.error(`Error fetching booking ${bookingId}:`, error.message);
        return null;
    }
}

async function testBookingDetails() {
    try {
        console.log('Testing detailed booking API...\n');

        // Get November bookings
        const novemberBookings = await getBookingsForDateRange('2025-11-01', '2025-11-30');
        console.log(`Found ${novemberBookings.hits} bookings\n`);

        // Test first 3 bookings
        const bookingIds = Object.keys(novemberBookings.entries).slice(0, 3);

        for (const key of bookingIds) {
            const booking = novemberBookings.entries[key];

            console.log('='.repeat(80));
            console.log(`Booking #${booking.id}: ${booking.customer_name}`);
            console.log('='.repeat(80));

            // Show what we know from the list API
            console.log('\nFrom Bookings List API:');
            console.log(`  Course Name: ${booking.course_name_en}`);
            console.log(`  Course Category: ${Array.isArray(booking.course_category) ? booking.course_category.join(', ') : booking.course_category}`);
            console.log(`  Course Weeks: ${booking.course_weeks}`);
            console.log(`  Course Units: ${booking.course_units}`);
            console.log(`  Amount Total: €${booking.amount_total_original}`);

            // Try to get detailed info
            console.log('\nFetching detailed booking data...');
            const details = await getBookingDetails(booking.id);

            if (!details) {
                console.log('  ❌ Failed to get details\n');
                continue;
            }

            if (details.data && details.data.booking && details.data.booking.courses) {
                console.log('\nFrom Booking Details API:');
                console.log(`  Found ${details.data.booking.courses.length} courses:`);

                details.data.booking.courses.forEach((course, idx) => {
                    console.log(`\n  Course ${idx + 1}:`);
                    console.log(`    Name: ${course.name}`);
                    console.log(`    Category: ${course.category}`);
                    console.log(`    From: ${course.from} to ${course.until}`);
                    console.log(`    Weeks: ${course.weeks}`);
                    console.log(`    Active: ${course.active}`);
                });

                // Check invoices
                if (details.data.invoices && details.data.invoices.length > 0) {
                    console.log(`\n  Found ${details.data.invoices.length} invoices:`);

                    details.data.invoices.forEach((invoice, idx) => {
                        console.log(`\n  Invoice ${idx + 1}: ${invoice.number}`);
                        if (invoice.items && invoice.items.length > 0) {
                            invoice.items.forEach((item, itemIdx) => {
                                console.log(`    Item ${itemIdx + 1}:`);
                                console.log(`      Description: ${item.description}`);
                                console.log(`      Amount: €${item.amount}`);
                                console.log(`      Service: ${item.service_from} to ${item.service_until}`);
                            });
                        }
                    });
                }
            }

            console.log('\n');

            // Small delay
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

    } catch (error) {
        console.error('Error:', error.message);
        console.error(error.stack);
    }
}

testBookingDetails();
