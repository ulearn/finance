/**
 * Extract ALL Invoice Line Items - November 2025
 *
 * This version extracts ALL line items from all invoices with payments
 * so they can be reviewed by AI to ensure we're capturing all courses correctly.
 *
 * Usage: node extract-all-line-items.js [YYYY-MM]
 */

const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs').promises;

const GUI2_BOOKINGS = 'https://ulearn.fidelo.com/api/1.0/gui2/b56eab683e450abb7100bfa45fc238fd/search';
const BOOKING_DETAIL_API = 'https://ulearn.fidelo.com/api/1.1/ts/booking';
const API_TOKEN = '699c957fb710153384dc0aea54e5dbec';

async function getNovemberMorningClassBookings(yearMonth) {
    const [year, month] = yearMonth.split('-');

    console.log(`Fetching Morning Class bookings for ${yearMonth}...\n`);

    const formData = new URLSearchParams({
        _token: API_TOKEN,
        'filter[search]': '',
        'filter[booking_created_filter]': `01/${month}/${year},`,
        'filter[course_category_original][]': '4', // Morning Classes
        'filter[confirmed_original][]': 'yes'
    });

    const response = await axios.post(GUI2_BOOKINGS, formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 60000
    });

    if (!response.data || !response.data.entries) {
        console.log('No bookings found\n');
        return {};
    }

    console.log(`Found ${response.data.hits} bookings\n`);
    return response.data.entries;
}

async function getBookingInvoiceDetails(bookingId) {
    const curlCommand = `curl -s "${BOOKING_DETAIL_API}/${bookingId}?include_inactive_services=1&include_credit_notes=1" \
      -H "Authorization: Bearer ${API_TOKEN}" \
      -H "Accept: application/json"`;

    const { stdout } = await execPromise(curlCommand, { maxBuffer: 50 * 1024 * 1024 });
    return JSON.parse(stdout).data;
}

function extractAllLineItems(bookingData) {
    const invoices = bookingData.invoices || [];

    // Prefer D-invoices, fallback to last document
    const dInvoice = invoices.find(inv => inv.number?.startsWith('D') && inv.is_last_document);
    const targetInvoice = dInvoice || invoices.find(inv => inv.is_last_document);

    if (!targetInvoice?.items) return null;

    // Extract ALL active line items (no filtering)
    const allItems = [];

    for (const item of targetInvoice.items) {
        if (!item.active) continue;

        allItems.push({
            description: item.description,
            amount: item.amount,
            discount: item.amount_discount || 0,
            commission: item.amount_commission || 0,
            nadc: item.amount_net,
            serviceFrom: item.service_from,
            serviceUntil: item.service_until,
            tax: item.tax
        });
    }

    if (allItems.length === 0) return null;

    return {
        invoice: targetInvoice.number,
        invoiceType: targetInvoice.number.startsWith('D') ? 'Invoice' : 'Proforma',
        invoiceDate: targetInvoice.date,
        items: allItems,
        totalAmount: allItems.reduce((sum, i) => sum + i.amount, 0),
        totalDiscount: allItems.reduce((sum, i) => sum + i.discount, 0),
        totalCommission: allItems.reduce((sum, i) => sum + i.commission, 0),
        totalNADC: allItems.reduce((sum, i) => sum + i.nadc, 0)
    };
}

function getMorningCourseInfo(bookingData) {
    const courses = bookingData.booking?.courses || {};

    for (const course of Object.values(courses)) {
        if (course.category?.toLowerCase().includes('morning')) {
            return {
                name: course.name,
                category: course.category,
                from: course.from,
                until: course.until,
                weeks: parseInt(course.weeks) || 0
            };
        }
    }

    return null;
}

async function processBooking(booking) {
    const bookingId = booking.id;

    try {
        const details = await getBookingInvoiceDetails(bookingId);

        const courseInfo = getMorningCourseInfo(details);
        if (!courseInfo) return null;

        const invoiceData = extractAllLineItems(details);
        if (!invoiceData) return null;

        const student = details.student || {};

        return {
            bookingId,
            studentId: student.number,
            studentName: `${student.firstname} ${student.surname}`,
            studentEmail: student.email,
            courseName: courseInfo.name,
            courseCategory: courseInfo.category,
            coursePeriod: `${courseInfo.from} to ${courseInfo.until}`,
            courseWeeks: courseInfo.weeks,
            invoice: invoiceData.invoice,
            invoiceType: invoiceData.invoiceType,
            invoiceDate: invoiceData.invoiceDate,
            allLineItems: invoiceData.items,
            totalLineItems: invoiceData.items.length,
            invoiceTotalAmount: invoiceData.totalAmount,
            invoiceTotalDiscount: invoiceData.totalDiscount,
            invoiceTotalCommission: invoiceData.totalCommission,
            invoiceTotalNADC: invoiceData.totalNADC
        };

    } catch (error) {
        console.error(`Error processing booking ${bookingId}:`, error.message);
        return null;
    }
}

async function main() {
    const yearMonth = process.argv[2] || '2025-11';
    const [year, month] = yearMonth.split('-');
    const monthName = new Date(year, month - 1).toLocaleString('en', { month: 'short' }).toLowerCase();

    console.log('='.repeat(80));
    console.log('ALL LINE ITEMS EXTRACTION - NOVEMBER 2025');
    console.log('='.repeat(80));
    console.log('');

    const bookings = await getNovemberMorningClassBookings(yearMonth);
    const bookingList = Object.values(bookings);

    console.log(`Processing ${bookingList.length} bookings...\n`);

    const results = [];
    let processed = 0;

    for (const booking of bookingList) {
        processed++;
        process.stdout.write(`\rProcessed ${processed}/${bookingList.length}...`);

        const result = await processBooking(booking);
        if (result) {
            results.push(result);
        }

        await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('\n\n' + '='.repeat(80));
    console.log('RESULTS');
    console.log('='.repeat(80));
    console.log(`\nTotal bookings processed: ${processed}`);
    console.log(`Bookings with invoice data: ${results.length}\n`);

    if (results.length > 0) {
        const totalLineItems = results.reduce((sum, r) => sum + r.totalLineItems, 0);
        const totalNADC = results.reduce((sum, r) => sum + r.invoiceTotalNADC, 0);

        console.log(`Total Line Items: ${totalLineItems}`);
        console.log(`Total Invoice NADC: €${totalNADC.toFixed(2)}\n`);

        // Export to specific location
        const outputPath = `/home/hub/public_html/fins/scripts/fidelo/hourly/2025/${month}.${monthName}-morn-all.json`;
        await fs.writeFile(outputPath, JSON.stringify({
            generated: new Date().toISOString(),
            period: yearMonth,
            description: 'All invoice line items for Morning Class bookings (for AI review)',
            summary: {
                totalBookings: results.length,
                totalLineItems: totalLineItems,
                totalInvoiceNADC: totalNADC
            },
            results
        }, null, 2));

        console.log(`📄 Exported to: ${outputPath}`);
    }
}

main().catch(console.error);
