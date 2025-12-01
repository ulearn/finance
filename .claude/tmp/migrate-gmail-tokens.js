#!/usr/bin/env node
/**
 * Migrate Gmail tokens from gmail-tokens.json to .env file
 */

const fs = require('fs');
const path = require('path');

const tokensFile = path.join(__dirname, '../../scripts/gmail/gmail-tokens.json');
const envFile = path.join(__dirname, '../../.env');

try {
    // Read tokens from JSON file
    const tokens = JSON.parse(fs.readFileSync(tokensFile, 'utf8'));

    console.log('✓ Found Gmail tokens in JSON file');
    console.log('  - access_token: ' + (tokens.access_token ? 'present' : 'missing'));
    console.log('  - refresh_token: ' + (tokens.refresh_token ? 'present' : 'missing'));
    console.log('  - expiry_date: ' + (tokens.expiry_date || 'not set'));

    // Read .env file
    let envContent = fs.readFileSync(envFile, 'utf8');

    // Remove any existing Gmail token entries
    envContent = envContent
        .split('\n')
        .filter(line => !line.startsWith('GMAIL_ACCESS_TOKEN=') &&
                       !line.startsWith('GMAIL_REFRESH_TOKEN=') &&
                       !line.startsWith('GMAIL_TOKEN_EXPIRY='))
        .join('\n');

    // Add migrated tokens
    const tokenLines = [
        '',
        '# Gmail OAuth Tokens (accounts@ulearnschool.com)',
        `GMAIL_ACCESS_TOKEN=${tokens.access_token}`,
        `GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`,
        `GMAIL_TOKEN_EXPIRY=${tokens.expiry_date || ''}`
    ];

    envContent = envContent.trim() + '\n' + tokenLines.join('\n') + '\n';

    // Write updated .env
    fs.writeFileSync(envFile, envContent);
    console.log('\n✓ Migrated tokens to .env file');

    // Delete the JSON file
    fs.unlinkSync(tokensFile);
    console.log('✓ Deleted gmail-tokens.json file');

    console.log('\n✅ Migration complete!');
    console.log('\nGmail tokens are now stored in .env and will not be committed to git.');

} catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
}
