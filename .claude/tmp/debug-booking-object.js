/**
 * Debug: Check what's in the booking object
 */

const FideloReferenceSearch = require('../../scripts/assign/fidelo-search');

async function debugBooking() {
    const search = new FideloReferenceSearch();

    try {
        // Search for Student ID 30737 (Laia Padros)
        const result = await search.findBookingByStudentId('30737');

        if (result.success) {
            console.log('Booking object fields:');
            console.log(JSON.stringify(result.booking, null, 2));
        } else {
            console.log('Not found');
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

debugBooking();
