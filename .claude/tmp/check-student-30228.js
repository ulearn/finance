const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function checkStudent30228() {
    console.log('Fetching bookings for Student ID 30228...\n');

    // Use GUI2 API to search for this student
    const formData = new URLSearchParams({
        _token: '699c957fb710153384dc0aea54e5dbec',
        'filter[search]': '30228'
    });

    const searchCommand = `curl -s "https://ulearn.fidelo.com/api/1.0/gui2/b56eab683e450abb7100bfa45fc238fd/search" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -d "${formData.toString()}"`;

    const { stdout: searchResult } = await execPromise(searchCommand, { maxBuffer: 1024 * 1024 * 50 });
    const searchData = JSON.parse(searchResult);

    console.log(`Found ${searchData.hits} booking(s)\n`);

    if (searchData.hits === 0) {
        console.log('No bookings found for Student ID 30228');
        return;
    }

    // Get the first booking
    const booking = Object.values(searchData.entries)[0];
    console.log(`Booking ID: ${booking.id}`);
    console.log(`Student: ${booking.customer_name}`);
    console.log(`Course: ${booking.course_name_en}`);
    console.log(`Documents: ${booking.document_numbers_invoices}\n`);

    // Now get detailed booking with invoices
    console.log('Fetching detailed invoice data...\n');

    const detailCommand = `curl -s "https://ulearn.fidelo.com/api/1.1/ts/booking/${booking.id}?include_inactive_services=1&include_credit_notes=1" \
      -H "Authorization: Bearer 699c957fb710153384dc0aea54e5dbec" \
      -H "Accept: application/json"`;

    const { stdout: detailResult } = await execPromise(detailCommand, { maxBuffer: 1024 * 1024 * 50 });
    const data = JSON.parse(detailResult);

    // Find proforma P20251058
    const proforma = data.data.invoices.find(inv => inv.number === 'P20251058');

    if (!proforma) {
        console.log('Proforma P20251058 not found');
        console.log('Available invoices:', data.data.invoices.map(inv => inv.number).join(', '));
        return;
    }

    console.log('='.repeat(80));
    console.log('PROFORMA P20251058 - COMMISSIONS & DISCOUNTS EXAMPLE');
    console.log('='.repeat(80));
    console.log(`\nStudent: ${data.data.student.firstname} ${data.data.student.surname} (ID: ${data.data.student.number})`);
    console.log(`Invoice: ${proforma.number}`);
    console.log(`Type: ${proforma.type}`);
    console.log(`Date: ${proforma.date}`);
    console.log(`Is Last Document: ${proforma.is_last_document}\n`);

    console.log('LINE ITEMS:\n');

    let totalCourseFees = 0;
    const courseItems = [];

    proforma.items.forEach((item, idx) => {
        console.log(`${idx + 1}. ${item.description}`);
        console.log(`   Amount (original): €${item.amount.toFixed(2)}`);

        if (item.amount_discount > 0) {
            console.log(`   - Discount: €${item.amount_discount.toFixed(2)}`);
        }

        if (item.amount_commission > 0) {
            console.log(`   - Commission: €${item.amount_commission.toFixed(2)}`);
        }

        console.log(`   = NADC (Net After Discounts & Commissions): €${item.amount_net.toFixed(2)}`);
        console.log(`   Service Period: ${item.service_from} to ${item.service_until}`);
        console.log(`   Active: ${item.active}\n`);

        // Check if this is a COURSE item (not accommodation, not supplement)
        const isCourseItem = item.description && (
            item.description.toLowerCase().includes('morning') ||
            item.description.toLowerCase().includes('ielts') ||
            item.description.toLowerCase().includes('general') ||
            (item.description.toLowerCase().includes('week') && item.description.toLowerCase().includes('course'))
        ) && !item.description.toLowerCase().includes('accommodation') &&
           !item.description.toLowerCase().includes('placement') &&
           !item.description.toLowerCase().includes('supplement');

        if (item.active && isCourseItem) {
            totalCourseFees += item.amount_net;
            courseItems.push({
                description: item.description,
                amount: item.amount,
                discount: item.amount_discount,
                commission: item.amount_commission,
                nadc: item.amount_net
            });
        }
    });

    console.log('='.repeat(80));
    console.log('COURSE FEES ANALYSIS');
    console.log('='.repeat(80));

    if (courseItems.length > 0) {
        console.log(`\nCourse Line Items Found: ${courseItems.length}\n`);

        courseItems.forEach((item, idx) => {
            console.log(`Course Item ${idx + 1}:`);
            console.log(`  Description: ${item.description}`);
            console.log(`  Original Amount: €${item.amount.toFixed(2)}`);

            if (item.discount > 0) {
                const discountPercent = ((item.discount / item.amount) * 100).toFixed(1);
                console.log(`  Discount: €${item.discount.toFixed(2)} (${discountPercent}%)`);
            }

            if (item.commission > 0) {
                const commissionPercent = ((item.commission / item.amount) * 100).toFixed(1);
                console.log(`  Commission: €${item.commission.toFixed(2)} (${commissionPercent}%)`);
            }

            console.log(`  NADC: €${item.nadc.toFixed(2)}`);
            console.log('');
        });

        console.log(`Total Course Fees (NADC): €${totalCourseFees.toFixed(2)}`);

        // Get course info to calculate hourly rate
        const courses = data.data.booking?.courses || {};
        const morningCourse = Object.values(courses).find(c =>
            c.category && c.category.toLowerCase().includes('morning')
        );

        if (morningCourse) {
            const weeks = parseInt(morningCourse.weeks) || 0;
            const hoursPerWeek = 15; // Morning Classes standard
            const totalHours = weeks * hoursPerWeek;

            console.log(`\nCourse Details:`);
            console.log(`  Name: ${morningCourse.name}`);
            console.log(`  Weeks: ${weeks}`);
            console.log(`  Hours per week: ${hoursPerWeek}`);
            console.log(`  Total hours: ${totalHours}`);

            if (totalHours > 0) {
                const ratePerHour = totalCourseFees / totalHours;
                console.log(`\n  📊 Rate per hour: €${ratePerHour.toFixed(2)}/hour`);
            }
        }
    } else {
        console.log('\n⚠️  No course line items found');
    }
}

checkStudent30228().catch(console.error);
