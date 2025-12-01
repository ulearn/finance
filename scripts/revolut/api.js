/**
 * Revolut Merchant API Integration - API Client
 * Location: /home/hub/public_html/fins/scripts/revolut/api.js
 *
 * Purpose: Fetch Revolut Merchant transactions for payment matching
 *
 * Business Context:
 * - Revolut Merchant used for online payment links & card payments
 * - Better transaction details than BOI
 * - Funds transferred from Merchant → Euro account → BOI
 *
 * API Docs: https://developer.revolut.com/docs/merchant-api
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

class RevolutIntegration {
    constructor() {
        this.apiKey = process.env.REVOLUT_API_KEY;
        this.environment = process.env.REVOLUT_ENVIRONMENT || 'production';

        // API endpoints
        if (this.environment === 'sandbox') {
            this.apiBase = 'https://sandbox-merchant.revolut.com/api/1.0';
        } else {
            this.apiBase = 'https://merchant.revolut.com/api/1.0';
        }

        if (!this.apiKey) {
            throw new Error('Revolut API key not found in environment variables (REVOLUT_API_KEY)');
        }
    }

    /**
     * Make authenticated request to Revolut API
     */
    async request(endpoint, params = {}) {
        try {
            const response = await axios.get(`${this.apiBase}${endpoint}`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Accept': 'application/json'
                },
                params
            });

            return response.data;

        } catch (error) {
            console.error(`Revolut API Error (${endpoint}):`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get orders (transactions) for a date range
     *
     * @param {string} startDate - ISO date string (YYYY-MM-DD)
     * @param {string} endDate - ISO date string (YYYY-MM-DD)
     * @returns {Promise<Array>} Array of order objects
     */
    async getOrders(startDate, endDate) {
        try {
            // Revolut uses ISO 8601 timestamps
            const fromDate = new Date(startDate).toISOString();
            const toDate = new Date(endDate + 'T23:59:59').toISOString();

            console.log(`Fetching Revolut orders from ${startDate} to ${endDate}...`);

            const params = {
                from_created_date: fromDate,
                to_created_date: toDate,
                limit: 250 // Max per request
            };

            const orders = [];
            let hasMore = true;
            let fromId = null;

            while (hasMore) {
                if (fromId) {
                    params.from_id = fromId;
                }

                const result = await this.request('/orders', params);

                if (Array.isArray(result)) {
                    orders.push(...result);

                    hasMore = result.length === params.limit;
                    if (hasMore && result.length > 0) {
                        fromId = result[result.length - 1].id;
                    }
                } else {
                    // Handle different response formats
                    console.warn('Unexpected Revolut API response format');
                    break;
                }
            }

            console.log(`✅ Found ${orders.length} Revolut order(s)`);
            return orders;

        } catch (error) {
            console.error('Error fetching Revolut orders:', error.message);
            throw error;
        }
    }

    /**
     * Get specific order details by ID
     *
     * @param {string} orderId - Revolut order ID
     * @returns {Promise<Object>} Order object
     */
    async getOrder(orderId) {
        try {
            const order = await this.request(`/orders/${orderId}`);
            return order;

        } catch (error) {
            console.error(`Error fetching order ${orderId}:`, error.message);
            return null;
        }
    }

    /**
     * Get customer details from order
     *
     * @param {Object} order - Revolut order object
     * @returns {Object} Customer info
     */
    extractCustomerInfo(order) {
        const customer = order.customer_details || {};
        const shipping = order.shipping_address || {};

        return {
            name: customer.name || shipping.recipient || 'Unknown',
            email: customer.email || order.email || null,
            phone: customer.phone || order.phone || null
        };
    }

    /**
     * Convert Revolut order to standard transaction format
     *
     * @param {Object} order - Revolut order object
     * @returns {Object} Standardized transaction
     */
    formatTransaction(order) {
        const customer = this.extractCustomerInfo(order);

        // Revolut amounts are in smallest currency unit (cents/pence)
        const amount = order.order_amount?.value
            ? order.order_amount.value / 100
            : order.total_amount / 100;

        const currency = order.order_amount?.currency || order.currency || 'EUR';

        // Get settlement info if available
        const settlementAmount = order.settled_amount
            ? order.settled_amount / 100
            : null;

        const fee = settlementAmount ? amount - settlementAmount : 0;

        return {
            id: order.id,
            source: 'revolut',
            date: order.created_at ? order.created_at.split('T')[0] : null,
            datetime: order.created_at ? new Date(order.created_at) : null,
            description: `Revolut: ${customer.name}`,
            amount,
            netAmount: settlementAmount || amount,
            fee,
            currency: currency.toUpperCase(),
            status: order.state,
            customerName: customer.name,
            customerEmail: customer.email,
            customerPhone: customer.phone,
            paymentMethod: order.payment_method?.type || 'card',
            reference: order.merchant_order_ext_ref || null,
            metadata: order.metadata || {},
            raw: order
        };
    }

    /**
     * Get all transactions with customer details for date range
     * Returns standardized transaction format
     *
     * @param {string} startDate - ISO date string
     * @param {string} endDate - ISO date string
     * @returns {Promise<Array>} Array of formatted transactions
     */
    async getTransactions(startDate, endDate) {
        try {
            const orders = await this.getOrders(startDate, endDate);

            console.log('Processing Revolut orders...');

            const transactions = orders
                .filter(order => order.state === 'COMPLETED') // Only completed orders
                .map(order => this.formatTransaction(order));

            console.log(`✅ Processed ${transactions.length} Revolut transaction(s)`);
            return transactions;

        } catch (error) {
            console.error('Error getting Revolut transactions:', error.message);
            throw error;
        }
    }

    /**
     * Get account balance
     * Useful for verifying API access
     *
     * @returns {Promise<Object>} Balance info
     */
    async getBalance() {
        try {
            // Note: This endpoint may not exist in all Revolut plans
            // Try to get merchant info instead
            const info = await this.request('/merchant');
            return info;

        } catch (error) {
            console.error('Error fetching balance:', error.message);
            return null;
        }
    }

    /**
     * Test API connection
     *
     * @returns {Promise<boolean>} Connection status
     */
    async testConnection() {
        try {
            console.log('Testing Revolut API connection...');

            // Try to fetch recent orders
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            await this.getOrders(
                yesterday.toISOString().split('T')[0],
                today.toISOString().split('T')[0]
            );

            console.log('✅ Revolut API connection successful');
            return true;

        } catch (error) {
            console.error('❌ Revolut API connection failed:', error.message);
            return false;
        }
    }
}

module.exports = RevolutIntegration;
