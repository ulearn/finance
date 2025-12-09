#!/bin/bash

###############################################################################
# Verify Bank Feed Refresh Worked
# Location: /home/hub/public_html/fins/scripts/xero/recon/verify-refresh.sh
#
# Usage: ./verify-refresh.sh
#
# This script:
# 1. Counts unreconciled transactions BEFORE refresh
# 2. Runs bank feed refresh
# 3. Waits 15 minutes
# 4. Counts unreconciled transactions AFTER refresh
# 5. Shows the difference
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================================"
echo "Bank Feed Refresh Verification Test"
echo "Started: $(date)"
echo "============================================================"
echo ""

# Step 1: Get BEFORE count
echo "STEP 1: Pulling current unreconciled transactions (BEFORE)..."
node pull-txns.js --month dec --year 2025 2>&1 | tee /tmp/before-refresh.log

BEFORE_COUNT=$(grep "Total Transactions:" /tmp/before-refresh.log | tail -1 | awk '{print $3}')
echo ""
echo "✓ BEFORE refresh: $BEFORE_COUNT unreconciled transactions"
echo ""

# Step 2: Run refresh
echo "STEP 2: Running bank feed refresh..."
node refresh-bank-feed.js 2>&1 | tee /tmp/refresh.log

if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo "❌ ERROR: Bank feed refresh failed"
    exit 1
fi

echo ""
echo "✓ Refresh complete"
echo ""

# Step 3: Wait
echo "STEP 3: Waiting 15 minutes for new transactions to sync..."
echo "Started wait: $(date)"

for i in {15..1}; do
    echo "   $i minutes remaining..."
    sleep 60
done

echo "✓ Wait complete: $(date)"
echo ""

# Step 4: Get AFTER count
echo "STEP 4: Pulling unreconciled transactions (AFTER)..."
node pull-txns.js --month dec --year 2025 2>&1 | tee /tmp/after-refresh.log

AFTER_COUNT=$(grep "Total Transactions:" /tmp/after-refresh.log | tail -1 | awk '{print $3}')
echo ""
echo "✓ AFTER refresh: $AFTER_COUNT unreconciled transactions"
echo ""

# Step 5: Compare
echo "============================================================"
echo "RESULTS"
echo "============================================================"
echo "Before:     $BEFORE_COUNT transactions"
echo "After:      $AFTER_COUNT transactions"

DIFF=$((AFTER_COUNT - BEFORE_COUNT))

if [ $DIFF -gt 0 ]; then
    echo "Difference: +$DIFF NEW transactions"
    echo ""
    echo "✅ SUCCESS! Bank feed refresh worked!"
    echo "   $DIFF new transactions appeared in Xero"
elif [ $DIFF -eq 0 ]; then
    echo "Difference: 0 transactions"
    echo ""
    echo "⚠️  UNCLEAR: No new transactions appeared"
    echo "   This could mean:"
    echo "   1. Refresh worked but BOI has no new transactions"
    echo "   2. Refresh failed silently"
    echo "   3. Transactions take longer than 15 min to sync"
else
    echo "Difference: $DIFF transactions (some were reconciled)"
    echo ""
    echo "ℹ️  Some transactions were reconciled during the wait period"
fi

echo "============================================================"
echo "Completed: $(date)"
echo "============================================================"
