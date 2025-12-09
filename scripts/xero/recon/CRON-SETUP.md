# Xero Recon Automation - Cron Setup

## Overview

Automated workflow that:
1. **Refreshes BOI bank feed** in Xero (triggers new transaction sync)
2. **Waits 15 minutes** for Xero to fetch new transactions from BOI
3. **Pulls unreconciled transactions** for AI analysis

## Scripts

### 1. `refresh-bank-feed.js`
- Logs into Xero with 2FA
- Navigates to BOI account
- Clicks "Manage Account" → "Refresh Bank Feed"
- **Runtime:** ~30 seconds

### 2. `pull-txns.js`
- Collects unreconciled transactions
- Filters by target month/year
- Checks for Xero suggestions
- Saves to JSON for AI analysis
- **Runtime:** ~1 minute

### 3. `auto-recon.sh` (Wrapper)
- Runs refresh-bank-feed.js
- Waits 15 minutes
- Runs pull-txns.js with current month
- Logs everything to `logs/auto-recon-YYYYMMDD.log`
- **Runtime:** ~16.5 minutes total

## Cron Job Setup

### Option 1: Daily Auto-Run (Recommended)

Run every day at 9:00 AM to catch new transactions:

```bash
0 9 * * * /home/hub/public_html/fins/scripts/xero/recon/auto-recon.sh >> /home/hub/public_html/fins/scripts/xero/recon/logs/cron.log 2>&1
```

### Option 2: Multiple Times Per Day

Run 3 times daily (9am, 1pm, 5pm):

```bash
0 9,13,17 * * * /home/hub/public_html/fins/scripts/xero/recon/auto-recon.sh >> /home/hub/public_html/fins/scripts/xero/recon/logs/cron.log 2>&1
```

### Option 3: Manual Trigger Only

Don't set up cron, just run manually when needed:

```bash
cd /home/hub/public_html/fins/scripts/xero/recon
./auto-recon.sh
```

## Manual Usage

### Refresh bank feed only (no transaction pull):
```bash
node refresh-bank-feed.js
```

### Pull transactions only (no refresh):
```bash
node pull-txns.js --month dec --year 2025
```

### Full workflow for specific month:
```bash
./auto-recon.sh dec 2025
```

## Output Files

All transaction data saved to:
```
/home/hub/public_html/fins/scripts/xero/recon/2025/
  ├── 1-jan-txns.json
  ├── 2-feb-txns.json
  ├── 3-mar-txns.json
  └── ... (12-dec-txns.json)
```

## Logs

All logs saved to:
```
/home/hub/public_html/fins/scripts/xero/recon/logs/
  ├── auto-recon-20251205.log  (daily workflow logs)
  ├── cron.log                 (cron execution logs)
  ├── login-page-*.png         (screenshots)
  └── error-*.png              (error screenshots)
```

## Monitoring

Check if cron is working:
```bash
# View today's log
tail -f /home/hub/public_html/fins/scripts/xero/recon/logs/auto-recon-$(date +%Y%m%d).log

# View cron execution log
tail -f /home/hub/public_html/fins/scripts/xero/recon/logs/cron.log

# Check last transaction pull
ls -lht /home/hub/public_html/fins/scripts/xero/recon/2025/*-txns.json | head -1
```

## Troubleshooting

### Cron not running?
1. Check cron is enabled: `crontab -l`
2. Check script has execute permissions: `ls -l auto-recon.sh`
3. Check cron.log for errors: `tail -50 logs/cron.log`

### Bank feed refresh failing?
1. Check screenshots in `logs/` directory
2. Verify Xero credentials in `.env` file
3. Test manually: `node refresh-bank-feed.js`

### No new transactions?
1. Bank feed refresh takes 5-15 minutes to sync
2. BOI may have no new transactions
3. Check Xero UI manually to verify

## Installing the Cron Job

```bash
# Edit crontab
crontab -e

# Add this line (daily at 9am):
0 9 * * * /home/hub/public_html/fins/scripts/xero/recon/auto-recon.sh >> /home/hub/public_html/fins/scripts/xero/recon/logs/cron.log 2>&1

# Save and exit
# Verify it's installed:
crontab -l
```

## Next Steps After Transaction Pull

1. **AI Analysis**: Claude analyzes the JSON file and generates reconciliation decisions
2. **Review**: Human reviews the decisions
3. **Execute**: Run `execute-recon.js` to apply the decisions to Xero
4. **Verify**: Check Xero UI to confirm reconciliation

---

**Created:** 2025-12-05
**Last Updated:** 2025-12-05
