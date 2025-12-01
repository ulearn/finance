// Gmail API Client for accounts@ulearnschool.com
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class GmailClient {
    constructor() {
        this.clientId = process.env.GOOGLE_CLIENT_ID;
        this.clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        this.redirectUri = process.env.GOOGLE_REDIRECT_URI;
        this.envFile = path.join(__dirname, '../../.env');

        // Initialize OAuth2 client
        this.oauth2Client = new google.auth.OAuth2(
            this.clientId,
            this.clientSecret,
            this.redirectUri
        );

        // Gmail-specific scopes
        this.scopes = [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.modify'
        ];

        this.tokens = null;
    }

    /**
     * Load tokens from environment variables
     */
    async loadTokens() {
        try {
            const accessToken = process.env.GMAIL_ACCESS_TOKEN;
            const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
            const expiryDate = process.env.GMAIL_TOKEN_EXPIRY;

            if (!accessToken || !refreshToken) {
                console.log('No Gmail tokens found in .env, need to authenticate');
                return false;
            }

            this.tokens = {
                access_token: accessToken,
                refresh_token: refreshToken,
                expiry_date: expiryDate ? parseInt(expiryDate) : null,
                scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify',
                token_type: 'Bearer'
            };

            this.oauth2Client.setCredentials(this.tokens);
            return true;
        } catch (error) {
            console.log('Error loading Gmail tokens from .env:', error.message);
            return false;
        }
    }

    /**
     * Save tokens to .env file
     */
    async saveTokens(tokens) {
        if (!tokens || !tokens.access_token) {
            console.error('Attempted to save invalid tokens');
            return;
        }

        this.tokens = tokens;
        this.oauth2Client.setCredentials(tokens);

        try {
            // Read current .env file
            let envContent = '';
            try {
                envContent = await fs.readFile(this.envFile, 'utf8');
            } catch (error) {
                console.log('.env file not found, creating new one');
            }

            // Remove existing Gmail token entries
            envContent = envContent
                .split('\n')
                .filter(line => !line.startsWith('GMAIL_ACCESS_TOKEN=') &&
                               !line.startsWith('GMAIL_REFRESH_TOKEN=') &&
                               !line.startsWith('GMAIL_TOKEN_EXPIRY='))
                .join('\n');

            // Add updated tokens
            const tokenLines = [
                '',
                '# Gmail OAuth Tokens (accounts@ulearnschool.com)',
                `GMAIL_ACCESS_TOKEN=${tokens.access_token}`,
                `GMAIL_REFRESH_TOKEN=${tokens.refresh_token || process.env.GMAIL_REFRESH_TOKEN}`,
                `GMAIL_TOKEN_EXPIRY=${tokens.expiry_date || ''}`
            ];

            envContent = envContent.trim() + '\n' + tokenLines.join('\n') + '\n';

            await fs.writeFile(this.envFile, envContent);

            // Update process.env for current session
            process.env.GMAIL_ACCESS_TOKEN = tokens.access_token;
            if (tokens.refresh_token) {
                process.env.GMAIL_REFRESH_TOKEN = tokens.refresh_token;
            }
            process.env.GMAIL_TOKEN_EXPIRY = tokens.expiry_date || '';

            console.log('✓ Gmail tokens saved to .env successfully');
        } catch (error) {
            console.error('Error saving tokens to .env:', error.message);
        }
    }

    /**
     * Generate authorization URL for OAuth flow
     */
    getAuthorizationUrl() {
        const authUrl = this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: this.scopes,
            prompt: 'consent', // Force to get refresh token
            login_hint: 'accounts@ulearnschool.com' // Suggest this account
        });
        return authUrl;
    }

    /**
     * Exchange authorization code for tokens
     */
    async exchangeCodeForTokens(code) {
        try {
            const { tokens } = await this.oauth2Client.getToken(code);
            await this.saveTokens(tokens);
            console.log('✓ Successfully authenticated Gmail API');
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
        if (!this.tokens || !this.tokens.refresh_token) {
            console.error('No refresh token available');
            return false;
        }

        try {
            this.oauth2Client.setCredentials(this.tokens);
            const { credentials } = await this.oauth2Client.refreshAccessToken();

            // Merge new tokens with existing (preserve refresh_token)
            const updatedTokens = {
                ...this.tokens,
                ...credentials
            };

            await this.saveTokens(updatedTokens);
            console.log('✓ Gmail token refreshed successfully');
            return true;
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
        if (!this.tokens) {
            const loaded = await this.loadTokens();
            if (!loaded) {
                throw new Error('No valid Gmail tokens available. Please complete OAuth authorization first.');
            }
        }

        // Check if token is expired or will expire soon (within 5 minutes)
        if (this.tokens.expiry_date) {
            const expiryTime = new Date(this.tokens.expiry_date).getTime();
            const now = Date.now();
            const fiveMinutes = 5 * 60 * 1000;

            if (expiryTime - now < fiveMinutes) {
                console.log('Gmail token expired or expiring soon, refreshing...');
                await this.refreshAccessToken();
            }
        }
    }

    /**
     * Get Gmail API instance
     */
    async getGmailAPI() {
        await this.ensureValidToken();
        return google.gmail({ version: 'v1', auth: this.oauth2Client });
    }

    // ==================== GMAIL API METHODS ====================

    /**
     * Search for emails matching a query
     * @param {Object} options - Search options
     * @param {string} options.query - Gmail search query
     * @param {number} options.maxResults - Max results to return
     */
    async searchEmails(options = {}) {
        try {
            const gmail = await this.getGmailAPI();
            const response = await gmail.users.messages.list({
                userId: 'me',
                q: options.query || '',
                maxResults: options.maxResults || 100
            });

            return response.data.messages || [];
        } catch (error) {
            console.error('Error searching emails:', error.message);
            throw error;
        }
    }

    /**
     * Get full email content by message ID
     */
    async getEmailContent(messageId) {
        try {
            const gmail = await this.getGmailAPI();
            const response = await gmail.users.messages.get({
                userId: 'me',
                id: messageId,
                format: 'full'
            });

            const message = response.data;
            const headers = message.payload.headers;

            // Extract key headers
            const subject = headers.find(h => h.name === 'Subject')?.value || '';
            const from = headers.find(h => h.name === 'From')?.value || '';
            const date = headers.find(h => h.name === 'Date')?.value || '';

            // Get email body
            let body = '';
            if (message.payload.parts) {
                // Multipart email
                for (const part of message.payload.parts) {
                    if (part.mimeType === 'text/plain' && part.body.data) {
                        body += Buffer.from(part.body.data, 'base64').toString('utf-8');
                    }
                }
            } else if (message.payload.body.data) {
                // Single part email
                body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
            }

            return {
                id: messageId,
                subject,
                from,
                date,
                body,
                snippet: message.snippet
            };

        } catch (error) {
            console.error(`Error getting email ${messageId}:`, error.message);
            return null;
        }
    }

    /**
     * Mark email as read
     */
    async markAsRead(messageId) {
        try {
            const gmail = await this.getGmailAPI();
            await gmail.users.messages.modify({
                userId: 'me',
                id: messageId,
                requestBody: {
                    removeLabelIds: ['UNREAD']
                }
            });
            console.log(`✅ Marked email ${messageId} as read`);
        } catch (error) {
            console.error(`❌ Error marking email as read:`, error.message);
        }
    }

    /**
     * Archive email (remove from inbox)
     */
    async archiveEmail(messageId) {
        try {
            const gmail = await this.getGmailAPI();
            await gmail.users.messages.modify({
                userId: 'me',
                id: messageId,
                requestBody: {
                    removeLabelIds: ['INBOX']
                }
            });
            console.log(`📦 Archived email ${messageId}`);
        } catch (error) {
            console.error(`❌ Error archiving email:`, error.message);
        }
    }
}

module.exports = GmailClient;
