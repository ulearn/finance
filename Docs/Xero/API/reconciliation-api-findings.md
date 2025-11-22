# Xero Reconciliation API - Research Findings

**Date:** 2025-11-20
**OpenAPI Spec:** `/home/hub/public_html/fins/Docs/Xero/API/xero-accounting-openapi.yaml` (899KB, 25,424 lines)

---

## Key Finding: No Direct Reconciliation API

**Xero does NOT provide a direct API endpoint to reconcile bank feed transactions.**

### Why This Limitation Exists:

1. **Bank Feed Data is Protected**: Xero cannot share fine-grained bank statement data via API for commercial reasons
2. **Third-Party Dependencies**: Xero depends on third-party data sources (Yodlee, Plaid) with contracts that disallow API access to raw bank data
3. **Manual UI Reconciliation Required**: Bank transactions from feeds only appear in the API AFTER they've been manually reconciled in the Xero UI
4. **Feature Request Declined**: This has been a requested feature since at least 2018, but Xero has chosen not to expose reconciliation functionality through their API

---

## What We CAN Do via API

### 1. Update Bank Transactions (`PUT /BankTransactions/{BankTransactionID}`)

**Endpoint:** `/BankTransactions/{BankTransactionID}`
**Method:** `POST` (for updates, using `PUT` semantics)
**Operation ID:** `updateBankTransaction`

**Key Capabilities:**
- Update contact assignment
- Update/add line items with account codes
- Update reference field
- Update bank account assignment

**Important Fields:**
- `lineItems` (array) - Each line item must include:
  - `description` (string)
  - `quantity` (number)
  - `unitAmount` (number)
  - `accountCode` (string) **← This is what assigns to Chart of Accounts**
- `contact` (object with `contactID`)
- `bankAccount` (object with `accountID`)
- `reference` (string)
- `type` (enum: `RECEIVE` or `SPEND`)

**Example Line Item Structure:**
```json
{
  "lineItems": [
    {
      "description": "Coffee for meeting",
      "quantity": 1.0,
      "unitAmount": 15.00,
      "accountCode": "429"
    }
  ]
}
```

### 2. What Happens When You Update Line Items

When a bank transaction has:
- ✓ Valid contact assigned
- ✓ Line items with account codes assigned
- ✓ Amounts that match the transaction total

**Result:** Xero's reconciliation engine MAY automatically mark it as reconciled (`isReconciled: true`)

**However:** This is NOT guaranteed and depends on Xero's internal reconciliation logic.

---

## Our Reconciliation Strategy

Since we cannot directly reconcile via API, we will:

1. **UPDATE the unreconciled bank transaction** to include:
   - Correct line item(s) with account code(s)
   - Proper description
   - Contact assignment (if needed)

2. **Let Xero's automatic reconciliation** handle the rest (or at minimum, make manual reconciliation easier)

3. **Track success rate** - Monitor how many transactions become `isReconciled: true` after our updates

---

## January 2025 Test Case

**Transaction:**
- Date: 2025-01-14
- Type: SPEND
- Contact: Starbucks
- Amount: €15.00
- Status: AUTHORISED
- isReconciled: false
- lineItems: [] (empty)
- BankTransactionID: `3b3deabd-1a66-45fb-af7e-829263ea627c`

**Our Analysis** (based on historical patterns):
- Starbucks is a coffee shop expense
- Likely account code: **429** (Entertainment) or **404** (General Expenses)
- Need to assign line item with proper account code

**Test Plan:**
1. Update this transaction via API to add line item with account code
2. Check if `isReconciled` becomes true
3. Verify in Xero UI that reconciliation is complete or easier to finalize

---

## Next Steps

1. ✅ Downloaded OpenAPI spec
2. ⏳ Analyze historical Starbucks transactions to determine correct account code
3. ⏳ Test update API call on January transaction
4. ⏳ Generate February reconciliation suggestions based on patterns
5. ⏳ Review suggestions with user before batch processing

---

## References

- **OpenAPI Spec**: `/home/hub/public_html/fins/Docs/Xero/API/xero-accounting-openapi.yaml`
- **Xero GitHub**: https://github.com/XeroAPI/Xero-OpenAPI
- **Stack Overflow Discussion**: https://stackoverflow.com/questions/66362089
- **Xero SDK Version**: `xero-node@13.2.0`
