#!/usr/bin/env node
/**
 * Test Gmail Reader - TransferMate Email Parsing
 *
 * Tests reading TransferMate batch payment notification emails
 */

const GmailReader = require('./reader');

(async () => {
    console.log('📧 GMAIL READER TEST - TransferMate Batch Notifications');
    console.log('═'.repeat(70));

    const reader = new GmailReader();

    try {
        // Search for ALL TransferMate emails (any @transfermate.com)
        console.log('\n🔍 Searching for all TransferMate emails from any date...\n');

        const emails = await reader.searchTransferMateBatchEmails({
            // No date filter - search all emails
            unreadOnly: false // Get all emails, not just unread
        });

        console.log(`\n📬 Found ${emails.length} email(s)\n`);
        console.log('═'.repeat(70));

        for (const email of emails) {
            console.log('\n📧 EMAIL:');
            console.log(`   Subject: ${email.subject}`);
            console.log(`   From: ${email.from}`);
            console.log(`   Date: ${email.date}`);
            console.log(`   ID: ${email.id}`);
            console.log('');
            console.log('─'.repeat(70));
            console.log('BODY SNIPPET:');
            console.log(email.snippet);
            console.log('─'.repeat(70));

            // Parse payments from email body
            const payments = reader.parseTransferMateBatchEmail(email.body);

            if (payments.length > 0) {
                console.log(`\n💰 Extracted ${payments.length} payment(s):\n`);

                payments.forEach((p, i) => {
                    console.log(`   ${i + 1}. Payment ID: ${p.pmntId}`);
                    console.log(`      Amount: ${p.currency || 'EUR'} ${p.amount || 'N/A'}`);
                    console.log(`      Reference: ${p.reference || 'N/A'}`);
                    console.log(`      Fidelo Ref: ${p.fideloRef || 'N/A'}`);
                    console.log('');
                });
            } else {
                console.log('\n⚠️  No payments extracted from email body');
            }

            console.log('═'.repeat(70));
        }

        if (emails.length === 0) {
            console.log('\n💡 No TransferMate batch emails found for November 2025');
            console.log('   Try adjusting the date range or check the from address');
        }

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error.stack);
    }

    console.log('\n✅ Test complete\n');
})();
