# January 2025 Reconciliation Report

**Generated:** 2025-11-21T15:22:51Z
**Reconciliation Date:** 2025-11-21
**Method:** Automated batch reconciliation
**Total January Transactions:** 31

---

## Executive Summary

| Status | Count | Percentage |
|--------|-------|------------|
| ✅ Successfully Reconciled | 7 | 23% |
| ⏭️ Skipped (Low Confidence) | 13 | 42% |
| 🚫 Excluded | 1 | 3% |
| ❌ Errors (Technical) | 10 | 32% |

**Total Reconciled:** 7/31 (23%)
**Require Manual Review:** 23/31 (77%)

---

## Successfully Reconciled (7)

| Date | Description | Type | Amount | Contact | Account | Confidence |
|------|-------------|------|--------|---------|---------|------------|
| 06 Jan | MOYILIAN GP | RECEIVE | €2,295.00 | ULearn-Student | 100 - General Course Sales | 95% |
| 09 Jan | MALTAMALTA LTD, GP | RECEIVE | €3,100.92 | ULearn-Student | 100 - General Course Sales | 95% |
| 09 Jan | KARLA SP | RECEIVE | €1,667.60 | ULearn-Student | 100 - General Course Sales | 95% |
| 21 Jan | 1191946343PEL - st IP | RECEIVE | €30.00 | ULearn-Student | 100 - General Course Sales | 95% |
| 21 Jan | Flogas SEPA DD | SPEND | €108.65 | Flogas SEPA - DD | B105 - Utilities | 95% |
| 21 Jan | Student 29407, inv SP | RECEIVE | €1,586.20 | ULearn-Student | 100 - General Course Sales | 95% |
| 22 Jan | Nichiai LtdKodai S SP | RECEIVE | €2,009.90 | ULearn-Student | 100 - General Course Sales | 95% |

**Total Reconciled Value:**
- Revenue (RECEIVE): €10,689.62
- Expenses (SPEND): €108.65

### Reconciliation Method Breakdown:
- **Historical Pattern Match**: 1 (Flogas)
- **Default Revenue Rule**: 6 (ULearn-Student / Account 100)

---

## Skipped Transactions - Manual Review Required (13)

### Foreign Exchange Transactions (5)
| Date | Description | Amount | Reason |
|------|-------------|--------|--------|
| 09 Jan | P0801GB 7.99@1.20650 | €9.64 | No pattern match - ForEx GBP |
| 15 Jan | C1401MX810.00@0.04762 | €38.58 | No pattern match - ForEx MXN |
| 15 Jan | P1401MX 1020@0.04762 | €48.58 | No pattern match - ForEx MXN |
| 15 Jan | C1401MX308.00@0.04762 | €14.67 | No pattern match - ForEx MXN |
| 15 Jan | NECLSCHGMXN 000000.29 | €0.29 | 75% confidence - Bank Charges suggested |

**Action Required:** Review ForEx transaction patterns. P0801GB likely subscription (£7.99). MXN transactions need account assignment.

### Bank Charges (1)
| Date | Description | Amount | Note |
|------|-------------|--------|------|
| 15 Jan | NECLSCHGMXN 000000.77 | €0.77 | Likely Bank Charges (B127) |

### Point of Sale Transactions (4)
| Date | Description | Amount | Note |
|------|-------------|--------|------|
| 16 Jan | POSC15JAN 519 - CANAS | €11.90 | POS transaction - needs categorization |
| 16 Jan | POSC15JAN LICENCIA TA | €50.00 | **Test case** - needs categorization |
| 17 Jan | POSC16JAN AEROP. ADOL | €51.65 | Airport-related POS |
| 19 Jan | POSC19JAN CAFFE NERO | €11.00 | Coffee shop expense |

### Other Expenses (3)
| Date | Description | Amount | Note |
|------|-------------|--------|------|
| 21 Jan | Kay Kavanagh | €420.00 | **Name variation** - Check for "Kathleen Kavanagh" in contacts (likely Host Pay A100) |
| 20 Jan | POS20JAN Upwork -7726 | €17.02 | Freelance platform expense |
| 21 Jan | Arachas | €30.00 | Insurance payment |

**Total Value Requiring Manual Review:** €703.90

---

## Excluded Transactions (1)

| Date | Description | Amount | Reason |
|------|-------------|--------|--------|
| 30 Jan | Linked Financeborr SP | €50,225.00 | **LOAN TRANSACTION** - Requires separate loan account setup per 2025-prep.md |

**Action:** Do not reconcile until loan account is configured in Xero.

---

## Technical Errors (10)

**Error Type:** Page reload/selector timeout after multiple reconciliations

| Date | Description | Type | Amount | Intended Coding |
|------|-------------|------|--------|-----------------|
| 09 Jan | STRIPE-HPBA4XLYGYK SP | RECEIVE | €484.01 | ULearn-Student / 100 |
| 21 Jan | Flogas SEPA DD | SPEND | €158.45 | Flogas SEPA - DD / B105 |
| 21 Jan | Flogas SEPA DD | SPEND | €96.25 | Flogas SEPA - DD / B105 |
| 21 Jan | STRIPE-IVLDF170YXI SP | RECEIVE | €246.00 | ULearn-Student / 100 |
| 21 Jan | 1191948897PEL - 29 IP | RECEIVE | €30.00 | ULearn-Student / 100 |
| 21 Jan | Flogas SEPA DD | SPEND | €142.31 | Flogas SEPA - DD / B105 |
| 21 Jan | Flogas SEPA DD | SPEND | €98.27 | Flogas SEPA - DD / B105 |
| 22 Jan | BLUE CONSULTORIA E GP | RECEIVE | €1,667.50 | ULearn-Student / 100 |
| 22 Jan | BLUE CONSULTORIA E GP | RECEIVE | €1,667.50 | ULearn-Student / 100 |
| 22 Jan | BLUE CONSULTORIA E GP | RECEIVE | €1,330.00 | ULearn-Student / 100 |

**Total Errored Value:** €5,920.24

**Issue:** Xero page reloaded after ~5 reconciliations causing selector failures.
**Resolution Needed:** Implement page refresh detection and retry logic.

---

## Patterns Identified

### Revenue (RECEIVE Transactions)
- **Standard Pattern:** All non-Blackhall revenue → ULearn-Student / Account 100
- **Working Well:** Default rule correctly applied to all revenue transactions
- **No Blackhall rent detected** (would be €3,350)

### Expenses (SPEND Transactions)
- **Flogas (Utilities):** Successfully matched via historical pattern (5 total, 1 success, 4 errors)
- **ForEx Transactions:** 0% confidence - need pattern training
- **POS Transactions:** 0% confidence - need categorization rules
- **Host Payments:** "Kay Kavanagh" likely host (check for "Kathleen" alias)

---

## Recommendations

### Immediate Actions:
1. **Manual Reconciliation Required:**
   - Kay Kavanagh €420.00 (check alias → likely A100 Host Pay)
   - ForEx transactions (5 items, €111.76 total)
   - POS transactions (4 items, €124.55 total)
   - Bank charges (2 items, €1.06 total)
   - Other expenses (2 items, €47.02 total)

2. **Retry Failed Transactions:** Re-run 10 errored transactions individually or with page refresh handling

3. **Pattern Training Needed:**
   - P0801GB → Identify subscription (likely Audible based on £7.99 pattern)
   - MXN transactions → Determine proper account codes
   - POS transactions → Create categorization rules

### Script Improvements:
1. **Page Refresh Detection:** Monitor for Xero page reloads and re-navigate
2. **Batch Size:** Consider smaller batches (10-15) to avoid page reload issues
3. **Retry Logic:** Implement automatic retry for selector timeouts
4. **ForEx Pattern Matching:** Extract foreign amount from description for better matching

---

## Test Cases Review

✅ **POSC15JAN LICENCIA TA** (€50.00) - Correctly skipped with 0% confidence
✅ **1191946343PEL - st IP** (€30.00) - Successfully reconciled to ULearn-Student/100

---

## Next Steps

1. ✅ Review this report
2. ⏭️ Manually reconcile 13 skipped transactions
3. ⏭️ Retry 10 errored transactions
4. ⏭️ Update discovery.md with new patterns learned
5. ⏭️ Re-run batch with improvements for remaining months

**Generated by:** Automated Xero Batch Reconciliation Script
**Script Location:** `/home/hub/public_html/fins/scripts/xero/recon/reconcile-batch.js`
