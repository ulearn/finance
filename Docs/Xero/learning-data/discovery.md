# Xero Reconciliation Discovery Log

This file documents pattern learning from manual reconciliation training examples. Therefore theses discovered lessons / rules / protocols are created from the particular to the general. 
As patterns are confirmed, they strengthen the AI's confidence in automatic categorization.

## Bank Transaction Patterns

### Example 1: Bank Charges/Fees

**Bank Transaction:**
- Transaction Date: 6 Jan 2025
- Payee: Null/Not Set (BOI doesn't provide)
- Reference: 240
- Description: "MOYILIAN CHRG GP"
- Transaction Amount: €12.50
- Transaction Type: Debit

**Suggested Reconciliation:**
- Who (Contact): Bank Charges
- What (Account Code): B127 (Bank Fees)
- Why (Description): Copy exact bank description: "MOYILIAN CHRG GP"
- Category: Expense (B-series account)

**Reasoning:**
From the learning data, ALL bank charges/fees consistently use:
- Contact: "Bank Charges"
- Account Code: "B127"
- Similar small amounts (€0.02 to €6.13 range in 2024)

The pattern "CHRG" indicates a charge/fee, and while €12.50 is higher than typical bank fees found in historical data, it follows the same pattern. "GP" might refer to a specific service or transaction type from Bank of Ireland.

**Confidence:** High (95%) - Clear pattern match with historical bank charge categorization

**TRAINING RESULT:** ✅ CONFIRMED CORRECT!

**Pattern Learned:**
- Keywords: "CHRG", "CHARGE" → Account B127, Contact "Bank Charges"
- Small debit amounts (typically under €20)
- Copy exact BOI description to transaction description

---

### Example 2: ForEx Subscription (Audible)

**Bank Transaction:**
- Transaction Date: 9 Jan 2025
- Description: "P0801GB 7.99@1.20650"
- Amount: €9.64
- Transaction Type: Debit

**Reconciliation:**
- Who (Contact): Audible - CARD
- What (Account Code): B121
- Why (Description): "P0801GB 7.99@1.20650"

**Pattern Learned:**
- ForEx pattern: Search by reference code (e.g., "P0801GB")
- Foreign amount stays constant (£7.99), EUR varies with exchange rate
- Monthly recurring subscription payments

**TRAINING RESULT:** ✅ CONFIRMED CORRECT!

---

### Example 3: International Travel Expense

**Bank Transaction:**
- Transaction Date: 17 Jan 2025
- Description: "POSC16JAN AEROP. ADOL"
- Amount: €51.65
- Transaction Type: Debit

**Reconciliation:**
- Who (Contact): Adolfo Suarez Airport (create new)
- What (Account Code): B112b (Travel - International)
- Why (Description): "POSC16JAN AEROP. ADOL"

**Pattern Learned:**
- "POSC" = Point of Sale Card transaction
- Airport expenses during business travel → B112b
- Create merchant as contact when needed
- Copy exact BOI description when no receipt/context available

**TRAINING RESULT:** ✅ CONFIRMED CORRECT!

---

### Example 4: Individual Student Payment (Revenue)

**Bank Transaction:**
- Transaction Date: 9 Jan 2025
- Description: "KARLA SP"
- Amount: €1,667.60
- Transaction Type: Credit (Received)

**Reconciliation:**
- Who (Contact): ULearn-Student (catchall)
- What (Account Code): 100 (General Course Sales)
- Why (Description): "KARLA SP"

**Pattern Learned:**
- ALL individual student payments → ULearn-Student + Account 100
- Don't search for specific contacts (Xero = Accounting, not CRM)
- Customer attribution happens in Fidelo/HubSpot, not Xero
- Simple rule: If credit, not Blackhall, not group invoice → ULearn-Student + 100

**TRAINING RESULT:** ✅ CONFIRMED CORRECT!

---

## Pending Confirmation

_(Examples awaiting training confirmation will be added here)_

---

## Discovery Statistics

- Total Examples Trained: 4
- Confirmed Correct: 4
- Patterns Established: 4 (Bank Charges, ForEx Subscriptions, Travel Expenses, Revenue)
- Confidence Baseline: 80% (items below this require manual confirmation)

---

## Notes

- Reference numbers from BOI (e.g., "240") can optionally be included in the "Why" description field
- BOI provides minimal detail: Date, Narrative, Amount (Debit/Credit) only
- Always copy exact bank description when no meaningful context is available
