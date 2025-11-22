// Google API Client
// Location: /home/hub/public_html/fins/scripts/google/google-client.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class GoogleAPIClient {
    constructor() {
        this.clientId = process.env.GOOGLE_CLIENT_ID;
        this.clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        this.redirectUri = process.env.GOOGLE_REDIRECT_URI;
        this.tokenFile = path.join(__dirname, 'tokens.json');

        // Initialize OAuth2 client
        this.oauth2Client = new google.auth.OAuth2(
            this.clientId,
            this.clientSecret,
            this.redirectUri
        );

        // Set scopes
        this.scopes = [
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/sites.readonly',
            'https://www.googleapis.com/auth/youtube.readonly'
        ];

        this.tokens = null;
    }

    /**
     * Load tokens from file
     */
    async loadTokens() {
        try {
            const data = await fs.readFile(this.tokenFile, 'utf8');
            const tokens = JSON.parse(data);

            if (!tokens.access_token || !tokens.refresh_token) {
                console.log('Invalid tokens found, need to authenticate');
                return false;
            }

            this.tokens = tokens;
            this.oauth2Client.setCredentials(tokens);

            return true;
        } catch (error) {
            console.log('No tokens found, need to authenticate');
            return false;
        }
    }

    /**
     * Save tokens to file
     */
    async saveTokens(tokens) {
        if (!tokens || !tokens.access_token) {
            console.error('Attempted to save invalid tokens');
            return;
        }

        this.tokens = tokens;
        this.oauth2Client.setCredentials(tokens);

        const tokensToSave = {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            scope: tokens.scope,
            token_type: tokens.token_type,
            expiry_date: tokens.expiry_date,
            updated_at: new Date().toISOString()
        };

        await fs.writeFile(this.tokenFile, JSON.stringify(tokensToSave, null, 2));
        console.log('✓ Tokens saved successfully');
    }

    /**
     * Generate authorization URL for OAuth flow
     */
    getAuthorizationUrl() {
        const authUrl = this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: this.scopes,
            prompt: 'consent' // Force to get refresh token
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
            console.log('✓ Successfully authenticated with Google');
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
            console.log('✓ Token refreshed successfully');
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
                throw new Error('No valid tokens available. Please complete OAuth authorization first.');
            }
        }

        // Check if token is expired or will expire soon (within 5 minutes)
        if (this.tokens.expiry_date) {
            const expiryTime = new Date(this.tokens.expiry_date).getTime();
            const now = Date.now();
            const fiveMinutes = 5 * 60 * 1000;

            if (expiryTime - now < fiveMinutes) {
                console.log('Token expired or expiring soon, refreshing...');
                await this.refreshAccessToken();
            }
        }
    }

    /**
     * Get Drive API instance
     */
    async getDriveAPI() {
        await this.ensureValidToken();
        return google.drive({ version: 'v3', auth: this.oauth2Client });
    }

    /**
     * Get YouTube API instance
     */
    async getYouTubeAPI() {
        await this.ensureValidToken();
        return google.youtube({ version: 'v3', auth: this.oauth2Client });
    }

    /**
     * Get Sites API instance
     */
    async getSitesAPI() {
        await this.ensureValidToken();
        return google.siteVerification({ version: 'v1', auth: this.oauth2Client });
    }

    // ==================== DRIVE API METHODS ====================

    /**
     * List files in Google Drive
     * @param {Object} options - Query options (q, pageSize, orderBy, etc.)
     */
    async listDriveFiles(options = {}) {
        try {
            const drive = await this.getDriveAPI();
            const response = await drive.files.list({
                pageSize: options.pageSize || 100,
                fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink)',
                q: options.q || null,
                orderBy: options.orderBy || 'modifiedTime desc',
                pageToken: options.pageToken || null
            });
            return response.data;
        } catch (error) {
            console.error('Error listing Drive files:', error.message);
            throw error;
        }
    }

    /**
     * Get file content from Google Drive
     * @param {string} fileId - Drive file ID
     */
    async getFileContent(fileId) {
        try {
            const drive = await this.getDriveAPI();
            const response = await drive.files.get({
                fileId: fileId,
                alt: 'media'
            });
            return response.data;
        } catch (error) {
            console.error('Error getting file content:', error.message);
            throw error;
        }
    }

    /**
     * Export Google Docs/Sheets/Slides to specific format
     * @param {string} fileId - Drive file ID
     * @param {string} mimeType - Export mime type (e.g., 'text/html', 'text/plain')
     */
    async exportFile(fileId, mimeType = 'text/html') {
        try {
            const drive = await this.getDriveAPI();
            const response = await drive.files.export({
                fileId: fileId,
                mimeType: mimeType
            });
            return response.data;
        } catch (error) {
            console.error('Error exporting file:', error.message);
            throw error;
        }
    }

    /**
     * Search for Google Sites files
     */
    async searchGoogleSites(siteName = null) {
        try {
            let query = "mimeType='application/vnd.google-apps.site'";
            if (siteName) {
                query += ` and name contains '${siteName}'`;
            }

            const drive = await this.getDriveAPI();
            const response = await drive.files.list({
                q: query,
                fields: 'files(id, name, webViewLink, modifiedTime)',
                orderBy: 'modifiedTime desc'
            });
            return response.data.files || [];
        } catch (error) {
            console.error('Error searching Google Sites:', error.message);
            throw error;
        }
    }

    // ==================== YOUTUBE API METHODS ====================

    /**
     * List videos from a channel or playlist
     * @param {Object} options - channelId or playlistId
     */
    async listYouTubeVideos(options = {}) {
        try {
            const youtube = await this.getYouTubeAPI();

            if (options.playlistId) {
                const response = await youtube.playlistItems.list({
                    part: 'snippet,contentDetails',
                    playlistId: options.playlistId,
                    maxResults: options.maxResults || 50
                });
                return response.data.items;
            } else if (options.channelId) {
                const response = await youtube.search.list({
                    part: 'snippet',
                    channelId: options.channelId,
                    type: 'video',
                    maxResults: options.maxResults || 50
                });
                return response.data.items;
            } else {
                throw new Error('Either channelId or playlistId is required');
            }
        } catch (error) {
            console.error('Error listing YouTube videos:', error.message);
            throw error;
        }
    }

    /**
     * Get video captions/transcripts
     * @param {string} videoId - YouTube video ID
     */
    async getVideoCaptions(videoId) {
        try {
            const youtube = await this.getYouTubeAPI();
            const response = await youtube.captions.list({
                part: 'snippet',
                videoId: videoId
            });
            return response.data.items || [];
        } catch (error) {
            console.error('Error getting captions:', error.message);
            throw error;
        }
    }

    // ==================== GOOGLE SITES API METHODS ====================

    /**
     * List pages from a Google Site
     * @param {string} siteId - The Drive ID of the Google Site
     * @param {Object} options - Optional parameters (pageSize, pageToken, parent)
     */
    async listSitePages(siteId, options = {}) {
        try {
            // Note: Google Sites API v1 is limited. We'll use a workaround via Drive API
            // to fetch site structure. The actual Sites API requires different approach.
            console.log(`Listing pages for site: ${siteId}`);

            // For now, return site info - will need to implement proper Sites API
            const drive = await this.getDriveAPI();
            const site = await drive.files.get({
                fileId: siteId,
                fields: 'id, name, mimeType, webViewLink, modifiedTime'
            });

            return {
                site: site.data,
                note: 'Google Sites API for page listing requires additional implementation'
            };
        } catch (error) {
            console.error('Error listing site pages:', error.message);
            throw error;
        }
    }
}

module.exports = GoogleAPIClient;
