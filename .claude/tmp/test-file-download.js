#!/usr/bin/env node
/**
 * Test: Can we download file attachments from #financial?
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function testFileDownload() {
    const token = process.env.SLACK_BOT_TOKEN;
    const channelId = 'C07CGA4752S'; // #financial

    console.log('Testing File Download from #financial...\n');

    try {
        // Get recent messages with files
        const historyResponse = await axios.get('https://slack.com/api/conversations.history', {
            headers: { 'Authorization': `Bearer ${token}` },
            params: {
                channel: channelId,
                limit: 20
            }
        });

        if (!historyResponse.data.ok) {
            console.error('❌ Failed to read messages:', historyResponse.data.error);
            return;
        }

        const messagesWithFiles = historyResponse.data.messages.filter(m => m.files && m.files.length > 0);

        console.log(`Found ${messagesWithFiles.length} messages with files\n`);

        if (messagesWithFiles.length === 0) {
            console.log('No files to test with');
            return;
        }

        // Try to download the first file
        const testMessage = messagesWithFiles[0];
        const testFile = testMessage.files[0];

        console.log('Test file details:');
        console.log(`  Name: ${testFile.name}`);
        console.log(`  Type: ${testFile.filetype}`);
        console.log(`  Size: ${(testFile.size / 1024).toFixed(2)} KB`);
        console.log(`  Posted: ${new Date(parseFloat(testMessage.ts) * 1000).toISOString()}`);
        console.log(`  Message text: ${testMessage.text || 'No text'}\n`);

        if (!testFile.url_private) {
            console.error('❌ File has no private URL');
            return;
        }

        console.log('Attempting download...');

        try {
            // Slack files need the url_private_download field, not url_private
            const downloadUrl = testFile.url_private_download || testFile.url_private;

            console.log(`Download URL type: ${testFile.url_private_download ? 'url_private_download' : 'url_private'}`);

            const downloadResponse = await axios.get(downloadUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': '*/*'
                },
                responseType: 'arraybuffer',
                maxContentLength: 10 * 1024 * 1024, // 10MB limit
                maxRedirects: 5
            });

            console.log(`✅ Download successful! (${downloadResponse.data.length} bytes)`);
            console.log(`Content-Type: ${downloadResponse.headers['content-type']}`);

            // Save to temp file to verify
            const tempPath = path.join(__dirname, `test-download-${testFile.name}`);
            await fs.writeFile(tempPath, downloadResponse.data);
            console.log(`✅ Saved to: ${tempPath}`);

            console.log('\n═══════════════════════════════════════════');
            console.log('✅ FILE DOWNLOAD WORKING!');
            console.log('═══════════════════════════════════════════');
            console.log('Ready to implement:');
            console.log('  1. Search #financial for remittances');
            console.log('  2. Download PDF/image attachments');
            console.log('  3. Parse with AI for booking references');

        } catch (downloadError) {
            if (downloadError.response?.status === 403) {
                console.error('❌ Download blocked: 403 Forbidden');
                console.log('\n⚠️  This means you need the files:read scope');
                console.log('\n📋 To fix:');
                console.log('   1. Go to https://api.slack.com/apps/A09USHN84HZ/oauth');
                console.log('   2. Under "Bot Token Scopes", add: files:read');
                console.log('   3. Reinstall to workspace');
                console.log('   4. Run this test again');
            } else {
                console.error('❌ Download error:', downloadError.message);
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testFileDownload();
