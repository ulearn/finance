#!/usr/bin/env node
/**
 * Gmail OAuth2 Token Generator
 *
 * Generates a refresh token for accounts@ulearnschool.com
 * Run this ONCE to get the refresh token, then add it to .env
 */

const { google } = require('googleapis');
const readline = require('readline');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

// OAuth2 credentials from .env (fins project OAuth client)
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback';

// Scopes needed for reading Gmail
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify'
];

const oAuth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
);

console.log('');
console.log('═'.repeat(70));
console.log('GMAIL OAUTH2 TOKEN GENERATOR');
console.log('Account: accounts@ulearnschool.com');
console.log('═'.repeat(70));
console.log('');

// Generate auth URL
const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force to show consent screen
    login_hint: 'accounts@ulearnschool.com' // Suggest this email
});

console.log('📋 STEP 1: Authorize this app');
console.log('');
console.log('Open this URL in your browser:');
console.log('');
console.log(authUrl);
console.log('');
console.log('⚠️  IMPORTANT: Log in as accounts@ulearnschool.com');
console.log('');
console.log('─'.repeat(70));
console.log('');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('📋 STEP 2: Paste the authorization code from the redirect URL: ', async (code) => {
    try {
        console.log('');
        console.log('🔄 Exchanging code for tokens...');

        const { tokens } = await oAuth2Client.getToken(code);

        console.log('');
        console.log('✅ SUCCESS! Tokens generated');
        console.log('═'.repeat(70));
        console.log('');
        console.log('📝 Add this to your .env file:');
        console.log('');
        console.log(`GMAIL_ACCOUNTS_REFRESH_TOKEN=${tokens.refresh_token}`);
        console.log('');
        console.log('═'.repeat(70));
        console.log('');
        console.log('💾 Full token details (for debugging):');
        console.log('');
        console.log(JSON.stringify(tokens, null, 2));
        console.log('');

    } catch (error) {
        console.error('');
        console.error('❌ ERROR getting tokens:', error.message);
        console.error('');
        console.error('Try again and make sure you:');
        console.error('1. Used the correct Gmail account (accounts@ulearnschool.com)');
        console.error('2. Pasted the FULL authorization code');
        console.error('');
    }

    rl.close();
});
