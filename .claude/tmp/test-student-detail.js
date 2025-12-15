const axios = require('axios');

// Fidelo API configuration
const FIDELO_API_BASE = 'https://ulearn.fidelo.com/api/1.1/ts';
const FIDELO_API_TOKEN = '699c957fb710153384dc0aea54e5dbec';

async function getStudentBooking(customerNumber) {
    try {
        console.log(`Fetching bookings for Student ID (customer_number): ${customerNumber}...\n`);

        // First, get all bookings and filter by customer_number
        const listResponse = await axios.get(`${FIDELO_API_BASE}/bookings`, {
            headers: {
                'Authorization': `Bearer ${FIDELO_API_TOKEN}`,
                'Accept': 'application/json'
            },
            decompress: true,
            timeout: 30000
        });

        if (!listResponse.data || !listResponse.data.entries) {
            console.log('No bookings found');
            return;
        }

        // Find bookings matching this customer number
        const matchingBookings = Object.values(listResponse.data.entries).filter(
            booking => booking.customer_number === customerNumber
        );

        if (matchingBookings.length === 0) {
            console.log(`No bookings found for customer_number: ${customerNumber}`);
            return;
        }

        console.log(`Found ${matchingBookings.length} booking(s) for customer ${customerNumber}:\n`);

        for (const booking of matchingBookings) {
            console.log('='.repeat(80));
            console.log(`BOOKING ID: ${booking.id}`);
            console.log(`CUSTOMER NUMBER (Student ID): ${booking.customer_number}`);
            console.log(`STUDENT NAME: ${booking.customer_name}`);
            console.log('='.repeat(80));
            console.log('\nBASIC BOOKING INFO:');
            console.log(JSON.stringify({
                id: booking.id,
                booking_number: booking.booking_number,
                customer_number: booking.customer_number,
                customer_name: booking.customer_name,
                email: booking.email,
                course_name_en: booking.course_name_en,
                course_from: booking.course_from,
                course_until: booking.course_until,
                course_weeks: booking.course_weeks,
                course_units: booking.course_units,
                amount_total_original: booking.amount_total_original,
                amount_payed_original: booking.amount_payed_original,
                document_numbers_invoices: booking.document_numbers_invoices
            }, null, 2));

            // Now try to get detailed booking information with invoices
            console.log('\n\nFETCHING DETAILED BOOKING INFO (with invoices)...\n');

            try {
                const detailResponse = await axios.get(`${FIDELO_API_BASE}/booking/${booking.id}`, {
                    headers: {
                        'Authorization': `Bearer ${FIDELO_API_TOKEN}`,
                        'Accept': 'application/json'
                    },
                    params: {
                        include_inactive_services: 1,
                        include_credit_notes: 1
                    },
                    decompress: true,
                    timeout: 30000
                });

                if (detailResponse.data && detailResponse.data.data) {
                    const data = detailResponse.data.data;

                    // Show courses
                    if (data.booking && data.booking.courses) {
                        console.log('COURSES:');
                        console.log(JSON.stringify(data.booking.courses, null, 2));
                    }

                    // Show invoices with line items
                    if (data.invoices && data.invoices.length > 0) {
                        console.log('\n\nINVOICES:');
                        data.invoices.forEach((invoice, idx) => {
                            console.log(`\nInvoice ${idx + 1}: ${invoice.number}`);
                            console.log(`  Type: ${invoice.type}`);
                            console.log(`  Date: ${invoice.date}`);
                            console.log(`  Created: ${invoice.created}`);
                            console.log(`  Updated: ${invoice.updated}`);
                            console.log(`  Is Last Document: ${invoice.is_last_document}`);

                            if (invoice.items && invoice.items.length > 0) {
                                console.log(`\n  LINE ITEMS:`);
                                invoice.items.forEach((item, itemIdx) => {
                                    console.log(`\n  Item ${itemIdx + 1}:`);
                                    console.log(`    Description: ${item.description}`);
                                    console.log(`    Amount: €${item.amount}`);
                                    console.log(`    Tax: ${item.tax}%`);
                                    console.log(`    Service Period: ${item.service_from} to ${item.service_until}`);
                                    console.log(`    Active: ${item.active}`);
                                });
                            }
                        });
                    }
                } else {
                    console.log('No detailed data returned');
                }

            } catch (detailError) {
                console.error('Error fetching booking details:', detailError.message);
                if (detailError.response) {
                    console.error('Response status:', detailError.response.status);
                    console.error('Response data:', detailError.response.data);
                }
            }

            console.log('\n');
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

// Test with Student ID 30793
const studentId = process.argv[2] || '30793';
getStudentBooking(studentId);
