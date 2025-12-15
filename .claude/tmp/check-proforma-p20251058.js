const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function checkProforma() {
    // First, find which booking has this proforma
    console.log('Searching for proforma P20251058...\n');

    const searchCommand = `curl -s "https://ulearn.fidelo.com/api/1.1/ts/bookings" \
      -H "Authorization: Bearer 699c957fb710153384dc0aea54e5dbec" \
      -H "Accept: application/json"`;

    const { stdout: searchResult } = await execPromise(searchCommand);
    const bookingsData = JSON.parse(searchResult);

    let targetBookingId = null;

    for (const [key, booking] of Object.entries(bookingsData.entries || {})) {
        if (booking.document_numbers_invoices && booking.document_numbers_invoices.includes('P20251058')) {
            targetBookingId = booking.id;
            console.log(`Found proforma P20251058 in Booking ID: ${targetBookingId}`);
            console.log(`Student: ${booking.customer_name} (ID: ${booking.customer_number})`);
            console.log(`Course: ${booking.course_name_en}\n`);
            break;
        }
    }

    if (!targetBookingId) {
        console.log('Proforma P20251058 not found in recent bookings');
        return;
    }

    // Now get the detailed booking with invoices
    console.log('Fetching detailed invoice data...\n');

    const detailCommand = `curl -s "https://ulearn.fidelo.com/api/1.1/ts/booking/${targetBookingId}?include_inactive_services=1&include_credit_notes=1" \
      -H "Authorization: Bearer 699c957fb710153384dc0aea54e5dbec" \
      -H "Accept: application/json"`;

    const { stdout: detailResult } = await execPromise(detailCommand);
    const data = JSON.parse(detailResult);

    const proforma = data.data.invoices.find(inv => inv.number === 'P20251058');

    if (!proforma) {
        console.log('Proforma P20251058 not found in booking invoices');
        return;
    }

    console.log('='.repeat(80));
    console.log('PROFORMA P20251058 - LINE ITEMS');
    console.log('='.repeat(80));
    console.log(`\nInvoice Number: ${proforma.number}`);
    console.log(`Type: ${proforma.type}`);
    console.log(`Date: ${proforma.date}`);
    console.log(`Is Last Document: ${proforma.is_last_document}`);

    console.log('\n\nLINE ITEMS:\n');

    let totalCourseFees = 0;
    const courseItems = [];

    proforma.items.forEach((item, idx) => {
        console.log(`${idx + 1}. ${item.description}`);
        console.log(`   Amount (before discount): €${item.amount.toFixed(2)}`);
        console.log(`   Discount: €${item.amount_discount.toFixed(2)}`);
        console.log(`   Commission: €${item.amount_commission.toFixed(2)}`);
        console.log(`   NADC (Net After Discounts & Commissions): €${item.amount_net.toFixed(2)}`);
        console.log(`   Tax: ${item.tax}%`);
        console.log(`   Service Period: ${item.service_from} to ${item.service_until}`);
        console.log(`   Active: ${item.active}`);

        // Check if this is a course item
        const isCourse = item.description && (
            item.description.toLowerCase().includes('morning') ||
            item.description.toLowerCase().includes('ielts') ||
            item.description.toLowerCase().includes('general') ||
            item.description.toLowerCase().includes('course') ||
            item.description.toLowerCase().includes('supplement')
        ) && !item.description.toLowerCase().includes('accommodation') &&
           !item.description.toLowerCase().includes('placement');

        if (item.active && isCourse) {
            totalCourseFees += item.amount_net;
            courseItems.push({
                description: item.description,
                amount: item.amount,
                discount: item.amount_discount,
                commission: item.amount_commission,
                nadc: item.amount_net
            });
        }

        console.log('');
    });

    console.log('='.repeat(80));
    console.log('COURSE FEES SUMMARY');
    console.log('='.repeat(80));
    console.log(`\nTotal Course Items: ${courseItems.length}`);
    console.log(`Total Course Fees (NADC): €${totalCourseFees.toFixed(2)}`);

    if (courseItems.length > 0) {
        console.log('\nCourse Line Items Breakdown:');
        courseItems.forEach((item, idx) => {
            console.log(`\n  ${idx + 1}. ${item.description}`);
            console.log(`     Amount: €${item.amount.toFixed(2)}`);
            if (item.discount > 0) {
                console.log(`     - Discount: €${item.discount.toFixed(2)}`);
            }
            if (item.commission > 0) {
                console.log(`     - Commission: €${item.commission.toFixed(2)}`);
            }
            console.log(`     = NADC: €${item.nadc.toFixed(2)}`);
        });
    }
}

checkProforma().catch(console.error);
