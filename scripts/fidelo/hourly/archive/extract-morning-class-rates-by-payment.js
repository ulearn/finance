/**
 * Extract Morning Class Course Rates from Fidelo - By Payment Date
 *
 * This script extracts course rate data for Morning Classes based on PAYMENT DATE.
 * It uses the Payments API to find all payments in a given month, then traces back
 * to the booking to get course details and calculate hourly rates.
 *
 * Key concepts:
 * - NADC = Net After Discounts & Commissions (amount_net field)
 * - Morning Classes = 15 hours per week (standard)
 * - Rate per hour = Course Fee NADC / Total Hours
 * - D-prefix = Invoice (actual), P-prefix = Proforma (quotation)
 *
 * Usage:
 *   node extract-morning-class-rates-by-payment.js [YYYY-MM]
 *
 * Example:
 *   node extract-morning-class-rates-by-payment.js 2025-11
 */

const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs').promises;
const path = require('path');

// Fidelo API configuration
const FIDELO_API_BASE = 'https://ulearn.fidelo.com/api/1.1/ts';
const FIDELO_GUI2_PAYMENTS = 'https://ulearn.fidelo.com/api/1.0/gui2/4e289ca973cc2b424d58ec10197bd160/search';
const API_TOKEN = '699c957fb710153384dc0aea54e5dbec';

class MorningClassRateExtractor {
    constructor() {
        this.results = [];
        this.errors = [];
        this.processedBookings = new Set();
    }

    /**
     * Get all payments for a given month using GUI2 Payments API
     */
    async getPaymentsForMonth(yearMonth) {
        try {
            console.log(`Fetching payments for ${yearMonth}...\n`);

            // Parse year-month (e.g., "2025-11")
            const [year, month] = yearMonth.split('-');
            const startDate = `01/${month}/${year}`;
            const lastDay = new Date(year, month, 0).getDate();
            const endDate = `${lastDay}/${month}/${year}`;

            console.log(`Date range: ${startDate} to ${endDate}\n`);

            // Build POST data for Payments API
            const formData = new URLSearchParams({
                _token: API_TOKEN,
                'filter[search_time_from_1]': startDate,
                'filter[search_time_until_1]': endDate,
                'filter[timefilter_basedon]': 'kip.payment_date',
                'limit': '1000',
                'offset': '0'
            });

            const response = await axios.post(FIDELO_GUI2_PAYMENTS, formData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 60000
            });

            if (!response.data || !response.data.data || !response.data.data.body) {
                console.log('No payment data returned\n');
                return [];
            }

            const payments = response.data.data.body;
            console.log(`Found ${payments.length} payments in ${yearMonth}\n`);

            return payments;

        } catch (error) {
            console.error('Error fetching payments:', error.message);
            throw error;
        }
    }

    /**
     * Get booking details with invoices using curl (more reliable for large responses)
     */
    async getBookingDetails(bookingId) {
        try {
            const curlCommand = `curl -s "https://ulearn.fidelo.com/api/1.1/ts/booking/${bookingId}?include_inactive_services=1&include_credit_notes=1" \
              -H "Authorization: Bearer ${API_TOKEN}" \
              -H "Accept: application/json"`;

            const { stdout } = await execPromise(curlCommand, { maxBuffer: 1024 * 1024 * 50 });
            const data = JSON.parse(stdout);

            return data.data;

        } catch (error) {
            console.error(`Error fetching booking ${bookingId}:`, error.message);
            return null;
        }
    }

    /**
     * Check if a booking has Morning Classes
     */
    hasMorningClass(bookingData) {
        const courses = bookingData.booking?.courses || {};

        for (const course of Object.values(courses)) {
            if (course.category && course.category.toLowerCase().includes('morning')) {
                return true;
            }
        }

        return false;
    }

    /**
     * Extract course fee from invoice line items
     */
    extractCourseFee(bookingData) {
        const invoices = bookingData.invoices || [];

        // Prefer D-invoices (actual invoices) over P-invoices (proformas)
        const dInvoices = invoices.filter(inv => inv.number && inv.number.startsWith('D'));
        const lastDocument = invoices.find(inv => inv.is_last_document === true);

        // Use D-invoice if available, otherwise use last document
        const targetInvoice = dInvoices.length > 0 ? dInvoices[0] : lastDocument;

        if (!targetInvoice || !targetInvoice.items) {
            return null;
        }

        // Find the main Morning course line item
        for (const item of targetInvoice.items) {
            if (!item.active) continue;

            const desc = (item.description || '').toLowerCase();

            // Check if this is a Morning course item (not supplement, not accommodation)
            const isMorningCourse = (
                (desc.includes('morning') && desc.includes('week')) ||
                (desc.includes('week') && (desc.includes('ielts') || desc.includes('general') || desc.includes('academic')))
            ) && !desc.includes('supplement') &&
               !desc.includes('accommodation') &&
               !desc.includes('placement');

            if (isMorningCourse) {
                return {
                    description: item.description,
                    amount: item.amount,
                    discount: item.amount_discount || 0,
                    commission: item.amount_commission || 0,
                    nadc: item.amount_net,
                    invoiceNumber: targetInvoice.number,
                    invoiceType: targetInvoice.number.startsWith('D') ? 'Invoice' : 'Proforma'
                };
            }
        }

        return null;
    }

    /**
     * Extract Morning Class course info
     */
    getMorningCourseInfo(bookingData) {
        const courses = bookingData.booking?.courses || {};

        for (const [courseId, course] of Object.entries(courses)) {
            if (course.category && course.category.toLowerCase().includes('morning')) {
                return {
                    courseId: courseId,
                    name: course.name,
                    category: course.category,
                    from: course.from,
                    until: course.until,
                    weeks: parseInt(course.weeks) || 0,
                    active: course.active === 1
                };
            }
        }

        return null;
    }

    /**
     * Process a single payment
     */
    async processPayment(payment, paymentHeaders) {
        // Extract booking ID from payment data
        // The payment data structure depends on the headers
        // Typically there's a booking_id or similar field

        // Map headers to get column indices
        const headerMap = {};
        paymentHeaders.forEach((header, index) => {
            headerMap[header.db_column || header.title] = index;
        });

        // Get booking ID from payment
        const bookingIdIndex = headerMap['booking_id'] || headerMap['id'];
        if (bookingIdIndex === undefined || !payment[bookingIdIndex]) {
            return null;
        }

        const bookingId = payment[bookingIdIndex];

        // Skip if already processed
        if (this.processedBookings.has(bookingId)) {
            return null;
        }

        this.processedBookings.add(bookingId);

        // Get booking details
        const bookingData = await this.getBookingDetails(bookingId);

        if (!bookingData) {
            this.errors.push({ bookingId, error: 'Failed to fetch booking data' });
            return null;
        }

        // Check if it's a Morning Class
        if (!this.hasMorningClass(bookingData)) {
            return null; // Not a Morning Class, skip
        }

        // Extract course info
        const courseInfo = this.getMorningCourseInfo(bookingData);
        if (!courseInfo) {
            this.errors.push({ bookingId, error: 'No Morning Class course found' });
            return null;
        }

        // Extract course fee
        const courseFee = this.extractCourseFee(bookingData);
        if (!courseFee) {
            this.errors.push({ bookingId, error: 'No course fee found in invoice' });
            return null;
        }

        // Calculate rate
        const hoursPerWeek = 15; // Morning Classes standard
        const totalHours = courseInfo.weeks * hoursPerWeek;
        const ratePerHour = totalHours > 0 ? (courseFee.nadc / totalHours) : 0;

        // Student info
        const student = bookingData.student || {};

        return {
            bookingId: bookingId,
            studentId: student.number,
            studentName: `${student.firstname} ${student.surname}`,
            studentEmail: student.email,
            courseName: courseInfo.name,
            courseCategory: courseInfo.category,
            coursePeriod: `${courseInfo.from} to ${courseInfo.until}`,
            weeks: courseInfo.weeks,
            hoursPerWeek: hoursPerWeek,
            totalHours: totalHours,
            courseDescription: courseFee.description,
            amountOriginal: courseFee.amount,
            discount: courseFee.discount,
            commission: courseFee.commission,
            courseFeeNADC: courseFee.nadc,
            ratePerHour: ratePerHour,
            invoiceNumber: courseFee.invoiceNumber,
            invoiceType: courseFee.invoiceType
        };
    }

    /**
     * Extract rates for all payments in a month
     */
    async extractRatesForMonth(yearMonth) {
        try {
            console.log('='.repeat(80));
            console.log('MORNING CLASS RATE EXTRACTION - BY PAYMENT DATE');
            console.log('='.repeat(80));
            console.log(`Period: ${yearMonth}\n`);

            // Get all payments for the month
            const paymentsData = await this.getPaymentsForMonth(yearMonth);

            if (paymentsData.length === 0) {
                console.log('No payments found for this period\n');
                return { results: [], stats: null };
            }

            console.log('Processing payments...\n');

            let processed = 0;
            let morningClassCount = 0;

            // Note: The payments API returns data with headers
            // We'll process the first payment to understand the structure
            // For now, let's assume we need to parse the payment data differently

            console.log('⚠️  Payment API integration needs refinement');
            console.log('   The Payments API returns a different structure than Bookings API');
            console.log('   We need to map payment records to booking IDs\n');

            // TODO: Complete the payment-to-booking mapping
            // This requires understanding the exact payment data structure

            return {
                results: this.results,
                stats: this.calculateStats(),
                errors: this.errors
            };

        } catch (error) {
            console.error('Extraction failed:', error.message);
            throw error;
        }
    }

    /**
     * Calculate summary statistics
     */
    calculateStats() {
        if (this.results.length === 0) {
            return null;
        }

        const totalRevenue = this.results.reduce((sum, r) => sum + r.courseFeeNADC, 0);
        const totalHours = this.results.reduce((sum, r) => sum + r.totalHours, 0);
        const avgRate = this.results.reduce((sum, r) => sum + r.ratePerHour, 0) / this.results.length;

        return {
            totalBookings: this.results.length,
            totalRevenue: totalRevenue,
            totalHours: totalHours,
            averageRatePerHour: avgRate
        };
    }

    /**
     * Export results to JSON
     */
    async exportToJSON(yearMonth) {
        const outputDir = path.join(__dirname, '../../.claude/tmp');
        const filename = `morning-class-rates-payments_${yearMonth}.json`;
        const outputPath = path.join(outputDir, filename);

        const data = {
            generated: new Date().toISOString(),
            period: yearMonth,
            method: 'payment_date',
            summary: this.calculateStats(),
            results: this.results,
            errors: this.errors
        };

        await fs.writeFile(outputPath, JSON.stringify(data, null, 2));

        return outputPath;
    }
}

// CLI usage
if (require.main === module) {
    const yearMonth = process.argv[2] || '2025-11';

    const extractor = new MorningClassRateExtractor();

    extractor.extractRatesForMonth(yearMonth)
        .then(async ({ results, stats }) => {
            console.log('\n' + '='.repeat(80));
            console.log('EXTRACTION COMPLETE');
            console.log('='.repeat(80));

            if (stats) {
                console.log(`\nTotal Morning Class Bookings: ${stats.totalBookings}`);
                console.log(`Total Revenue (NADC): €${stats.totalRevenue.toFixed(2)}`);
                console.log(`Total Hours: ${stats.totalHours}`);
                console.log(`Average Rate per Hour: €${stats.averageRatePerHour.toFixed(2)}`);
            }

            const outputPath = await extractor.exportToJSON(yearMonth);
            console.log(`\n📄 Data exported to: ${outputPath}`);

            process.exit(0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = MorningClassRateExtractor;
