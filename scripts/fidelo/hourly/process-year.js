/**
 * Process All Courses for Any Year
 *
 * Usage: node process-year.js [year]
 * Example: node process-year.js 2024
 */

const fs = require('fs');
const path = require('path');

const year = process.argv[2] || '2025';
// Try all-YEAR.json first (from extract-all-years.sh), then YEAR-master.json (from manual merge)
let masterFilePath = path.join(__dirname, year, `all-${year}.json`);
if (!fs.existsSync(masterFilePath)) {
    masterFilePath = path.join(__dirname, year, `${year}-master.json`);
}
const outputFilePath = path.join(__dirname, year, `all-courses-${year}.json`);

console.log(`Processing ${year}...`);
console.log(`Reading from: ${masterFilePath}`);

const masterData = JSON.parse(fs.readFileSync(masterFilePath, 'utf8'));

function extractCourseLineItems(invoice) {
    const courseItems = [];

    // Get course categories from invoice.courses for hours lookup
    const courseCats = {};
    if (invoice.courses && invoice.courses.length > 0) {
        invoice.courses.forEach(course => {
            courseCats[course.category] = course;
        });
    }

    invoice.lineItems.forEach(item => {
        const desc = item.description.toLowerCase();

        const hasWeek = desc.includes('week');
        const hasHour = desc.includes('hour');

        const isExcluded = desc.includes('supplement') ||
                          desc.includes('accommodation') ||
                          desc.includes('apartment') ||
                          desc.includes('host family') ||
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
                          desc.includes('material') ||
                          desc.includes('evening') ||
                          desc.includes('after work');

        const isCourse = (hasWeek || hasHour) && !isExcluded;

        if (isCourse) {
            const weeksMatch = item.description.match(/(\d+)\s+week/i);
            const weeks = weeksMatch ? parseInt(weeksMatch[1]) : 0;

            let courseType = 'unknown';
            let hoursPerWeek = 15; // default
            let matchedCategory = null;

            // First try to match using invoice.courses category (most reliable)
            for (const category in courseCats) {
                if (category === 'Morning Classes Plus') {
                    hoursPerWeek = 20;
                    courseType = 'morning';
                    matchedCategory = category;
                    break;
                } else if (category === 'Morning Classes') {
                    hoursPerWeek = 15;
                    courseType = 'morning';
                    matchedCategory = category;
                    break;
                } else if (category === 'Afternoon Classes Plus') {
                    hoursPerWeek = 20;
                    courseType = 'afternoon';
                    matchedCategory = category;
                    break;
                } else if (category === 'Afternoon Classes') {
                    hoursPerWeek = 15;
                    courseType = 'afternoon';
                    matchedCategory = category;
                    break;
                } else if (category === 'Intensive Classes') {
                    hoursPerWeek = 30;
                    courseType = 'both';
                    matchedCategory = category;
                    break;
                }
            }

            // Fallback to description parsing if no category match
            if (!matchedCategory) {
                // Check for 30 hours FIRST (before 20, to avoid matching dates like "20/02/2017")
                if (desc.includes('ge30') || desc.includes('gem30') || desc.includes('intensive') ||
                    (desc.includes('morn') && desc.includes('aft')) || desc.includes('30 hour')) {
                    hoursPerWeek = 30;
                    courseType = 'both';
                } else if (desc.includes('plus') || desc.includes('gem20') || desc.includes('20 hour')) {
                    hoursPerWeek = 20;
                    // Determine if morning or afternoon
                    if (desc.includes('afternoon') && !desc.includes('morning')) {
                        courseType = 'afternoon';
                    } else {
                        courseType = 'morning';
                    }
                } else if (desc.includes('15 hour') || desc.includes('gem15') || desc.includes('ge15')) {
                    hoursPerWeek = 15;
                    // Determine if morning or afternoon
                    if (desc.includes('afternoon') && !desc.includes('morning')) {
                        courseType = 'afternoon';
                    } else {
                        courseType = 'morning';
                    }
                } else {
                    // Determine course type from description
                    if (desc.includes('afternoon') && !desc.includes('morning') && !desc.includes('morn')) {
                        courseType = 'afternoon';
                    } else {
                        courseType = 'morning';
                    }
                }
            }

            courseItems.push({
                description: item.description,
                weeks: weeks,
                hoursPerWeek: hoursPerWeek,
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
                nadc: item.nadc
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
        const hasAgent = invoice.agent.hasAgent;
        const studentType = hasAgent ? 'agent' : 'direct';

        const courseItems = extractCourseLineItems(invoice);

        if (courseItems.length > 0) {
            const morningItems = courseItems.filter(item => item.courseType === 'morning');
            const afternoonItems = courseItems.filter(item => item.courseType === 'afternoon');
            const bothItems = courseItems.filter(item => item.courseType === 'both');

            if (morningItems.length > 0 || bothItems.length > 0) {
                const totalWeeks = morningItems.reduce((sum, item) => sum + item.weeks, 0) +
                                  bothItems.reduce((sum, item) => sum + (item.weeks / 2), 0);
                const totalAmount = morningItems.reduce((sum, item) => sum + item.amount, 0) +
                                   bothItems.reduce((sum, item) => sum + (item.amount / 2), 0);
                const totalDiscount = morningItems.reduce((sum, item) => sum + item.discount, 0) +
                                     bothItems.reduce((sum, item) => sum + (item.discount / 2), 0);
                const totalCommission = morningItems.reduce((sum, item) => sum + item.commission, 0) +
                                       bothItems.reduce((sum, item) => sum + (item.commission / 2), 0);
                const totalNADC = morningItems.reduce((sum, item) => sum + item.nadc, 0) +
                                 bothItems.reduce((sum, item) => sum + (item.nadc / 2), 0);

                // Calculate total hours using each course's hoursPerWeek
                const totalHours = morningItems.reduce((sum, item) => sum + (item.weeks * item.hoursPerWeek), 0) +
                                  bothItems.reduce((sum, item) => sum + (item.weeks * item.hoursPerWeek / 2), 0);
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

                // Calculate total hours using each course's hoursPerWeek
                const totalHours = afternoonItems.reduce((sum, item) => sum + (item.weeks * item.hoursPerWeek), 0) +
                                  bothItems.reduce((sum, item) => sum + (item.weeks * item.hoursPerWeek / 2), 0);
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

console.log('='.repeat(80));
console.log(`PROCESSING ALL COURSES - ${year}`);
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

fs.writeFileSync(outputFilePath, JSON.stringify({
    generated: new Date().toISOString(),
    year: year,
    description: `All courses and accommodation from ${year} master data`,
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

console.log(`📄 Saved to: ${outputFilePath}`);
