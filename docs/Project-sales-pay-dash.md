# Revenue & Commissions Dashboard - Technical Specification

**Location**: `/home/hub/public_html/fins/scripts/pay/sales/`
**Version**: v14 (October 2025)
**Purpose**: Real-time revenue tracking and commission calculations for management team

---

## Overview

This dashboard provides a comprehensive view of ULearn's revenue streams, broken down by:
- **B2C Revenue** (Direct student bookings - Diego's responsibility)
- **B2B Revenue** (Agency bookings - Cenker's responsibility)
- **Total Revenue** (Combined view)
- **Escrow Tracking** (TransferMate Escrow funds - separate from actual revenue)

The system calculates commissions automatically based on net revenue figures and year-over-year growth.

---

## Data Sources

### Primary Database Table: `payment_detail`

**Source**: Historical data imported via CSV (no Fidelo API integration for historical data)
**Database**: `hub_payroll`
**Table**: `payment_detail`

### Key Fields Used:

| Field | Purpose | Notes |
|-------|---------|-------|
| `date` | Transaction date | Proper DATE format (cleaned from original `date_tmp`) |
| `amount` | Total transaction amount | Format: €X,XXX.XX (string with currency symbol) |
| `course` | Course fee portion | Format: €X,XXX.XX (used for commission calculations) |
| `agent` | Agency name | Determines B2B vs B2C classification |
| `method` | Payment method | Used to filter TransferMate Escrow |
| `type` | Transaction type | "Refund" for refunded transactions |
| `refund_date` | Date of refund | Used for refund tracking |

### Manual Fields (Added to CSV):
These fields were manually added to the imported CSV and are not part of the original Fidelo export:
- `visa_status` - Filters out 'Pending' transactions
- `refunded` - 'Yes'/'No' status indicator
- `refund_date` - When refund occurred
- `visa_checked` - (not currently used)
- `release_date` - (not currently used)

---

## Revenue Classification Logic

### B2C vs B2B Determination

**Current Logic**: Based on `agent` field
```sql
CASE
    WHEN agent IS NOT NULL AND agent != '' THEN 'B2B'
    ELSE 'B2C'
END
```

**Important Notes**:
- The `paid_by` field exists but is NOT used for classification
- `paid_by` indicates who physically made the payment ('Student' or 'Agent')
- The `agent` field represents the business relationship (whether booking came through an agency)
- A student may physically pay (paid_by='Student') but still be a B2B transaction if booked through an agency

**Why This Matters**: Using `paid_by` would understate B2B revenue by ~€139k (2025 YTD) because students sometimes pay directly for agency bookings.

---

## Section Breakdown

### 1. Total Revenue (B2C + B2B)

**Purpose**: Combined view of all revenue streams

**Rows**:
- **2024**: Full year 2024 revenue by month
- **2024 YTD**: Year-to-date comparison period
- **Q 2024**: Quarterly totals for 2024
- **2025 YTD**: Current year revenue by month
- **Q 2025**: Quarterly totals for 2025
- **Cmsns**: Partner commission deductions (from JSON file)
- **Refunds**: Refunded transactions (negative amounts)
- **Net Total**: Revenue - Commissions - Refunds
- **YoY € (Net)**: Year-over-year growth in euros
- **YoY % (Net)**: Year-over-year growth percentage
- **Q Diff**: Quarterly difference from prior year

**Filters Applied**:
```sql
WHERE date IS NOT NULL
AND amount IS NOT NULL
AND (type != 'Refund' OR type IS NULL)
AND (method != 'TransferMate Escrow' OR method IS NULL)
```

**Excludes**:
- TransferMate Escrow transactions (tracked separately)
- Refund transactions (shown in separate row)
- Records with pending visa status

---

### 2. B2C Revenue - Diego

**Purpose**: Direct student bookings and commission calculations

**Commission Structure**: 1% of Net B2C Revenue
- Calculated monthly: `(Revenue + Refunds) * 0.01`
- Based on total revenue, not course fees
- Net = Revenue after refunds

**Rows**:
- **2024 Revenue**: Prior year baseline
- **Q 2024**: Quarterly comparisons
- **2025 YTD**: Current year revenue
- **Q 2025**: Current year quarters
- **Refunds**: B2C refunds (from `payment_detail` where `type='Refund'`)
- **Net Total**: Revenue + Refunds
- **YoY € (Net)**: Growth in euros
- **YoY % (Net)**: Growth percentage
- **Q Diff**: Quarterly differences

**Special Note**: Refunds are NEGATIVE, so Net Total = Revenue + Refunds (where Refunds is already negative)

---

### 3. B2B Revenue - Cenker

**Purpose**: Agency bookings and commission calculations

**Commission Structure**: 10% of YoY Net Course Fee Growth (if positive)
- Based on **course fees only**, not total revenue
- Net Course Fees = Gross Course Fees + Refunds - Partner Commissions
- Only pays commission on growth (vs prior year)
- If YoY growth is negative, no commission paid

**Rows**:
- **2024 Revenue**: Prior year baseline
- **Q 2024**: Quarterly comparisons
- **2025 YTD**: Current year revenue
- **Q 2025**: Current year quarters
- **Cmsns**: Partner commission deductions (agencies that pay gross and we pay their commission back)
- **Refunds**: B2B refunds
- **Net Total**: Revenue - Partner Commissions + Refunds
- **YoY € (Net)**: Growth in euros
- **YoY % (Net)**: Growth percentage
- **Q Diff**: Quarterly differences

**Partner Commissions (Cmsns Row)**:
- **Source**: `/home/hub/public_html/fins/scripts/fidelo/data/cmsns-2025.json`
- **Purpose**: Track commissions paid to partner agencies that send gross invoices
- **Examples**: Agencies like Actra that send gross payments and we later pay their commission
- **Format**: JSON file with monthly breakdown
- **2025 YTD Total**: €34,109.97

**JSON Structure**:
```json
{
  "year": 2025,
  "monthly": {
    "01": 4124.20,
    "02": 8355.00,
    ...
  }
}
```

**Important**: These commissions are deducted from B2B gross course fees to calculate the net course fees that Cenker's 10% commission is based on.

---

### 4. Escrow Section (Collapsible)

**Purpose**: Track TransferMate Escrow funds (NOT counted as revenue)

**Why Separate?**:
- Escrow funds are "visa pending" - not yet settled to our account
- Should not inflate revenue figures
- Tracked separately for reconciliation and monitoring

**Rows**:
- **2024 Escrow**: Incoming escrow funds in 2024
- **2024 Refunded**: Escrow refunds in 2024
- **2025 Escrow**: Incoming escrow funds in 2025
- **2025 Refunded**: Escrow refunds in 2025
- **Funds Pending**: Net escrow balance (Incoming - Refunded) YTD only

**Query Logic**:
```sql
-- Incoming (Positive amounts only)
WHERE method = 'TransferMate Escrow'
AND CAST(amount AS DECIMAL) > 0

-- Refunded (Negative amounts only)
WHERE method = 'TransferMate Escrow'
AND CAST(amount AS DECIMAL) < 0
```

**Display**:
- Collapsed by default (clickable arrow to expand)
- Styled with yellow background (#fff9e6) to differentiate from revenue
- Shows YTD totals in rightmost column

---

## Refunds Logic

### Non-Escrow Refunds (Appear in Revenue Tables)

**Query**:
```sql
WHERE type = 'Refund'
AND date IS NOT NULL
AND (method != 'TransferMate Escrow' OR method IS NULL)
```

**Includes**: Bank Transfer, Stripe, Cash, TransferMate (non-Escrow) refunds
**Excludes**: TransferMate Escrow refunds (those appear in Escrow section)

**Display**:
- Red background (#fee2e2, color: #991b1b)
- Shown as negative values
- Deducted from gross revenue in "Net Total" row

---

## Commission Calculations (Backend)

### B2C Commission (Diego)
```javascript
// 1% of Net B2C Revenue
const netB2cRevenue = currentYearData.b2c.amount + refundsData.b2c.amount;
const b2cCommissionNet = netB2cRevenue * 0.01;
```

### B2B Commission (Cenker)
```javascript
// 10% of YoY NET course fee growth (only if positive)
const monthKey = String(month).padStart(2, '0');
const partnerCommission = partnerCommissions[monthKey] || 0;

// Net = Current year course fees + refunds - partner commissions
const netB2bCourseFees = currentYearData.b2b.course_fees
                       + refundsData.b2b.course_fees
                       - partnerCommission;

const b2bCourseGrowthNet = netB2bCourseFees - lastYearData.b2b.course_fees;
const b2bCommissionNet = b2bCourseGrowthNet > 0 ? b2bCourseGrowthNet * 0.10 : 0;
```

---

## File Structure

```
/home/hub/public_html/fins/scripts/pay/sales/
├── dashboard.js              # Backend API (Node.js/Express)
├── dashboard.html            # Frontend (React)
└── data/
    └── (no data files here)

/home/hub/public_html/fins/scripts/fidelo/data/
├── cmsns-2025.json          # Partner commissions (B2B)
└── cmsns_2025.csv           # Original CSV (reference only)

Database:
└── hub_payroll.payment_detail  # Main transaction table
```

---

## Important Technical Notes

### Date Field Cleanup
- Original field: `date` (text format, inconsistent)
- Temporary field: `date_tmp` (cleaned DATE format)
- **Current**: Renamed `date_tmp` back to `date` (proper DATE format)
- Old text `date` field was deleted

### Field Transformation (Import)
CSV headers are transformed to SQL-ready field names:
- Lowercase conversion
- Special characters → underscores
- Multiple underscores → single underscore
- Preservation of original names (generally)

Example: `"Payment Method"` → `payment_method`

### Partner Commissions Update Process
1. Edit `/home/hub/public_html/fins/scripts/fidelo/data/cmsns-2025.json`
2. Update monthly values in the `"monthly"` object
3. Dashboard automatically recalculates totals on next page load
4. No need to update hardcoded values (dynamic calculation)

---

## API Endpoints

### Main Dashboard Data
**URL**: `/fins/scripts/pay/sales/dashboard/data`
**Method**: GET
**Response**:
```json
{
  "success": true,
  "data": {
    "lastYear": { ... },
    "currentYear": { ... },
    "yoyGrowth": { ... },
    "commissions": { ... }
  },
  "partnerCommissions": {
    "01": 4124.20,
    "02": 8355.00,
    ...
  },
  "metadata": {
    "lastDataDate": "2025-09-30",
    "ytdMonth": 9,
    "ytdDay": 30
  }
}
```

### Dashboard HTML
**URL**: `/fins/scripts/pay/sales/dashboard.html`
**Technology**: React (via Babel standalone)
**Refresh**: Auto-refreshes every 60 seconds

---

## Known Issues & Future Considerations

### Current Limitations
1. **No Fidelo API Integration**: All data from CSV imports
2. **Manual Partner Commission Updates**: Requires editing JSON file
3. **Hard-coded Years**: 2024/2025 comparisons (needs generalization for 2026+)
4. **Single Currency**: Assumes all transactions in EUR

### Data Quality Notes
1. **Partner Commissions**: Only a few agencies pay gross (most pay net)
2. **Escrow Accuracy**: Relies on `method` field being correctly populated
3. **B2C/B2B Split**: Dependent on `agent` field quality
4. **Historical Data**: CSV import may have inconsistencies vs live Fidelo data

### Future Enhancements
- [ ] Fidelo API integration for live data
- [ ] Automated partner commission import
- [ ] Multi-year comparison (beyond just 2024/2025)
- [ ] Course fee breakdown by program type
- [ ] Agency-level detail in B2B section
- [ ] Excel export functionality

---

## Maintenance Tasks

### Monthly
- [ ] Update partner commissions JSON (if applicable)
- [ ] Verify escrow reconciliation
- [ ] Check refund processing

### Quarterly
- [ ] Review B2C/B2B classification accuracy
- [ ] Verify commission calculations
- [ ] Audit TransferMate Escrow vs actual settlements

### Annually
- [ ] Update year comparisons in code (hardcoded 2024/2025)
- [ ] Archive old commission JSON files
- [ ] Review and update base salary constants

---

## Developer Notes

### Key Functions (dashboard.js)

**`getMonthlyData()`**: Main data fetching and orchestration
- Loads partner commissions from JSON
- Connects to MySQL
- Executes revenue, refund, and escrow queries
- Processes and returns structured data

**`processDataForDashboards()`**: Data aggregation
- Groups revenue by year/month/channel
- Calculates quarterly totals
- Handles escrow data separately
- Processes refunds with proper sign handling

**`calculateMetrics()`**: Commission and growth calculations
- YoY comparisons
- Commission calculations (B2C 1%, B2B 10% of growth)
- Net total calculations (includes partner commission deductions)
- Percentage growth calculations

### Frontend State Management (dashboard.html)

**State Variables**:
- `data`: Main dashboard data from API
- `loading`: Loading state indicator
- `error`: Error message display
- `escrowVisible`: Controls escrow section collapse/expand

**Important**: Partner commissions are merged into data object on fetch:
```javascript
setData({
  ...result.data,
  partnerCommissions: result.partnerCommissions
});
```

---

## Contact & Support

**Primary Developer**: Claude (Anthropic AI Assistant)
**Documentation Date**: October 4, 2025
**Last Updated**: v14 - Partner commissions from JSON file implementation

For questions or modifications, refer to this specification and the inline code comments in `dashboard.js` and `dashboard.html`.
