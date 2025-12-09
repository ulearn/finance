#!/bin/bash

###############################################################################
# Install Assign Task Cron Job
# Location: /home/hub/public_html/fins/scripts/assign/install-assign-cron.sh
#
# Schedule:
#   06:30 AM - Run daily payment assignment (after xero recon completes at 6:00)
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================================"
echo "Installing Payment Assignment Cron Job"
echo "============================================================"
echo ""
echo "Schedule:"
echo "  06:30 AM - Process yesterday's payments (LIVE mode)"
echo ""
echo "Note: Runs after Xero recon completes at 6:00 AM"
echo "============================================================"
echo ""

# Create logs directory if it doesn't exist
mkdir -p "$SCRIPT_DIR/logs"

# Create temp file with new cron entries
TEMP_CRON=$(mktemp)

# Get existing crontab (if any)
crontab -l > "$TEMP_CRON" 2>/dev/null || true

# Remove any existing assign cron jobs (in case reinstalling)
sed -i '/assign.*run-daily/d' "$TEMP_CRON"

# Add new cron job
cat >> "$TEMP_CRON" << EOF

# Payment Assignment - Daily Run (processes today's payments)
30 6 * * * cd $SCRIPT_DIR && /home/hub/.nvm/versions/node/v22.19.0/bin/node run.js --live >> logs/daily-assign.log 2>&1

EOF

# Install the new crontab
crontab "$TEMP_CRON"

# Clean up
rm "$TEMP_CRON"

echo "✅ Cron job installed successfully!"
echo ""
echo "To verify installation:"
echo "  crontab -l | grep -A 1 'Payment Assignment'"
echo ""
echo "To view logs:"
echo "  tail -f $SCRIPT_DIR/logs/daily-assign.log"
echo ""
echo "To remove cron job:"
echo "  crontab -e"
echo "  (then delete the Payment Assignment line)"
echo ""
