#!/usr/bin/env node
/**
 * HubSpot API Client
 * Location: /home/hub/public_html/fins/scripts/hubspot/hubspot-client.js
 *
 * Purpose: Fetch deals from HubSpot B2B and B2C pipelines for incoming payment matching
 *
 * Requirements:
 * - Fetch deals from B2B sales pipeline
 * - Fetch deals from B2C sales pipeline
 * - Exclude "Won" and "Lost" deals (only active pipeline deals)
 * - Extract: Deal amount, Contact name, Deal ID, Pipeline
 *
 * Usage:
 * const HubSpotClient = require('./scripts/hubspot/hubspot-client');
 * const client = new HubSpotClient();
 * const deals = await client.getActiveDeals();
 */

const hubspot = require('@hubspot/api-client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

class HubSpotClient {
    constructor() {
        this.accessToken = process.env.ACCESS_TOKEN;

        if (!this.accessToken) {
            throw new Error('ACCESS_TOKEN not found in .env file');
        }

        this.client = new hubspot.Client({
            accessToken: this.accessToken
        });

        // Pipeline IDs - these will need to be configured after initial discovery
        this.pipelines = {
            b2b: null,  // Will be set via getPipelines()
            b2c: null   // Will be set via getPipelines()
        };

        // Deal stage properties to exclude
        this.excludedStages = ['closedwon', 'closedlost', 'won', 'lost'];
    }

    /**
     * Discover all pipelines in HubSpot
     * Run this first to identify B2B and B2C pipeline IDs
     */
    async getPipelines() {
        try {
            console.log('🔍 Fetching HubSpot pipelines...');

            const response = await this.client.crm.pipelines.pipelinesApi.getAll('deals');

            console.log(`\n📊 Found ${response.results.length} pipelines:\n`);

            response.results.forEach(pipeline => {
                console.log(`Pipeline: ${pipeline.label}`);
                console.log(`  ID: ${pipeline.id}`);
                console.log(`  Stages: ${pipeline.stages.length}`);
                pipeline.stages.forEach(stage => {
                    console.log(`    - ${stage.label} (${stage.id})`);
                });
                console.log('');
            });

            return response.results;

        } catch (error) {
            console.error('❌ Error fetching pipelines:', error.message);
            throw error;
        }
    }

    /**
     * Set pipeline IDs manually after discovery
     * @param {string} b2bId - B2B pipeline ID
     * @param {string} b2cId - B2C pipeline ID
     */
    setPipelines(b2bId, b2cId) {
        this.pipelines.b2b = b2bId;
        this.pipelines.b2c = b2cId;
        console.log(`✅ Pipelines configured: B2B=${b2bId}, B2C=${b2cId}`);
    }

    /**
     * Fetch all active deals from both B2B and B2C pipelines
     * Active = Not "Won" or "Lost" (unless includeWonLost is true)
     *
     * @param {boolean} enrichWithContacts - Whether to fetch contact names (slower)
     * @param {boolean} includeWonLost - Include Won/Lost deals (for testing historical data)
     * @returns {Promise<Array>} Array of deal objects with amount, contact name, deal ID
     */
    async getActiveDeals(enrichWithContacts = false, includeWonLost = false) {
        try {
            if (!this.pipelines.b2b || !this.pipelines.b2c) {
                throw new Error('Pipelines not configured. Run getPipelines() first, then setPipelines(b2bId, b2cId)');
            }

            console.log('🔍 Fetching active deals from HubSpot...');

            // Fetch deals with pagination
            const allDeals = [];
            let after = undefined;

            const properties = [
                'dealname',
                'amount',
                'dealstage',
                'pipeline',
                'closedate',
                'createdate',
                'hs_lastmodifieddate'
            ];

            // Build filter to exclude Won/Lost deals at API level
            const filterGroups = [];

            if (!includeWonLost) {
                // Use OR logic: dealstage NOT IN (won, lost, closed won, closed lost)
                // In HubSpot filters, multiple filterGroups = OR, multiple filters in one group = AND
                // We want: NOT won OR NOT lost OR NOT "closed won" OR NOT "closed lost"
                // But that would include everything. We need AND logic.
                // Better approach: exclude each stage individually in same filter group
                const excludeFilters = this.excludedStages.map(stage => ({
                    propertyName: 'dealstage',
                    operator: 'NEQ',  // Not Equal
                    value: stage
                }));

                filterGroups.push({
                    filters: excludeFilters
                });
            }

            do {
                const searchRequest = {
                    filterGroups,
                    properties,
                    limit: 100,
                    after
                };

                const response = await this.client.crm.deals.searchApi.doSearch(searchRequest);

                allDeals.push(...response.results);
                after = response.paging?.next?.after;

                process.stdout.write(`\r   Fetched ${allDeals.length} deals...`);

            } while (after);

            console.log(`\n   Total deals fetched: ${allDeals.length}`);

            // Filter for B2B and B2C pipelines only
            const pipelineDeals = allDeals.filter(deal => {
                const pipeline = deal.properties.pipeline;
                return pipeline === this.pipelines.b2b || pipeline === this.pipelines.b2c;
            });

            console.log(`   Deals in B2B/B2C pipelines: ${pipelineDeals.length}`);

            // Exclude Won/Lost deals (unless includeWonLost is true)
            const activeDeals = includeWonLost ? pipelineDeals : pipelineDeals.filter(deal => {
                const stage = deal.properties.dealstage?.toLowerCase() || '';
                return !this.excludedStages.some(excluded => stage.includes(excluded));
            });

            console.log(`   ${includeWonLost ? 'All deals (including Won/Lost)' : 'Active deals (excluding Won/Lost)'}: ${activeDeals.length}`);

            // Optionally enrich with contact names (slower)
            if (enrichWithContacts) {
                const enrichedDeals = await this.enrichDealsWithContacts(activeDeals);
                return enrichedDeals;
            } else {
                // Return deals without contact names (faster)
                return activeDeals.map(deal => ({
                    dealId: deal.id,
                    dealName: deal.properties.dealname || 'Unnamed Deal',
                    amount: parseFloat(deal.properties.amount) || 0,
                    currency: 'EUR',
                    dealStage: deal.properties.dealstage,
                    pipeline: deal.properties.pipeline,
                    pipelineType: deal.properties.pipeline === this.pipelines.b2b ? 'B2B' : 'B2C',
                    contactId: deal.associations?.contacts?.results?.[0]?.id || null,
                    contactName: null, // Not fetched for performance
                    closeDate: deal.properties.closedate,
                    createdDate: deal.properties.createdate,
                    lastModified: deal.properties.hs_lastmodifieddate,
                    hubspotUrl: `https://app.hubspot.com/contacts/${this.getPortalId()}/deal/${deal.id}`
                }));
            }

        } catch (error) {
            console.error('❌ Error fetching active deals:', error.message);
            throw error;
        }
    }

    /**
     * Enrich deals with contact names
     * @param {Array} deals - Array of deal objects
     * @returns {Promise<Array>} Deals with contact names added
     */
    async enrichDealsWithContacts(deals) {
        console.log('\n🔗 Enriching deals with contact information...');

        const enriched = [];

        for (const deal of deals) {
            try {
                let contactName = null;

                // Get associated contacts
                if (deal.associations?.contacts?.results?.length > 0) {
                    const contactId = deal.associations.contacts.results[0].id;

                    // Fetch contact details
                    const contact = await this.client.crm.contacts.basicApi.getById(
                        contactId,
                        ['firstname', 'lastname', 'email']
                    );

                    const firstName = contact.properties.firstname || '';
                    const lastName = contact.properties.lastname || '';
                    contactName = `${firstName} ${lastName}`.trim();
                }

                enriched.push({
                    dealId: deal.id,
                    dealName: deal.properties.dealname || 'Unnamed Deal',
                    amount: parseFloat(deal.properties.amount) || 0,
                    currency: 'EUR', // Assuming EUR, adjust if needed
                    dealStage: deal.properties.dealstage,
                    pipeline: deal.properties.pipeline,
                    pipelineType: deal.properties.pipeline === this.pipelines.b2b ? 'B2B' : 'B2C',
                    contactName: contactName,
                    closeDate: deal.properties.closedate,
                    createdDate: deal.properties.createdate,
                    lastModified: deal.properties.hs_lastmodifieddate,
                    hubspotUrl: `https://app.hubspot.com/contacts/${this.getPortalId()}/deal/${deal.id}`
                });

            } catch (error) {
                console.error(`   ⚠️  Error enriching deal ${deal.id}:`, error.message);
                // Add deal without contact name
                enriched.push({
                    dealId: deal.id,
                    dealName: deal.properties.dealname || 'Unnamed Deal',
                    amount: parseFloat(deal.properties.amount) || 0,
                    currency: 'EUR',
                    dealStage: deal.properties.dealstage,
                    pipeline: deal.properties.pipeline,
                    pipelineType: deal.properties.pipeline === this.pipelines.b2b ? 'B2B' : 'B2C',
                    contactName: null,
                    closeDate: deal.properties.closedate,
                    createdDate: deal.properties.createdate,
                    lastModified: deal.properties.hs_lastmodifieddate,
                    hubspotUrl: null
                });
            }
        }

        console.log(`✅ Enriched ${enriched.length} deals with contact information\n`);

        return enriched;
    }

    /**
     * Get HubSpot portal ID from access token (for building URLs)
     * This is a placeholder - we'll need to fetch this from the account info
     */
    getPortalId() {
        // TODO: Fetch actual portal ID from account info
        return 'PORTAL_ID';
    }

    /**
     * Search deals by amount
     * @param {number} amount - Amount to search for
     * @param {number} tolerance - Tolerance for amount matching (default 0.01)
     * @returns {Promise<Array>} Matching deals
     */
    async searchDealsByAmount(amount, tolerance = 0.01) {
        const activeDeals = await this.getActiveDeals();

        return activeDeals.filter(deal => {
            const diff = Math.abs(deal.amount - amount);
            return diff <= tolerance;
        });
    }

    /**
     * Search deals by contact name
     * @param {string} name - Name to search for (fuzzy match)
     * @returns {Promise<Array>} Matching deals
     */
    async searchDealsByName(name) {
        const activeDeals = await this.getActiveDeals();

        const nameLower = name.toLowerCase();

        return activeDeals.filter(deal => {
            if (!deal.contactName) return false;

            const contactNameLower = deal.contactName.toLowerCase();

            // Check if any part of the search name matches
            const searchParts = nameLower.split(/\s+/);
            return searchParts.some(part => contactNameLower.includes(part));
        });
    }

    /**
     * Match deal by amount AND name
     * @param {number} amount - Amount to match
     * @param {string} name - Name to match
     * @param {number} tolerance - Amount tolerance (default 0.01)
     * @returns {Promise<Array>} Matching deals, sorted by confidence
     */
    async matchDeal(amount, name, tolerance = 0.01) {
        const activeDeals = await this.getActiveDeals();

        const matches = [];
        const nameLower = name?.toLowerCase() || '';

        for (const deal of activeDeals) {
            const amountDiff = Math.abs(deal.amount - amount);
            const amountMatches = amountDiff <= tolerance;

            let nameScore = 0;
            if (name && deal.contactName) {
                const contactNameLower = deal.contactName.toLowerCase();
                const searchParts = nameLower.split(/\s+/);

                searchParts.forEach(part => {
                    if (contactNameLower.includes(part)) {
                        nameScore += 1;
                    }
                });

                // Normalize score
                nameScore = searchParts.length > 0 ? nameScore / searchParts.length : 0;
            }

            if (amountMatches || nameScore > 0) {
                matches.push({
                    ...deal,
                    matchScore: {
                        amount: amountMatches ? 1 : 0,
                        name: nameScore,
                        total: (amountMatches ? 0.6 : 0) + (nameScore * 0.4), // Weight: 60% amount, 40% name
                        amountDiff: amountDiff
                    }
                });
            }
        }

        // Sort by total match score (descending)
        matches.sort((a, b) => b.matchScore.total - a.matchScore.total);

        return matches;
    }
}

// Export
module.exports = HubSpotClient;

// CLI usage
if (require.main === module) {
    const client = new HubSpotClient();

    const command = process.argv[2] || 'help';

    if (command === 'pipelines') {
        // Discover pipelines
        client.getPipelines()
            .then(() => {
                process.exit(0);
            })
            .catch(error => {
                console.error('Failed:', error.message);
                process.exit(1);
            });

    } else if (command === 'test') {
        // Test fetching deals (requires pipeline IDs to be configured)
        const b2bId = process.argv[3];
        const b2cId = process.argv[4];

        if (!b2bId || !b2cId) {
            console.error('Usage: node hubspot-client.js test <B2B_PIPELINE_ID> <B2C_PIPELINE_ID>');
            process.exit(1);
        }

        client.setPipelines(b2bId, b2cId);

        client.getActiveDeals()
            .then(deals => {
                console.log(`\n📋 Sample deals (first 5):\n`);
                deals.slice(0, 5).forEach(deal => {
                    console.log(`Deal: ${deal.dealName}`);
                    console.log(`  Amount: €${deal.amount}`);
                    console.log(`  Contact: ${deal.contactName || 'N/A'}`);
                    console.log(`  Pipeline: ${deal.pipelineType}`);
                    console.log(`  Stage: ${deal.dealStage}`);
                    console.log('');
                });
                process.exit(0);
            })
            .catch(error => {
                console.error('Failed:', error.message);
                process.exit(1);
            });

    } else {
        console.log('HubSpot API Client');
        console.log('='.repeat(60));
        console.log('Usage:');
        console.log('  node hubspot-client.js pipelines              # Discover pipeline IDs');
        console.log('  node hubspot-client.js test <B2B_ID> <B2C_ID> # Test fetching deals');
        console.log('');
        console.log('Examples:');
        console.log('  node hubspot-client.js pipelines');
        console.log('  node hubspot-client.js test 12345 67890');
        process.exit(0);
    }
}
