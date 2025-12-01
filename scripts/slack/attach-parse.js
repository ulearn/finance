/**
 * Slack Attachment Parser - Parse payment remittances from Slack file attachments
 * Location: /home/hub/public_html/fins/scripts/slack/attachment-parser.js
 *
 * Purpose: Download and parse payment receipt images/PDFs from Slack messages
 *          Extract: amount, date, payment method, booking reference
 *
 * Uses OpenAI Vision API for image analysis
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

class SlackAttachmentParser {
    constructor() {
        this.slackBotToken = process.env.SLACK_BOT_TOKEN;
        this.openaiApiKey = process.env.OPENAI_API_KEY;

        if (!this.slackBotToken) {
            throw new Error('SLACK_BOT_TOKEN not configured in .env');
        }

        if (!this.openaiApiKey) {
            console.warn('⚠️  OPENAI_API_KEY not configured - attachment parsing will be unavailable');
        }
    }

    /**
     * Download file from Slack
     * @param {object} file - File object from Slack API (must have url_private)
     * @returns {Promise<Buffer>} - File data as buffer
     */
    async downloadFile(file) {
        try {
            console.log(`📥 Downloading file: ${file.name} (${file.size} bytes)`);

            const response = await axios.get(file.url_private, {
                headers: {
                    'Authorization': `Bearer ${this.slackBotToken}`
                },
                responseType: 'arraybuffer'
            });

            const buffer = Buffer.from(response.data);
            console.log(`✅ Downloaded ${buffer.length} bytes`);

            return buffer;
        } catch (error) {
            console.error(`❌ Failed to download file:`, error.message);
            throw error;
        }
    }

    /**
     * Parse image file using OpenAI Vision API
     * @param {Buffer} imageBuffer - Image data
     * @param {string} mimeType - MIME type (e.g., 'image/png')
     * @returns {Promise<object>} - Extracted payment details
     */
    async parseImage(imageBuffer, mimeType) {
        if (!this.openaiApiKey) {
            throw new Error('OpenAI API key not configured');
        }

        try {
            console.log('🔍 Parsing image with OpenAI Vision...');

            // Convert buffer to base64
            const base64Image = imageBuffer.toString('base64');

            // Call OpenAI Vision API
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-4o',
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: `Analyze this payment receipt/remittance and extract the following information in JSON format:
{
  "amount": <number> (in euros),
  "currency": <string>,
  "date": <string> (ISO format YYYY-MM-DD if possible),
  "paymentMethod": <string> (e.g., "Stripe", "Bank Transfer", "Card"),
  "studentId": <string> (if mentioned),
  "studentName": <string> (if mentioned),
  "bookingReference": <string> (any P#### or D#### references),
  "transactionId": <string> (if visible),
  "notes": <string> (any other relevant details)
}

Return ONLY the JSON object, no additional text.`
                                },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: `data:${mimeType};base64,${base64Image}`
                                    }
                                }
                            ]
                        }
                    ],
                    max_tokens: 500
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.openaiApiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            let content = response.data.choices[0].message.content.trim();
            console.log('📄 OpenAI response:', content);

            // Strip markdown code blocks if present (OpenAI sometimes wraps JSON in ```json ... ```)
            if (content.startsWith('```')) {
                content = content.replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '');
            }

            // Parse JSON response
            const parsed = JSON.parse(content);
            console.log('✅ Parsed payment details:', parsed);

            return parsed;

        } catch (error) {
            console.error('❌ Failed to parse image:', error.message);
            if (error.response?.data) {
                console.error('OpenAI error:', JSON.stringify(error.response.data, null, 2));
            }
            throw error;
        }
    }

    /**
     * Parse PDF file using pdf-parse + GPT-4
     * Extract text from PDF, then use GPT-4 to parse payment details
     */
    async parsePDF(pdfBuffer) {
        if (!this.openaiApiKey) {
            throw new Error('OpenAI API key not configured');
        }

        try {
            console.log('📄 Extracting text from PDF...');

            // Extract text from PDF (v1.x API - simple!)
            const data = await pdfParse(pdfBuffer);
            const text = data.text;

            console.log(`✅ Extracted ${text.length} characters from PDF`);
            console.log('Sample:', text.substring(0, 200) + '...');

            // Use GPT-4 to parse the extracted text
            console.log('🔍 Parsing extracted text with GPT-4...');

            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-4o',
                    messages: [
                        {
                            role: 'user',
                            content: `Analyze this payment receipt text and extract the following information in JSON format:
{
  "amount": <number> (in euros),
  "currency": <string>,
  "date": <string> (ISO format YYYY-MM-DD if possible),
  "paymentMethod": <string> (e.g., "Stripe", "Bank Transfer", "Card"),
  "studentId": <string> (if mentioned),
  "studentName": <string> (if mentioned),
  "bookingReference": <string> (any P#### or D#### references),
  "transactionId": <string> (if visible),
  "notes": <string> (any other relevant details)
}

Return ONLY the JSON object, no additional text.

Receipt text:
${text}`
                        }
                    ],
                    max_tokens: 500
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.openaiApiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            let content = response.data.choices[0].message.content.trim();
            console.log('📄 GPT-4 response:', content);

            // Strip markdown code blocks if present
            if (content.startsWith('```')) {
                content = content.replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '');
            }

            // Parse JSON response
            const parsed = JSON.parse(content);
            console.log('✅ Parsed payment details from PDF:', parsed);

            return parsed;

        } catch (error) {
            console.error('❌ Failed to parse PDF:', error.message);
            if (error.response?.data) {
                console.error('OpenAI error:', JSON.stringify(error.response.data, null, 2));
            }
            throw error;
        }
    }

    /**
     * Parse any attachment file
     * @param {object} file - File object from Slack API
     * @returns {Promise<object>} - Extracted payment details
     */
    async parseAttachment(file) {
        console.log(`\n📎 Parsing attachment: ${file.name} (${file.mimetype})`);

        // Download file
        const buffer = await this.downloadFile(file);

        // Parse based on MIME type
        if (file.mimetype.startsWith('image/')) {
            return await this.parseImage(buffer, file.mimetype);
        } else if (file.mimetype === 'application/pdf') {
            return await this.parsePDF(buffer);
        } else {
            console.warn(`⚠️  Unsupported file type: ${file.mimetype}`);
            return {
                error: 'unsupported_file_type',
                mimetype: file.mimetype
            };
        }
    }

    /**
     * Parse all attachments from a Slack message
     * @param {Array} files - Array of file objects from Slack message
     * @returns {Promise<Array>} - Array of parsed payment details
     */
    async parseAllAttachments(files) {
        const results = [];

        for (const file of files) {
            try {
                const parsed = await this.parseAttachment(file);
                results.push({
                    filename: file.name,
                    mimetype: file.mimetype,
                    parsed,
                    success: !parsed.error
                });
            } catch (error) {
                results.push({
                    filename: file.name,
                    mimetype: file.mimetype,
                    error: error.message,
                    success: false
                });
            }
        }

        return results;
    }

    /**
     * Merge parsed attachment data with message text data
     * Attachment data takes precedence for amount/date
     * @param {object} messageData - Data extracted from message text
     * @param {object} attachmentData - Data parsed from attachment
     * @returns {object} - Merged data
     */
    mergeData(messageData, attachmentData) {
        return {
            // From message text
            studentId: messageData.studentId || attachmentData.studentId,
            studentName: messageData.studentName || attachmentData.studentName,

            // From attachment (more reliable)
            amount: attachmentData.amount || messageData.amount,
            date: attachmentData.date || messageData.date,
            paymentMethod: attachmentData.paymentMethod || messageData.paymentMethod,

            // Additional from attachment
            currency: attachmentData.currency,
            bookingReference: attachmentData.bookingReference,
            transactionId: attachmentData.transactionId,
            notes: attachmentData.notes,

            // Metadata
            hasAttachment: true,
            attachmentParsed: true
        };
    }
}

// Export for use as module
module.exports = SlackAttachmentParser;

// CLI test mode
if (require.main === module) {
    (async () => {
        const parser = new SlackAttachmentParser();

        console.log('🧪 Testing Slack Attachment Parser...\n');

        // Test with a sample file object (you'd get this from Slack API)
        const testFile = {
            name: 'payment-receipt.png',
            mimetype: 'image/png',
            size: 89012,
            url_private: 'https://files.slack.com/files-pri/...' // Would be real URL from Slack
        };

        console.log('Note: This test requires a real Slack file URL');
        console.log('To test properly, fetch a file from Slack #financial channel using conversations.history API\n');

        console.log('Parser initialized:');
        console.log(`  Slack token: ${parser.slackBotToken ? '✅ Configured' : '❌ Missing'}`);
        console.log(`  OpenAI key: ${parser.openaiApiKey ? '✅ Configured' : '❌ Missing'}`);

    })();
}
