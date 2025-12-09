#!/bin/bash

###############################################################################
# Xero Automated Reconciliation Workflow
# Location: /home/hub/public_html/fins/scripts/xero/recon/auto-recon.sh
#
# Purpose:
#   1. Refresh BOI bank feed in Xero
#   2. Wait 15 minutes for new transactions to sync
#   3. Pull unreconciled transactions for analysis
#
# Usage: ./auto-recon.sh [month] [year]
# Example: ./auto-recon.sh dec 2025
#
# Cron: Run daily at 9:00 AM
#   0 9 * * * /home/hub/public_html/fins/scripts/xero/recon/auto-recon.sh
###############################################################################

# Get current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Get month/year from args or use current date
MONTH=${1:-$(date +%b | tr '[:upper:]' '[:lower:]')}
YEAR=${2:-$(date +%Y)}

# Log file
LOG_FILE="$SCRIPT_DIR/logs/auto-recon-$(date +%Y%m%d).log"
mkdir -p "$SCRIPT_DIR/logs"

echo "============================================================" | tee -a "$LOG_FILE"
echo "Xero Auto-Reconciliation Workflow" | tee -a "$LOG_FILE"
echo "Started: $(date)" | tee -a "$LOG_FILE"
echo "Target: $MONTH $YEAR" | tee -a "$LOG_FILE"
echo "============================================================" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Step 1: Refresh Bank Feed
echo "STEP 1: Refreshing bank feed..." | tee -a "$LOG_FILE"
node refresh-bank-feed.js 2>&1 | tee -a "$LOG_FILE"

if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo "❌ ERROR: Bank feed refresh failed" | tee -a "$LOG_FILE"
    echo "Continuing anyway - attempting transaction pull..." | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
fi

echo "✓ Bank feed refresh complete" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Step 2: Wait for transactions to sync
echo "STEP 2: Waiting 15 minutes for transactions to sync..." | tee -a "$LOG_FILE"
echo "Started wait: $(date)" | tee -a "$LOG_FILE"

# Show countdown
for i in {15..1}; do
    echo "   $i minutes remaining..." | tee -a "$LOG_FILE"
    sleep 60
done

echo "✓ Wait complete: $(date)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Step 3: Pull transactions
echo "STEP 3: Pulling unreconciled transactions..." | tee -a "$LOG_FILE"
node pull-txns.js --month "$MONTH" --year "$YEAR" 2>&1 | tee -a "$LOG_FILE"

if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo "❌ ERROR: Transaction pull failed" | tee -a "$LOG_FILE"
    exit 1
fi

echo "" | tee -a "$LOG_FILE"

# Step 4: Cleanup old logs (keep only last 2 login attempts)
echo "STEP 4: Cleaning up old log files..." | tee -a "$LOG_FILE"
bash "$SCRIPT_DIR/cleanup-logs.sh" 2>&1 | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "============================================================" | tee -a "$LOG_FILE"
echo "✅ AUTO-RECONCILIATION WORKFLOW COMPLETE" | tee -a "$LOG_FILE"
echo "Completed: $(date)" | tee -a "$LOG_FILE"
echo "============================================================" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "Next steps:" | tee -a "$LOG_FILE"
echo "  1. Review transactions in $SCRIPT_DIR/$YEAR/${MONTH}-txns.json" | tee -a "$LOG_FILE"
echo "  2. AI will analyze and generate reconciliation decisions" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

exit 0
