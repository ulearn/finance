/**
 * Extract Morning Class Course Rates from Fidelo
 *
 * This script extracts course rate data for Morning Classes from the Fidelo Bookings API.
 * Morning Classes are identified by "Morning" in the course_name_en field.
 *
 * Key calculations:
 * - Morning Classes = 15 hours per week (standard)
 * - Total hours = course_weeks × 15
 * - Rate per hour = amount_total_original ÷ course_units
 * - Rate per week = amount_total_original ÷ course_weeks
 *
 * Usage:
 *   node morning-class-rates.js [start-date] [end-date]
 *
 * Example:
 *   node morning-class-rates.js 2025-11-01 2025-11-30
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;

// Fidelo API configuration
const FIDELO_API_BASE = 'https://ulearn.fidelo.com/api/1.1/ts';
const FIDELO_API_TOKEN = '699c957fb710153384dc0aea54e5dbec';

class MorningClassRatesExtractor {
    constructor() {
        this.apiBase = FIDELO_API_BASE;
        this.apiToken = FIDELO_API_TOKEN;
    }

    /**
     * Fetch all bookings from Fidelo API
     */
    async getAllBookings() {
        try {
            console.log('Fetching all bookings from Fidelo API...');

            const response = await axios.get(`${this.apiBase}/bookings`, {
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Accept': 'application/json'
                },
                decompress: true,
                timeout: 30000
            });

            if (response.data && response.data.entries) {
                console.log(`Fetched ${response.data.hits} total bookings\n`);
                return response.data.entries;
            }

            return {};

        } catch (error) {
            console.error('Error fetching bookings:', error.message);
            throw error;
        }
    }

    /**
     * Filter bookings by date range
     */
    filterByDateRange(bookings, startDate, endDate) {
        const start = new Date(startDate + 'T00:00:00.000Z');
        const end = new Date(endDate + 'T23:59:59.999Z');

        const filtered = {};
        let count = 0;

        for (const [key, booking] of Object.entries(bookings)) {
            // Check if course starts within the date range
            if (booking.course_from) {
                const courseStart = new Date(booking.course_from);

                if (courseStart >= start && courseStart <= end) {
                    filtered[key] = booking;
                    count++;
                }
            }
        }

        console.log(`Filtered to ${count} bookings starting between ${startDate} and ${endDate}\n`);
        return filtered;
    }

    /**
     * Check if a booking contains Morning Classes
     */
    isMorningClass(booking) {
        if (!booking.course_name_en) return false;

        const courseName = String(booking.course_name_en).toLowerCase();
        return courseName.includes('morning');
    }

    /**
     * Extract rate information from a booking
     */
    extractRateInfo(booking) {
        const courseName = booking.course_name_en || '';
        const weeks = booking.course_weeks || 0;
        const units = parseFloat(booking.course_units) || 0;
        const amount = parseFloat(booking.amount_total_original) || 0;
        const courseFrom = booking.course_from || '';
        const courseUntil = booking.course_until || '';

        // Calculate rates
        const ratePerHour = units > 0 ? (amount / units) : 0;
        const ratePerWeek = weeks > 0 ? (amount / weeks) : 0;
        const hoursPerWeek = (weeks > 0 && units > 0) ? (units / weeks) : 0;

        return {
            // Booking info
            bookingId: booking.id,
            studentName: booking.customer_name || '',
            studentEmail: booking.email || '',
            bookingNumber: booking.booking_number || '',

            // Course info
            courseName: courseName,
            courseFrom: courseFrom,
            courseUntil: courseUntil,
            weeks: weeks,
            totalUnits: units,

            // Financial info
            amountTotal: amount,
            amountPayed: parseFloat(booking.amount_payed_original) || 0,
            amountOpen: parseFloat(booking.amount_open) || 0,

            // Calculated rates
            hoursPerWeek: hoursPerWeek,
            ratePerHour: ratePerHour,
            ratePerWeek: ratePerWeek,

            // Status
            status: booking.status || '',
            confirmed: booking.confirmed || false
        };
    }

    /**
     * Extract Morning Class rates for a date range
     */
    async extractRates(startDate, endDate) {
        try {
            console.log('='.repeat(80));
            console.log('MORNING CLASS RATE EXTRACTION');
            console.log('='.repeat(80));
            console.log(`Date Range: ${startDate} to ${endDate}\n`);

            // Step 1: Fetch all bookings
            const allBookings = await this.getAllBookings();

            // Step 2: Filter by date range
            const dateRangeBookings = this.filterByDateRange(allBookings, startDate, endDate);

            // Step 3: Filter for Morning Classes
            const morningClassBookings = [];

            for (const [key, booking] of Object.entries(dateRangeBookings)) {
                if (this.isMorningClass(booking)) {
                    const rateInfo = this.extractRateInfo(booking);
                    morningClassBookings.push(rateInfo);
                }
            }

            console.log(`Found ${morningClassBookings.length} Morning Class bookings\n`);

            // Step 4: Calculate statistics
            const stats = this.calculateStatistics(morningClassBookings);

            // Step 5: Display results
            this.displayResults(morningClassBookings, stats);

            // Step 6: Export to JSON
            const exportPath = await this.exportToJSON(startDate, endDate, morningClassBookings, stats);

            console.log('\n' + '='.repeat(80));
            console.log('✅ Extraction completed successfully!');
            console.log(`📄 Data exported to: ${exportPath}`);
            console.log('='.repeat(80));

            return {
                bookings: morningClassBookings,
                stats: stats,
                exportPath: exportPath
            };

        } catch (error) {
            console.error('\n❌ Extraction failed:', error.message);
            throw error;
        }
    }

    /**
     * Calculate summary statistics
     */
    calculateStatistics(bookings) {
        if (bookings.length === 0) {
            return {
                totalBookings: 0,
                totalRevenue: 0,
                totalHours: 0,
                totalWeeks: 0,
                averageRatePerHour: 0,
                averageRatePerWeek: 0,
                averageHoursPerWeek: 0
            };
        }

        const totalRevenue = bookings.reduce((sum, b) => sum + b.amountTotal, 0);
        const totalHours = bookings.reduce((sum, b) => sum + b.totalUnits, 0);
        const totalWeeks = bookings.reduce((sum, b) => sum + b.weeks, 0);

        // Only include bookings with valid rate data for averages
        const validBookings = bookings.filter(b => b.ratePerHour > 0);
        const avgRatePerHour = validBookings.length > 0
            ? validBookings.reduce((sum, b) => sum + b.ratePerHour, 0) / validBookings.length
            : 0;

        const avgRatePerWeek = validBookings.length > 0
            ? validBookings.reduce((sum, b) => sum + b.ratePerWeek, 0) / validBookings.length
            : 0;

        const avgHoursPerWeek = validBookings.length > 0
            ? validBookings.reduce((sum, b) => sum + b.hoursPerWeek, 0) / validBookings.length
            : 0;

        return {
            totalBookings: bookings.length,
            totalRevenue: totalRevenue,
            totalHours: totalHours,
            totalWeeks: totalWeeks,
            averageRatePerHour: avgRatePerHour,
            averageRatePerWeek: avgRatePerWeek,
            averageHoursPerWeek: avgHoursPerWeek
        };
    }

    /**
     * Display results to console
     */
    displayResults(bookings, stats) {
        console.log('='.repeat(80));
        console.log('SUMMARY STATISTICS');
        console.log('='.repeat(80));
        console.log(`Total Morning Class Bookings: ${stats.totalBookings}`);
        console.log(`Total Revenue: €${stats.totalRevenue.toFixed(2)}`);
        console.log(`Total Course Hours: ${stats.totalHours.toFixed(0)}`);
        console.log(`Total Course Weeks: ${stats.totalWeeks}`);
        console.log(`\nAverage Rate per Hour: €${stats.averageRatePerHour.toFixed(2)}`);
        console.log(`Average Rate per Week: €${stats.averageRatePerWeek.toFixed(2)}`);
        console.log(`Average Hours per Week: ${stats.averageHoursPerWeek.toFixed(1)}`);

        // Show top 10 by revenue
        console.log('\n' + '='.repeat(80));
        console.log('TOP 10 BOOKINGS BY REVENUE');
        console.log('='.repeat(80));

        const topBookings = [...bookings]
            .sort((a, b) => b.amountTotal - a.amountTotal)
            .slice(0, 10);

        topBookings.forEach((booking, index) => {
            console.log(`\n${index + 1}. ${booking.studentName} (Booking #${booking.bookingId})`);
            console.log(`   Course: ${booking.courseName}`);
            console.log(`   Period: ${booking.courseFrom} to ${booking.courseUntil} (${booking.weeks} weeks)`);
            console.log(`   Hours: ${booking.totalUnits} total (${booking.hoursPerWeek.toFixed(1)}/week)`);
            console.log(`   Revenue: €${booking.amountTotal.toFixed(2)}`);
            console.log(`   Rate: €${booking.ratePerHour.toFixed(2)}/hour | €${booking.ratePerWeek.toFixed(2)}/week`);
        });

        // Show rate distribution
        console.log('\n' + '='.repeat(80));
        console.log('RATE DISTRIBUTION');
        console.log('='.repeat(80));

        const rateBuckets = {
            'Under €5/hour': bookings.filter(b => b.ratePerHour > 0 && b.ratePerHour < 5).length,
            '€5-€7/hour': bookings.filter(b => b.ratePerHour >= 5 && b.ratePerHour < 7).length,
            '€7-€9/hour': bookings.filter(b => b.ratePerHour >= 7 && b.ratePerHour < 9).length,
            '€9-€11/hour': bookings.filter(b => b.ratePerHour >= 9 && b.ratePerHour < 11).length,
            'Over €11/hour': bookings.filter(b => b.ratePerHour >= 11).length
        };

        for (const [range, count] of Object.entries(rateBuckets)) {
            const percent = stats.totalBookings > 0 ? ((count / stats.totalBookings) * 100).toFixed(1) : 0;
            console.log(`${range}: ${count} bookings (${percent}%)`);
        }
    }

    /**
     * Export data to JSON file
     */
    async exportToJSON(startDate, endDate, bookings, stats) {
        const outputDir = path.join(__dirname, '../../.claude/tmp');
        const filename = `morning-class-rates_${startDate}_to_${endDate}.json`;
        const outputPath = path.join(outputDir, filename);

        const data = {
            generated: new Date().toISOString(),
            dateRange: {
                start: startDate,
                end: endDate
            },
            summary: stats,
            bookings: bookings
        };

        await fs.writeFile(outputPath, JSON.stringify(data, null, 2));

        return outputPath;
    }
}

// CLI usage
if (require.main === module) {
    const startDate = process.argv[2] || '2025-11-01';
    const endDate = process.argv[3] || '2025-11-30';

    const extractor = new MorningClassRatesExtractor();

    extractor.extractRates(startDate, endDate)
        .then(() => {
            process.exit(0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = MorningClassRatesExtractor;
