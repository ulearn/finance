const { getFideloBookingsAxios, getBookingsForDateRange } = require('../../scripts/fidelo/bookings-api');

async function testBookingData() {
    try {
        console.log('Fetching November 2025 bookings...\n');

        // Get bookings for November 2025
        const novemberBookings = await getBookingsForDateRange('2025-11-01', '2025-11-30');

        console.log(`Found ${novemberBookings.hits} bookings in November\n`);

        // Show a sample booking to understand the data structure
        const sampleKeys = Object.keys(novemberBookings.entries).slice(0, 3);

        for (const key of sampleKeys) {
            const booking = novemberBookings.entries[key];
            console.log('='.repeat(60));
            console.log('Sample Booking:', key);
            console.log('='.repeat(60));
            console.log(JSON.stringify(booking, null, 2));
            console.log('\n');
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

testBookingData();
