const axios = require('axios');

function cleanBookingData(data) {
    if (data && data.data && data.data.invoices) {
        data.data.invoices = data.data.invoices.map(invoice => {
            const cleanInvoice = { ...invoice };
            if (cleanInvoice.base64) {
                cleanInvoice.base64 = '[PDF_DATA_REMOVED]';
            }
            return cleanInvoice;
        });
    }
    return data;
}

async function getBookingByContactId(contactId) {
    try {
        console.log(`🔍 Searching for bookings with Contact ID (Student ID): ${contactId}`);
        
        // Method 1: Try the list endpoint with contact_id filter
        console.log('\n📋 Method 1: Using list endpoint with contact_id filter...');
        try {
            const listResponse = await axios.get(`https://ulearn.fidelo.com/api/1.0/ts/bookings?filter[contact_id]=${contactId}`, {
                headers: {
                    'Authorization': 'Bearer 54b1c34031393ae0bafb5cd4874deb17',
                    'Accept': 'application/json'
                },
                decompress: true
            });
            
            console.log('✅ List endpoint worked!');
            console.log(`📊 Found ${listResponse.data.hits} booking(s)`);
            
            if (listResponse.data.hits > 0) {
                const entries = listResponse.data.entries;
                Object.keys(entries).forEach(key => {
                    const booking = entries[key];
                    console.log(`📋 Booking ID: ${booking.id}`);
                    console.log(`👤 Customer: ${booking.customer_name}`);
                    console.log(`📧 Email: ${booking.email}`);
                    console.log(`📅 Created: ${booking.created_original}`);
                    console.log(`📅 Updated: ${booking.changed_original}`);
                    
                    // Now get detailed info for this booking ID
                    getDetailedBooking(booking.id);
                });
                return;
            }
        } catch (error) {
            console.log('❌ List endpoint failed:', error.response?.status || error.message);
        }
        
        // Method 2: Try the new API endpoint
        console.log('\n📋 Method 2: Using new API endpoint...');
        try {
            const newResponse = await axios.get(`https://ulearn.fidelo.com/bookings`, {
                params: {
                    'filter[contact_id]': contactId
                },
                headers: {
                    'Authorization': 'Bearer 54b1c34031393ae0bafb5cd4874deb17',
                    'Accept': 'application/json'
                },
                decompress: true
            });
            
            console.log('✅ New endpoint worked!');
            console.log('Response:', JSON.stringify(newResponse.data, null, 2));
            return;
        } catch (error) {
            console.log('❌ New endpoint failed:', error.response?.status || error.message);
        }
        
        // Method 3: Search through all bookings to find contact_id
        console.log('\n📋 Method 3: Searching all bookings for contact_id...');
        const allResponse = await axios.get('https://ulearn.fidelo.com/api/1.0/ts/bookings', {
            headers: {
                'Authorization': 'Bearer 54b1c34031393ae0bafb5cd4874deb17',
                'Accept': 'application/json'
            },
            decompress: true
        });
        
        console.log(`📊 Searching through ${allResponse.data.hits} bookings...`);
        
        const entries = allResponse.data.entries;
        let found = false;
        
        Object.keys(entries).forEach(key => {
            const booking = entries[key];
            // Check if this booking matches our contact ID
            if (booking.customer_number == contactId || 
                booking.id == contactId ||
                booking.contactId == contactId) {
                
                console.log(`✅ Found match! Booking ID: ${booking.id}`);
                console.log(`👤 Customer: ${booking.customer_name}`);
                console.log(`📧 Email: ${booking.email}`);
                console.log(`🔢 Customer Number: ${booking.customer_number}`);
                
                found = true;
                getDetailedBooking(booking.id);
            }
        });
        
        if (!found) {
            console.log(`❌ No booking found for contact_id: ${contactId}`);
            console.log('\n📋 Sample bookings to check structure:');
            Object.keys(entries).slice(0, 3).forEach(key => {
                const booking = entries[key];
                console.log(`  Booking ID: ${booking.id}, Customer: ${booking.customer_name}, Customer Number: ${booking.customer_number}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

async function getDetailedBooking(bookingId) {
    try {
        console.log(`\n🔍 Getting detailed info for Booking ID: ${bookingId}`);
        
        const response = await axios.get(`https://ulearn.fidelo.com/api/1.1/ts/booking/${bookingId}`, {
            headers: {
                'Authorization': 'Bearer 54b1c34031393ae0bafb5cd4874deb17',
                'Accept': 'application/json'
            },
            decompress: true
        });
        
        const cleanData = cleanBookingData(response.data);
        const student = cleanData.data.student;
        
        console.log('✅ SUCCESS! Found detailed booking:');
        console.log(`👤 Student: ${student.firstname} ${student.surname}`);
        console.log(`📧 Email: ${student.email}`);
        console.log(`🔢 Student Number: ${student.number}`);
        
        console.log('\n📋 FULL BOOKING DATA:');
        console.log('=====================');
        console.log(JSON.stringify(cleanData, null, 2));
        
    } catch (error) {
        console.error(`❌ Error getting detailed booking ${bookingId}:`, error.response?.status || error.message);
    }
}

// Test with Verónica's student ID
getBookingByContactId(27490);