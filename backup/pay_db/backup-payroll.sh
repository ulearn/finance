#!/bin/bash
# MySQL Backup Script for hub_payroll
# Runs on the last Friday of each month
# Keeps 14 most recent backups

# Load environment variables
export $(grep -v '^#' /home/hub/public_html/fins/.env | xargs)

# Backup directory
BACKUP_DIR="/home/hub/public_html/fins/backup/pay_db"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="hub_payroll_${DATE}.sql.gz"

# Number of backups to keep
KEEP_BACKUPS=14

# Log file
LOG_FILE="${BACKUP_DIR}/backup.log"

echo "========================================" >> "$LOG_FILE"
echo "Backup started at $(date)" >> "$LOG_FILE"

# Create backup
mysqldump -h "${DB_HOST}" \
  -P "${DB_PORT:-3306}" \
  -u "${DB_USER}" \
  -p"${DB_PASSWORD}" \
  --single-transaction \
  --no-tablespaces \
  --routines \
  --triggers \
  --events \
  hub_payroll 2>&1 | grep -v "Using a password" | gzip > "${BACKUP_DIR}/${BACKUP_FILE}"

if [ $? -eq 0 ]; then
    FILE_SIZE=$(du -h "${BACKUP_DIR}/${BACKUP_FILE}" | cut -f1)
    echo "✓ Backup successful: ${BACKUP_FILE} (${FILE_SIZE})" >> "$LOG_FILE"

    # Rotate old backups - keep only the most recent $KEEP_BACKUPS
    cd "${BACKUP_DIR}"
    ls -t hub_payroll_*.sql.gz | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm

    REMAINING=$(ls -1 hub_payroll_*.sql.gz 2>/dev/null | wc -l)
    echo "  Backups kept: ${REMAINING}" >> "$LOG_FILE"
else
    echo "✗ Backup failed!" >> "$LOG_FILE"
    exit 1
fi

echo "Backup completed at $(date)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"
