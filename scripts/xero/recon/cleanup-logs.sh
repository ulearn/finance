#!/bin/bash
# Cleanup old Xero recon logs - keep only last 2 login attempts
# Location: /home/hub/public_html/fins/scripts/xero/recon/cleanup-logs.sh

LOGS_DIR="/home/hub/public_html/fins/scripts/xero/recon/logs"

echo "🧹 Cleaning up old Xero recon logs..."
echo "Location: $LOGS_DIR"

# Count files before cleanup
BEFORE_COUNT=$(ls "$LOGS_DIR"/*.{png,html} 2>/dev/null | wc -l)
echo "Files before cleanup: $BEFORE_COUNT"

# Get the 2 most recent login timestamps (these represent the last 2 login attempts)
# Each login attempt creates multiple files: login-page, post-login, 2fa-page, post-2fa, etc.
RECENT_TIMESTAMPS=$(ls "$LOGS_DIR"/login-page-*.png 2>/dev/null | \
  sed 's/.*login-page-\([0-9]*\).png/\1/' | \
  sort -rn | \
  head -2)

if [ -z "$RECENT_TIMESTAMPS" ]; then
  echo "⚠️  No login-page files found - nothing to clean"
  exit 0
fi

echo "Keeping last 2 login attempts:"
echo "$RECENT_TIMESTAMPS" | while read ts; do
  echo "  - Timestamp: $ts"
done

# Build a pattern to match files from recent timestamps
KEEP_PATTERN=""
for ts in $RECENT_TIMESTAMPS; do
  if [ -z "$KEEP_PATTERN" ]; then
    KEEP_PATTERN="$ts"
  else
    KEEP_PATTERN="$KEEP_PATTERN|$ts"
  fi
done

# Delete all files that don't match the recent timestamps
DELETED=0
for file in "$LOGS_DIR"/*.{png,html,json}; do
  [ -e "$file" ] || continue

  filename=$(basename "$file")

  # Keep pull-txns.log and refresh.log (these are current operation logs)
  if [[ "$filename" == "pull-txns.log" ]] || [[ "$filename" == "refresh.log" ]]; then
    continue
  fi

  # Check if filename contains any of the recent timestamps
  if ! echo "$filename" | grep -qE "($KEEP_PATTERN)"; then
    rm "$file"
    ((DELETED++))
  fi
done

# Count files after cleanup (excluding operational logs)
AFTER_COUNT=$(find "$LOGS_DIR" -name "*.png" -o -name "*.html" -o -name "session-*.json" | wc -l)

echo ""
echo "✅ Cleanup complete"
echo "Files deleted: $DELETED"
echo "Files remaining: $AFTER_COUNT (+ 2 operational logs)"
echo "Disk space freed: $(du -sh "$LOGS_DIR" | cut -f1)"
