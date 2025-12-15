/**
 * AI Review Filter - Remove non-course line items
 * Creates AI-filtered copy with only course-related items
 */

const fs = require('fs');

// Read the all-items file
const data = JSON.parse(fs.readFileSync('/home/hub/public_html/fins/scripts/fidelo/hourly/2025/11.nov-morn-all.json', 'utf8'));

// Filter function for course items
function isCourseItem(item) {
    const desc = (item.description || '').toLowerCase();

    // Must have 'morning' AND 'week'
    const hasMorningAndWeek = desc.includes('morning') && desc.includes('week');

    // Exclude non-course items
    const isExcluded = desc.includes('supplement') ||
                      desc.includes('accommodation') ||
                      desc.includes('placement') ||
                      desc.includes('exam') ||
                      desc.includes('insurance') ||
                      desc.includes('health') ||
                      desc.includes('pel') ||
                      desc.includes('registration') ||
                      desc.includes('arrival') ||
                      desc.includes('apartment') ||
                      desc.includes('transfer');

    return hasMorningAndWeek && !isExcluded;
}

// Filter each booking's line items
const filteredResults = [];
let totalCourseItems = 0;
let totalCourseNADC = 0;
let removedItems = [];

for (const booking of data.results) {
    const courseItems = booking.allLineItems.filter(item => {
        const isCourse = isCourseItem(item);
        if (!isCourse) {
            removedItems.push({
                bookingId: booking.bookingId,
                studentName: booking.studentName,
                description: item.description,
                nadc: item.nadc
            });
        }
        return isCourse;
    });

    if (courseItems.length > 0) {
        totalCourseItems += courseItems.length;
        const courseNADC = courseItems.reduce((sum, item) => sum + item.nadc, 0);
        totalCourseNADC += courseNADC;

        filteredResults.push({
            ...booking,
            allLineItems: courseItems,
            totalLineItems: courseItems.length,
            invoiceTotalNADC: courseNADC
        });
    }
}

// Create the filtered output
const output = {
    generated: new Date().toISOString(),
    period: data.period,
    description: 'AI-filtered invoice line items - COURSE ITEMS ONLY (non-course items removed)',
    filtering: {
        criteria: 'Includes: Morning + Week. Excludes: supplement, accommodation, placement, exam, insurance, health, pel, registration, arrival, apartment, transfer',
        totalItemsRemoved: removedItems.length,
        totalNADCRemoved: removedItems.reduce((sum, item) => sum + item.nadc, 0)
    },
    summary: {
        totalBookings: filteredResults.length,
        totalCourseLineItems: totalCourseItems,
        totalCourseNADC: totalCourseNADC
    },
    results: filteredResults,
    removedItems: removedItems
};

// Write the AI-filtered file
fs.writeFileSync(
    '/home/hub/public_html/fins/scripts/fidelo/hourly/2025/11.nov-morn-Ai.json',
    JSON.stringify(output, null, 2)
);

// Print summary
console.log('\n' + '='.repeat(80));
console.log('AI FILTERING SUMMARY');
console.log('='.repeat(80));
console.log(`\nOriginal file: ${data.summary.totalLineItems} line items`);
console.log(`Course items kept: ${totalCourseItems} line items`);
console.log(`Non-course items removed: ${removedItems.length} line items\n`);

console.log(`Course NADC: €${totalCourseNADC.toFixed(2)}`);
console.log(`Removed NADC: €${output.filtering.totalNADCRemoved.toFixed(2)}`);
console.log(`Original Total: €${data.summary.totalInvoiceNADC.toFixed(2)}\n`);

console.log(`Verification: €${(totalCourseNADC + output.filtering.totalNADCRemoved).toFixed(2)} = €${data.summary.totalInvoiceNADC.toFixed(2)}`);

console.log('\n' + '='.repeat(80));
console.log('REMOVED ITEMS BREAKDOWN');
console.log('='.repeat(80) + '\n');

// Group removed items by type
const itemTypes = {};
for (const item of removedItems) {
    const desc = item.description;
    let type = 'Other';

    if (desc.toLowerCase().includes('health') || desc.toLowerCase().includes('pel') || desc.toLowerCase().includes('insurance')) {
        type = 'Health/PEL/Insurance';
    } else if (desc.toLowerCase().includes('exam')) {
        type = 'External Exam Fees';
    } else if (desc.toLowerCase().includes('registration')) {
        type = 'Registration Fees';
    } else if (desc.toLowerCase().includes('accommodation') || desc.toLowerCase().includes('apartment')) {
        type = 'Accommodation';
    } else if (desc.toLowerCase().includes('placement')) {
        type = 'Placement Fees';
    } else if (desc.toLowerCase().includes('arrival') || desc.toLowerCase().includes('transfer')) {
        type = 'Transfer/Arrival';
    }

    if (!itemTypes[type]) {
        itemTypes[type] = { count: 0, total: 0, items: [] };
    }
    itemTypes[type].count++;
    itemTypes[type].total += item.nadc;
    itemTypes[type].items.push(item);
}

for (const [type, data] of Object.entries(itemTypes)) {
    console.log(`${type}: ${data.count} items, €${data.total.toFixed(2)}`);
}

console.log(`\n✓ File created: /home/hub/public_html/fins/scripts/fidelo/hourly/2025/11.nov-morn-Ai.json\n`);
