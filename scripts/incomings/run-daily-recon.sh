#!/bin/bash

# Daily Incoming Payments Reconciliation
# Runs at 6am to pull Xero transactions and assign payments
# =========================================================

set -e  # Exit on error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
XERO_SCRIPT="$PROJECT_ROOT/scripts/xero/recon/pull-txns.js"
WORKFLOW_SCRIPT="$SCRIPT_DIR/payment-assignment-workflow.js"
LOG_DIR="$SCRIPT_DIR/logs"
TEMP_DIR="$LOG_DIR/temp"

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"
mkdir -p "$TEMP_DIR"

# Set up logging
DATE=$(date +%Y-%m-%d)
TIME=$(date +%H:%M:%S)
LOG_FILE="$LOG_DIR/daily-recon-$DATE.log"

log() {
    echo "[$(date +%H:%M:%S)] $1" | tee -a "$LOG_FILE"
}

log "=========================================="
log "Daily Incoming Payments Reconciliation"
log "=========================================="
log "Started at: $TIME"

# Get current month and year
MONTH=$(date +%b | tr '[:upper:]' '[:lower:]')
YEAR=$(date +%Y)

log "Processing month: $MONTH $YEAR"

# Step 1: Pull Xero transactions
log ""
log "Step 1: Pulling unreconciled Xero transactions..."
XERO_OUTPUT="$PROJECT_ROOT/scripts/xero/recon/$YEAR/$(date +%m)-$MONTH-txns.json"

cd "$PROJECT_ROOT/scripts/xero/recon"

if node pull-txns.js --month "$MONTH" --year "$YEAR" 2>&1 | tee -a "$LOG_FILE"; then
    log "✅ Xero transactions pulled successfully"
    log "Output: $XERO_OUTPUT"
else
    log "❌ ERROR: Failed to pull Xero transactions"
    exit 1
fi

# Check if file was created
if [ ! -f "$XERO_OUTPUT" ]; then
    log "❌ ERROR: Xero output file not found: $XERO_OUTPUT"
    exit 1
fi

# Step 2: Run payment assignment workflow
log ""
log "Step 2: Running payment assignment workflow..."

cd "$SCRIPT_DIR"

# Set production mode (remove DRY_RUN to actually create payments)
# export DRY_RUN=false

if node "$WORKFLOW_SCRIPT" "$XERO_OUTPUT" 2>&1 | tee -a "$LOG_FILE"; then
    log "✅ Payment assignment workflow completed"
else
    log "❌ ERROR: Payment assignment workflow failed"
    exit 1
fi

# Clean up temp files older than 7 days
log ""
log "Cleaning up old temp files..."
find "$TEMP_DIR" -type f -mtime +7 -delete 2>/dev/null || true

log ""
log "=========================================="
log "Daily reconciliation completed at: $(date +%H:%M:%S)"
log "=========================================="
