# Gmail Reader for TransferMate Notifications

Reads TransferMate batch payment notification emails from `accounts@ulearnschool.com`.

## Setup (One-Time)

### 1. Generate Authorization URL

Run the setup script:

```bash
cd /home/hub/public_html/fins/scripts/gmail
node setup-gmail.js
```

This will print an authorization URL.

### 2. Complete OAuth Flow

1. Open the authorization URL in your browser
2. Log in as **accounts@ulearnschool.com**
3. Grant Gmail permissions
4. You'll be redirected to `https://hub.ulearnschool.com/fins/google/callback`
5. The system automatically detects Gmail authorization and saves tokens to `gmail-tokens.json`

That's it! No need to manually edit `.env` files.

## Usage

### Test Email Reading

```bash
cd /home/hub/public_html/fins/scripts/gmail
node test-reader.js
```

This will:
- Search for TransferMate batch emails from November 2025
- Parse payment data from email bodies
- Display extracted Fidelo references and amounts

### Programmatic Usage

```javascript
const GmailReader = require('./scripts/gmail/reader');

const reader = new GmailReader();

// Search for emails
const emails = await reader.searchTransferMateBatchEmails({
    after: '2025/11/01',
    before: '2025/11/30',
    unreadOnly: true
});

// Parse payments from each email
for (const email of emails) {
    const payments = reader.parseTransferMateBatchEmail(email.body);

    for (const payment of payments) {
        console.log(`€${payment.amount} - Fidelo Ref: ${payment.fideloRef}`);
    }

    // Mark as processed
    await reader.markAsRead(email.id);
}
```

## Email Format

TransferMate sends batch payment notifications with format:

```
Pmnt ID: 690665
Company Name: ULearn Ltd.
Reference: Moana Johanna Frauchiger FIDELO-XML-SERVICE30748
Paid Amnt(PC): 554
Pmnt Curr: EUR
```

The parser extracts:
- `pmntId`: TransferMate payment ID (690665)
- `reference`: Full reference text
- `fideloRef`: Extracted Fidelo reference (30748)
- `amount`: Payment amount (554)
- `currency`: Currency (EUR)

## Files

- `reader.js` - Gmail reader class
- `generate-token.js` - Token generator (run once)
- `test-reader.js` - Test script
- `README.md` - This file
