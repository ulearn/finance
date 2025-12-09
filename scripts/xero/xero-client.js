// Xero API Client
// Location: /home/hub/public_html/fins/scripts/xero/xero-client.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { XeroClient } = require('xero-node');
const fs = require('fs').promises;
const path = require('path');

class XeroAPIClient {
    constructor() {
        this.clientId = process.env.XERO_CLIENT_ID;
        this.clientSecret = process.env.XERO_CLIENT_SECRET;
        this.redirectUri = process.env.XERO_REDIRECT_URI;
        this.tokenFile = path.join(__dirname, 'tokens.json');

        // Initialize Xero client
        this.xero = new XeroClient({
            clientId: this.clientId,
            clientSecret: this.clientSecret,
            redirectUris: [this.redirectUri],
            scopes: 'openid profile email accounting.settings accounting.transactions accounting.contacts accounting.attachments accounting.reports.read accounting.journals.read files files.read offline_access'.split(' '),
            httpTimeout: 3000,
            clockTolerance: 10
        });

        this.tokenSet = null;
        this.tenantId = null;
    }

    /**
     * Load tokens from file
     */
    async loadTokens() {
        try {
            const data = await fs.readFile(this.tokenFile, 'utf8');
            const tokens = JSON.parse(data);

            // Validate tokens exist
            if (!tokens.access_token || !tokens.refresh_token) {
                console.log('Invalid tokens found, need to authenticate');
                return false;
            }

            this.tokenSet = tokens;
            this.tenantId = tokens.tenantId;

            // Set token set on Xero client
            await this.xero.setTokenSet(this.tokenSet);

            return true;
        } catch (error) {
            console.log('No tokens found, need to authenticate');
            return false;
        }
    }

    /**
     * Save tokens to file
     */
    async saveTokens(tokenSet, tenantId = null) {
        if (!tokenSet || !tokenSet.access_token || !tokenSet.refresh_token) {
            console.error('Attempted to save invalid token set');
            return;
        }

        this.tokenSet = tokenSet;
        if (tenantId) {
            this.tenantId = tenantId;
        }

        const tokensToSave = {
            access_token: tokenSet.access_token,
            refresh_token: tokenSet.refresh_token,
            id_token: tokenSet.id_token,
            expires_at: tokenSet.expires_at,
            token_type: tokenSet.token_type,
            scope: tokenSet.scope,
            tenantId: this.tenantId,
            updated_at: new Date().toISOString()
        };

        await fs.writeFile(this.tokenFile, JSON.stringify(tokensToSave, null, 2));
        console.log('✓ Tokens saved successfully');
    }

    /**
     * Generate authorization URL for OAuth flow
     */
    async getAuthorizationUrl() {
        try {
            const consentUrl = await this.xero.buildConsentUrl();
            return consentUrl;
        } catch (error) {
            console.error('Error building consent URL:', error.message);
            throw error;
        }
    }

    /**
     * Exchange authorization code for tokens
     */
    async exchangeCodeForTokens(callbackUrl) {
        try {
            const tokenSet = await this.xero.apiCallback(callbackUrl);

            // Get tenant (organization) info
            await this.xero.updateTenants();
            const tenants = this.xero.tenants;

            if (!tenants || tenants.length === 0) {
                throw new Error('No tenants found for this connection');
            }

            // Use first tenant by default (modify if multi-org support needed)
            const tenantId = tenants[0].tenantId;
            console.log(`✓ Connected to organization: ${tenants[0].tenantName}`);

            await this.saveTokens(tokenSet, tenantId);
            return true;
        } catch (error) {
            console.error('Error exchanging code for tokens:', error.message);
            return false;
        }
    }

    /**
     * Refresh access token using refresh token
     */
    async refreshAccessToken() {
        if (!this.tokenSet || !this.tokenSet.refresh_token) {
            console.error('No refresh token available');
            return false;
        }

        try {
            // Check if token is expired
            const tokenSetObj = this.xero.readTokenSet();

            if (tokenSetObj.expired()) {
                console.log('Token expired, refreshing...');

                // Use refreshWithRefreshToken instead of refreshToken (which requires openIdClient)
                const newTokenSet = await this.xero.refreshWithRefreshToken(
                    this.clientId,
                    this.clientSecret,
                    this.tokenSet.refresh_token
                );

                await this.saveTokens(newTokenSet, this.tenantId);
                console.log('✓ Token refreshed successfully');
                return true;
            }

            return true; // Token not expired yet
        } catch (error) {
            console.error('Error refreshing token:', error.message);
            return false;
        }
    }

    /**
     * Ensure valid token before making API calls
     */
    async ensureValidToken() {
        // Load tokens if not already loaded
        if (!this.tokenSet) {
            const loaded = await this.loadTokens();
            if (!loaded) {
                throw new Error('No valid tokens available. Please complete OAuth authorization first.');
            }
        }

        // Refresh if needed
        await this.refreshAccessToken();
    }

    /**
     * Make authenticated API call with automatic retry on 401
     */
    async makeApiCall(apiMethod, ...args) {
        try {
            await this.ensureValidToken();
            return await apiMethod(...args);
        } catch (error) {
            // If 401 Unauthorized, try refreshing token ONCE and retry
            if (error.response?.statusCode === 401) {
                console.log('API call unauthorized, refreshing token...');
                const refreshed = await this.refreshAccessToken();
                if (refreshed) {
                    try {
                        return await apiMethod(...args);
                    } catch (retryError) {
                        console.error('Retry failed:', retryError.message);
                        throw retryError;
                    }
                }
            }
            throw error;
        }
    }

    // ==================== ACCOUNTING API METHODS ====================

    /**
     * Get bank transactions
     * @param {Object} options - Filter options (ifModifiedSince, where, order, page, etc.)
     * @returns {Promise<Object>} - Bank transactions
     */
    async getBankTransactions(options = {}) {
        const method = async () => {
            const response = await this.xero.accountingApi.getBankTransactions(
                this.tenantId,
                options.ifModifiedSince,
                options.where,
                options.order,
                options.page,
                options.unitdp
            );
            return response.body;
        };
        return await this.makeApiCall(method);
    }

    /**
     * Get invoices
     * @param {Object} options - Filter options
     * @returns {Promise<Object>} - Invoices
     */
    async getInvoices(options = {}) {
        const method = async () => {
            const response = await this.xero.accountingApi.getInvoices(
                this.tenantId,
                options.ifModifiedSince,
                options.where,
                options.order,
                options.iDs,
                options.invoiceNumbers,
                options.contactIDs,
                options.statuses,
                options.page,
                options.includeArchived,
                options.createdByMyApp,
                options.unitdp
            );
            return response.body;
        };
        return await this.makeApiCall(method);
    }

    /**
     * Get payments
     * @param {Object} options - Filter options
     * @returns {Promise<Object>} - Payments
     */
    async getPayments(options = {}) {
        const method = async () => {
            const response = await this.xero.accountingApi.getPayments(
                this.tenantId,
                options.ifModifiedSince,
                options.where,
                options.order,
                options.page
            );
            return response.body;
        };
        return await this.makeApiCall(method);
    }

    /**
     * Get all accounts (Chart of Accounts)
     * @param {Object} options - Filter options
     * @returns {Promise<Object>} - All accounts
     */
    async getAccounts(options = {}) {
        const method = async () => {
            const response = await this.xero.accountingApi.getAccounts(
                this.tenantId,
                options.ifModifiedSince,
                options.where,
                options.order
            );
            return response.body;
        };
        return await this.makeApiCall(method);
    }

    /**
     * Get bank accounts
     * @param {Object} options - Filter options
     * @returns {Promise<Object>} - Accounts (filtered to bank accounts)
     */
    async getBankAccounts(options = {}) {
        const method = async () => {
            const where = options.where || 'Type=="BANK"';
            const response = await this.xero.accountingApi.getAccounts(
                this.tenantId,
                options.ifModifiedSince,
                where,
                options.order
            );
            return response.body;
        };
        return await this.makeApiCall(method);
    }

    /**
     * Get contacts
     * @param {Object} options - Filter options
     * @returns {Promise<Object>} - Contacts
     */
    async getContacts(options = {}) {
        const method = async () => {
            const response = await this.xero.accountingApi.getContacts(
                this.tenantId,
                options.ifModifiedSince,
                options.where,
                options.order,
                options.iDs,
                options.page,
                options.includeArchived
            );
            return response.body;
        };
        return await this.makeApiCall(method);
    }

    /**
     * Get organization info
     */
    async getOrganizationInfo() {
        try {
            await this.ensureValidToken();
            await this.xero.updateTenants();
            return this.xero.tenants;
        } catch (error) {
            console.error('Error getting organization info:', error.message);
            throw error;
        }
    }

    /**
     * Get a specific report by name with date parameters
     * @param {string} reportName - Report name (ProfitAndLoss, BalanceSheet, etc.)
     * @param {Object} params - Report parameters (fromDate, toDate, periods, timeframe, etc.)
     * @returns {Promise<Object>} - Report data
     */
    async getReport(reportName, params = {}) {
        const method = async () => {
            let response;

            switch(reportName) {
                case 'ProfitAndLoss':
                    response = await this.xero.accountingApi.getReportProfitAndLoss(
                        this.tenantId,
                        params.fromDate,
                        params.toDate,
                        params.periods,
                        params.timeframe,
                        params.trackingCategoryID,
                        params.trackingCategoryID2,
                        params.trackingOptionID,
                        params.trackingOptionID2,
                        params.standardLayout,
                        params.paymentsOnly
                    );
                    break;

                case 'BalanceSheet':
                    response = await this.xero.accountingApi.getReportBalanceSheet(
                        this.tenantId,
                        params.date,
                        params.periods,
                        params.timeframe,
                        params.trackingOptionID,
                        params.trackingOptionID2,
                        params.standardLayout,
                        params.paymentsOnly
                    );
                    break;

                case 'BankSummary':
                    response = await this.xero.accountingApi.getReportBankSummary(
                        this.tenantId,
                        params.fromDate,
                        params.toDate
                    );
                    break;

                default:
                    // Fallback to generic report by ID
                    response = await this.xero.accountingApi.getReportFromId(
                        this.tenantId,
                        reportName
                    );
            }

            return response.body;
        };
        return await this.makeApiCall(method);
    }

    /**
     * Get available reports list
     */
    async getReports() {
        const method = async () => {
            const response = await this.xero.accountingApi.getReportsList(
                this.tenantId
            );
            return response.body;
        };
        return await this.makeApiCall(method);
    }

    /**
     * Get journals (GL entries)
     * @param {Object} options - Filter options
     * @returns {Promise<Object>} - Journals
     */
    async getJournals(options = {}) {
        const method = async () => {
            const response = await this.xero.accountingApi.getJournals(
                this.tenantId,
                options.ifModifiedSince,
                options.offset,
                options.paymentsOnly
            );
            return response.body;
        };
        return await this.makeApiCall(method);
    }

    /**
     * Get folders from Xero Files
     */
    async getFolders() {
        return this.makeApiCall(
            this.xero.filesApi.getFolders.bind(this.xero.filesApi),
            this.tenantId
        );
    }

    /**
     * Get files from a specific folder
     * @param {string} folderId - Folder ID (optional, gets all files if not specified)
     */
    async getFiles(folderId = null) {
        const params = folderId ? { folderId } : {};
        return this.makeApiCall(
            this.xero.filesApi.getFiles.bind(this.xero.filesApi),
            this.tenantId,
            null, // pageSize
            null, // sort
            null, // direction
            params.folderId
        );
    }

    /**
     * Get file content
     * @param {string} fileId - File ID
     */
    async getFileContent(fileId) {
        return this.makeApiCall(
            this.xero.filesApi.getFileContent.bind(this.xero.filesApi),
            this.tenantId,
            fileId
        );
    }
}

module.exports = XeroAPIClient;
