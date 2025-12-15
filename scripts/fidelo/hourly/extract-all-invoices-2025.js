/**
 * Extract ALL D-Invoices (with payments) for 2025
 *
 * This pulls complete invoice data from Fidelo and saves it as a master JSON file.
 * We can then process this file for any analysis without repeated API calls.
 *
 * Usage: node extract-all-invoices-2025.js [start-date] [end-date]
 * Example: node extract-all-invoices-2025.js 2025-01-01 2025-12-31
 */

const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs').promises;

const GUI2_BOOKINGS = 'https://ulearn.fidelo.com/api/1.0/gui2/b56eab683e450abb7100bfa45fc238fd/search';
const BOOKING_DETAIL_API = 'https://ulearn.fidelo.com/api/1.1/ts/booking';
const API_TOKEN = '699c957fb710153384dc0aea54e5dbec';

async function getAllBookings(startDate, endDate) {
    console.log(`Fetching ALL bookings from ${startDate} to ${endDate}...\n`);

    // Convert YYYY-MM-DD to DD/MM/YYYY format for Fidelo
    const formatDate = (dateStr) => {
        const [year, month, day] = dateStr.split('-');
        return `${day}/${month}/${year}`;
    };

    const formData = new URLSearchParams({
        _token: API_TOKEN,
        'filter[search]': '',
        'filter[booking_created_filter]': `${formatDate(startDate)},${formatDate(endDate)}`,
        'filter[confirmed_original][]': 'yes' // Only confirmed bookings
    });

    const response = await axios.post(GUI2_BOOKINGS, formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 60000
    });

    if (!response.data || !response.data.entries) {
        console.log('No bookings found\n');
        return {};
    }

    console.log(`Found ${response.data.hits} confirmed bookings\n`);
    return response.data.entries;
}

async function getBookingInvoiceDetails(bookingId) {
    const curlCommand = `curl -s "${BOOKING_DETAIL_API}/${bookingId}?include_inactive_services=1&include_credit_notes=1" \
      -H "Authorization: Bearer ${API_TOKEN}" \
      -H "Accept: application/json"`;

    const { stdout } = await execPromise(curlCommand, { maxBuffer: 50 * 1024 * 1024 });
    return JSON.parse(stdout).data;
}

function extractInvoiceData(bookingData, bookingId) {
    const invoices = bookingData.invoices || [];

    // Find the D-invoice (actual invoice with payment)
    const dInvoice = invoices.find(inv => inv.number?.startsWith('D') && inv.is_last_document);

    // If no D-invoice, this booking doesn't have a payment yet (only proforma)
    if (!dInvoice) {
        return null;
    }

    const student = bookingData.student || {};
    const booking = bookingData.booking || {};
    const courses = booking.courses || {};

    // Extract all line items (unfiltered - we'll filter later during processing)
    const lineItems = (dInvoice.items || [])
        .filter(item => item.active)
        .map(item => ({
            description: item.description,
            amount: item.amount || 0,
            discount: item.amount_discount || 0,
            commission: item.amount_commission || 0,
            nadc: item.amount_net || 0,
            serviceFrom: item.service_from,
            serviceUntil: item.service_until,
            tax: item.tax || 0
        }));

    // Calculate totals
    const totals = lineItems.reduce((acc, item) => ({
        amount: acc.amount + item.amount,
        discount: acc.discount + item.discount,
        commission: acc.commission + item.commission,
        nadc: acc.nadc + item.nadc
    }), { amount: 0, discount: 0, commission: 0, nadc: 0 });

    // EXCLUDE credit notes / refunds (negative amounts)
    if (totals.nadc <= 0 || totals.amount <= 0) {
        return null;
    }

    // Extract course information
    const courseList = Object.values(courses).map(course => ({
        name: course.name,
        category: course.category,
        from: course.from,
        until: course.until,
        weeks: parseInt(course.weeks) || 0,
        hours: parseInt(course.hours) || 0
    }));

    return {
        bookingId: bookingId,
        invoiceNumber: dInvoice.number,
        invoiceDate: dInvoice.date,
        invoiceType: 'Invoice',
        student: {
            id: student.number,
            firstName: student.firstname,
            surname: student.surname,
            email: student.email,
            nationality: student.nationality,
            dob: student.dob
        },
        agent: {
            name: booking.agent_name || null,
            hasAgent: (totals.commission > 0)
        },
        courses: courseList,
        lineItems: lineItems,
        totals: totals,
        paymentMethod: dInvoice.payment_method || null,
        currency: dInvoice.currency || 'EUR'
    };
}

async function processBooking(booking) {
    const bookingId = booking.id;

    try {
        const details = await getBookingInvoiceDetails(bookingId);
        const invoiceData = extractInvoiceData(details, bookingId);

        return invoiceData; // Can be null if no D-invoice or negative amount
    } catch (error) {
        console.error(`Error processing booking ${bookingId}:`, error.message);
        return null;
    }
}

async function main() {
    const startDate = process.argv[2] || '2025-01-01';
    const endDate = process.argv[3] || '2025-12-31';

    // Extract year from startDate for output folder
    const year = startDate.split('-')[0];

    console.log('='.repeat(80));
    console.log(`FIDELO D-INVOICE EXTRACTION - ${year} MASTER DATA`);
    console.log('='.repeat(80));
    console.log('');

    // Get all bookings
    const bookings = await getAllBookings(startDate, endDate);
    const bookingList = Object.values(bookings);

    console.log(`Processing ${bookingList.length} bookings...`);
    console.log('This will take several minutes...\n');

    const results = [];
    let processed = 0;
    let withDInvoice = 0;
    let withoutDInvoice = 0;
    let creditNotes = 0;

    for (const booking of bookingList) {
        processed++;
        if (processed % 50 === 0 || processed === bookingList.length) {
            process.stdout.write(`\rProcessed ${processed}/${bookingList.length}... (D-Invoices: ${withDInvoice}, Proforma only: ${withoutDInvoice}, Credit notes: ${creditNotes})`);
        }

        const result = await processBooking(booking);
        if (result) {
            results.push(result);
            withDInvoice++;
        } else {
            // Check if it was filtered out due to negative amount or no D-invoice
            try {
                const details = await getBookingInvoiceDetails(booking.id);
                const invoices = details.invoices || [];
                const dInv = invoices.find(inv => inv.number?.startsWith('D') && inv.is_last_document);

                if (dInv && dInv.items) {
                    const total = dInv.items.reduce((sum, item) => sum + (item.amount || 0), 0);
                    if (total <= 0) {
                        creditNotes++;
                    } else {
                        withoutDInvoice++;
                    }
                } else {
                    withoutDInvoice++;
                }
            } catch (error) {
                // Booking failed to fetch - skip it
                withoutDInvoice++;
            }
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('\n\n' + '='.repeat(80));
    console.log('RESULTS');
    console.log('='.repeat(80));
    console.log(`\nTotal bookings processed: ${processed}`);
    console.log(`D-Invoices extracted: ${withDInvoice}`);
    console.log(`Proforma only (no payment): ${withoutDInvoice}`);
    console.log(`Credit notes excluded: ${creditNotes}\n`);

    if (results.length > 0) {
        const totalRevenue = results.reduce((sum, r) => sum + r.totals.nadc, 0);
        const totalDiscount = results.reduce((sum, r) => sum + r.totals.discount, 0);
        const totalCommission = results.reduce((sum, r) => sum + r.totals.commission, 0);
        const withAgent = results.filter(r => r.agent.hasAgent).length;
        const directStudents = results.filter(r => !r.agent.hasAgent).length;

        console.log(`Total Revenue (NADC): €${totalRevenue.toFixed(2)}`);
        console.log(`Total Discounts: €${totalDiscount.toFixed(2)}`);
        console.log(`Total Commissions: €${totalCommission.toFixed(2)}`);
        console.log(`\nAgent Students: ${withAgent}`);
        console.log(`Direct Students: ${directStudents}\n`);

        // Export master data file
        const month = startDate.split('-')[1];
        const outputPath = `/home/hub/public_html/fins/scripts/fidelo/hourly/${year}/${month}-${year}.json`;
        await fs.writeFile(outputPath, JSON.stringify({
            generated: new Date().toISOString(),
            period: `${startDate} to ${endDate}`,
            description: `Master data: All D-invoices (with payments) for ${year} - excludes proformas and credit notes`,
            summary: {
                totalInvoices: results.length,
                totalRevenue: totalRevenue,
                totalDiscounts: totalDiscount,
                totalCommissions: totalCommission,
                agentStudents: withAgent,
                directStudents: directStudents
            },
            invoices: results
        }, null, 2));

        console.log(`📄 Master data exported to: ${outputPath}`);
        console.log(`\nYou can now process this file for any analysis without API calls!\n`);
    }
}

main().catch(console.error);
