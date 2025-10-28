#!/bin/bash
# Wrapper script that only runs backup on the last Friday of the month

# Get today's day of week (5 = Friday)
DOW=$(date +%u)

# Get current date
TODAY=$(date +%d)

# Get last day of this month
LAST_DAY=$(date -d "$(date +%Y-%m-01) +1 month -1 day" +%d)

# Check if today is Friday
if [ "$DOW" -ne 5 ]; then
    # Not Friday, exit silently
    exit 0
fi

# Check if this is the last Friday of the month
# (Friday within the last 7 days of the month)
if [ "$TODAY" -ge $((LAST_DAY - 6)) ]; then
    # This is the last Friday - run backup
    /home/hub/public_html/fins/backup/pay_db/backup-payroll.sh
fi
