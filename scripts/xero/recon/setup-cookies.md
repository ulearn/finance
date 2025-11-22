# Xero Cookie Setup

Since Xero's bot detection prevents automated 2FA, we use cookie-based authentication.

## One-Time Setup

### Step 1: Export Cookies from Your Browser

1. Login to Xero manually in Chrome/Firefox on your local machine
2. Complete 2FA and check "Trust this device"
3. Install a cookie export extension:
   - Chrome: "EditThisCookie" or "Cookie-Editor"
   - Firefox: "Cookie-Editor"
4. Export all cookies for `*.xero.com` and `*.go.xero.com`
5. Save as `/home/hub/public_html/fins/scripts/xero/recon/cookies.json`

### Step 2: Upload to Server

```bash
scp cookies.json hub@YOUR_SERVER:/home/hub/public_html/fins/scripts/xero/recon/
```

### Step 3: Run Observer

The observer will automatically load cookies if `cookies.json` exists.

## Cookie Format

Cookies should be in Puppeteer format (array of cookie objects):

```json
[
  {
    "name": "cookie_name",
    "value": "cookie_value",
    "domain": ".xero.com",
    "path": "/",
    "expires": 1234567890,
    "httpOnly": true,
    "secure": true
  }
]
```

## Refreshing Cookies

When the session expires (usually 30 days), repeat the export process.

## Automated Cookie Refresh (Future)

We can add a scheduled task to check if cookies are expiring and notify you to refresh them.
