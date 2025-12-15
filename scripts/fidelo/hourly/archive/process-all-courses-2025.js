/**
 * Process All Courses from Master Data - 2025
 *
 * Extracts and classifies:
 * - Morning courses (including Morning Plus, 50% of GE30/Intensive)
 * - Afternoon courses (including Afternoon Plus, 50% of GE30/Intensive)
 * - Accommodation revenue
 *
 * Usage: node process-all-courses-2025.js
 */

const fs = require('fs');
const masterData = require('./2025/master-invoices-2025.json');

// Classification rules
function classifyCourse(courseName, courseCategory) {
    const name = (courseName || '').toLowerCase();
    const category = (courseCategory || '').toLowerCase();

    // Skip closed groups, junior groups, and private lessons
    if (category.includes('closed') || category.includes('junior') || category.includes('private')) {
        return 'excluded';
    }

    // GE30/GEM30/Intensive - split 50/50
    if (name.includes('ge30') || name.includes('gem30') || name.includes('intensive')) {
        return 'both'; // Split between morning and afternoon
    }

    // Morning courses
    if (category.includes('morning') || name.includes('morning')) {
        return 'morning';
    }

    // Afternoon courses
    if (category.includes('afternoon') || name.includes('afternoon')) {
        return 'afternoon';
    }

    // Evening courses (treat as afternoon)
    if (category.includes('evening') || name.includes('evening')) {
        return 'afternoon';
    }

    return 'unknown';
}

function extractCourseLineItems(invoice) {
    const courseItems = [];

    invoice.lineItems.forEach(item => {
        const desc = item.description.toLowerCase();

        // Identify course items (have "week" or "hour" and course name)
        const hasWeek = desc.includes('week');
        const hasHour = desc.includes('hour');

        // Exclude non-course items
        const isExcluded = desc.includes('supplement') ||
                          desc.includes('accommodation') ||
                          desc.includes('apartment') ||
                          desc.includes('homestay') ||
                          desc.includes('residence') ||
                          desc.includes('placement') ||
                          desc.includes('exam') ||
                          desc.includes('insurance') ||
                          desc.includes('health') ||
                          desc.includes('pel') ||
                          desc.includes('registration') ||
                          desc.includes('arrival') ||
                          desc.includes('transfer') ||
                          desc.includes('book') ||
                          desc.includes('material');

        const isCourse = (hasWeek || hasHour) && !isExcluded;

        if (isCourse) {
            // Extract weeks from description
            const weeksMatch = item.description.match(/(\d+)\s+week/i);
            const weeks = weeksMatch ? parseInt(weeksMatch[1]) : 0;

            // Determine course type
            let courseType = 'unknown';
            if (desc.includes('morning')) {
                courseType = 'morning';
            } else if (desc.includes('afternoon') || desc.includes('evening')) {
                courseType = 'afternoon';
            } else if (desc.includes('ge30') || desc.includes('gem30') || desc.includes('intensive')) {
                courseType = 'both';
            }

            courseItems.push({
                description: item.description,
                weeks: weeks,
                amount: item.amount,
                discount: item.discount,
                commission: item.commission,
                nadc: item.nadc,
                courseType: courseType
            });
        }
    });

    return courseItems;
}

function extractAccommodationLineItems(invoice) {
    const accommItems = [];

    invoice.lineItems.forEach(item => {
        const desc = item.description.toLowerCase();

        const isAccomm = desc.includes('apartment') ||
                        desc.includes('accommodation') ||
                        desc.includes('homestay') ||
                        desc.includes('residence');

        if (isAccomm) {
            accommItems.push({
                description: item.description,
                amount: item.amount,
                nadc: item.nadc // No discounts or commissions for accommodation
            });
        }
    });

    return accommItems;
}

function processInvoices() {
    const results = {
        morning: [],
        afternoon: [],
        accommodation: []
    };

    masterData.invoices.forEach(invoice => {
        // Determine if student has agent
        const hasAgent = invoice.agent.hasAgent;
        const studentType = hasAgent ? 'agent' : 'direct';

        // Extract course line items
        const courseItems = extractCourseLineItems(invoice);

        if (courseItems.length > 0) {
            // Split courses by type
            const morningItems = courseItems.filter(item => item.courseType === 'morning');
            const afternoonItems = courseItems.filter(item => item.courseType === 'afternoon');
            const bothItems = courseItems.filter(item => item.courseType === 'both');

            // Process morning courses
            if (morningItems.length > 0 || bothItems.length > 0) {
                const totalWeeks = morningItems.reduce((sum, item) => sum + item.weeks, 0) +
                                  bothItems.reduce((sum, item) => sum + (item.weeks / 2), 0); // Split GE30 50/50
                const totalAmount = morningItems.reduce((sum, item) => sum + item.amount, 0) +
                                   bothItems.reduce((sum, item) => sum + (item.amount / 2), 0);
                const totalDiscount = morningItems.reduce((sum, item) => sum + item.discount, 0) +
                                     bothItems.reduce((sum, item) => sum + (item.discount / 2), 0);
                const totalCommission = morningItems.reduce((sum, item) => sum + item.commission, 0) +
                                       bothItems.reduce((sum, item) => sum + (item.commission / 2), 0);
                const totalNADC = morningItems.reduce((sum, item) => sum + item.nadc, 0) +
                                 bothItems.reduce((sum, item) => sum + (item.nadc / 2), 0);

                const hoursPerWeek = 15;
                const totalHours = totalWeeks * hoursPerWeek;
                const ratePerHour = totalHours > 0 ? (totalNADC / totalHours) : 0;

                results.morning.push({
                    bookingId: invoice.bookingId,
                    studentId: invoice.student.id,
                    studentName: `${invoice.student.firstName} ${invoice.student.surname}`,
                    invoice: invoice.invoiceNumber,
                    invoiceDate: invoice.invoiceDate,
                    studentType: studentType,
                    weeks: totalWeeks,
                    totalHours: totalHours,
                    amountOriginal: totalAmount,
                    discount: totalDiscount,
                    commission: totalCommission,
                    courseFeeNADC: totalNADC,
                    ratePerHour: ratePerHour,
                    courseItems: [...morningItems, ...bothItems.map(item => ({
                        ...item,
                        weeks: item.weeks / 2,
                        amount: item.amount / 2,
                        discount: item.discount / 2,
                        commission: item.commission / 2,
                        nadc: item.nadc / 2,
                        note: 'Split 50/50 from GE30/Intensive'
                    }))]
                });
            }

            // Process afternoon courses
            if (afternoonItems.length > 0 || bothItems.length > 0) {
                const totalWeeks = afternoonItems.reduce((sum, item) => sum + item.weeks, 0) +
                                  bothItems.reduce((sum, item) => sum + (item.weeks / 2), 0);
                const totalAmount = afternoonItems.reduce((sum, item) => sum + item.amount, 0) +
                                   bothItems.reduce((sum, item) => sum + (item.amount / 2), 0);
                const totalDiscount = afternoonItems.reduce((sum, item) => sum + item.discount, 0) +
                                     bothItems.reduce((sum, item) => sum + (item.discount / 2), 0);
                const totalCommission = afternoonItems.reduce((sum, item) => sum + item.commission, 0) +
                                       bothItems.reduce((sum, item) => sum + (item.commission / 2), 0);
                const totalNADC = afternoonItems.reduce((sum, item) => sum + item.nadc, 0) +
                                 bothItems.reduce((sum, item) => sum + (item.nadc / 2), 0);

                const hoursPerWeek = 15;
                const totalHours = totalWeeks * hoursPerWeek;
                const ratePerHour = totalHours > 0 ? (totalNADC / totalHours) : 0;

                results.afternoon.push({
                    bookingId: invoice.bookingId,
                    studentId: invoice.student.id,
                    studentName: `${invoice.student.firstName} ${invoice.student.surname}`,
                    invoice: invoice.invoiceNumber,
                    invoiceDate: invoice.invoiceDate,
                    studentType: studentType,
                    weeks: totalWeeks,
                    totalHours: totalHours,
                    amountOriginal: totalAmount,
                    discount: totalDiscount,
                    commission: totalCommission,
                    courseFeeNADC: totalNADC,
                    ratePerHour: ratePerHour,
                    courseItems: [...afternoonItems, ...bothItems.map(item => ({
                        ...item,
                        weeks: item.weeks / 2,
                        amount: item.amount / 2,
                        discount: item.discount / 2,
                        commission: item.commission / 2,
                        nadc: item.nadc / 2,
                        note: 'Split 50/50 from GE30/Intensive'
                    }))]
                });
            }
        }

        // Extract accommodation
        const accommItems = extractAccommodationLineItems(invoice);
        if (accommItems.length > 0) {
            results.accommodation.push({
                bookingId: invoice.bookingId,
                studentId: invoice.student.id,
                studentName: `${invoice.student.firstName} ${invoice.student.surname}`,
                invoice: invoice.invoiceNumber,
                invoiceDate: invoice.invoiceDate,
                studentType: studentType,
                items: accommItems,
                totalNADC: accommItems.reduce((sum, item) => sum + item.nadc, 0)
            });
        }
    });

    return results;
}

// Main execution
console.log('='.repeat(80));
console.log('PROCESSING ALL COURSES - 2025');
console.log('='.repeat(80));
console.log('');

const results = processInvoices();

console.log(`Morning courses: ${results.morning.length} bookings`);
console.log(`Afternoon courses: ${results.afternoon.length} bookings`);
console.log(`Accommodation: ${results.accommodation.length} bookings`);
console.log('');

const morningRevenue = results.morning.reduce((sum, r) => sum + r.courseFeeNADC, 0);
const afternoonRevenue = results.afternoon.reduce((sum, r) => sum + r.courseFeeNADC, 0);
const accommRevenue = results.accommodation.reduce((sum, r) => sum + r.totalNADC, 0);

console.log(`Morning revenue: €${morningRevenue.toFixed(2)}`);
console.log(`Afternoon revenue: €${afternoonRevenue.toFixed(2)}`);
console.log(`Accommodation revenue: €${accommRevenue.toFixed(2)}`);
console.log(`Total: €${(morningRevenue + afternoonRevenue + accommRevenue).toFixed(2)}`);
console.log('');

// Save to file
const outputPath = './2025/all-courses-2025.json';
fs.writeFileSync(outputPath, JSON.stringify({
    generated: new Date().toISOString(),
    period: '2025-01-01 to 2025-11-30',
    description: 'All courses and accommodation from 2025 master data',
    summary: {
        morning: {
            count: results.morning.length,
            revenue: morningRevenue
        },
        afternoon: {
            count: results.afternoon.length,
            revenue: afternoonRevenue
        },
        accommodation: {
            count: results.accommodation.length,
            revenue: accommRevenue
        }
    },
    data: results
}, null, 2));

console.log(`📄 Saved to: ${outputPath}`);
