# Xero Recon Logs Management

## Overview

The Xero reconciliation process creates many debug log files during bank feed refreshes (screenshots at each step of the login process). These files accumulate quickly.

## Automatic Cleanup

The logs are now cleaned up automatically after each recon run.

### What Gets Kept

- **Last 2 login attempts only** (all files from those 2 timestamps)
- `pull-txns.log` (current operation log)
- `refresh.log` (current operation log)

### What Gets Deleted

- All login screenshots older than the last 2 attempts
- All HTML debug files from old attempts
- All session JSON files from old attempts

## Files Created Per Login Attempt

Each login creates approximately 6-8 files:
- `login-page-{timestamp}.png` - Login screen
- `post-login-{timestamp}.png` - After login
- `2fa-page-{timestamp}.html` - 2FA page HTML
- `post-2fa-{timestamp}.png` - After 2FA
- `session-{timestamp}.json` - Session data
- Plus error screenshots if issues occur

## Manual Cleanup

If you need to manually clean logs:

```bash
cd /home/hub/public_html/fins/scripts/xero/recon
bash cleanup-logs.sh
```

## Space Savings

Before: 717 files (133MB)
After: 4 files (128KB)

**Space saved: 132.8MB per cleanup**

## Automatic Execution

Cleanup runs automatically as **Step 4** of `auto-recon.sh` (after pulling transactions).

Cron: Daily at 9:00 AM
```
0 9 * * * /home/hub/public_html/fins/scripts/xero/recon/auto-recon.sh
```

## Log Retention

Logs from the last 2 login attempts are kept indefinitely for debugging. This means:
- If logins succeed: Only 2 successful login sets preserved
- If logins fail: Last 2 attempts (successful or failed) preserved
- Older failures are automatically purged

## Troubleshooting

If you need to see older logs for debugging, they will be gone after cleanup. Consider:
1. Copying logs before cleanup runs
2. Checking logs immediately after a failure
3. Reviewing `pull-txns.log` and `refresh.log` which are always kept
