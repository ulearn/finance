const SlackAttachmentParser = require('../../scripts/slack/attach-parse.js');
const axios = require('axios');
require('dotenv').config({ path: '../../.env' });

(async () => {
    try {
        const parser = new SlackAttachmentParser();

        // Get the Slack message with the attachment
        const messageTs = '1764332741.587829';
        const channelId = 'C07CGA4752S';

        console.log('Fetching Slack message to get file URL...');
        const response = await axios.get('https://slack.com/api/conversations.history', {
            headers: {
                'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`
            },
            params: {
                channel: channelId,
                latest: messageTs,
                inclusive: true,
                limit: 1
            }
        });

        if (!response.data.ok) {
            throw new Error(`Slack API error: ${response.data.error}`);
        }

        const message = response.data.messages[0];
        console.log('Message found:', message.text);
        console.log('Files:', message.files.length);

        if (message.files && message.files.length > 0) {
            const file = message.files[0];
            console.log('\nFile details:');
            console.log('  Name:', file.name);
            console.log('  Type:', file.mimetype);
            console.log('  Size:', file.size);

            // Download the file
            const buffer = await parser.downloadFile(file);

            // Parse with OpenAI Vision
            console.log('\n📸 Parsing image with OpenAI Vision...');
            const result = await parser.parseImage(buffer, file.mimetype);

            console.log('\n✅ Parsed result:');
            console.log(JSON.stringify(result, null, 2));

            // Also get raw text extraction
            console.log('\n📝 Requesting full text extraction...');
            const base64Image = buffer.toString('base64');
            const textResponse = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-4o',
                    messages: [{
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Extract ALL visible text from this image. Include every word, number, and detail you can see. Format it clearly but include everything.'
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:${file.mimetype};base64,${base64Image}`
                                }
                            }
                        ]
                    }],
                    max_tokens: 1000
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('\n📄 FULL TEXT FROM IMAGE:');
            console.log('='.repeat(70));
            console.log(textResponse.data.choices[0].message.content);
            console.log('='.repeat(70));
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
})();
