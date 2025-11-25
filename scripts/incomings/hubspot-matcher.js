/**
 * HubSpot Matcher - Cross-reference incoming payments with HubSpot deals
 * Location: /home/hub/public_html/fins/scripts/incomings/hubspot-matcher.js
 *
 * Purpose: When bank description has no clear P####/D#### reference,
 * match the payment to a booking using HubSpot deal data (amount + name)
 *
 * Strategy:
 * 1. Extract customer name from bank description
 * 2. Search HubSpot deals by amount (€10 tolerance for bank/ForEx fees)
 * 3. Prioritize: Exact amount → Newest deals → Highest name similarity
 * 4. Filter by name match (fuzzy matching, 20% threshold for exact amounts)
 * 5. Return matched deal with contact ID for Fidelo lookup
 *
 * Key Factors (in priority order):
 * - Amount match (exact preferred, within €10 acceptable)
 * - Deal date (newest first - more likely to be recent payment)
 * - Name similarity (cultural/transcription variations expected)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const HubSpotClient = require('../hubspot/hubspot-client');

class HubSpotMatcher {
    constructor() {
        this.hubspot = new HubSpotClient();
        // Configure known pipelines: B2B='35765201', B2C='default'
        this.hubspot.setPipelines('35765201', 'default');
        this.dealsCache = null;
        this.cacheTimestamp = null;
        this.cacheValidityMs = 3600000; // 1 hour cache
    }

    /**
     * Get active deals from HubSpot with caching
     * @param {boolean} includeWonLost - Include Won/Lost deals (for testing)
     */
    async getActiveDeals(includeWonLost = false) {
        const now = Date.now();

        // Return cached deals if still valid
        if (this.dealsCache && this.cacheTimestamp && (now - this.cacheTimestamp < this.cacheValidityMs)) {
            console.log('Using cached HubSpot deals');
            return this.dealsCache;
        }

        console.log('Fetching fresh HubSpot deals...');
        this.dealsCache = await this.hubspot.getActiveDeals(false, includeWonLost); // Fast mode - no contact enrichment
        this.cacheTimestamp = now;

        return this.dealsCache;
    }

    /**
     * Extract customer name from bank description
     * Examples:
     *   "Yagmur Sirkecioglu SP" → "Yagmur Sirkecioglu"
     *   "Andrea Michelle Di SP" → "Andrea Michelle Di"
     *   "Jose Luis Rodrigue SP" → "Jose Luis Rodrigue"
     *   "BLUE CONSULTORIA E GP" → "BLUE CONSULTORIA"
     */
    extractNameFromDescription(description) {
        if (!description) return null;

        // Remove common suffixes
        let cleaned = description
            .replace(/\s+(SP|IP|GP)$/i, '')  // Remove trailing SP/IP/GP
            .replace(/^Revolut:\s+[a-f0-9-]+$/i, '') // Remove Revolut UUIDs
            .replace(/^ST-[A-Z0-9]+$/i, '') // Remove Stripe codes
            .replace(/^ADMIN FEE/i, '') // Remove admin fee prefix
            .replace(/ULEARN(P|D)?[0-9]+/gi, '') // Remove ULEARN references
            .replace(/TMUL/gi, '') // Remove TransferMate
            .replace(/FIDELO/gi, '') // Remove FIDELO keyword
            .replace(/\s+acc\s+/gi, ' ') // Remove 'acc' keyword
            .replace(/^\d{10,}\s+/, '') // Remove leading long numbers
            .trim();

        // If nothing left after cleaning, return null
        if (!cleaned || cleaned.length < 3) return null;

        return cleaned;
    }

    /**
     * Normalize name for matching
     * Removes accents, lowercase, removes punctuation
     */
    normalizeName(name) {
        if (!name) return '';

        return name
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
            .replace(/[^a-z0-9\s]/g, '') // Remove punctuation
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Calculate name similarity score (0-100)
     * Uses simple token matching
     */
    calculateNameSimilarity(name1, name2) {
        const normalized1 = this.normalizeName(name1);
        const normalized2 = this.normalizeName(name2);

        if (!normalized1 || !normalized2) return 0;

        // Exact match
        if (normalized1 === normalized2) return 100;

        // Split into tokens
        const tokens1 = normalized1.split(' ');
        const tokens2 = normalized2.split(' ');

        // Count matching tokens
        let matches = 0;
        for (const token1 of tokens1) {
            if (token1.length < 2) continue; // Skip very short tokens

            for (const token2 of tokens2) {
                if (token2.length < 2) continue;

                // Exact token match
                if (token1 === token2) {
                    matches++;
                    break;
                }

                // Partial token match (at least 3 chars)
                if (token1.length >= 3 && token2.length >= 3) {
                    if (token1.includes(token2) || token2.includes(token1)) {
                        matches += 0.5;
                        break;
                    }
                }
            }
        }

        // Calculate score based on matching tokens vs total tokens
        const totalTokens = Math.max(tokens1.length, tokens2.length);
        return totalTokens > 0 ? Math.round((matches / totalTokens) * 100) : 0;
    }

    /**
     * Match payment by amount
     * Returns deals with matching or close amount
     * Tolerance: €10 fixed (captures bank/ForEx fees, flags larger discrepancies)
     */
    matchByAmount(deals, targetAmount, tolerance = 10) {
        const matches = [];

        for (const deal of deals) {
            const dealAmount = parseFloat(deal.amount);
            if (isNaN(dealAmount)) continue;

            const diff = Math.abs(dealAmount - targetAmount);

            // Exact match (within €1)
            if (diff <= 1) {
                matches.push({
                    deal,
                    amountMatch: 'exact',
                    amountDiff: diff
                });
            }
            // Close match (within €10 - captures bank/ForEx fees)
            else if (diff <= tolerance) {
                matches.push({
                    deal,
                    amountMatch: 'close',
                    amountDiff: diff
                });
            }
        }

        return matches;
    }

    /**
     * Main matching function
     * Returns best match or null
     */
    async findMatch(bankDescription, amount, options = {}) {
        const {
            minNameSimilarity = 60,
            amountTolerance = 10, // €10 fixed tolerance (captures bank/ForEx fees)
            pipeline = null, // 'B2B', 'B2C', or null for both
            includeWonLost = false // Include Won/Lost deals (for testing)
        } = options;

        // Extract name from description
        const extractedName = this.extractNameFromDescription(bankDescription);

        if (!extractedName) {
            return {
                success: false,
                reason: 'no_name_extracted',
                message: `Could not extract customer name from: "${bankDescription}"`,
                bankDescription,
                amount
            };
        }

        // Get active deals (or all deals if includeWonLost is true)
        const allDeals = await this.getActiveDeals(includeWonLost);

        // Filter by pipeline if specified
        let deals = allDeals;
        if (pipeline === 'B2B') {
            deals = allDeals.filter(d => d.pipeline === '35765201');
        } else if (pipeline === 'B2C') {
            deals = allDeals.filter(d => d.pipeline === 'default');
        }

        console.log(`Searching ${deals.length} ${pipeline || 'all'} deals for: "${extractedName}" (€${amount})`);

        // Step 1: Match by amount (within €10 tolerance for bank/ForEx fees)
        const amountMatches = this.matchByAmount(deals, amount, amountTolerance);

        if (amountMatches.length === 0) {
            return {
                success: false,
                reason: 'no_amount_match',
                message: `No deals found with amount €${amount}`,
                extractedName,
                bankDescription,
                amount
            };
        }

        console.log(`Found ${amountMatches.length} deals with matching amount`);

        // Step 2: Score by name similarity
        const scoredMatches = amountMatches.map(match => {
            // Try matching against deal name (if available)
            const dealName = match.deal.dealName || '';
            const nameSimilarity = this.calculateNameSimilarity(extractedName, dealName);

            return {
                ...match,
                nameSimilarity,
                dealName,
                dealDate: match.deal.closeDate || match.deal.createdDate || '1970-01-01'
            };
        });

        // Sort by priority: 1) Exact amount first, 2) Newest date, 3) Name similarity
        scoredMatches.sort((a, b) => {
            // 1. Prioritize exact amount matches over close matches
            if (a.amountMatch === 'exact' && b.amountMatch !== 'exact') return -1;
            if (b.amountMatch === 'exact' && a.amountMatch !== 'exact') return 1;

            // 2. Within same match type, prioritize newer deals
            const dateCompare = new Date(b.dealDate) - new Date(a.dealDate);
            if (dateCompare !== 0) return dateCompare;

            // 3. Finally sort by name similarity (highest first)
            return b.nameSimilarity - a.nameSimilarity;
        });

        // For exact amount matches, use lower threshold (20%), otherwise use specified threshold
        const effectiveThreshold = scoredMatches.some(m => m.amountMatch === 'exact') ?
            Math.min(minNameSimilarity, 20) : minNameSimilarity;

        // Filter by minimum similarity threshold
        const goodMatches = scoredMatches.filter(m => m.nameSimilarity >= effectiveThreshold);

        if (goodMatches.length === 0) {
            return {
                success: false,
                reason: 'no_name_match',
                message: `Found ${amountMatches.length} deals with amount €${amount}, but none match name "${extractedName}"`,
                extractedName,
                bankDescription,
                amount,
                amountMatches: scoredMatches.slice(0, 5).map(m => ({
                    dealId: m.deal.dealId,
                    dealName: m.dealName,
                    amount: m.deal.amount,
                    similarity: m.nameSimilarity
                }))
            };
        }

        // If multiple good matches, warn about ambiguity
        if (goodMatches.length > 1) {
            const topScore = goodMatches[0].nameSimilarity;
            const nearTies = goodMatches.filter(m => Math.abs(m.nameSimilarity - topScore) < 10);

            if (nearTies.length > 1) {
                return {
                    success: false,
                    reason: 'ambiguous_match',
                    message: `Found ${nearTies.length} similar deals - manual review needed`,
                    extractedName,
                    bankDescription,
                    amount,
                    possibleMatches: nearTies.map(m => ({
                        dealId: m.deal.dealId,
                        dealName: m.dealName,
                        amount: m.deal.amount,
                        similarity: m.nameSimilarity,
                        pipeline: m.deal.pipeline === 'default' ? 'B2C' : 'B2B'
                    }))
                };
            }
        }

        // Return best match
        const bestMatch = goodMatches[0];

        // Build match message with amount discrepancy note if applicable
        let message = `Matched via HubSpot: ${bestMatch.dealName}`;
        if (bestMatch.amountMatch === 'close' && bestMatch.amountDiff > 0) {
            message += ` (€${bestMatch.amountDiff.toFixed(2)} discrepancy - likely bank/ForEx fee)`;
        }

        return {
            success: true,
            reason: 'matched',
            message,
            extractedName,
            bankDescription,
            amount,
            match: {
                dealId: bestMatch.deal.dealId,
                dealName: bestMatch.dealName,
                dealAmount: bestMatch.deal.amount,
                amountDiff: bestMatch.amountDiff || 0,
                pipeline: bestMatch.deal.pipeline === 'default' ? 'B2C' : 'B2B',
                nameSimilarity: bestMatch.nameSimilarity,
                amountMatch: bestMatch.amountMatch,
                dealDate: bestMatch.dealDate,
                // Note: We need to add a method to get Fidelo booking ID from deal
                // For now, return contactId which we'll use to search Fidelo
                contactId: bestMatch.deal.contactId,
                hubspotUrl: `https://app.hubspot.com/contacts/YOUR_PORTAL_ID/deal/${bestMatch.deal.dealId}`
            }
        };
    }

    /**
     * Batch match multiple transactions
     */
    async matchBatch(transactions) {
        const results = [];

        for (const txn of transactions) {
            const result = await this.findMatch(txn.description, txn.amount, txn.options || {});
            results.push({
                transaction: txn,
                ...result
            });
        }

        return results;
    }
}

// Export for use as module
module.exports = HubSpotMatcher;

// CLI test mode
if (require.main === module) {
    const matcher = new HubSpotMatcher();

    // Test cases from emails.md (November 2025 - already Won/Closed)
    const testCases = [
        { desc: 'Yagmur Sirkecioglu SP', amount: 826.20, expected: 'Sirkecioğlu Şenol, Yagmur', includeWonLost: true },
        { desc: 'BLUE CONSULTORIA E GP', amount: 1509.60, expected: 'Kuhl, Maurivan', pipeline: 'B2B', includeWonLost: true },
        { desc: 'Revolut: 690c8752-328d-a153-a4f4-644cdbec0db5', amount: 900.00, expected: 'Parada, Paola', includeWonLost: true },
        { desc: 'Andrea Michelle Di SP', amount: 2260.50, expected: 'Diaz Moreno, Andrea Michelle', includeWonLost: true },
        { desc: 'Laia Padros FIDELO SP', amount: 532.40, expected: 'Padros, Laia', includeWonLost: true },
    ];

    console.log('Running HubSpot Matcher Test...\n');

    (async () => {
        for (const test of testCases) {
            console.log(`\nTest: "${test.desc}" (€${test.amount})`);
            console.log(`Expected: ${test.expected}`);
            console.log('-'.repeat(70));

            const result = await matcher.findMatch(test.desc, test.amount, {
                pipeline: test.pipeline,
                includeWonLost: test.includeWonLost
            });

            if (result.success) {
                console.log(`✅ MATCH FOUND`);
                console.log(`   Deal: ${result.match.dealName}`);
                console.log(`   Amount: €${result.match.dealAmount}`);
                console.log(`   Pipeline: ${result.match.pipeline}`);
                console.log(`   Similarity: ${result.match.nameSimilarity}%`);
                console.log(`   Contact ID: ${result.match.contactId}`);
            } else {
                console.log(`❌ NO MATCH: ${result.reason}`);
                console.log(`   ${result.message}`);

                // Show top potential matches or possible matches (ambiguous)
                const matchesToShow = result.possibleMatches || result.amountMatches;
                if (matchesToShow && matchesToShow.length > 0) {
                    console.log(`   ${result.possibleMatches ? 'Possible matches' : 'Top potential matches'}:`);
                    matchesToShow.forEach((match, i) => {
                        const dealName = match.dealName;
                        const amount = match.dealAmount || match.amount;
                        const similarity = match.similarity;
                        const pipeline = match.pipeline || '';
                        console.log(`   ${i + 1}. ${dealName} (€${amount}) - ${similarity}% ${pipeline ? `[${pipeline}]` : ''}`);
                    });
                }
            }
        }
    })();
}
