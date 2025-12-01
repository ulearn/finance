#!/usr/bin/env node
/**
 * Test: Read messages from Slack #financial channel
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function testSlackAccess() {
    const token = process.env.SLACK_BOT_TOKEN;

    if (!token) {
        console.error('❌ SLACK_BOT_TOKEN not found in .env');
        return;
    }

    console.log('Testing Slack API Access...\n');

    try {
        // 1. Get channel list to find #financial
        console.log('1️⃣ Finding #financial channel...');
        const channelsResponse = await axios.get('https://slack.com/api/conversations.list', {
            headers: { 'Authorization': `Bearer ${token}` },
            params: {
                types: 'public_channel,private_channel',
                exclude_archived: true,
                limit: 100
            }
        });

        if (!channelsResponse.data.ok) {
            console.error('❌ Failed to list channels:', channelsResponse.data.error);
            return;
        }

        const financialChannel = channelsResponse.data.channels.find(c => c.name === 'financial');

        if (!financialChannel) {
            console.error('❌ #financial channel not found');
            console.log('Available channels:', channelsResponse.data.channels.map(c => c.name).join(', '));
            return;
        }

        console.log(`✅ Found #financial (ID: ${financialChannel.id})\n`);

        // 2. Read recent messages (last 50)
        console.log('2️⃣ Reading recent messages...');
        const messagesResponse = await axios.get('https://slack.com/api/conversations.history', {
            headers: { 'Authorization': `Bearer ${token}` },
            params: {
                channel: financialChannel.id,
                limit: 50
            }
        });

        if (!messagesResponse.data.ok) {
            console.error('❌ Failed to read messages:', messagesResponse.data.error);
            return;
        }

        const messages = messagesResponse.data.messages;
        console.log(`✅ Retrieved ${messages.length} messages\n`);

        // 3. Analyze messages with files/attachments
        console.log('3️⃣ Analyzing messages with attachments...\n');

        const messagesWithFiles = messages.filter(m => m.files && m.files.length > 0);

        console.log(`Found ${messagesWithFiles.length} messages with attachments:\n`);

        messagesWithFiles.slice(0, 5).forEach((msg, i) => {
            const timestamp = new Date(msg.ts * 1000).toISOString();
            console.log(`Message ${i + 1}:`);
            console.log(`  Date: ${timestamp}`);
            console.log(`  Text: ${msg.text?.substring(0, 60) || 'No text'}...`);
            console.log(`  Files: ${msg.files.length}`);

            msg.files.forEach((file, j) => {
                console.log(`    File ${j + 1}:`);
                console.log(`      Name: ${file.name}`);
                console.log(`      Type: ${file.filetype}`);
                console.log(`      Size: ${(file.size / 1024).toFixed(2)} KB`);
                console.log(`      URL: ${file.url_private ? '✅ Available' : '❌ Not available'}`);
            });
            console.log('');
        });

        // 4. Test file download capability
        if (messagesWithFiles.length > 0 && messagesWithFiles[0].files[0].url_private) {
            console.log('4️⃣ Testing file download...');
            const testFile = messagesWithFiles[0].files[0];

            try {
                const downloadResponse = await axios.get(testFile.url_private, {
                    headers: { 'Authorization': `Bearer ${token}` },
                    responseType: 'arraybuffer'
                });

                console.log(`✅ Successfully downloaded: ${testFile.name} (${downloadResponse.data.length} bytes)\n`);
            } catch (error) {
                console.error(`❌ Failed to download file:`, error.message);
            }
        }

        // 5. Test search capability
        console.log('5️⃣ Testing search functionality...');
        const searchResponse = await axios.get('https://slack.com/api/search.messages', {
            headers: { 'Authorization': `Bearer ${token}` },
            params: {
                query: 'in:#financial payment',
                count: 10,
                sort: 'timestamp',
                sort_dir: 'desc'
            }
        });

        if (!searchResponse.data.ok) {
            console.error('❌ Search failed:', searchResponse.data.error);
            console.log('Note: search.messages requires "search:read" scope');
        } else {
            console.log(`✅ Search successful: ${searchResponse.data.messages?.total || 0} results found\n`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

testSlackAccess();
