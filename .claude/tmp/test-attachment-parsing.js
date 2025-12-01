/**
 * Test Slack Attachment Parsing
 * Download and parse payment receipts from Slack messages
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const SlackRemittanceReader = require('../../scripts/slack/attach-read');

async function testAttachmentParsing() {
    console.log('🧪 Testing Slack Attachment Parsing...\n');

    // Check configuration
    if (!process.env.OPENAI_API_KEY) {
        console.error('❌ OPENAI_API_KEY not configured in .env');
        console.log('\nTo enable attachment parsing:');
        console.log('1. Get your API key from https://platform.openai.com/api-keys');
        console.log('2. Add to .env: OPENAI_API_KEY=sk-...');
        process.exit(1);
    }

    console.log('✅ Configuration:');
    console.log(`   Slack token: ${process.env.SLACK_BOT_TOKEN ? 'Configured' : 'Missing'}`);
    console.log(`   OpenAI key: ${process.env.OPENAI_API_KEY ? 'Configured' : 'Missing'}`);
    console.log('');

    const reader = new SlackRemittanceReader();

    // Fetch remittances WITH attachment parsing
    console.log('📥 Fetching remittances WITH attachment parsing (this may take a while)...\n');

    try {
        await reader.fetchNewRemittances(
            10,    // Only fetch last 10 messages (for testing)
            false, // Fetch all messages, not just new ones
            true   // PARSE ATTACHMENTS
        );

        // Show results
        const stats = reader.getStats();
        console.log('\n📊 Statistics:');
        console.log(`   Total remittances: ${stats.totalRemittances}`);
        console.log(`   With amount: ${stats.withAmount}`);
        console.log(`   With files: ${stats.withFiles}`);

        // Show remittances with parsed attachments
        const withParsedAttachments = reader.getAllRemittances().filter(r => r.parsedAttachment);
        console.log(`   With parsed attachments: ${withParsedAttachments.length}`);

        if (withParsedAttachments.length > 0) {
            console.log('\n📎 Remittances with parsed attachments:');
            withParsedAttachments.forEach((r, i) => {
                console.log(`\n${i + 1}. Student ID ${r.studentId} - ${r.studentName}`);
                console.log(`   Message text amount: ${r.amount ? `€${r.amount}` : 'N/A'}`);
                console.log(`   Parsed from attachment:`);
                console.log(`      Amount: ${r.parsedAttachment.amount ? `€${r.parsedAttachment.amount}` : 'N/A'}`);
                console.log(`      Date: ${r.parsedAttachment.date || 'N/A'}`);
                console.log(`      Payment method: ${r.parsedAttachment.paymentMethod || 'N/A'}`);
                console.log(`      Transaction ID: ${r.parsedAttachment.transactionId || 'N/A'}`);

                // Check for mismatches
                if (r.amount && r.parsedAttachment.amount) {
                    const diff = Math.abs(r.amount - r.parsedAttachment.amount);
                    if (diff > 1) {
                        console.log(`   ⚠️  AMOUNT MISMATCH: Text says €${r.amount}, attachment says €${r.parsedAttachment.amount}`);
                    } else {
                        console.log(`   ✅ Amounts match!`);
                    }
                }
            });
        }

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.response?.data) {
            console.error('API error:', JSON.stringify(error.response.data, null, 2));
        }
        throw error;
    }
}

// Run test
testAttachmentParsing()
    .then(() => {
        console.log('\n✅ Test completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    });
