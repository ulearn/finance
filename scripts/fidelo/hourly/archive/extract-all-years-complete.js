/**
 * Extract ALL D-Invoices for Multiple Years - COMPLETE DATA
 *
 * This script bypasses the 1000-booking API limit by extracting month-by-month.
 *
 * Years to extract:
 * - 2025, 2024, 2023, 2022 (full years)
 * - 2020 Q1 only (Jan-Mar, pandemic closure after)
 * - 2019, 2018, 2017 (full years)
 * - Skip 2021 (pandemic closure)
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
    { year: 2025, months: 12 },
    { year: 2024, months: 12 },
    { year: 2023, months: 12 },
    { year: 2022, months: 12 },
    { year: 2020, months: 3 },  // Q1 only
    { year: 2019, months: 12 },
    { year: 2018, months: 12 },
    { year: 2017, months: 12 }
];

function getMonthlyRanges(year, totalMonths) {
    const ranges = [];
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    // Adjust for leap year
    if (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) {
        daysInMonth[1] = 29;
    }

    for (let month = 1; month <= totalMonths; month++) {
        const monthStr = month.toString().padStart(2, '0');
        const lastDay = daysInMonth[month - 1];
        ranges.push({
            month: month,
            start: `01/${monthStr}/${year}`,
            end: `${lastDay}/${monthStr}/${year}`
        });
    }

    return ranges;
}

async function getBookingsForMonth(startDate, endDate) {
    const formData = new URLSearchParams({
        _token: API_TOKEN,
        'filter[search]': '',
        'filter[booking_created_filter]': `${startDate},${endDate}`,
        'filter[confirmed_original][]': 'yes'
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
    const dInvoice = invoices.find(inv => inv.number?.startsWith('D') && inv.is_last_document);

    if (!dInvoice) {
        return null;
    }

    const student = bookingData.student || {};
    const booking = bookingData.booking || {};

    const totals = {
        amount: parseFloat(dInvoice.sum_items) || 0,
        discount: parseFloat(dInvoice.sum_discount) || 0,
        commission: parseFloat(dInvoice.sum_commission) || 0,
        nadc: parseFloat(dInvoice.amount_net) || 0
    };

    // EXCLUDE credit notes / refunds
    if (totals.nadc <= 0 || totals.amount <= 0) {
        return null;
    }

    const lineItems = (dInvoice.items || [])
        .filter(item => item.active)
        .map(item => ({
            description: item.description,
            quantity: parseFloat(item.quantity) || 0,
            price: parseFloat(item.price) || 0,
            discount: parseFloat(item.discount) || 0,
            commission: parseFloat(item.commission) || 0,
            total: parseFloat(item.total) || 0
        }));

    return {
        bookingId: parseInt(bookingId),
        invoiceNumber: dInvoice.number,
        invoiceDate: dInvoice.date,
        invoiceType: dInvoice.type,
        student: {
            number: student.number,
            firstName: student.firstname,
            surname: student.surname,
            email: student.email
        },
        agent: student.agent || null,
        courses: booking.courses || {},
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
        return invoiceData;
    } catch (error) {
        console.error(`\nError processing booking ${bookingId}: ${error.message}`);
        return null;
    }
}

async function extractYearData(yearConfig) {
    const { year, months } = yearConfig;
    const isPandemic2020 = year === 2020;

    console.log('='.repeat(80));
    console.log(`EXTRACTING ${year}${isPandemic2020 ? ' (Q1 ONLY - PANDEMIC)' : ''}`);
    console.log('='.repeat(80));
    console.log(`Extracting month-by-month to bypass 1000-booking API limit...\n`);

    const monthlyRanges = getMonthlyRanges(year, months);
    const allBookings = {};
    let totalBookingsFound = 0;

    // Fetch bookings for each month
    for (const range of monthlyRanges) {
        process.stdout.write(`\rFetching month ${range.month}/${months}...`);
        const monthBookings = await getBookingsForMonth(range.start, range.end);
        const count = Object.keys(monthBookings).length;
        totalBookingsFound += count;

        // Merge into allBookings (using booking ID as key to avoid duplicates)
        Object.assign(allBookings, monthBookings);

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    const bookingList = Object.values(allBookings);
    console.log(`\n\nFound ${totalBookingsFound} bookings across ${months} months (${bookingList.length} unique)`);
    console.log('Processing invoices... (this may take a while)\n');

    const results = [];
    let processed = 0;
    let dInvoiceCount = 0;
    let proformaCount = 0;
    let creditCount = 0;

    for (const booking of bookingList) {
        processed++;
        if (processed % 50 === 0 || processed === bookingList.length) {
            process.stdout.write(`\r${year}: ${processed}/${bookingList.length} | D-Invoices: ${dInvoiceCount} | Proforma: ${proformaCount} | Credits: ${creditCount}`);
        }

        const result = await processBooking(booking);
        if (result) {
            results.push(result);
            dInvoiceCount++;
        } else {
            try {
                const details = await getBookingInvoiceDetails(booking.id);
                const invoices = details.invoices || [];
                const dInv = invoices.find(inv => inv.number?.startsWith('D') && inv.is_last_document);

                if (dInv && dInv.items) {
                    const total = dInv.items.reduce((sum, item) => sum + (item.amount || 0), 0);
                    if (total <= 0) {
                        creditCount++;
                    } else {
                        proformaCount++;
                    }
                } else {
                    proformaCount++;
                }
            } catch (err) {
                proformaCount++;
            }
        }

        await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('\n');

    const agentStudents = results.filter(inv => inv.agent !== null).length;
    const directStudents = results.length - agentStudents;
    const totalRevenue = results.reduce((sum, inv) => sum + inv.totals.nadc, 0);
    const totalDiscounts = results.reduce((sum, inv) => sum + inv.totals.discount, 0);
    const totalCommissions = results.reduce((sum, inv) => sum + inv.totals.commission, 0);

    console.log(`✓ D-Invoices: ${dInvoiceCount}`);
    console.log(`✓ Revenue (NADC): €${totalRevenue.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`);
    console.log(`✓ Discounts: €${totalDiscounts.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`);
    console.log(`✓ Commissions: €${totalCommissions.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`);
    console.log(`✓ Agent: ${agentStudents} | Direct: ${directStudents}`);

    const outputDir = path.join(__dirname, year.toString());
    await fs.mkdir(outputDir, { recursive: true });

    const outputFile = path.join(outputDir, `${year}-master.json`);
    await fs.writeFile(outputFile, JSON.stringify({ invoices: results }, null, 2));

    console.log('');
    console.log(`📄 Saved: ${outputFile}`);
    console.log('');
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║              FIDELO COMPLETE MASTER DATA EXTRACTION                          ║');
    console.log('║                                                                              ║');
    console.log('║  Extracting ALL D-invoices (with payments) using monthly chunks:            ║');
    console.log('║  • 2025, 2024, 2023, 2022 (full years)                                      ║');
    console.log('║  • 2020 Q1 (Jan-Mar, pandemic closure after)                                ║');
    console.log('║  • 2019, 2018, 2017 (full years)                                            ║');
    console.log('║  • Skip 2021 (pandemic closure)                                             ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    console.log('');

    for (const yearConfig of YEAR_RANGES) {
        await extractYearData(yearConfig);
    }

    console.log('='.repeat(80));
    console.log('ALL YEARS EXTRACTED SUCCESSFULLY!');
    console.log('='.repeat(80));
    console.log('');
    console.log('Next steps:');
    console.log('1. Run process-year.js for each year to classify courses');
    console.log('2. View data in dashboard-v3.html');
    console.log('');
}

main().catch(console.error);
