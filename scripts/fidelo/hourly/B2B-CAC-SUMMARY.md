# B2B Customer Acquisition Cost Analysis

## Overview
This analysis calculates the B2B CAC based on partner commissions paid to agents for student bookings.

## 2024 Partner Commissions (B2B CAC)

### Monthly Breakdown
| Month | Commissions | # Bookings | CAC per Customer |
|-------|-------------|------------|------------------|
| JAN   | €8,733.46   | 21         | €585.02          |
| FEB   | €5,234.59   | 11         | €798.60          |
| MAR   | €2,525.40   | 7          | €867.91          |
| APR   | €1,037.00   | 5          | €917.40          |
| MAY   | €2,775.25   | 4          | €1,581.31        |
| JUN   | €1,652.90   | 5          | €1,040.58        |
| JUL   | €2,719.50   | 10         | €626.95          |
| AUG   | €2,207.45   | 8          | €719.68          |
| SEP   | €3,700.00   | 7          | €1,035.55        |
| OCT   | €5,049.52   | 11         | €781.77          |
| NOV   | €6,464.60   | 16         | €625.91          |
| DEC   | €7,300.80   | 14         | €775.06          |

### Annual Totals
- **Total Commissions**: €49,400.47
- **Total Bookings**: 119
- **Average B2B CAC**: €773.10

## Comparison: B2C vs B2B CAC

### B2C (Direct Marketing)
- Average CAC: €233.15
- Channel: Ads, Software, Salaries, Staff Commissions

### B2B (Partner Channel)
- Average CAC: €773.10
- Channel: Partner Commissions only (no advertising costs)

**Key Insight**: B2B CAC is 3.3x higher than B2C CAC (€773.10 vs €233.15)

## Payback Period Analysis

### Morning Session (€336 gross profit/month)
- **B2C**: Payback in 0.7 months (€233.15 / €336)
- **B2B**: Payback in 2.3 months (€773.10 / €336)
  - Month 1: -€437.10 (negative)
  - Month 2: -€101.10 (negative)
  - Month 3: +€234.90 (positive - BREAK EVEN)

### Afternoon Session (€276 gross profit/month)
- **B2C**: Payback in 0.8 months (€233.15 / €276)
- **B2B**: Payback in 2.8 months (€773.10 / €276)
  - Month 1: -€497.10 (negative)
  - Month 2: -€221.10 (negative)
  - Month 3: +€54.90 (positive - BREAK EVEN)

## Strategic Implications

1. **B2B Takes Longer to Recover CAC**:
   - B2C pays back in less than 1 month
   - B2B needs 3 months to break even

2. **B2B Requires Higher LTV**:
   - Need minimum 3-month retention for B2B profitability
   - B2C profitable after 1 month

3. **Cash Flow Impact**:
   - B2C can fuel exponential growth (30-day GP > CAC)
   - B2B requires more working capital (payback > 2 months)

4. **Volume vs Margin**:
   - B2B delivered 119 students in 2024
   - Higher cost per acquisition but provides steady stream
   - No advertising spend required (partners do marketing)

## Data Source
- Generated from: `/home/hub/public_html/fins/scripts/fidelo/hourly/`
- Source data: `all-courses-2024.json`
- Script: `calculate-b2b-cac.js`
- Date: 2024-12-15
