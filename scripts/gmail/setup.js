#!/usr/bin/env node
/**
 * Gmail OAuth Setup Script
 *
 * This script generates an authorization URL and handles the OAuth flow
 * for connecting accounts@ulearnschool.com to read TransferMate emails.
 */

const GmailClient = require('./client');

console.log('');
console.log('═'.repeat(70));
console.log('GMAIL OAUTH SETUP - accounts@ulearnschool.com');
console.log('═'.repeat(70));
console.log('');

const gmailClient = new GmailClient();
const authUrl = gmailClient.getAuthorizationUrl();

console.log('📋 SETUP STEPS:');
console.log('');
console.log('1. Open this URL in your browser:');
console.log('');
console.log(authUrl);
console.log('');
console.log('2. Log in as accounts@ulearnschool.com');
console.log('');
console.log('3. Grant permissions for Gmail access');
console.log('');
console.log('4. You will be redirected to:');
console.log('   https://hub.ulearnschool.com/fins/google/callback?code=...');
console.log('');
console.log('5. The system will automatically save the tokens');
console.log('');
console.log('═'.repeat(70));
console.log('');
console.log('After completing authorization, tokens will be saved to:');
console.log('/home/hub/public_html/fins/.env (GMAIL_ACCESS_TOKEN, GMAIL_REFRESH_TOKEN)');
console.log('');
