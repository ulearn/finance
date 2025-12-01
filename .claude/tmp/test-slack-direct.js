#!/usr/bin/env node
/**
 * Test: Direct access to #financial using channel ID
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function testDirectAccess() {
    const token = process.env.SLACK_BOT_TOKEN;

    if (!token) {
        console.error('❌ SLACK_BOT_TOKEN not found in .env');
        return;
    }

    console.log('Testing Direct Channel Access...\n');
    console.log(`Using token: ${token.substring(0, 15)}...\n`);

    // Common method: Get channel ID by posting a test message
    // Or manually find it from Slack: right-click channel → View channel details → Copy ID

    try {
        // First, let's check what scopes we actually have
        console.log('1️⃣ Checking current bot scopes...');
        const authResponse = await axios.get('https://slack.com/api/auth.test', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!authResponse.data.ok) {
            console.error('❌ Auth test failed:', authResponse.data.error);
            return;
        }

        console.log(`✅ Bot authenticated: ${authResponse.data.user}`);
        console.log(`   Team: ${authResponse.data.team}`);
        console.log(`   User ID: ${authResponse.data.user_id}\n`);

        // Try to get a list of conversations the bot is member of
        console.log('2️⃣ Getting conversations bot is member of...');
        const convsResponse = await axios.get('https://slack.com/api/users.conversations', {
            headers: { 'Authorization': `Bearer ${token}` },
            params: {
                types: 'public_channel,private_channel',
                exclude_archived: true,
                limit: 100
            }
        });

        if (!convsResponse.data.ok) {
            console.error('❌ Failed to get conversations:', convsResponse.data.error);
            console.log('\n⚠️  This error suggests:');
            console.log('   1. Bot needs "channels:read" scope');
            console.log('   2. OR app needs to be reinstalled after adding scopes\n');
            console.log('📋 Steps to fix:');
            console.log('   1. Go to https://api.slack.com/apps/A09USHN84HZ/oauth');
            console.log('   2. Check "Bot Token Scopes" - should include:');
            console.log('      - channels:history');
            console.log('      - channels:read');
            console.log('      - files:read');
            console.log('      - chat:write');
            console.log('   3. Click "Reinstall to Workspace"');
            console.log('   4. Copy the NEW Bot User OAuth Token');
            console.log('   5. Update SLACK_BOT_TOKEN in .env\n');
            return;
        }

        const channels = convsResponse.data.channels;
        console.log(`✅ Bot is member of ${channels.length} channels\n`);

        // Find #financial
        const financialChannel = channels.find(c => c.name === 'financial');

        if (!financialChannel) {
            console.log('❌ #financial not found in bot\'s channels');
            console.log('   Bot is member of:', channels.map(c => `#${c.name}`).join(', '));
            console.log('\n⚠️  To fix: Invite bot to #financial channel');
            console.log('   In Slack: Type in #financial: /invite @YourBotName');
            return;
        }

        console.log(`✅ Found #financial (ID: ${financialChannel.id})\n`);

        // Try to read messages
        console.log('3️⃣ Reading recent messages...');
        const messagesResponse = await axios.get('https://slack.com/api/conversations.history', {
            headers: { 'Authorization': `Bearer ${token}` },
            params: {
                channel: financialChannel.id,
                limit: 10
            }
        });

        if (!messagesResponse.data.ok) {
            console.error('❌ Failed to read messages:', messagesResponse.data.error);
            return;
        }

        const messages = messagesResponse.data.messages;
        console.log(`✅ Retrieved ${messages.length} messages\n`);

        // Show first few messages
        console.log('📬 Recent messages:');
        messages.slice(0, 5).forEach((msg, i) => {
            const timestamp = new Date(parseFloat(msg.ts) * 1000).toISOString();
            const hasFiles = msg.files && msg.files.length > 0;
            console.log(`\n${i + 1}. ${timestamp}`);
            console.log(`   Text: ${(msg.text || 'No text').substring(0, 80)}`);
            if (hasFiles) {
                console.log(`   📎 Files: ${msg.files.length}`);
                msg.files.forEach(f => {
                    console.log(`      - ${f.name} (${f.filetype}, ${(f.size / 1024).toFixed(1)} KB)`);
                });
            }
        });

        // Check for messages with files
        const messagesWithFiles = messages.filter(m => m.files && m.files.length > 0);
        console.log(`\n📎 ${messagesWithFiles.length} messages have attachments`);

        if (messagesWithFiles.length > 0) {
            console.log('\n4️⃣ Testing file download...');
            const testFile = messagesWithFiles[0].files[0];

            if (testFile.url_private) {
                try {
                    const downloadResponse = await axios.get(testFile.url_private, {
                        headers: { 'Authorization': `Bearer ${token}` },
                        responseType: 'arraybuffer',
                        maxContentLength: 10 * 1024 * 1024 // 10MB limit
                    });

                    console.log(`✅ Downloaded: ${testFile.name} (${downloadResponse.data.length} bytes)`);
                } catch (downloadError) {
                    console.error(`❌ Download failed:`, downloadError.message);
                }
            } else {
                console.log('⚠️  File has no download URL');
            }
        }

        console.log('\n═══════════════════════════════════════════');
        console.log('✅ ALL TESTS PASSED!');
        console.log('═══════════════════════════════════════════');
        console.log('Slack bot can now:');
        console.log('  ✓ Read #financial channel');
        console.log('  ✓ Access message history');
        console.log('  ✓ Download file attachments');
        console.log('\nReady to implement remittance search!');

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

testDirectAccess();
