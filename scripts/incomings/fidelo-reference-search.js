/**
 * Fidelo Reference Search - Find bookings by multiple matching strategies
 * Location: /home/hub/public_html/fins/scripts/incomings/fidelo-reference-search.js
 *
 * Purpose: Priority 1 matching - Search Fidelo FIRST before HubSpot
 *
 * Search Strategies (in order):
 * 1. P####/D#### invoice references (document_number field)
 * 2. Numeric booking ID (5-6 digits) - direct API lookup
 * 3. Student names (firstname/lastname) + amount matching
 *
 * Strategy:
 * 1. Extract ALL possible identifiers from bank description (P/D refs, IDs, names)
 * 2. Search Fidelo bookings by document_number, booking_number, ID
 * 3. Search Fidelo bookings by student name + amount
 * 4. Return booking details for payment assignment
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { getFideloBookingAxios, getFideloBookingsAxios } = require('../fidelo/bookings-api');

class FideloReferenceSearch {
    constructor() {
        this.bookingsCache = null;
        this.cacheTimestamp = null;
        this.cacheValidityMs = 3600000; // 1 hour cache
    }

    /**
     * Get all bookings with caching
     */
    async getAllBookings() {
        const now = Date.now();

        // Return cached bookings if still valid
        if (this.bookingsCache && this.cacheTimestamp && (now - this.cacheTimestamp < this.cacheValidityMs)) {
            console.log('Using cached Fidelo bookings');
            return this.bookingsCache;
        }

        console.log('Fetching fresh Fidelo bookings...');
        const response = await getFideloBookingsAxios();

        // Handle different API response structures
        let bookingsArray = [];
        if (Array.isArray(response)) {
            bookingsArray = response;
        } else if (response.data && Array.isArray(response.data)) {
            bookingsArray = response.data;
        } else if (response.entries) {
            bookingsArray = Object.values(response.entries);
        } else if (typeof response === 'object') {
            bookingsArray = Object.values(response);
        }

        this.bookingsCache = bookingsArray;
        this.cacheTimestamp = now;

        console.log(`Cached ${bookingsArray.length} bookings`);
        return bookingsArray;
    }

    /**
     * Extract structured references from bank description
     * Returns array of potential references in priority order
     *
     * Examples:
     *   "158619782030727 P2 IP" → ["P2025302"]
     *   "1580214041P2025951 IP" → ["P2025951"]
     *   "138116 Aurora Mad SP" → ["138116"]
     *   "ULEARNP2024929 SP" → ["P2024929"]
     *   "ULEARND2025380TMUL SP" → ["D2025380"]
     */
    extractReferences(bankDescription) {
        if (!bankDescription) return [];

        const references = [];

        // Pattern 1: P#### format (Proforma Invoice)
        // Matches: P2025951, P2024929, P2 (with year inference)
        const pMatches = bankDescription.match(/P(\d{4,7})/gi);
        if (pMatches) {
            pMatches.forEach(match => {
                let digits = match.substring(1); // Remove 'P'

                // If only 2-3 digits (like "P2"), infer current year
                if (digits.length <= 3) {
                    const currentYear = new Date().getFullYear();
                    digits = `${currentYear}${digits.padStart(3, '0')}`;
                }

                references.push(`P${digits}`);
            });
        }

        // Pattern 2: D#### format (Document/Invoice - German: "Dokument")
        // Matches: D2025380, D2025237
        const dMatches = bankDescription.match(/D(\d{4,7})/gi);
        if (dMatches) {
            dMatches.forEach(match => {
                references.push(match.toUpperCase());
            });
        }

        // Pattern 3: Numeric booking ID (5-6 digits, standalone)
        // Matches: 138116, 110997
        // Careful: Don't match bank reference numbers (too long)
        const numericMatches = bankDescription.match(/\b(\d{5,6})\b/g);
        if (numericMatches) {
            numericMatches.forEach(match => {
                // Only add if not already captured in P/D format
                if (!references.some(ref => ref.includes(match))) {
                    references.push(match);
                }
            });
        }

        return references;
    }

    /**
     * Search Fidelo bookings API with search parameter
     *
     * @param {string} searchTerm - P####, D####, name, or booking ID
     * @returns {Promise<Object|null>} Booking object or null
     */
    async searchByReference(searchTerm) {
        if (!searchTerm) return null;

        try {
            console.log(`Searching Fidelo for: ${searchTerm}`);

            const axios = require('axios');

            const response = await axios.get(`https://ulearn.fidelo.com/api/1.0/ts/bookings`, {
                params: { 'filter[search]': searchTerm },
                headers: {
                    'Authorization': `Bearer ${process.env.FIDELO_API_TOKEN || '699c957fb710153384dc0aea54e5dbec'}`,
                    'Accept': 'application/json'
                }
            });

            // Handle response structure
            let bookings = [];
            if (response.data.entries) {
                bookings = Object.values(response.data.entries);
            } else if (Array.isArray(response.data)) {
                bookings = response.data;
            } else if (response.data.data) {
                bookings = Array.isArray(response.data.data) ? response.data.data : Object.values(response.data.data);
            }

            if (bookings.length === 0) {
                console.log(`❌ No booking found for: ${searchTerm}`);
                return null;
            }

            // If multiple results, return all for amount matching downstream
            // If single result, return it
            if (bookings.length === 1) {
                const booking = bookings[0];
                console.log(`✅ Found booking ${booking.id} (${booking.customer_firstname} ${booking.customer_lastname})`);
                return booking;
            }

            // Multiple bookings found - return all of them
            console.log(`✅ Found ${bookings.length} bookings for: ${searchTerm}`);
            return bookings;

        } catch (error) {
            console.error(`❌ Error searching Fidelo for ${searchTerm}:`, error.message);
            return null;
        }
    }

    /**
     * Extract possible student names from bank description
     * Returns array of name components
     *
     * Examples:
     *   "Badamkhand Otgonba SP" → ["Badamkhand", "Otgonba"]
     *   "Yagmur Sirkecioglu SP" → ["Yagmur", "Sirkecioglu"]
     *   "Fischer, Christian" → ["Fischer", "Christian"]
     */
    extractNames(bankDescription) {
        if (!bankDescription) return [];

        // Remove common suffixes and prefixes
        let cleaned = bankDescription
            .replace(/\bSP\b/gi, '')
            .replace(/\bIP\b/gi, '')
            .replace(/\bULEARN\b/gi, '')
            .replace(/\bTMUL\b/gi, '')
            .replace(/\bTO\b/gi, '')
            .replace(/\d+/g, '') // Remove numbers
            .replace(/[,\.\-_]/g, ' ') // Replace punctuation with spaces
            .trim();

        // Split into words and filter
        const words = cleaned.split(/\s+/).filter(word => {
            return word.length >= 2 && // At least 2 characters
                   !/^[A-Z]{2,}$/.test(word) && // Not all caps abbreviations
                   word.match(/[a-zA-Z]/); // Contains letters
        });

        return words.slice(0, 3); // Return max 3 words (firstname, lastname, possible middle)
    }

    /**
     * Search Fidelo by student name and amount
     * Uses search API parameter then filters by amount
     *
     * @param {Array<string>} nameWords - Array of name components
     * @param {number} amount - Transaction amount
     * @param {number} tolerance - Amount tolerance in euros (default 10)
     * @returns {Promise<Object|null>} Booking object or null
     */
    async searchByNameAndAmount(nameWords, amount, tolerance = 10) {
        if (!nameWords || nameWords.length === 0 || !amount) return null;

        console.log(`Searching by name: ${nameWords.join(' ')} + amount: €${amount}`);

        try {
            const targetAmount = parseFloat(amount);

            // Try searching for each name word
            for (const nameWord of nameWords) {
                const result = await this.searchByReference(nameWord);

                if (!result) continue;

                // Handle single booking or array of bookings
                const bookings = Array.isArray(result) ? result : [result];

                // Check each booking for amount match
                for (const booking of bookings) {
                    const bookingAmount = parseFloat(booking.amount || 0);
                    const amountOpen = parseFloat(booking.amount_open || 0);

                    const amountDiff = Math.abs(bookingAmount - targetAmount);
                    const openDiff = Math.abs(amountOpen - targetAmount);

                    // Check if amount matches (within tolerance)
                    if (amountDiff <= tolerance || openDiff <= tolerance) {
                        console.log(`✅ Found booking ${booking.id} (${booking.customer_firstname} ${booking.customer_lastname}) by name + amount`);
                        return booking;
                    }
                }

                // Log if found bookings but no amount match
                if (bookings.length > 0) {
                    console.log(`⚠️  Found ${bookings.length} booking(s) for "${nameWord}" but none match amount €${amount}`);
                }
            }

            console.log(`❌ No booking found for name: ${nameWords.join(' ')} + amount: €${amount}`);
            return null;

        } catch (error) {
            console.error(`❌ Error searching by name + amount:`, error.message);
            return null;
        }
    }

    /**
     * Main search function - tries all extracted references AND names
     * Returns first successful match
     *
     * @param {string} bankDescription - Full bank transaction description
     * @param {number} amount - Transaction amount (optional, for name matching)
     * @returns {Promise<Object>} Search result with booking or failure reason
     */
    async findBooking(bankDescription, amount = null) {
        // Step 1: Try structured references first (P####/D####/ID)
        const references = this.extractReferences(bankDescription);

        if (references.length > 0) {
            console.log(`Extracted references: ${references.join(', ')}`);

            // Try each reference in priority order (P first, then D, then numeric)
            for (const reference of references) {
                const booking = await this.searchByReference(reference);

                if (booking) {
                    return {
                        success: true,
                        reason: 'reference_matched',
                        message: `Found booking via reference: ${reference}`,
                        bankDescription,
                        reference,
                        booking: {
                            bookingId: booking.id,
                            contactId: booking.contact_id,
                            customerId: booking.customer_id,
                            documentNumber: booking.document_number,
                            bookingNumber: booking.booking_number,
                            studentName: `${booking.customer_lastname}, ${booking.customer_firstname}`,
                            amount: booking.amount,
                            payments: booking.payments,
                            amountOpen: booking.amount_open,
                            agencyId: booking.agency_id,
                            pipeline: booking.agency_id ? 'B2B' : 'B2C'
                        }
                    };
                }
            }

            console.log(`References found but no match in Fidelo: ${references.join(', ')}`);
        }

        // Step 2: Try name + amount matching (if amount provided)
        if (amount) {
            const nameWords = this.extractNames(bankDescription);

            if (nameWords.length > 0) {
                console.log(`Trying name + amount match: ${nameWords.join(' ')} + €${amount}`);

                const booking = await this.searchByNameAndAmount(nameWords, amount);

                if (booking) {
                    return {
                        success: true,
                        reason: 'name_amount_matched',
                        message: `Found booking via name + amount: ${nameWords.join(' ')}`,
                        bankDescription,
                        nameWords,
                        booking: {
                            bookingId: booking.id,
                            contactId: booking.contact_id,
                            customerId: booking.customer_id,
                            documentNumber: booking.document_number,
                            bookingNumber: booking.booking_number,
                            studentName: `${booking.customer_lastname}, ${booking.customer_firstname}`,
                            amount: booking.amount,
                            payments: booking.payments,
                            amountOpen: booking.amount_open,
                            agencyId: booking.agency_id,
                            pipeline: booking.agency_id ? 'B2B' : 'B2C'
                        }
                    };
                }
            }
        }

        // No matches found
        const nameWords = this.extractNames(bankDescription);
        return {
            success: false,
            reason: references.length > 0 ? 'reference_not_found' : 'no_match_found',
            message: references.length > 0
                ? `References found (${references.join(', ')}) but no matching booking in Fidelo`
                : `No structured reference or matching name found in: "${bankDescription}"`,
            bankDescription,
            references,
            attemptedReferences: references,
            extractedNames: nameWords
        };
    }

    /**
     * Batch search multiple bank descriptions
     */
    async searchBatch(bankDescriptions) {
        const results = [];

        for (const desc of bankDescriptions) {
            const result = await this.findBooking(desc);
            results.push(result);
        }

        return results;
    }
}

// Export for use as module
module.exports = FideloReferenceSearch;

// CLI test mode
if (require.main === module) {
    const searcher = new FideloReferenceSearch();

    // Test cases from emails.md (easy matches with P####/D#### references)
    const testCases = [
        '158619782030727 P2 IP',
        '158771690530723 P2 IP',
        '1580214041P2025951 IP',
        'ULEARNP2024929 SP',
        'ULEARNP2025921TMUL SP',
        '138116 Aurora Mad SP',
        '138139 Diego Moli IP',
        '110997 Eduardo Gub IP',
        'ULEARND2025380TMUL SP'
    ];

    console.log('Running Fidelo Reference Search Test...\n');

    (async () => {
        for (const test of testCases) {
            console.log(`\nTest: "${test}"`);
            console.log('-'.repeat(70));

            const result = await searcher.findBooking(test);

            if (result.success) {
                console.log(`✅ MATCH FOUND`);
                console.log(`   Reference: ${result.reference}`);
                console.log(`   Booking ID: ${result.booking.bookingId}`);
                console.log(`   Student: ${result.booking.studentName}`);
                console.log(`   Amount: €${result.booking.amount}`);
                console.log(`   Amount Open: €${result.booking.amountOpen}`);
                console.log(`   Pipeline: ${result.booking.pipeline}`);
            } else {
                console.log(`❌ NO MATCH: ${result.reason}`);
                console.log(`   ${result.message}`);
                if (result.attemptedReferences) {
                    console.log(`   Tried: ${result.attemptedReferences.join(', ')}`);
                }
            }
        }
    })();
}
