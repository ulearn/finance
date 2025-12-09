# Xero Recon - Automated Schedule

## 📅 Daily Schedule (4 Times Per Day)

| Time     | Action                    | Purpose                              |
|----------|---------------------------|--------------------------------------|
| **05:45 AM** | Refresh Bank Feed     | Trigger BOI to send new transactions |
| **06:00 AM** | Pull Transactions     | Collect overnight transactions       |
| **08:45 AM** | Refresh Bank Feed     | Trigger BOI morning sync             |
| **09:00 AM** | Pull Transactions     | Collect morning transactions         |
| **11:45 AM** | Refresh Bank Feed     | Trigger BOI midday sync              |
| **12:00 PM** | Pull Transactions     | Collect midday transactions          |
| **02:45 PM** | Refresh Bank Feed     | Trigger BOI afternoon sync           |
| **03:00 PM** | Pull Transactions     | Collect afternoon transactions       |

## 🔄 What Happens Each Round

### Refresh Bank Feed (X:45)
1. Logs into Xero with 2FA
2. Navigates to BOI account
3. Clicks "Refresh Bank Feed" link
4. BOI receives request to sync new transactions
5. Logs to: `logs/refresh.log`

### Pull Transactions (X:00 - 15 min later)
1. Logs into Xero with 2FA
2. Navigates to Bank Reconciliation
3. Collects all unreconciled transactions for current month
4. Checks for Xero AI suggestions
5. Saves to: `2025/MM-mon-txns.json`
6. Logs to: `logs/pull-txns.log`

## 📂 Output Files

### Transaction Data
```
/home/hub/public_html/fins/scripts/xero/recon/2025/
  └── 12-dec-txns.json  (updated 4x daily)
```

### Logs
```
/home/hub/public_html/fins/scripts/xero/recon/logs/
  ├── refresh.log        (bank feed refresh logs)
  ├── pull-txns.log      (transaction pull logs)
  ├── login-page-*.png   (login screenshots)
  └── error-*.png        (error screenshots if any)
```

## 🔍 Monitoring

### Check if cron is running:
```bash
# View today's refresh log
tail -f /home/hub/public_html/fins/scripts/xero/recon/logs/refresh.log

# View today's pull log
tail -f /home/hub/public_html/fins/scripts/xero/recon/logs/pull-txns.log

# Check last transaction pull
ls -lht /home/hub/public_html/fins/scripts/xero/recon/2025/*-txns.json | head -1
```

### Check transaction count history:
```bash
# See when transactions were collected and how many
grep "Total Transactions:" logs/pull-txns.log | tail -20
```

## 🛠️ Management

### View installed cron jobs:
```bash
crontab -l | grep -A 1 'Xero'
```

### Reinstall cron jobs:
```bash
cd /home/hub/public_html/fins/scripts/xero/recon
./install-cron.sh
```

### Remove cron jobs:
```bash
crontab -e
# Delete the Xero lines, save and exit
```

### Test manually (outside of schedule):
```bash
cd /home/hub/public_html/fins/scripts/xero/recon

# Refresh bank feed
node refresh-bank-feed.js

# Pull transactions
node pull-txns.js --month dec --year 2025
```

## ⚠️ Important Notes

1. **Timing**: 15-minute gap between refresh and pull gives Xero time to sync with BOI
2. **Month Detection**: Pull script automatically detects current month from system date
3. **Logs**: All cron output goes to log files (not email)
4. **2FA**: Uses TOTP from .env file (no manual intervention needed)
5. **Headless**: Runs in background without opening browser windows

## 📊 Expected Results

After each pull, you should see transaction count for current month. Example:

```
📊 Summary:
   Month: DEC 2025
   Total Transactions: 15
   RECEIVE: 8
   SPEND: 7
```

The JSON file gets overwritten each time, always containing the latest unreconciled transactions for the current month.

## 🔐 Next Steps After Transactions Are Pulled

1. **AI Analysis**: Claude analyzes the JSON file
2. **Generate Decisions**: Create reconciliation decisions
3. **Review**: Human reviews the decisions
4. **Execute**: Run `execute-recon.js` to apply decisions
5. **Verify**: Check Xero UI to confirm

---

**Installed:** 2025-12-05
**Schedule:** 4x daily (5:45am, 8:45am, 11:45am, 2:45pm)
**Status:** ✅ Active
