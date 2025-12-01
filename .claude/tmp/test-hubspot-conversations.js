#!/usr/bin/env node
/**
 * Test: HubSpot Conversations API - Can we read email body and attachments?
 */

const hubspot = require('@hubspot/api-client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function testHubSpotConversations() {
    const accessToken = process.env.ACCESS_TOKEN;

    if (!accessToken) {
        console.error('❌ ACCESS_TOKEN not found in .env');
        return;
    }

    const client = new hubspot.Client({ accessToken });

    console.log('Testing HubSpot Conversations API...\n');

    try {
        // 1. Search for recent conversations
        console.log('1️⃣ Searching for recent conversations...');

        // Get deals from last 30 days with won/lost included
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const dealsResponse = await client.crm.deals.searchApi.doSearch({
            filterGroups: [{
                filters: [{
                    propertyName: 'createdate',
                    operator: 'GTE',
                    value: thirtyDaysAgo.getTime().toString()
                }]
            }],
            properties: ['dealname', 'amount', 'createdate', 'dealstage'],
            limit: 20 // Check more deals
        });

        console.log(`✅ Found ${dealsResponse.results.length} recent deals\n`);

        if (dealsResponse.results.length === 0) {
            console.log('No recent deals to test with');
            return;
        }

        // 2. Find a deal with a contact
        console.log(`2️⃣ Finding a deal with associated contact...`);

        let testDeal = null;
        let contactId = null;
        let dealsChecked = 0;

        for (const deal of dealsResponse.results) {
            dealsChecked++;
            console.log(`   Checking deal ${dealsChecked}: ${deal.properties.dealname}`);

            try {
                const associationsResponse = await client.apiRequest({
                    method: 'GET',
                    path: `/crm/v4/objects/deals/${deal.id}/associations/contacts`
                });

                console.log(`      Associations response:`, associationsResponse.results ? `${associationsResponse.results.length} contacts` : 'No results field');

                if (associationsResponse.results && associationsResponse.results.length > 0) {
                    testDeal = deal;
                    contactId = associationsResponse.results[0].toObjectId;
                    console.log(`      ✅ Found contact: ${contactId}`);
                    break;
                } else {
                    console.log(`      ❌ No contacts`);
                }
            } catch (err) {
                console.log(`      ❌ Error: ${err.message}`);
                continue;
            }
        }

        if (!contactId) {
            console.log('❌ None of the recent deals have associated contacts');
            console.log('   This may be a data issue or need to check more deals');
            return;
        }
        console.log(`✅ Found contact ID: ${contactId}\n`);

        // 3. Try to get conversations (emails) for this contact
        console.log('3️⃣ Attempting to fetch conversations...');

        try {
            // Method 1: Try engagement API (emails are a type of engagement)
            console.log('   Trying engagements API...');
            const engagementsResponse = await client.apiRequest({
                method: 'GET',
                path: `/crm/v4/objects/contacts/${contactId}/associations/emails`
            });

            const emailCount = engagementsResponse.results ? engagementsResponse.results.length : 0;
            console.log(`   Found ${emailCount} email associations\n`);

            if (emailCount > 0) {
                // Get details of first email
                const emailId = engagementsResponse.results[0].toObjectId || engagementsResponse.results[0].id;
                console.log(`   Fetching email ${emailId} details...`);

                try {
                    // Try to get email engagement details
                    const emailResponse = await client.apiRequest({
                        method: 'GET',
                        path: `/engagements/v1/engagements/${emailId}`
                    });

                    console.log('   ✅ Email engagement retrieved!');
                    console.log('   Structure:', JSON.stringify(emailResponse, null, 2).substring(0, 500));

                    // Check if it has attachments
                    if (emailResponse.engagement?.attachments) {
                        console.log(`   📎 Attachments found: ${emailResponse.engagement.attachments.length}`);
                        emailResponse.engagement.attachments.forEach((att, i) => {
                            console.log(`      ${i + 1}. ${att.name || att.fileName || 'Unknown'}`);
                        });
                    } else {
                        console.log('   No attachments in this email');
                    }

                } catch (emailError) {
                    console.log(`   ❌ Could not fetch email details: ${emailError.message}`);
                }
            }

        } catch (error) {
            console.log(`   ❌ Engagements API error: ${error.message}`);
        }

        // 4. Try conversations inbox API (different from engagements)
        console.log('\n4️⃣ Trying Conversations Inbox API...');
        try {
            // This requires conversations scope
            const conversationsResponse = await client.apiRequest({
                method: 'GET',
                path: '/conversations/v3/conversations/threads'
            });

            console.log('   ✅ Conversations API accessible!');
            console.log('   Response:', JSON.stringify(conversationsResponse, null, 2).substring(0, 500));

        } catch (convError) {
            console.log(`   ❌ Conversations API error: ${convError.message}`);
            if (convError.message.includes('403') || convError.message.includes('scope')) {
                console.log('   Note: May require "conversations.read" or "conversations.write" scope');
            }
        }

        // 5. Summary
        console.log('\n═══════════════════════════════════════════');
        console.log('SUMMARY');
        console.log('═══════════════════════════════════════════');
        console.log('✅ Can access deals and contacts');
        console.log('⚠️  Email/Conversation access: Check results above');
        console.log('\nNext steps:');
        console.log('1. Check if we can access email body content');
        console.log('2. Check if we can download attachments');
        console.log('3. Verify what scopes are needed');

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response);
        }
    }
}

testHubSpotConversations();
