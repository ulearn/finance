#!/usr/bin/env node
/**
 * Test with hardcoded #financial channel ID
 * To get channel ID: In Slack, right-click #financial → View channel details → Copy channel ID
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function testHardcoded() {
    const token = process.env.SLACK_BOT_TOKEN;

    // Try multiple methods to find the channel
    console.log('Testing Slack Channel Access...\n');

    try {
        // Method 1: List all channels (might work now with channels:read)
        console.log('Method 1: Using conversations.list...');
        const listResponse = await axios.get('https://slack.com/api/conversations.list', {
            headers: { 'Authorization': `Bearer ${token}` },
            params: {
                types: 'public_channel',
                exclude_archived: true,
                limit: 100
            }
        });

        if (listResponse.data.ok) {
            console.log(`✅ conversations.list worked! Found ${listResponse.data.channels.length} channels`);
            const financial = listResponse.data.channels.find(c => c.name === 'financial');

            if (financial) {
                console.log(`✅ Found #financial: ${financial.id}\n`);

                // Try to read messages
                const historyResponse = await axios.get('https://slack.com/api/conversations.history', {
                    headers: { 'Authorization': `Bearer ${token}` },
                    params: {
                        channel: financial.id,
                        limit: 5
                    }
                });

                if (historyResponse.data.ok) {
                    console.log(`✅ Successfully read ${historyResponse.data.messages.length} messages!`);

                    // Check for files
                    const withFiles = historyResponse.data.messages.filter(m => m.files && m.files.length > 0);
                    console.log(`📎 ${withFiles.length} messages have files\n`);

                    if (withFiles.length > 0) {
                        console.log('Sample message with file:');
                        const msg = withFiles[0];
                        console.log(`  Date: ${new Date(parseFloat(msg.ts) * 1000).toISOString()}`);
                        console.log(`  Files: ${msg.files.map(f => f.name).join(', ')}`);
                    }

                    console.log('\n✅ ALL TESTS PASSED!');
                    console.log('Ready to implement remittance search.');
                    return;
                } else {
                    console.error('❌ Failed to read history:', historyResponse.data.error);
                }
            } else {
                console.log('❌ #financial not in list');
                console.log('Available channels:', listResponse.data.channels.map(c => c.name).slice(0, 10).join(', '));
            }
        } else {
            console.error(`❌ conversations.list failed: ${listResponse.data.error}`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response?.data) {
            console.error('Response:', error.response.data);
        }
    }

    // Wait suggestion
    console.log('\n⏳ If this still fails:');
    console.log('   1. Slack API changes can take 2-5 minutes to propagate');
    console.log('   2. Try again in a few minutes');
    console.log('   3. Make sure bot is invited to #financial: /invite @Ai Bot');
}

testHardcoded();
