/**
 * Slack Remittance Reader - Extract payment remittances from #financial channel
 * Location: /home/hub/public_html/fins/scripts/slack/remittance-reader.js
 *
 * Purpose: Read payment remittance messages posted by sales team to #financial channel
 *          and extract student ID/name for matching with incoming payments
 *
 * Approach:
 * 1. Read messages from #financial channel history
 * 2. Parse message TEXT to extract student ID and name (e.g., "ID 30737 Padros, Laia")
 * 3. Store in JSON checkpoint file to avoid re-processing
 * 4. Provide search/match functions for payment assignment workflow
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const SlackAttachmentParser = require('./attach-parse');

class SlackRemittanceReader {
    constructor() {
        this.botToken = process.env.SLACK_BOT_TOKEN;
        this.financialChannelId = 'C07CGA4752S'; // #financial channel
        this.checkpointFile = path.join(__dirname, 'remits.json');
        this.remittances = [];
        this.lastMessageId = null;

        // Initialize attachment parser
        try {
            this.attachmentParser = new SlackAttachmentParser();
        } catch (error) {
            console.warn('⚠️  Attachment parser not available:', error.message);
            this.attachmentParser = null;
        }
    }

    /**
     * Load checkpoint from JSON file
     */
    async loadCheckpoint() {
        try {
            const data = await fs.readFile(this.checkpointFile, 'utf8');
            const checkpoint = JSON.parse(data);
            this.remittances = checkpoint.remittances || [];
            this.lastMessageId = checkpoint.lastMessageId || null;
            console.log(`✅ Loaded ${this.remittances.length} remittances from checkpoint`);
            return checkpoint;
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('ℹ️  No checkpoint file found - starting fresh');
                return { remittances: [], lastMessageId: null };
            }
            throw error;
        }
    }

    /**
     * Save checkpoint to JSON file
     */
    async saveCheckpoint() {
        const checkpoint = {
            remittances: this.remittances,
            lastMessageId: this.lastMessageId,
            lastUpdated: new Date().toISOString()
        };

        // Ensure data directory exists
        const dataDir = path.dirname(this.checkpointFile);
        await fs.mkdir(dataDir, { recursive: true });

        await fs.writeFile(this.checkpointFile, JSON.stringify(checkpoint, null, 2));
        console.log(`✅ Saved ${this.remittances.length} remittances to checkpoint`);
    }

    /**
     * Read messages from #financial channel
     * @param {number} limit - Number of messages to fetch (default: 100)
     * @param {boolean} incrementalOnly - Only fetch new messages since last checkpoint
     */
    async readMessages(limit = 100, incrementalOnly = true) {
        if (!this.botToken) {
            throw new Error('SLACK_BOT_TOKEN not configured in .env');
        }

        try {
            const params = {
                channel: this.financialChannelId,
                limit: limit
            };

            // Only fetch messages newer than last checkpoint
            if (incrementalOnly && this.lastMessageId) {
                params.oldest = this.lastMessageId;
            }

            const response = await axios.get('https://slack.com/api/conversations.history', {
                headers: {
                    'Authorization': `Bearer ${this.botToken}`
                },
                params
            });

            if (!response.data.ok) {
                throw new Error(`Slack API error: ${response.data.error}`);
            }

            const messages = response.data.messages || [];
            console.log(`✅ Read ${messages.length} messages from #financial`);

            return messages;
        } catch (error) {
            console.error('❌ Failed to read Slack messages:', error.message);
            throw error;
        }
    }

    /**
     * Parse student ID and name from message text
     * Formats recognized:
     * - "ID 30737 Padros, Laia"
     * - "ID 30737 - Padros, Laia"
     * - "Student ID: 30737 Padros, Laia"
     * - "30737 Padros, Laia"
     *
     * @param {string} text - Message text to parse
     * @returns {object|null} - {studentId, studentName} or null if not found
     */
    parseStudentInfo(text) {
        if (!text) return null;

        // Pattern 1: "ID 30737 Padros, Laia" or "ID 30737 - Padros, Laia"
        let match = text.match(/ID\s*:?\s*(\d{4,6})\s*-?\s*([A-Za-zÀ-ÿ\s,]+)/i);
        if (match) {
            return {
                studentId: match[1].trim(),
                studentName: match[2].trim()
            };
        }

        // Pattern 2: "Student ID: 30737 Padros, Laia"
        match = text.match(/Student\s+ID\s*:?\s*(\d{4,6})\s*-?\s*([A-Za-zÀ-ÿ\s,]+)/i);
        if (match) {
            return {
                studentId: match[1].trim(),
                studentName: match[2].trim()
            };
        }

        // Pattern 3: Just "30737 Padros, Laia" (5-6 digit number followed by name)
        match = text.match(/^(\d{4,6})\s+([A-Za-zÀ-ÿ\s,]+)/);
        if (match) {
            return {
                studentId: match[1].trim(),
                studentName: match[2].trim()
            };
        }

        return null;
    }

    /**
     * Parse payment amount from message text
     * Formats recognized:
     * - "€108"
     * - "108 euros"
     * - "EUR 108"
     * - "108.50€"
     *
     * @param {string} text - Message text to parse
     * @returns {number|null} - Amount or null if not found
     */
    parsePaymentAmount(text) {
        if (!text) return null;

        // Pattern 1: €108 or €108.50
        let match = text.match(/€\s*(\d+(?:[.,]\d{2})?)/);
        if (match) {
            return parseFloat(match[1].replace(',', '.'));
        }

        // Pattern 2: 108 euros or 108.50 euros
        match = text.match(/(\d+(?:[.,]\d{2})?)\s*euros?/i);
        if (match) {
            return parseFloat(match[1].replace(',', '.'));
        }

        // Pattern 3: EUR 108 or EUR 108.50
        match = text.match(/EUR\s*(\d+(?:[.,]\d{2})?)/i);
        if (match) {
            return parseFloat(match[1].replace(',', '.'));
        }

        // Pattern 4: 108€ or 108.50€
        match = text.match(/(\d+(?:[.,]\d{2})?)\s*€/);
        if (match) {
            return parseFloat(match[1].replace(',', '.'));
        }

        return null;
    }

    /**
     * Process messages and extract remittance information
     * @param {Array} messages - Slack messages to process
     * @param {boolean} parseAttachments - Whether to parse file attachments (default: false)
     * @returns {Promise<Array>} - Extracted remittances
     */
    async processMessages(messages, parseAttachments = false) {
        const newRemittances = [];

        for (const message of messages) {
            // Skip bot messages
            if (message.bot_id || message.subtype === 'bot_message') {
                continue;
            }

            const text = message.text || '';
            const studentInfo = this.parseStudentInfo(text);

            // Only process messages that contain student ID
            if (!studentInfo) {
                continue;
            }

            const amount = this.parsePaymentAmount(text);

            const remittance = {
                messageId: message.ts,
                timestamp: new Date(parseFloat(message.ts) * 1000).toISOString(),
                studentId: studentInfo.studentId,
                studentName: studentInfo.studentName,
                amount: amount,
                messageText: text,
                userId: message.user,
                hasFiles: message.files && message.files.length > 0,
                fileCount: message.files ? message.files.length : 0,
                files: message.files ? message.files.map(f => ({
                    name: f.name,
                    mimetype: f.mimetype,
                    size: f.size,
                    url_private: f.url_private
                })) : []
            };

            // Parse attachments if requested and parser is available
            if (parseAttachments && this.attachmentParser && remittance.hasFiles) {
                try {
                    console.log(`   📎 Parsing ${remittance.fileCount} attachment(s) for student ${remittance.studentId}...`);
                    const parsedAttachments = await this.attachmentParser.parseAllAttachments(message.files);

                    // Merge parsed data with text data (attachment takes precedence for amount/date)
                    if (parsedAttachments.length > 0 && parsedAttachments[0].success) {
                        const parsed = parsedAttachments[0].parsed;

                        // Attachment amount takes precedence
                        if (parsed.amount && !remittance.amount) {
                            remittance.amount = parsed.amount;
                            console.log(`   ✅ Amount from attachment: €${parsed.amount}`);
                        } else if (parsed.amount && remittance.amount) {
                            // Validate: check if amounts match
                            const diff = Math.abs(parsed.amount - remittance.amount);
                            if (diff > 1) {
                                console.warn(`   ⚠️  Amount mismatch! Text: €${remittance.amount}, Attachment: €${parsed.amount}`);
                            }
                        }

                        // Add additional parsed data
                        remittance.parsedAttachment = {
                            amount: parsed.amount,
                            date: parsed.date,
                            paymentMethod: parsed.paymentMethod,
                            bookingReference: parsed.bookingReference,
                            transactionId: parsed.transactionId,
                            notes: parsed.notes
                        };
                    }

                    remittance.attachmentsParsed = parsedAttachments;
                } catch (error) {
                    console.error(`   ❌ Failed to parse attachments:`, error.message);
                    remittance.attachmentParseError = error.message;
                }
            }

            newRemittances.push(remittance);

            // Update last message ID for checkpoint
            if (!this.lastMessageId || message.ts > this.lastMessageId) {
                this.lastMessageId = message.ts;
            }
        }

        return newRemittances;
    }

    /**
     * Fetch and process new remittances from Slack
     * @param {number} limit - Number of messages to fetch
     * @param {boolean} incrementalOnly - Only fetch new messages since last checkpoint
     * @param {boolean} parseAttachments - Whether to parse file attachments with OpenAI Vision (default: false)
     */
    async fetchNewRemittances(limit = 100, incrementalOnly = true, parseAttachments = false) {
        console.log('\n📥 Fetching remittances from #financial channel...');

        // Load existing checkpoint
        await this.loadCheckpoint();

        // Read messages
        const messages = await this.readMessages(limit, incrementalOnly);

        // Process messages (now async if parsing attachments)
        const newRemittances = await this.processMessages(messages, parseAttachments);

        if (newRemittances.length > 0) {
            console.log(`\n✅ Found ${newRemittances.length} new remittances:`);
            newRemittances.forEach((r, i) => {
                console.log(`   ${i + 1}. Student ID ${r.studentId} - ${r.studentName}${r.amount ? ` (€${r.amount})` : ''}`);
            });

            // Add to existing remittances (avoiding duplicates)
            for (const newRem of newRemittances) {
                const exists = this.remittances.some(r => r.messageId === newRem.messageId);
                if (!exists) {
                    this.remittances.push(newRem);
                }
            }

            // Save checkpoint
            await this.saveCheckpoint();
        } else {
            console.log('ℹ️  No new remittances found');
        }

        return newRemittances;
    }

    /**
     * Search remittances by student ID
     * @param {string|number} studentId - Student ID to search for
     * @returns {Array} - Matching remittances
     */
    findByStudentId(studentId) {
        const idStr = String(studentId);
        return this.remittances.filter(r => r.studentId === idStr);
    }

    /**
     * Search remittances by student name (fuzzy match)
     * @param {string} studentName - Student name to search for
     * @returns {Array} - Matching remittances
     */
    findByStudentName(studentName) {
        if (!studentName) return [];

        const searchName = studentName.toLowerCase().trim();
        // Don't search for empty strings (would match everything)
        if (searchName === '') return [];

        return this.remittances.filter(r => {
            // If remittance has no name, can't match by name (but don't filter it out entirely)
            if (!r.studentName || r.studentName.trim() === '') return false;

            const remName = r.studentName.toLowerCase();
            return remName.includes(searchName) || searchName.includes(remName);
        });
    }

    /**
     * Search remittances by amount (with tolerance)
     * @param {number} amount - Amount to search for
     * @param {number} tolerance - Tolerance in euros (default: 1)
     * @returns {Array} - Matching remittances
     */
    findByAmount(amount, tolerance = 1) {
        return this.remittances.filter(r => {
            if (!r.amount) return false;
            return Math.abs(r.amount - amount) <= tolerance;
        });
    }

    /**
     * Search remittances by multiple criteria
     * @param {object} criteria - {studentId, studentName, amount}
     * @returns {object|null} - Best matching remittance
     */
    findBestMatch(criteria) {
        const { studentId, studentName, amount } = criteria;
        let matches = [...this.remittances];

        // Filter by student ID (exact match)
        if (studentId) {
            const byId = this.findByStudentId(studentId);
            if (byId.length > 0) {
                return byId[0]; // Return first match
            }
        }

        // Filter by student name
        if (studentName) {
            const byName = this.findByStudentName(studentName);
            if (byName.length > 0) {
                matches = byName;
            }
        }

        // Filter by amount (if provided)
        if (amount && matches.length > 0) {
            const byAmount = matches.filter(r => {
                if (!r.amount) return false;
                return Math.abs(r.amount - amount) <= 1;
            });
            if (byAmount.length > 0) {
                return byAmount[0];
            }
        }

        return matches.length > 0 ? matches[0] : null;
    }

    /**
     * Get all remittances
     * @returns {Array} - All remittances
     */
    getAllRemittances() {
        return this.remittances;
    }

    /**
     * Get statistics
     */
    getStats() {
        const totalRemittances = this.remittances.length;
        const withAmount = this.remittances.filter(r => r.amount).length;
        const withFiles = this.remittances.filter(r => r.hasFiles).length;
        const uniqueStudents = new Set(this.remittances.map(r => r.studentId)).size;

        return {
            totalRemittances,
            withAmount,
            withFiles,
            uniqueStudents,
            checkpointFile: this.checkpointFile,
            lastMessageId: this.lastMessageId
        };
    }
}

// Export for use as module
module.exports = SlackRemittanceReader;

// CLI test mode
if (require.main === module) {
    (async () => {
        const reader = new SlackRemittanceReader();

        console.log('🔍 Testing Slack Remittance Reader...\n');

        try {
            // Fetch new remittances
            await reader.fetchNewRemittances(50, false); // Fetch last 50 messages

            // Display statistics
            const stats = reader.getStats();
            console.log('\n📊 Statistics:');
            console.log(`   Total remittances: ${stats.totalRemittances}`);
            console.log(`   With amount: ${stats.withAmount}`);
            console.log(`   With files: ${stats.withFiles}`);
            console.log(`   Unique students: ${stats.uniqueStudents}`);
            console.log(`   Checkpoint file: ${stats.checkpointFile}`);

            // Test search
            if (stats.totalRemittances > 0) {
                console.log('\n🔎 Testing search functions:');

                const firstRemittance = reader.getAllRemittances()[0];
                console.log(`\n   Searching for Student ID: ${firstRemittance.studentId}`);
                const byId = reader.findByStudentId(firstRemittance.studentId);
                console.log(`   Found ${byId.length} matches`);

                if (firstRemittance.amount) {
                    console.log(`\n   Searching for amount: €${firstRemittance.amount}`);
                    const byAmount = reader.findByAmount(firstRemittance.amount);
                    console.log(`   Found ${byAmount.length} matches`);
                }

                console.log(`\n   Testing best match with criteria:`);
                const match = reader.findBestMatch({
                    studentId: firstRemittance.studentId,
                    amount: firstRemittance.amount
                });
                if (match) {
                    console.log(`   ✅ Found: ${match.studentName} (€${match.amount || 'N/A'})`);
                }
            }

        } catch (error) {
            console.error('\n❌ Error:', error.message);
            process.exit(1);
        }
    })();
}
