# Fidelo Invoice Extraction & Analysis - Manual

## Overview
This system extracts D-Invoice data (paid invoices) from the Fidelo API and processes them for hourly rate analysis.

## Directory Structure
```
/home/hub/public_html/fins/scripts/fidelo/hourly/
├── extract-all-invoices-2025.js  # Main extraction script
├── merge-year.js                  # Merges monthly files into yearly file
├── process-year.js                # Processes data for dashboard
├── extract-all-years.sh           # Batch script to extract all years
├── MANUAL.md                      # This file
└── [YYYY]/                        # Year folders (2017-2025)
    ├── 01-YYYY.json              # Monthly extracted invoices
    ├── 02-YYYY.json
    ├── ...
    ├── YYYY-master.json          # Merged yearly invoices
    └── all-courses-YYYY.json     # Processed for dashboard
```

## Scripts

### 1. extract-all-invoices-2025.js
**Purpose:** Extracts D-Invoices from Fidelo API for a specific date range.

**Usage:**
```bash
node extract-all-invoices-2025.js START_DATE END_DATE
```

**Example:**
```bash
# Extract January 2024
node extract-all-invoices-2025.js 2024-01-01 2024-01-31

# Extract full year 2024 (WARNING: API limits to 1000 bookings)
node extract-all-invoices-2025.js 2024-01-01 2024-12-31
```

**Important Notes:**
- Dates must be in YYYY-MM-DD format
- API has a 1000 booking limit per request
- For full years, extract month-by-month to avoid limit
- Output: `[YEAR]/[MONTH]-[YEAR].json`
- Automatically excludes:
  - Proforma invoices (P-invoices)
  - Credit notes (negative amounts)
  - Cancelled/inactive bookings

**Data Extracted:**
- Booking ID
- Invoice number (D-invoice only)
- Invoice date
- Student details (ID, name, email, nationality)
- Agent information (name, commission amount)
- Course details (name, category, dates, weeks, hours)
- Line items (amount, discount, commission, NADC)
- Payment method
- Totals (amount, discount, commission, NADC)

---

### 2. merge-year.js
**Purpose:** Merges all monthly JSON files into a single yearly master file.

**Usage:**
```bash
node merge-year.js YEAR
```

**Example:**
```bash
node merge-year.js 2024
```

**What it does:**
- Reads all files: `01-2024.json` through `12-2024.json`
- Combines all invoices into one array
- Calculates yearly totals
- Output: `[YEAR]/[YEAR]-master.json`

**Output Structure:**
```json
{
  "generated": "2024-12-15T10:00:00.000Z",
  "period": "2024-01-01 to 2024-12-31",
  "description": "Master data: All D-invoices for 2024",
  "summary": {
    "totalInvoices": 1234,
    "totalRevenue": 1234567.89,
    "totalDiscounts": 12345.67,
    "totalCommissions": 23456.78,
    "agentStudents": 456,
    "directStudents": 778
  },
  "invoices": [ ... ]
}
```

---

### 3. process-year.js
**Purpose:** Processes yearly master file for dashboard consumption - filters to course data only and calculates hourly rates.

**Usage:**
```bash
node process-year.js YEAR
```

**Example:**
```bash
node process-year.js 2024
```

**What it does:**
1. Reads `[YEAR]/[YEAR]-master.json`
2. Filters line items to courses only (excludes accommodation, insurance, exams, etc.)
3. Categorizes courses as:
   - **Morning** (15 hours/week)
   - **Afternoon** (15 hours/week)
   - **Both** (GE30/Intensive - split 50/50)
4. Calculates hourly rates: `NADC / Total Hours`
5. Separates by student type (Direct vs Agent)
6. Output: `[YEAR]/all-courses-[YEAR].json`

**Rate Calculation:**
- **Direct Students:** Rate = (Amount - Discount) / Hours
- **Agent Students:** Rate = (Amount - Discount - Commission) / Hours

**Important:** Agent rates should ALWAYS be lower than Direct rates (due to 25% commission).

---

### 4. extract-all-years.sh
**Purpose:** Batch script to extract all months for multiple years.

**Usage:**
```bash
bash extract-all-years.sh
```

**What it does:**
- Loops through years 2018-2024
- Extracts all 12 months for each year
- Merges each year automatically
- Runs in background, logs to `extract-all-years.log`

**To monitor progress:**
```bash
tail -f extract-all-years.log
```

---

## Complete Workflow

### Extract a Single Year
```bash
# 1. Extract all months
for month in 01 02 03 04 05 06 07 08 09 10 11 12; do
  node extract-all-invoices-2025.js 2024-${month}-01 2024-${month}-31
done

# 2. Merge into yearly file
node merge-year.js 2024

# 3. Process for dashboard
node process-year.js 2024
```

### Extract All Years (2017-2024)
```bash
bash extract-all-years.sh
```

---

## Dashboard Access

**URL:** https://hub.ulearnschool.com/fins/scripts/fidelo/hourly/2025/dashboard-v3.html

**Features:**
- Select year from dropdown (2017-2025)
- View Morning/Afternoon class rates
- Compare Direct vs Agent students
- Filter by student type
- Monthly breakdown
- Export to CSV

**Data Requirements:**
Dashboard needs: `[YEAR]/all-courses-[YEAR].json`

---

## Troubleshooting

### "Data not available for [YEAR]"
**Cause:** Missing `all-courses-[YEAR].json` file
**Solution:**
```bash
# Check if master file exists
ls -lh [YEAR]/[YEAR]-master.json

# If missing, merge monthly files
node merge-year.js [YEAR]

# Then process
node process-year.js [YEAR]
```

### Agent Rate Higher Than Direct Rate
**Cause:** Data accuracy issue or extraction error
**Solution:**
- Verify source data in Fidelo
- Check commission amounts in monthly JSON files
- Agent GROSS rate should be ~33% higher than Direct to account for 25% commission

### API 1000 Booking Limit
**Cause:** Fetching full year in one request
**Solution:** Extract month-by-month instead

### Script Errors / Failures
**Check logs:**
```bash
tail -100 extract-all-years.log
```

---

## Data Definitions

- **Amount:** Original price before any deductions
- **Discount:** Direct price reductions (student discounts, promotions)
- **Commission:** Agent commission (typically 25% of amount)
- **NADC:** Net After Discount & Commission (actual revenue received)
- **D-Invoice:** Paid invoice (vs P-invoice = Proforma)
- **Direct Student:** B2C student (no agent) - studentType: 'direct'
- **Agent Student:** B2B student via agency - studentType: 'agent'

---

## File Locations

- **Scripts:** `/home/hub/public_html/fins/scripts/fidelo/hourly/`
- **Data:** `/home/hub/public_html/fins/scripts/fidelo/hourly/[YEAR]/`
- **Dashboard:** `/home/hub/public_html/fins/scripts/fidelo/hourly/2025/dashboard-v3.html`
- **Archive:** `/home/hub/public_html/fins/scripts/fidelo/hourly/archive/` (old/obsolete scripts)

---

## API Information

- **Fidelo API:** `https://ulearn.fidelo.com/api/1.0/`
- **Booking Search:** `gui2/b56eab683e450abb7100bfa45fc238fd/search`
- **Booking Detail:** `api/1.1/ts/booking/[ID]`
- **Token:** Stored in script (699c957fb710153384dc0aea54e5dbec)
- **Limits:** 1000 bookings per search request
- **Rate Limiting:** 200ms delay between requests

---

## Support

For issues or questions, refer to:
- Git history: `git log extract-all-invoices-2025.js`
- Previous conversation context in Claude Code sessions
