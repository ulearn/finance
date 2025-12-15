/**
 * Extract ALL D-Invoices for Multiple Years - Master Data Builder
 *
 * This pulls complete invoice data from Fidelo for all specified years
 * and saves master JSON files for each year.
 *
 * Years to extract:
 * - 2024, 2023, 2022 (full years)
 * - 2020 Q1 only (Jan-Mar, pandemic closure after)
 * - 2019, 2018, 2017 (full years)
 * - Skip 2021 (pandemic closure)
 *
 * Usage: node extract-all-years-master.js
 */

const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs').promises;
const path = require('path');

const GUI2_BOOKINGS = 'https://ulearn.fidelo.com/api/1.0/gui2/b56eab683e450abb7100bfa45fc238fd/search';
const BOOKING_DETAIL_API = 'https://ulearn.fidelo.com/api/1.1/ts/booking';
const API_TOKEN = '699c957fb710153384dc0aea54e5dbec';

// Define year ranges to extract
const YEAR_RANGES = [
    { year: 2024, start: '2024-01-01', end: '2024-12-31' },
    { year: 2023, start: '2023-01-01', end: '2023-12-31' },
    { year: 2022, start: '2022-01-01', end: '2022-12-31' },
    { year: 2020, start: '2020-01-01', end: '2020-03-31' }, // Q1 only
    { year: 2019, start: '2019-01-01', end: '2019-12-31' },
    { year: 2018, start: '2018-01-01', end: '2018-12-31' },
    { year: 2017, start: '2017-01-01', end: '2017-12-31' }
];

async function getAllBookings(startDate, endDate) {
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
        return {};
    }

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

async function extractYearData(yearConfig) {
    const { year, start, end } = yearConfig;
    const isPandemic2020 = year === 2020;

    console.log('='.repeat(80));
    console.log(`EXTRACTING ${year}${isPandemic2020 ? ' (Q1 ONLY - PANDEMIC)' : ''}`);
    console.log('='.repeat(80));
    console.log(`Period: ${start} to ${end}\n`);

    // Get all bookings
    const bookings = await getAllBookings(start, end);
    const bookingList = Object.values(bookings);

    console.log(`Found ${bookingList.length} confirmed bookings`);
    console.log('Processing... (this may take a while)\n');

    const results = [];
    let processed = 0;
    let withDInvoice = 0;
    let withoutDInvoice = 0;
    let creditNotes = 0;

    for (const booking of bookingList) {
        processed++;
        if (processed % 50 === 0 || processed === bookingList.length) {
            process.stdout.write(`\r${year}: ${processed}/${bookingList.length} | D-Invoices: ${withDInvoice} | Proforma: ${withoutDInvoice} | Credits: ${creditNotes}`);
        }

        const result = await processBooking(booking);
        if (result) {
            results.push(result);
            withDInvoice++;
        } else {
            // Track why it was excluded
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
            } catch (err) {
                withoutDInvoice++;
            }
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('\n');

    if (results.length > 0) {
        const totalRevenue = results.reduce((sum, r) => sum + r.totals.nadc, 0);
        const totalDiscount = results.reduce((sum, r) => sum + r.totals.discount, 0);
        const totalCommission = results.reduce((sum, r) => sum + r.totals.commission, 0);
        const withAgent = results.filter(r => r.agent.hasAgent).length;
        const directStudents = results.filter(r => !r.agent.hasAgent).length;

        console.log(`✓ D-Invoices: ${withDInvoice}`);
        console.log(`✓ Revenue (NADC): €${totalRevenue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
        console.log(`✓ Discounts: €${totalDiscount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
        console.log(`✓ Commissions: €${totalCommission.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
        console.log(`✓ Agent: ${withAgent} | Direct: ${directStudents}\n`);

        // Create year directory if it doesn't exist
        const yearDir = path.join(__dirname, year.toString());
        try {
            await fs.mkdir(yearDir, { recursive: true });
        } catch (err) {
            // Directory might already exist, that's fine
        }

        // Export master data file
        const outputPath = path.join(yearDir, `${year}-master.json`);
        await fs.writeFile(outputPath, JSON.stringify({
            generated: new Date().toISOString(),
            year: year,
            period: `${start} to ${end}`,
            description: isPandemic2020
                ? 'Master data: All D-invoices Q1 2020 (pandemic closure after March)'
                : `Master data: All D-invoices for ${year} - excludes proformas and credit notes`,
            summary: {
                totalInvoices: results.length,
                totalRevenue: totalRevenue,
                totalDiscounts: totalDiscount,
                totalCommissions: totalCommission,
                agentStudents: withAgent,
                directStudents: directStudents,
                proformaOnly: withoutDInvoice,
                creditNotesExcluded: creditNotes
            },
            invoices: results
        }, null, 2));

        console.log(`📄 Saved: ${outputPath}\n`);

        return {
            year: year,
            success: true,
            invoiceCount: results.length,
            revenue: totalRevenue
        };
    } else {
        console.log(`⚠ No D-invoices found for ${year}\n`);
        return {
            year: year,
            success: false,
            invoiceCount: 0,
            revenue: 0
        };
    }
}

async function main() {
    console.log('\n');
    console.log('╔' + '═'.repeat(78) + '╗');
    console.log('║' + ' '.repeat(20) + 'FIDELO MASTER DATA EXTRACTION' + ' '.repeat(29) + '║');
    console.log('║' + ' '.repeat(78) + '║');
    console.log('║  Extracting all D-invoices (with payments) for:' + ' '.repeat(30) + '║');
    console.log('║  • 2024, 2023, 2022 (full years)' + ' '.repeat(45) + '║');
    console.log('║  • 2020 Q1 (Jan-Mar, pandemic closure after)' + ' '.repeat(33) + '║');
    console.log('║  • 2019, 2018, 2017 (full years)' + ' '.repeat(45) + '║');
    console.log('║  • Skip 2021 (pandemic closure)' + ' '.repeat(46) + '║');
    console.log('╚' + '═'.repeat(78) + '╝');
    console.log('\n');

    const startTime = Date.now();
    const results = [];

    for (const yearConfig of YEAR_RANGES) {
        try {
            const result = await extractYearData(yearConfig);
            results.push(result);
        } catch (error) {
            console.error(`\n❌ Error processing ${yearConfig.year}:`, error.message);
            results.push({
                year: yearConfig.year,
                success: false,
                error: error.message
            });
        }
    }

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    console.log('='.repeat(80));
    console.log('EXTRACTION COMPLETE');
    console.log('='.repeat(80));
    console.log('');

    results.forEach(r => {
        if (r.success) {
            console.log(`✓ ${r.year}: ${r.invoiceCount.toLocaleString()} invoices | €${r.revenue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
        } else {
            console.log(`✗ ${r.year}: Failed${r.error ? ' - ' + r.error : ''}`);
        }
    });

    const totalInvoices = results.reduce((sum, r) => sum + (r.invoiceCount || 0), 0);
    const totalRevenue = results.reduce((sum, r) => sum + (r.revenue || 0), 0);

    console.log('');
    console.log(`Total: ${totalInvoices.toLocaleString()} invoices | €${totalRevenue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
    console.log(`Duration: ${duration} seconds`);
    console.log('');
}

main().catch(console.error);
