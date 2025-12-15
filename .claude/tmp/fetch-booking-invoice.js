const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const FIDELO_API_BASE = 'https://ulearn.fidelo.com/api/1.1/ts';
const API_TOKEN = '699c957fb710153384dc0aea54e5dbec';

async function getBookingWithInvoices(bookingId) {
    try {
        console.log(`Fetching detailed invoice data for booking ${bookingId}...\n`);

        // Use curl instead of axios to avoid timeout issues
        const curlCommand = `curl -s -X GET "${FIDELO_API_BASE}/booking/${bookingId}?include_inactive_services=1&include_credit_notes=1" \
          -H "Authorization: Bearer ${API_TOKEN}" \
          -H "Accept: application/json" \
          --max-time 60 --compressed`;

        const { stdout, stderr } = await execPromise(curlCommand);

        if (stderr && !stdout) {
            throw new Error(`Curl error: ${stderr}`);
        }

        const data = JSON.parse(stdout);

        if (!data || !data.data) {
            throw new Error('Invalid response structure');
        }

        return data.data;

    } catch (error) {
        console.error('Error fetching booking:', error.message);
        return null;
    }
}

async function extractCourseFeesFromInvoice(bookingId) {
    const data = await getBookingWithInvoices(bookingId);

    if (!data) {
        return null;
    }

    console.log('='.repeat(80));
    console.log(`BOOKING ${bookingId} - COURSE FEES BREAKDOWN`);
    console.log('='.repeat(80));

    // Get student info
    const student = data.student || {};
    console.log(`\nStudent: ${student.firstname} ${student.surname} (ID: ${student.number})`);
    console.log(`Email: ${student.email}`);

    // Get course info
    const courses = data.booking?.courses || {};
    console.log(`\nCOURSES:`);

    for (const [courseId, course] of Object.entries(courses)) {
        console.log(`\n  Course ID: ${courseId}`);
        console.log(`  Name: ${course.name}`);
        console.log(`  Category: ${course.category}`);
        console.log(`  Period: ${course.from} to ${course.until}`);
        console.log(`  Weeks: ${course.weeks}`);
        console.log(`  Active: ${course.active === 1 ? 'Yes' : 'No'}`);
    }

    // Get invoice line items
    const invoices = data.invoices || [];
    console.log(`\n\nINVOICES (${invoices.length} total):`);

    let totalCourseFees = 0;
    let courseLineItems = [];

    for (const invoice of invoices) {
        console.log(`\n  Invoice: ${invoice.number}`);
        console.log(`  Type: ${invoice.type}`);
        console.log(`  Date: ${invoice.date}`);
        console.log(`  Is Last Document: ${invoice.is_last_document}`);

        if (invoice.items && invoice.items.length > 0) {
            console.log(`\n  LINE ITEMS:`);

            for (const item of invoice.items) {
                const isActive = item.active !== false;
                const isCourse = item.description && (
                    item.description.toLowerCase().includes('morning') ||
                    item.description.toLowerCase().includes('ielts') ||
                    item.description.toLowerCase().includes('general') ||
                    item.description.toLowerCase().includes('course')
                );

                console.log(`\n    - ${item.description}`);
                console.log(`      Amount: €${item.amount}`);
                console.log(`      Service: ${item.service_from} to ${item.service_until}`);
                console.log(`      Tax: ${item.tax}%`);
                console.log(`      Active: ${isActive ? 'Yes' : 'No'}`);

                if (isActive && isCourse) {
                    totalCourseFees += parseFloat(item.amount) || 0;
                    courseLineItems.push({
                        description: item.description,
                        amount: parseFloat(item.amount) || 0,
                        servicePeriod: `${item.service_from} to ${item.service_until}`
                    });
                }
            }
        }
    }

    console.log('\n' + '='.repeat(80));
    console.log('COURSE FEES SUMMARY');
    console.log('='.repeat(80));
    console.log(`\nTotal Course Fees: €${totalCourseFees.toFixed(2)}`);

    if (courseLineItems.length > 0) {
        console.log(`\nCourse Line Items (${courseLineItems.length}):`);
        courseLineItems.forEach((item, idx) => {
            console.log(`  ${idx + 1}. ${item.description}: €${item.amount.toFixed(2)}`);
        });
    }

    return {
        bookingId,
        student,
        courses,
        invoices,
        totalCourseFees,
        courseLineItems
    };
}

// Run if called directly
if (require.main === module) {
    const bookingId = process.argv[2] || '40187'; // Krystof by default

    extractCourseFeesFromInvoice(bookingId)
        .then(() => {
            process.exit(0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { getBookingWithInvoices, extractCourseFeesFromInvoice };
