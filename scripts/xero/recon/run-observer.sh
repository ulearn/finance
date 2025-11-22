#!/bin/bash
# Wrapper script to run observer with automatic 2FA code entry
# This runs the observer in the background and monitors for 2FA, then auto-enters the code

cd /home/hub/public_html/fins/scripts/xero/reconcile
source /home/hub/nodevenv/public_html/fins/20/bin/activate

echo "🚀 Starting Xero Observer with automatic 2FA..."

# Start observer in background
node observer.js 2>&1 | tee logs/observer-output.log &
OBSERVER_PID=$!

echo "Observer PID: $OBSERVER_PID"

# Monitor for 2FA screenshot
echo "Monitoring for 2FA requirement..."
for i in {1..120}; do  # Wait up to 2 minutes
    sleep 1

    # Check if manual-2fa screenshot was created in last 5 seconds
    LATEST_2FA=$(find logs/ -name "manual-2fa-*.png" -mmin -0.1 2>/dev/null | head -1)

    if [ -n "$LATEST_2FA" ]; then
        echo "✓ 2FA screen detected!"
        sleep 2  # Wait for WS endpoint to be ready

        # Generate and enter TOTP code
        echo "Generating TOTP code..."
        CODE=$(node -e "
const { TOTP } = require('otpauth');
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const totp = new TOTP({
    issuer: 'Xero',
    label: process.env.XERO_EMAIL,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: process.env.XERO_TOTP_SECRET
});
console.log(totp.generate());
")

        echo "Entering code: $CODE"
        node enter-2fa-code.js "$CODE"

        if [ $? -eq 0 ]; then
            echo "✅ 2FA code entered successfully"
            break
        else
            echo "⚠️  Failed to enter code, retrying..."
        fi
    fi
done

# Wait for observer to complete
wait $OBSERVER_PID
EXIT_CODE=$?

echo "Observer completed with exit code: $EXIT_CODE"
exit $EXIT_CODE
