const axios = require('axios');

// Updated to use the correct API endpoints from the documentation
async function getFideloBookingAxios(bookingId) {
    try {
        const response = await axios.get(`https://ulearn.fidelo.com/bookings/${bookingId}`, {
            headers: {
                'Authorization': 'Bearer 54b1c34031393ae0bafb5cd4874deb17',
                'Accept': 'application/json'
            },
            decompress: true
        });
        
        return response.data;
    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
        throw error;
    }
}

async function getFideloBookingsAxios() {
    try {
        const response = await axios.get('https://ulearn.fidelo.com/bookings', {
            headers: {
                'Authorization': 'Bearer 54b1c34031393ae0bafb5cd4874deb17',
                'Accept': 'application/json'
            },
            decompress: true
        });
        
        return response.data;
    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
        throw error;
    }
}

// Get booking by contact ID (student ID)
async function getFideloBookingByContactId(contactId) {
    try {
        const response = await axios.get(`https://ulearn.fidelo.com/bookings?filter[contact_id]=${contactId}`, {
            headers: {
                'Authorization': 'Bearer 54b1c34031393ae0bafb5cd4874deb17',
                'Accept': 'application/json'
            },
            decompress: true
        });
        
        return response.data;
    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
        throw error;
    }
}

// Usage with date filtering (updated to handle different response structure if needed)
async function getBookingsForDateRange(startDate, endDate) {
    const allBookings = await getFideloBookingsAxios();
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Handle both old and new API response structures
    let bookingsData = {};
    if (allBookings.entries) {
        // Old API structure
        bookingsData = allBookings.entries;
    } else if (Array.isArray(allBookings)) {
        // New API might return array
        allBookings.forEach((booking, index) => {
            bookingsData[booking.id || index] = booking;
        });
    } else if (allBookings.data) {
        // New API might have data wrapper
        bookingsData = allBookings.data;
    } else {
        // Direct object
        bookingsData = allBookings;
    }
    
    const filtered = {};
    
    Object.keys(bookingsData).forEach(key => {
        const booking = bookingsData[key];
        // Look for update date in various possible field names
        const updatedDate = new Date(
            booking.changed_original || 
            booking.updated_at || 
            booking.updatedAt || 
            booking.modified_date ||
            booking.last_modified
        );
        
        if (updatedDate >= start && updatedDate <= end) {
            filtered[key] = booking;
        }
    });
    
    return {
        hits: Object.keys(filtered).length,
        entries: filtered
    };
}

// Test all endpoints
async function testAllEndpoints() {
    try {
        console.log('Testing new API endpoints...\n');
        
        // Test 1: Get all bookings
        console.log('1. Testing GET /bookings');
        const allBookings = await getFideloBookingsAxios();
        console.log('Response structure:', typeof allBookings);
        console.log('Sample data:', JSON.stringify(allBookings, null, 2).substring(0, 500) + '...\n');
        
        // Test 2: Get specific booking (using ID 30359)
        console.log('2. Testing GET /bookings/30359');
        try {
            const singleBooking = await getFideloBookingAxios(30359);
            console.log('Single booking retrieved successfully');
            console.log('Sample:', JSON.stringify(singleBooking, null, 2).substring(0, 300) + '...\n');
        } catch (error) {
            console.log('Single booking failed, trying contact ID filter...\n');
        }
        
        // Test 3: Get booking by contact ID
        console.log('3. Testing GET /bookings?filter[contact_id]=1');
        try {
            const contactBooking = await getFideloBookingByContactId(1);
            console.log('Contact booking retrieved successfully');
            console.log('Sample:', JSON.stringify(contactBooking, null, 2).substring(0, 300) + '...\n');
        } catch (error) {
            console.log('Contact booking failed:', error.message, '\n');
        }
        
        // Test 4: Date range filtering
        console.log('4. Testing date range filter (Sept 1-7, 2025)');
        const filteredBookings = await getBookingsForDateRange('2025-09-01', '2025-09-07');
        console.log('Filtered bookings:', filteredBookings.hits);
        console.log('Sample filtered data:', JSON.stringify(filteredBookings, null, 2).substring(0, 500) + '...');
        
    } catch (error) {
        console.error('Test failed:', error.message);
        console.error('Full error:', error);
    }
}

// Export functions for use in other modules
module.exports = {
    getFideloBookingAxios,
    getFideloBookingsAxios,
    getFideloBookingByContactId,
    getBookingsForDateRange,
    testAllEndpoints
};

// Run tests if this file is executed directly
if (require.main === module) {
    testAllEndpoints();
}