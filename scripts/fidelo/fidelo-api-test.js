const axios = require('axios');

// Version 10: Return all fields but clean PDF base64 data

async function getBookingsByDateRange(startDate, endDate) {
    try {
        console.log(`Getting bookings created between ${startDate} and ${endDate}...`);
        
        const response = await axios.get('https://ulearn.fidelo.com/api/1.1/ts/bookings', {
            headers: {
                'Authorization': 'Bearer 54b1c34031393ae0bafb5cd4874deb17',
                'Accept': 'application/json'
            },
            decompress: true,
            timeout: 30000
        });
        
        if (response.data.entries) {
            const allEntries = response.data.entries;
            console.log(`Total bookings in system: ${Object.keys(allEntries).length}`);
            
            const start = new Date(startDate + 'T00:00:00.000Z');
            const end = new Date(endDate + 'T23:59:59.999Z');
            
            const filteredBookings = [];
            
            Object.keys(allEntries).forEach(key => {
                const booking = allEntries[key];
                const createdDate = new Date(booking.created_original);
                
                if (createdDate >= start && createdDate <= end) {
                    // Clean the booking object to remove PDF base64 data
                    const cleanBooking = { ...booking };
                    
                    // Remove profile picture base64 data
                    if (cleanBooking.profile_picture && cleanBooking.profile_picture.includes('base64')) {
                        cleanBooking.profile_picture = '[PROFILE_PICTURE_REMOVED]';
                    }
                    
                    // Clean email HTML tags
                    if (cleanBooking.email) {
                        cleanBooking.email = cleanBooking.email.replace(/<[^>]*>/g, '');
                    }
                    
                    filteredBookings.push(cleanBooking);
                }
            });
            
            console.log(`\nFound ${filteredBookings.length} bookings in date range:\n`);
            
            filteredBookings.forEach((booking, index) => {
                console.log(`=== BOOKING ${index + 1} (ID: ${booking.id}) ===`);
                console.log(JSON.stringify(booking, null, 2));
                console.log(''); // Empty line between bookings
            });
            
            return filteredBookings;
            
        } else {
            throw new Error('Invalid response structure');
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        return [];
    }
}

// Export for use in other modules
module.exports = {
    getBookingsByDateRange
};

// Example usage - can be customized for different date ranges
if (require.main === module) {
    // Test with August 1-7, 2025
    getBookingsByDateRange('2025-08-01', '2025-08-07');
}