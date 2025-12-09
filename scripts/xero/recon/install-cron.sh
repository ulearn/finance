#!/bin/bash

###############################################################################
# Install Xero Recon Cron Jobs
# Location: /home/hub/public_html/fins/scripts/xero/recon/install-cron.sh
#
# Schedule:
#   05:45 - Refresh bank feed
#   06:00 - Pull transactions (15 min after refresh)
#   08:45 - Refresh bank feed
#   09:00 - Pull transactions
#   11:45 - Refresh bank feed
#   12:00 - Pull transactions
#   14:45 - Refresh bank feed
#   15:00 - Pull transactions
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================================"
echo "Installing Xero Recon Cron Jobs"
echo "============================================================"
echo ""
echo "Schedule:"
echo "  05:45 AM - Refresh bank feed"
echo "  06:00 AM - Pull transactions"
echo "  08:45 AM - Refresh bank feed"
echo "  09:00 AM - Pull transactions"
echo "  11:45 AM - Refresh bank feed"
echo "  12:00 PM - Pull transactions"
echo "  02:45 PM - Refresh bank feed"
echo "  03:00 PM - Pull transactions"
echo ""
echo "============================================================"
echo ""

# Create temp file with new cron entries
TEMP_CRON=$(mktemp)

# Get existing crontab (if any)
crontab -l > "$TEMP_CRON" 2>/dev/null || true

# Remove any existing Xero recon cron jobs (in case reinstalling)
sed -i '/xero.*recon.*refresh-bank-feed/d' "$TEMP_CRON"
sed -i '/xero.*recon.*pull-txns/d' "$TEMP_CRON"

# Add new cron jobs
cat >> "$TEMP_CRON" << EOF

# Xero Bank Reconciliation - Auto Refresh & Pull (4 times daily)
# Round 1: 5:45am refresh, 6:00am pull
45 5 * * * cd $SCRIPT_DIR && /home/hub/.nvm/versions/node/v22.19.0/bin/node refresh-bank-feed.js >> logs/refresh.log 2>&1
0 6 * * * cd $SCRIPT_DIR && /home/hub/.nvm/versions/node/v22.19.0/bin/node pull-txns.js --month \$(date +\%b | tr '[:upper:]' '[:lower:]') --year \$(date +\%Y) >> logs/pull-txns.log 2>&1

# Round 2: 8:45am refresh, 9:00am pull
45 8 * * * cd $SCRIPT_DIR && /home/hub/.nvm/versions/node/v22.19.0/bin/node refresh-bank-feed.js >> logs/refresh.log 2>&1
0 9 * * * cd $SCRIPT_DIR && /home/hub/.nvm/versions/node/v22.19.0/bin/node pull-txns.js --month \$(date +\%b | tr '[:upper:]' '[:lower:]') --year \$(date +\%Y) >> logs/pull-txns.log 2>&1

# Round 3: 11:45am refresh, 12:00pm pull
45 11 * * * cd $SCRIPT_DIR && /home/hub/.nvm/versions/node/v22.19.0/bin/node refresh-bank-feed.js >> logs/refresh.log 2>&1
0 12 * * * cd $SCRIPT_DIR && /home/hub/.nvm/versions/node/v22.19.0/bin/node pull-txns.js --month \$(date +\%b | tr '[:upper:]' '[:lower:]') --year \$(date +\%Y) >> logs/pull-txns.log 2>&1

# Round 4: 2:45pm refresh, 3:00pm pull
45 14 * * * cd $SCRIPT_DIR && /home/hub/.nvm/versions/node/v22.19.0/bin/node refresh-bank-feed.js >> logs/refresh.log 2>&1
0 15 * * * cd $SCRIPT_DIR && /home/hub/.nvm/versions/node/v22.19.0/bin/node pull-txns.js --month \$(date +\%b | tr '[:upper:]' '[:lower:]') --year \$(date +\%Y) >> logs/pull-txns.log 2>&1

EOF

# Install the new crontab
crontab "$TEMP_CRON"

# Clean up
rm "$TEMP_CRON"

echo "✅ Cron jobs installed successfully!"
echo ""
echo "To verify installation:"
echo "  crontab -l | grep -A 1 'Xero'"
echo ""
echo "To view logs:"
echo "  tail -f $SCRIPT_DIR/logs/refresh.log"
echo "  tail -f $SCRIPT_DIR/logs/pull-txns.log"
echo ""
echo "To remove cron jobs:"
echo "  crontab -e"
echo "  (then delete the Xero lines)"
echo ""
