const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function checkCustomer30228() {
    console.log('Searching for customer_number 30228 in bookings API...\n');

    // Fetch all bookings and filter by customer_number
    const bookingsCommand = `curl -s "https://ulearn.fidelo.com/api/1.1/ts/bookings" \
      -H "Authorization: Bearer 699c957fb710153384dc0aea54e5dbec" \
      -H "Accept: application/json"`;

    const { stdout } = await execPromise(bookingsCommand, { maxBuffer: 1024 * 1024 * 100 });
    const bookingsData = JSON.parse(stdout);

    console.log(`Total bookings in API: ${bookingsData.hits}\n`);
    console.log('Searching for customer_number = "30228"...\n');

    // Find booking with customer_number = 30228
    let targetBooking = null;

    for (const [key, booking] of Object.entries(bookingsData.entries || {})) {
        if (booking.customer_number === "30228") {
            targetBooking = booking;
            console.log('✓ Found booking for customer_number 30228!');
            console.log(`  Booking ID: ${booking.id}`);
            console.log(`  Student Name: ${booking.customer_name}`);
            console.log(`  Customer Number: ${booking.customer_number}`);
            console.log(`  Course: ${booking.course_name_en}`);
            console.log(`  Documents: ${booking.document_numbers_invoices}\n`);
            break;
        }
    }

    if (!targetBooking) {
        console.log('✗ No booking found with customer_number = "30228"');

        // Show some sample customer numbers for debugging
        console.log('\nSample customer_numbers in the system:');
        const samples = Object.values(bookingsData.entries || {}).slice(0, 5);
        samples.forEach(b => {
            console.log(`  ${b.customer_number} - ${b.customer_name}`);
        });
        return;
    }

    // Now get detailed booking with invoices
    console.log('Fetching detailed invoice data...\n');

    const detailCommand = `curl -s "https://ulearn.fidelo.com/api/1.1/ts/booking/${targetBooking.id}?include_inactive_services=1&include_credit_notes=1" \
      -H "Authorization: Bearer 699c957fb710153384dc0aea54e5dbec" \
      -H "Accept: application/json"`;

    const { stdout: detailResult } = await execPromise(detailCommand, { maxBuffer: 1024 * 1024 * 50 });
    const data = JSON.parse(detailResult);

    console.log('='.repeat(80));
    console.log('ALL INVOICES FOR THIS BOOKING');
    console.log('='.repeat(80));

    data.data.invoices.forEach(inv => {
        console.log(`\n${inv.number} (${inv.type}) - Last Document: ${inv.is_last_document}`);
    });

    // Find proforma P20251058
    const proforma = data.data.invoices.find(inv => inv.number === 'P20251058');

    if (!proforma) {
        console.log('\n\n✗ Proforma P20251058 not found in this booking');
        console.log('Available invoices:', data.data.invoices.map(inv => inv.number).join(', '));

        // Show the last document instead as example
        const lastDoc = data.data.invoices.find(inv => inv.is_last_document);
        if (lastDoc) {
            console.log(`\nShowing last document (${lastDoc.number}) as example instead:\n`);
            showInvoiceDetails(data, lastDoc);
        }
        return;
    }

    console.log('\n\n✓ Found P20251058!\n');
    showInvoiceDetails(data, proforma);
}

function showInvoiceDetails(data, invoice) {
    console.log('='.repeat(80));
    console.log(`INVOICE ${invoice.number} - LINE ITEMS`);
    console.log('='.repeat(80));
    console.log(`Type: ${invoice.type}`);
    console.log(`Date: ${invoice.date}`);
    console.log(`Is Last Document: ${invoice.is_last_document}\n`);

    console.log('LINE ITEMS:\n');

    let totalCourseFees = 0;
    const courseItems = [];

    invoice.items.forEach((item, idx) => {
        console.log(`${idx + 1}. ${item.description}`);
        console.log(`   Amount (original): €${item.amount.toFixed(2)}`);

        if (item.amount_discount > 0) {
            const discountPercent = ((item.amount_discount / item.amount) * 100).toFixed(1);
            console.log(`   - Discount: €${item.amount_discount.toFixed(2)} (${discountPercent}%)`);
        }

        if (item.amount_commission > 0) {
            const commissionPercent = ((item.amount_commission / item.amount) * 100).toFixed(1);
            console.log(`   - Commission: €${item.amount_commission.toFixed(2)} (${commissionPercent}%)`);
        }

        console.log(`   = NADC: €${item.amount_net.toFixed(2)}`);
        console.log(`   Service: ${item.service_from} to ${item.service_until}`);
        console.log(`   Active: ${item.active}\n`);

        // Check if this is a COURSE item (main course line, not supplements/accommodation)
        const isCourseItem = item.description && (
            (item.description.toLowerCase().includes('morning') && !item.description.toLowerCase().includes('supplement')) ||
            (item.description.toLowerCase().includes('week') &&
             (item.description.toLowerCase().includes('ielts') ||
              item.description.toLowerCase().includes('general')))
        ) && !item.description.toLowerCase().includes('accommodation') &&
           !item.description.toLowerCase().includes('placement');

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
    console.log('COURSE FEES ANALYSIS (Main course line items only)');
    console.log('='.repeat(80));

    if (courseItems.length > 0) {
        console.log(`\nCourse Line Items Found: ${courseItems.length}\n`);

        courseItems.forEach((item, idx) => {
            console.log(`Course Item ${idx + 1}:`);
            console.log(`  ${item.description}`);
            console.log(`  Original: €${item.amount.toFixed(2)}`);

            if (item.discount > 0) {
                console.log(`  - Discount: €${item.discount.toFixed(2)}`);
            }

            if (item.commission > 0) {
                console.log(`  - Commission: €${item.commission.toFixed(2)}`);
            }

            console.log(`  = NADC: €${item.nadc.toFixed(2)}\n`);
        });

        console.log(`Total Course Fees (NADC): €${totalCourseFees.toFixed(2)}`);

        // Get course info
        const courses = data.data.booking?.courses || {};
        const morningCourse = Object.values(courses).find(c =>
            c.category && c.category.toLowerCase().includes('morning')
        );

        if (morningCourse) {
            const weeks = parseInt(morningCourse.weeks) || 0;
            const hoursPerWeek = 15;
            const totalHours = weeks * hoursPerWeek;

            console.log(`\nCourse: ${morningCourse.name}`);
            console.log(`Weeks: ${weeks} × ${hoursPerWeek} hours/week = ${totalHours} hours`);

            if (totalHours > 0) {
                const ratePerHour = totalCourseFees / totalHours;
                console.log(`\n📊 Rate per hour: €${ratePerHour.toFixed(2)}/hour`);
            }
        }
    } else {
        console.log('\n⚠️  No course line items found');
    }
}

checkCustomer30228().catch(console.error);
