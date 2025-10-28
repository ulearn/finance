# Payroll Database Backup System

## Location
`/home/hub/public_html/fins/backup/pay_db/`

## Schedule
Runs automatically on the **last Friday of each month**

## Retention
Keeps the **14 most recent backups** (automatically rotates older ones)

## Database
- Database: `hub_payroll`
- Current size: ~3.6 MB (uncompressed)
- Backup size: ~260 KB (compressed with gzip)

## Manual Backup
To run a backup manually:
```bash
cd /home/hub/public_html/fins/backup/pay_db
./backup-payroll.sh
```

## Restore from Backup
To restore from a backup:
```bash
# List available backups
ls -lh /home/hub/public_html/fins/backup/pay_db/hub_payroll_*.sql.gz

# Restore (example)
gunzip < hub_payroll_2025-10-28_16-58-48.sql.gz | mysql -u hub -p hub_payroll
```

## Log File
Check backup history: `backup.log`
