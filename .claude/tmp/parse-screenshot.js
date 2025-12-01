#!/usr/bin/env node
/**
 * Parse the downloaded screenshot with OpenAI Vision API
 */

const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function parseScreenshot() {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });

    const imagePath = path.join(__dirname, 'test-download-Screenshot 2025-11-28 at 10.26.32.png');

    console.log('Reading screenshot...\n');

    // Read file as base64
    const imageBuffer = await fs.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');

    console.log('Sending to OpenAI Vision API...\n');

    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: `Extract the following information from this payment remittance/receipt:

1. Booking reference (P#### or D#### format)
2. Student name
3. Payment amount (in euros)
4. Payment date
5. Any bank reference numbers

Return as JSON:
{
  "bookingRef": "P2025###",
  "studentName": "Last, First",
  "amount": 1234.56,
  "date": "2025-11-28",
  "bankRef": "...",
  "confidence": "high|medium|low"
}`
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:image/png;base64,${base64Image}`
                        }
                    }
                ]
            }
        ],
        max_tokens: 500
    });

    const result = response.choices[0].message.content;
    console.log('OpenAI Response:');
    console.log(result);

    try {
        const parsed = JSON.parse(result);
        console.log('\n✅ Parsed data:');
        console.log(JSON.stringify(parsed, null, 2));

        if (parsed.bookingRef) {
            console.log(`\n🎯 Found booking reference: ${parsed.bookingRef}`);
            console.log('Ready to complete payment assignment!');
        }
    } catch (e) {
        console.log('\n⚠️  Response is not JSON, raw text above');
    }
}

parseScreenshot().catch(console.error);
