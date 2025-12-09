# Payment Assignment - Cron Setup

## Overview

The payment assignment workflow runs automatically once daily to process yesterday's incoming payments from all sources (Stripe, Revolut, BOI/Xero).

## Schedule

- **06:30 AM** - Process yesterday's payments (LIVE mode)
  - Runs after Xero bank reconciliation completes at 6:00 AM
  - Processes payments from Stripe, Revolut, and BOI (via Xero)
  - Automatically assigns payments to Fidelo bookings
  - Posts results to #financial Slack channel

## Installation

```bash
cd /home/hub/public_html/fins/scripts/assign
bash install-assign-cron.sh
```

This will install a daily cron job that runs at 6:30 AM.

## Verification

Check that the cron job was installed:

```bash
crontab -l | grep -A 1 "Payment Assignment"
```

Expected output:
```
# Payment Assignment - Daily Run (processes yesterday's payments)
30 6 * * * /home/hub/.nvm/versions/node/v22.19.0/bin/node run-daily.js --live >> logs/daily-assign.log 2>&1
```

## Monitoring

View real-time logs:

```bash
tail -f /home/hub/public_html/fins/scripts/assign/logs/daily-assign.log
```

## Manual Runs

### Run for specific date range
```bash
cd /home/hub/public_html/fins/scripts/assign
node run-date-range.js --start 2025-12-02 --end 2025-12-05 --live
```

### Run for today only (dry-run)
```bash
cd /home/hub/public_html/fins/scripts/assign
node run-daily.js
```

### Run for today (live mode)
```bash
cd /home/hub/public_html/fins/scripts/assign
node run-daily.js --live
```

## Retry Failed Transactions

If transactions fail with errors:

```bash
cd /home/hub/public_html/fins/scripts/assign
node retry-failed.js
```

## Workflow Details

The assign workflow:

1. **Fetches transactions** from all sources (Stripe, Revolut, BOI via Xero)
2. **Matches payments** using priority system:
   - Slack remittance messages (#financial channel)
   - TransferMate payout emails (Gmail)
   - Fidelo search (reference numbers, student IDs, names + amounts)
   - HubSpot deals (amount + name matching)
3. **Auto-confirms** unconfirmed students when payment received
4. **Detects duplicates** across all invoices for each student
5. **Handles escrow** payments (TransferMate Escrow)
6. **Assigns payments** to Fidelo bookings
7. **Posts results** to Slack #financial channel

## Tracking

Transaction statuses are tracked in:
```
/home/hub/public_html/fins/scripts/assign/2025/[MM]-[month]-tracker.json
```

Status codes:
- `assigned` - Successfully assigned to Fidelo
- `duplicate` - Already exists in Fidelo (skipped)
- `review` - Needs manual review (posted to Slack)
- `failed` - Error occurred during assignment

## Troubleshooting

### Cron not running

Check crontab is installed:
```bash
crontab -l
```

### Permission issues

Ensure script is executable:
```bash
chmod +x /home/hub/public_html/fins/scripts/assign/run-daily.js
```

### Node not found

The cron uses full path to node:
```
/home/hub/.nvm/versions/node/v22.19.0/bin/node
```

If node version changes, update the cron path in `install-assign-cron.sh`

## Removal

To remove the cron job:

```bash
crontab -e
```

Then delete the lines under "Payment Assignment"
