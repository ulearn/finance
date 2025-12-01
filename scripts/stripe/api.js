/**
 * Stripe Payment Integration - API Client
 * Location: /home/hub/public_html/fins/scripts/stripe/api.js
 *
 * Purpose: Fetch Stripe transactions and match to Fidelo bookings
 *
 * Business Context:
 * - Stripe charges appear as batch deposits in BOI account (net of fees)
 * - Need to match individual Stripe charges to students for Fidelo payment assignment
 * - Customer info in Stripe helps match to Fidelo bookings
 *
 * API Docs: https://stripe.com/docs/api
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

class StripeIntegration {
    constructor(apiKey = null) {
        // Support dual Stripe accounts
        // If apiKey is provided, use it
        // Otherwise use STRIPE_SECRET (backward compatibility)
        this.apiKey = apiKey || process.env.STRIPE_SECRET || process.env.STRIPE_API_KEY;
        this.apiBase = 'https://api.stripe.com/v1';

        if (!this.apiKey) {
            throw new Error('Stripe API key not found in environment variables (STRIPE_SECRET or STRIPE_API_KEY)');
        }

        // Store reference to all available API keys for multi-account support
        this.allApiKeys = [];
        if (process.env.STRIPE_SECRET_INFO) {
            this.allApiKeys.push({ name: 'info', key: process.env.STRIPE_SECRET_INFO });
        }
        if (process.env.STRIPE_SECRET_NEIL) {
            this.allApiKeys.push({ name: 'neil', key: process.env.STRIPE_SECRET_NEIL });
        }
    }

    /**
     * Make authenticated request to Stripe API
     */
    async request(endpoint, params = {}) {
        try {
            const response = await axios.get(`${this.apiBase}${endpoint}`, {
                auth: {
                    username: this.apiKey,
                    password: '' // Stripe uses API key as username, password blank
                },
                params
            });

            return response.data;

        } catch (error) {
            console.error(`Stripe API Error (${endpoint}):`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get charges (payments) for a date range
     *
     * @param {string} startDate - ISO date string (YYYY-MM-DD)
     * @param {string} endDate - ISO date string (YYYY-MM-DD)
     * @param {number} limit - Max results per page (default 100)
     * @returns {Promise<Array>} Array of charge objects
     */
    async getCharges(startDate, endDate, limit = 100) {
        try {
            const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
            // Add 1 day to endDate to include the entire end day (endDate 23:59:59)
            const endDatePlusOne = new Date(endDate);
            endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
            const endTimestamp = Math.floor(endDatePlusOne.getTime() / 1000) - 1;

            console.log(`Fetching Stripe charges from ${startDate} to ${endDate}...`);

            const charges = [];
            let hasMore = true;
            let startingAfter = null;

            while (hasMore) {
                const params = {
                    limit,
                    created: {
                        gte: startTimestamp,
                        lte: endTimestamp
                    }
                };

                if (startingAfter) {
                    params.starting_after = startingAfter;
                }

                const result = await this.request('/charges', params);

                charges.push(...result.data);

                hasMore = result.has_more;
                if (hasMore && result.data.length > 0) {
                    startingAfter = result.data[result.data.length - 1].id;
                }
            }

            console.log(`✅ Found ${charges.length} Stripe charge(s)`);
            return charges;

        } catch (error) {
            console.error('Error fetching Stripe charges:', error.message);
            throw error;
        }
    }

    /**
     * Get customer details by ID
     *
     * @param {string} customerId - Stripe customer ID (cus_xxx)
     * @returns {Promise<Object>} Customer object
     */
    async getCustomer(customerId) {
        try {
            if (!customerId) return null;

            const customer = await this.request(`/customers/${customerId}`);
            return customer;

        } catch (error) {
            console.error(`Error fetching customer ${customerId}:`, error.message);
            return null;
        }
    }

    /**
     * Get payouts (batch transfers to bank) for date range
     * Used to match Stripe deposits in BOI account
     *
     * @param {string} startDate - ISO date string
     * @param {string} endDate - ISO date string
     * @returns {Promise<Array>} Array of payout objects
     */
    async getPayouts(startDate, endDate) {
        try {
            const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
            const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

            console.log(`Fetching Stripe payouts from ${startDate} to ${endDate}...`);

            const payouts = [];
            let hasMore = true;
            let startingAfter = null;

            while (hasMore) {
                const params = {
                    limit: 100,
                    created: {
                        gte: startTimestamp,
                        lte: endTimestamp
                    }
                };

                if (startingAfter) {
                    params.starting_after = startingAfter;
                }

                const result = await this.request('/payouts', params);

                payouts.push(...result.data);

                hasMore = result.has_more;
                if (hasMore && result.data.length > 0) {
                    startingAfter = result.data[result.data.length - 1].id;
                }
            }

            console.log(`✅ Found ${payouts.length} Stripe payout(s)`);
            return payouts;

        } catch (error) {
            console.error('Error fetching Stripe payouts:', error.message);
            throw error;
        }
    }

    /**
     * Convert Stripe charge to standard transaction format
     * for payment assignment workflow
     *
     * @param {Object} charge - Stripe charge object
     * @param {Object} customer - Stripe customer object (optional)
     * @returns {Object} Standardized transaction
     */
    formatTransaction(charge, customer = null) {
        // Get customer info
        const customerName = customer?.name ||
                            charge.billing_details?.name ||
                            charge.metadata?.customer_name ||
                            'Unknown';

        const customerEmail = customer?.email ||
                             charge.billing_details?.email ||
                             charge.receipt_email ||
                             null;

        // Calculate amounts (Stripe uses cents)
        const grossAmount = charge.amount / 100;
        const feeAmount = (charge.amount - charge.amount_captured) / 100;
        const netAmount = charge.amount_captured / 100;

        return {
            id: charge.id,
            source: 'stripe',
            date: new Date(charge.created * 1000).toISOString().split('T')[0],
            datetime: new Date(charge.created * 1000),
            description: `Stripe: ${customerName}`,
            amount: grossAmount,
            netAmount,
            fee: feeAmount,
            currency: charge.currency.toUpperCase(),
            status: charge.status,
            customerName,
            customerEmail,
            customerId: charge.customer,
            metadata: charge.metadata,
            raw: charge
        };
    }

    /**
     * Get all charges with customer details for a date range
     * Returns standardized transaction format
     *
     * @param {string} startDate - ISO date string
     * @param {string} endDate - ISO date string
     * @returns {Promise<Array>} Array of formatted transactions
     */
    async getTransactions(startDate, endDate) {
        try {
            const charges = await this.getCharges(startDate, endDate);

            console.log('Enriching charges with customer data...');

            const transactions = [];
            for (const charge of charges) {
                let customer = null;

                if (charge.customer) {
                    customer = await this.getCustomer(charge.customer);
                }

                const transaction = this.formatTransaction(charge, customer);
                transactions.push(transaction);
            }

            console.log(`✅ Processed ${transactions.length} Stripe transaction(s)`);
            return transactions;

        } catch (error) {
            console.error('Error getting Stripe transactions:', error.message);
            throw error;
        }
    }

    /**
     * Get transactions from ALL configured Stripe accounts
     * Queries both info@ and neil@ accounts and merges results
     *
     * @param {string} startDate - ISO date string
     * @param {string} endDate - ISO date string
     * @returns {Promise<Array>} Combined array of formatted transactions from all accounts
     */
    async getTransactionsFromAllAccounts(startDate, endDate) {
        if (this.allApiKeys.length === 0) {
            console.log('⚠️  No additional Stripe accounts configured, using default key');
            return await this.getTransactions(startDate, endDate);
        }

        console.log(`📊 Querying ${this.allApiKeys.length} Stripe account(s)...`);

        const allTransactions = [];

        for (const account of this.allApiKeys) {
            console.log(`\n   💳 Fetching from ${account.name}@ Stripe account...`);

            try {
                // Create a temporary instance with this account's key
                const accountStripe = new StripeIntegration(account.key);
                const transactions = await accountStripe.getTransactions(startDate, endDate);

                // Tag transactions with source account
                transactions.forEach(t => {
                    t.stripeAccount = account.name;
                });

                allTransactions.push(...transactions);
                console.log(`      ✅ Found ${transactions.length} transaction(s) in ${account.name}@ account`);

            } catch (error) {
                console.error(`      ❌ Error fetching from ${account.name}@ account:`, error.message);
            }
        }

        console.log(`\n✅ Total Stripe transactions from all accounts: ${allTransactions.length}`);
        return allTransactions;
    }

    /**
     * Match Stripe payout to BOI bank transaction
     * Helps reconcile batch deposits
     *
     * @param {number} amount - BOI transaction amount
     * @param {string} date - BOI transaction date
     * @param {number} tolerance - Amount tolerance in euros
     * @returns {Promise<Object|null>} Matching payout or null
     */
    async matchPayoutToBankTransaction(amount, date, tolerance = 1) {
        try {
            // Search ±3 days around the bank transaction date
            const searchDate = new Date(date);
            const startDate = new Date(searchDate);
            startDate.setDate(startDate.getDate() - 3);
            const endDate = new Date(searchDate);
            endDate.setDate(endDate.getDate() + 3);

            const payouts = await this.getPayouts(
                startDate.toISOString().split('T')[0],
                endDate.toISOString().split('T')[0]
            );

            // Find payout matching amount (convert from cents)
            const match = payouts.find(payout => {
                const payoutAmount = payout.amount / 100;
                const diff = Math.abs(payoutAmount - amount);
                return diff <= tolerance && payout.status === 'paid';
            });

            if (match) {
                console.log(`✅ Matched Stripe payout ${match.id}: €${match.amount / 100}`);
                return match;
            }

            return null;

        } catch (error) {
            console.error('Error matching Stripe payout:', error.message);
            return null;
        }
    }
}

module.exports = StripeIntegration;
