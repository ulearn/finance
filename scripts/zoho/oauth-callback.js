// Zoho OAuth Callback Handler
// Location: /home/hub/public_html/fins/scripts/zoho/oauth-callback.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const express = require('express');
const router = express.Router();
const ZohoPeopleAPI = require('./people-api');

/**
 * GET /zoho/callback
 * Handle OAuth callback from Zoho
 */
router.get('/', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send('Authorization code missing');
    }

    const zohoAPI = new ZohoPeopleAPI();
    const success = await zohoAPI.exchangeCodeForTokens(code);

    if (success) {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Zoho Authorization Success</title>
                <style>
                    body { font-family: Arial; padding: 50px; text-align: center; }
                    .success { color: green; font-size: 24px; margin-bottom: 20px; }
                    .info { color: #666; }
                </style>
            </head>
            <body>
                <div class="success">✓ Authorization Successful!</div>
                <div class="info">You can now close this window and return to the dashboard.</div>
            </body>
            </html>
        `);
    } else {
        res.status(500).send('Failed to exchange authorization code');
    }
});

module.exports = router;
