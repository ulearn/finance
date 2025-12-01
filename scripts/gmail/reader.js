const GmailClient = require('./client');

/**
 * Gmail Reader for TransferMate Batch Payment Notifications
 *
 * Reads emails from accounts@ulearnschool.com for:
 * - TransferMate batch payment notifications (payout notifications)
 * - TransferMate escrow notifications (payment held)
 *
 * Uses Gmail OAuth tokens from gmail-tokens.json
 * Setup: Run `node scripts/gmail/setup.js` first
 */

class GmailReader {
    constructor() {
        this.gmailClient = new GmailClient();
        this.gmail = null;
    }

    async initialize() {
        this.gmail = await this.gmailClient.getGmailAPI();
        return this;
    }

    /**
     * Search for TransferMate emails
     * @param {Object} options - Search options
     * @param {string} options.after - Date in YYYY/MM/DD format
     * @param {string} options.before - Date in YYYY/MM/DD format
     * @param {boolean} options.unreadOnly - Only unread emails
     * @param {string} options.subject - Optional subject filter
     * @returns {Array} Array of email objects
     */
    async searchTransferMateBatchEmails(options = {}) {
        if (!this.gmail) await this.initialize();

        // Build Gmail search query - search for ANY @transfermate.com email
        const queryParts = [
            'from:@transfermate.com'
        ];

        // Add subject filter if provided
        if (options.subject) {
            queryParts.push(`subject:"${options.subject}"`);
        }

        if (options.after) queryParts.push(`after:${options.after}`);
        if (options.before) queryParts.push(`before:${options.before}`);
        if (options.unreadOnly) queryParts.push('is:unread');

        const query = queryParts.join(' ');

        console.log(`🔍 Searching Gmail: ${query}`);

        try {
            // List message IDs
            const response = await this.gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults: 100
            });

            if (!response.data.messages || response.data.messages.length === 0) {
                console.log('📭 No TransferMate batch emails found');
                return [];
            }

            console.log(`📬 Found ${response.data.messages.length} email(s)`);

            // Fetch full email content for each message
            const emails = [];
            for (const message of response.data.messages) {
                const email = await this.getEmailContent(message.id);
                if (email) emails.push(email);
            }

            return emails;

        } catch (error) {
            console.error('❌ Error searching Gmail:', error.message);
            throw error;
        }
    }

    /**
     * Get full email content by message ID
     */
    async getEmailContent(messageId) {
        try {
            const response = await this.gmail.users.messages.get({
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

            // Get email body (try plain text first, then HTML)
            let body = '';
            let htmlBody = '';

            const extractParts = (parts) => {
                for (const part of parts) {
                    if (part.mimeType === 'text/plain' && part.body.data) {
                        body += Buffer.from(part.body.data, 'base64').toString('utf-8');
                    } else if (part.mimeType === 'text/html' && part.body.data) {
                        htmlBody += Buffer.from(part.body.data, 'base64').toString('utf-8');
                    } else if (part.parts) {
                        // Recursive for nested parts
                        extractParts(part.parts);
                    }
                }
            };

            if (message.payload.parts) {
                // Multipart email
                extractParts(message.payload.parts);
            } else if (message.payload.body.data) {
                // Single part email
                if (message.payload.mimeType === 'text/html') {
                    htmlBody = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
                } else {
                    body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
                }
            }

            // If no plain text, strip HTML tags from HTML body
            if (!body && htmlBody) {
                body = htmlBody
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'")
                    .replace(/\s+/g, ' ')
                    .trim();
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
            console.error(`❌ Error getting email ${messageId}:`, error.message);
            return null;
        }
    }

    /**
     * Parse TransferMate batch email body to extract payment data
     *
     * Example email format:
     * Pmnt ID: 690665
     * Company Name: ULearn Ltd.
     * Reference: Moana Johanna Frauchiger FIDELO-XML-SERVICE30748
     * Paid Amnt(PC): 554
     * Pmnt Curr: EUR
     *
     * @param {string} emailBody - Raw email body text
     * @returns {Array} Array of payment objects
     */
    parseTransferMateBatchEmail(emailBody) {
        const payments = [];
        const lines = emailBody.split('\n');
        let currentPayment = {};

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Look for payment ID (6-7 digit number)
            if (line.match(/^\d{6,7}$/)) {
                // Save previous payment if exists
                if (currentPayment.pmntId) {
                    payments.push({ ...currentPayment });
                }
                currentPayment = { pmntId: line };
            }

            // Extract reference (contains student name + Fidelo ref)
            if (currentPayment.pmntId && line.includes('FIDELO-XML-SERVICE')) {
                currentPayment.reference = line;

                // Extract Fidelo reference number from string like:
                // "Moana Johanna Frauchiger FIDELO-XML-SERVICE30748"
                const match = line.match(/FIDELO-XML-SERVICE(\d+)/);
                if (match) {
                    currentPayment.fideloRef = match[1];
                }
            }

            // Extract amount (look for numeric value)
            if (currentPayment.pmntId && !isNaN(parseFloat(line))) {
                const amount = parseFloat(line);
                if (amount > 0 && amount < 100000) { // Reasonable payment range
                    currentPayment.amount = amount;
                }
            }

            // Extract currency
            if (line === 'EUR' || line === 'USD' || line === 'GBP' || line === 'CNY') {
                currentPayment.currency = line;
            }
        }

        // Save last payment
        if (currentPayment.pmntId) {
            payments.push(currentPayment);
        }

        return payments;
    }

    /**
     * Mark email as read
     */
    async markAsRead(messageId) {
        try {
            await this.gmail.users.messages.modify({
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
            await this.gmail.users.messages.modify({
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

module.exports = GmailReader;
