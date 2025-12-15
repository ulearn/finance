/**
 * Extract Morning Class Course Rates - November 2025
 *
 * Uses GUI2 Bookings API to find confirmed Morning Class bookings,
 * then extracts actual course fees (NADC) from invoice line items.
 *
 * Usage: node extract-morning-rates-november.js [YYYY-MM]
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

    // GUI2 search for Morning Classes (category 4), confirmed, created in November
    const formData = new URLSearchParams({
        _token: API_TOKEN,
        'filter[search]': '',
        'filter[booking_created_filter]': `01/${month}/${year},`,
        'filter[course_category_original][]': '4', // Morning Classes
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

function extractCourseFeeNADC(bookingData) {
    const invoices = bookingData.invoices || [];

    // Prefer D-invoices, fallback to last document
    const dInvoice = invoices.find(inv => inv.number?.startsWith('D') && inv.is_last_document);
    const targetInvoice = dInvoice || invoices.find(inv => inv.is_last_document);

    if (!targetInvoice?.items) return null;

    // Extract ALL Morning course line items (can be multiple for split courses)
    const courseItems = [];

    for (const item of targetInvoice.items) {
        if (!item.active) continue;

        const desc = (item.description || '').toLowerCase();

        // Identify course items: must have "morning" AND "week"
        const hasMorningAndWeek = desc.includes('morning') && desc.includes('week');

        // Exclude non-course items
        const isExcluded = desc.includes('supplement') ||
                          desc.includes('accommodation') ||
                          desc.includes('placement') ||
                          desc.includes('exam') ||
                          desc.includes('insurance') ||
                          desc.includes('health') ||
                          desc.includes('pel');

        const isCourse = hasMorningAndWeek && !isExcluded;

        if (isCourse) {
            // Extract weeks from description (e.g., "22 weeks Academic Year...")
            const weeksMatch = item.description.match(/(\d+)\s+week/i);
            const weeks = weeksMatch ? parseInt(weeksMatch[1]) : 0;

            courseItems.push({
                description: item.description,
                weeks: weeks,
                amount: item.amount,
                discount: item.amount_discount || 0,
                commission: item.amount_commission || 0,
                nadc: item.amount_net
            });
        }
    }

    if (courseItems.length === 0) return null;

    // Sum up all course items
    const totalWeeks = courseItems.reduce((sum, item) => sum + item.weeks, 0);
    const totalAmount = courseItems.reduce((sum, item) => sum + item.amount, 0);
    const totalDiscount = courseItems.reduce((sum, item) => sum + item.discount, 0);
    const totalCommission = courseItems.reduce((sum, item) => sum + item.commission, 0);
    const totalNADC = courseItems.reduce((sum, item) => sum + item.nadc, 0);

    return {
        items: courseItems,
        description: courseItems.map(i => i.description).join(' + '),
        weeks: totalWeeks,
        amount: totalAmount,
        discount: totalDiscount,
        commission: totalCommission,
        nadc: totalNADC,
        invoice: targetInvoice.number
    };
}

function getMorningCourseInfo(bookingData) {
    const courses = bookingData.booking?.courses || {};

    for (const course of Object.values(courses)) {
        if (course.category?.toLowerCase().includes('morning')) {
            return {
                name: course.name,
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
        // Get detailed booking with invoices
        const details = await getBookingInvoiceDetails(bookingId);

        // Extract course info
        const courseInfo = getMorningCourseInfo(details);
        if (!courseInfo) return null;

        // Extract course fee from invoice (this now extracts ALL course items and sums them)
        const courseFee = extractCourseFeeNADC(details);
        if (!courseFee) return null;

        // Use weeks from invoice line items (not from course object)
        const weeks = courseFee.weeks;

        // Calculate rate
        const hoursPerWeek = 15;
        const totalHours = weeks * hoursPerWeek;
        const ratePerHour = totalHours > 0 ? (courseFee.nadc / totalHours) : 0;

        const student = details.student || {};

        return {
            bookingId,
            studentId: student.number,
            studentName: `${student.firstname} ${student.surname}`,
            courseName: courseInfo.name,
            coursePeriod: `${courseInfo.from} to ${courseInfo.until}`,
            weeks: weeks,
            totalHours,
            courseLineItems: courseFee.items,
            courseDescription: courseFee.description,
            amountOriginal: courseFee.amount,
            discount: courseFee.discount,
            commission: courseFee.commission,
            courseFeeNADC: courseFee.nadc,
            ratePerHour,
            invoice: courseFee.invoice
        };

    } catch (error) {
        console.error(`Error processing booking ${bookingId}:`, error.message);
        return null;
    }
}

async function main() {
    const yearMonth = process.argv[2] || '2025-11';

    console.log('='.repeat(80));
    console.log('MORNING CLASS RATE EXTRACTION - NOVEMBER 2025');
    console.log('='.repeat(80));
    console.log('');

    // Get bookings
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

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('\n\n' + '='.repeat(80));
    console.log('RESULTS');
    console.log('='.repeat(80));
    console.log(`\nTotal bookings processed: ${processed}`);
    console.log(`Morning Classes with rates: ${results.length}\n`);

    if (results.length > 0) {
        const totalRevenue = results.reduce((sum, r) => sum + r.courseFeeNADC, 0);
        const totalHours = results.reduce((sum, r) => sum + r.totalHours, 0);
        const avgRate = results.reduce((sum, r) => sum + r.ratePerHour, 0) / results.length;

        console.log(`Total Revenue (NADC): €${totalRevenue.toFixed(2)}`);
        console.log(`Total Hours: ${totalHours}`);
        console.log(`Average Rate/Hour: €${avgRate.toFixed(2)}\n`);

        // Export
        const outputPath = `/home/hub/public_html/fins/.claude/tmp/morning-rates-${yearMonth}.json`;
        await fs.writeFile(outputPath, JSON.stringify({
            generated: new Date().toISOString(),
            period: yearMonth,
            summary: { totalBookings: results.length, totalRevenue, totalHours, avgRate },
            results
        }, null, 2));

        console.log(`📄 Exported to: ${outputPath}`);
    }
}

main().catch(console.error);
