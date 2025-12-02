/**
 * Fidelo Search - Find bookings by multiple matching strategies
 * Location: /home/hub/public_html/fins/scripts/incomings/fidelo-search.js
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
        // Matches: P2024929 (full year+seq), P20251003, or P2 (short format with year inference)
        // Full format: P + year (202X) + sequence (3-4 digits)
        // Short format: P + 1-3 digits (year gets inferred)
        const pMatches = bankDescription.match(/P(202\d\d{3,4}|\d{1,3})/gi);
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

        // Pattern 2: D#### format (Document/Invoice)
        // Matches: D2025380, D2025548 (year 202X + sequence 3-4 digits)
        // Does NOT match: D29297 or "ID29297" (no year format)
        const dMatches = bankDescription.match(/D(202\d\d{3,4})/gi);
        if (dMatches) {
            dMatches.forEach(match => {
                references.push(match.toUpperCase());
            });
        }

        // Pattern 3: Numeric booking ID (5-6 digits, including embedded in text)
        // Matches: 138116, 110997, ULEARN29160
        // Careful: Don't match bank reference numbers (too long)
        const numericMatches = bankDescription.match(/(\d{5,6})/g);
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

            // Sort by booking ID descending (most recent first, mimics GUI2 behavior)
            // Higher booking IDs = more recent bookings
            bookings.sort((a, b) => (b.id || 0) - (a.id || 0));

            // If multiple results, return all for amount matching downstream
            // If single result, return it
            if (bookings.length === 1) {
                const booking = bookings[0];
                console.log(`✅ Found booking ${booking.id} (${booking.customer_firstname} ${booking.customer_lastname})`);
                return booking;
            }

            // Multiple bookings found - return all of them (sorted by recency)
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
     * Score how well a student name matches the search terms
     * Returns score 0-100 (higher = better match)
     */
    scoreNameMatch(searchWords, studentName) {
        if (!studentName) return 0;

        const fullName = studentName.toLowerCase();
        const searchLower = searchWords.map(w => w.toLowerCase());

        let score = 0;
        let matchedWords = 0;

        for (const word of searchLower) {
            if (fullName.includes(word)) {
                matchedWords++;
                score += 30; // Full word match
            } else {
                // Check for partial match (truncated word like "Di" → "Diaz")
                // Student name might have word starting with search term
                const nameWords = fullName.split(/\s+/);
                const partialMatch = nameWords.some(nw => nw.startsWith(word) && word.length >= 2);
                if (partialMatch) {
                    matchedWords++;
                    score += 15; // Partial match (likely truncated)
                }
            }
        }

        // Bonus if all words matched
        if (matchedWords === searchLower.length) {
            score += 20;
        }

        return score;
    }

    /**
     * Search Fidelo by student name and amount
     * Strategy: Search API, take first 50 results, score by name similarity, then check amount
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

            // Helper: Search and score first 50 results by name similarity
            const searchAndScoreCandidates = async (searchString, searchWords) => {
                console.log(`   🔍 Searching: "${searchString}"`);
                const results = await this.searchByReference(searchString);

                if (!results) return [];

                const bookings = Array.isArray(results) ? results : [results];
                const first50 = bookings.slice(0, 50); // Take first 50 (most recent)

                console.log(`      Scanning first ${first50.length} results for name matches...`);

                // Score each booking by name similarity
                const scored = first50.map(booking => {
                    const fullName = `${booking.customer_firstname || ''} ${booking.customer_middlename || ''} ${booking.customer_lastname || ''}`.trim();
                    const score = this.scoreNameMatch(searchWords, fullName);

                    return {
                        ...booking,
                        _nameScore: score,
                        _fullName: fullName
                    };
                });

                // Keep candidates with good name matches (score >= 50)
                const candidates = scored.filter(b => b._nameScore >= 50);

                if (candidates.length > 0) {
                    console.log(`      Found ${candidates.length} name match candidate(s):`);
                    candidates.slice(0, 5).forEach(c => {
                        console.log(`        - ${c._fullName} (score: ${c._nameScore})`);
                    });
                } else {
                    console.log(`      No strong name matches found (all scores < 50)`);
                }

                return candidates;
            };

            // Helper: Check candidates for amount match
            const findBestAmountMatch = (candidates) => {
                if (!candidates || candidates.length === 0) return null;

                // First pass: Look for amount match
                for (const booking of candidates) {
                    const bookingAmount = parseFloat(booking.amount || 0);
                    const amountOpen = parseFloat(booking.amount_open || 0);

                    const amountDiff = Math.abs(bookingAmount - targetAmount);
                    const openDiff = Math.abs(amountOpen - targetAmount);

                    if (amountDiff <= tolerance || openDiff <= tolerance) {
                        console.log(`✅ Amount match: ${booking._fullName} (€${amountOpen} open)`);
                        return booking;
                    }
                }

                // Second pass: If best candidate has €0 open, flag as possible duplicate
                if (candidates.length > 0) {
                    const bestCandidate = candidates[0]; // Highest score
                    const amountOpen = parseFloat(bestCandidate.amount_open || 0);

                    if (amountOpen === 0) {
                        console.log(`⚠️  Best name match but invoice fully paid - possible duplicate`);
                        console.log(`   ${bestCandidate._fullName} (booking ${bestCandidate.id})`);
                        return {
                            ...bestCandidate,
                            _possibleDuplicate: true,
                            _duplicateReason: 'Invoice fully paid - transaction may already be applied'
                        };
                    }
                }

                return null;
            };

            // PROGRESSIVE SEARCH STRATEGY:
            // Search with progressively fewer words, scoring name similarity in first 50 results each time

            // STRATEGY 1: Try ALL words together (including truncated)
            if (nameWords.length >= 2) {
                const fullSearch = nameWords.join(' ');
                const candidates = await searchAndScoreCandidates(fullSearch, nameWords);
                const match = findBestAmountMatch(candidates);
                if (match) return match;
            }

            // STRATEGY 2: Remove last word if it's short (likely truncated) and try again
            if (nameWords.length >= 3) {
                const lastWord = nameWords[nameWords.length - 1];

                if (lastWord.length <= 3) {
                    const shorterWords = nameWords.slice(0, -1);
                    const shorterSearch = shorterWords.join(' ');
                    console.log(`   Removing truncated "${lastWord}"...`);
                    const candidates = await searchAndScoreCandidates(shorterSearch, nameWords); // Still score against original words
                    const match = findBestAmountMatch(candidates);
                    if (match) return match;
                }
            }

            // STRATEGY 3: Try first N-1 words
            if (nameWords.length >= 3) {
                const shorterWords = nameWords.slice(0, -1);
                const shorterSearch = shorterWords.join(' ');
                const candidates = await searchAndScoreCandidates(shorterSearch, nameWords);
                const match = findBestAmountMatch(candidates);
                if (match) return match;
            }

            // STRATEGY 4: Try first 2 words if we have more than 2
            if (nameWords.length >= 4) {
                const first2Words = nameWords.slice(0, 2);
                const first2Search = first2Words.join(' ');
                const candidates = await searchAndScoreCandidates(first2Search, nameWords);
                const match = findBestAmountMatch(candidates);
                if (match) return match;
            }

            // STRATEGY 5: Try individual words (might get lucky with uncommon name)
            for (const nameWord of nameWords) {
                if (nameWord.length < 3) {
                    console.log(`   ⏭️  Skipping short word: "${nameWord}" (< 3 chars)`);
                    continue;
                }

                const candidates = await searchAndScoreCandidates(nameWord, nameWords);
                const match = findBestAmountMatch(candidates);
                if (match) return match;
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
                            customer_number: booking.customer_number, // Student ID (use underscore for consistency)
                            customerNumber: booking.customer_number,  // Also provide camelCase for compatibility
                            customer_name: `${booking.customer_lastname}, ${booking.customer_firstname}`,
                            customerName: `${booking.customer_lastname}, ${booking.customer_firstname}`,
                            documentNumber: booking.document_number,
                            document_number: booking.document_number,
                            bookingNumber: booking.booking_number,
                            studentName: `${booking.customer_lastname}, ${booking.customer_firstname}`,
                            amount: booking.amount,
                            payments: booking.payments,
                            amount_open: booking.amount_open,
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
                            customerId: booking.customer_number, // Student ID (not customer_id which is internal DB ID)
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
     * Find booking by student ID
     * @param {string|number} studentId - Student ID (e.g., 30737)
     * @returns {Promise<Object>} - {success, booking} or {success: false, reason}
     */
    async findBookingByStudentId(studentId) {
        try {
            const allBookings = await this.getAllBookings();
            const idStr = String(studentId);

            // Search for booking with matching Student ID (customer_number field)
            const booking = allBookings.find(b => {
                const bookingStudentId = String(b.customer_number || '');
                return bookingStudentId === idStr;
            });

            if (booking) {
                console.log(`✅ Found booking ${booking.id} for student ID ${studentId}`);
                return {
                    success: true,
                    booking: {
                        bookingId: booking.id,
                        customerNumber: booking.customer_number,  // Student ID
                        documentNumber: booking.document_number,
                        studentName: `${booking.customer_firstname || ''} ${booking.customer_lastname || ''}`.trim(),
                        amount: parseFloat(booking.amount || 0),
                        amountOpen: parseFloat(booking.amount_open || 0),
                        pipeline: booking.crm_pipeline_name || booking.pipeline || 'Unknown'
                    }
                };
            }

            console.log(`❌ No booking found for student ID ${studentId}`);
            return {
                success: false,
                reason: 'student_id_not_found',
                message: `No booking found with student ID ${studentId}`
            };

        } catch (error) {
            console.error(`❌ Error searching for student ID ${studentId}:`, error.message);
            return {
                success: false,
                reason: 'search_error',
                error: error.message
            };
        }
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
