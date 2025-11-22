# Xero Reconciliation Manual

## Reconciliation Navigation

### Getting to the Reconciliation Screen

1. **Dashboard Landing**
   - After login, you land at: `https://go.xero.com/app/!1RBrS/dashboard`
   - The dashboard shows all bank accounts with their current status

2. **ULearn Limited Current Account Widget**
   - Look for the heading:
     ```html
     <h2 class="mf-bank-widget-heading-large mf-bank-widget-u-flex-horizontal mf-bank-widget-u-flex-grow mf-bank-widget-margin-none">
       ULearn Limited Current account
     </h2>
     ```

3. **Reconcile Button**
   - Blue button showing number of unreconciled items:
     ```html
     <a class="mf-bank-widget-button mf-bank-widget-margin-bottom-small mf-bank-widget-button-main mf-bank-widget-button-small"
        tabindex="0"
        href="/BankRec/BankRec.aspx?accountID=93D5D790E7A14C9D9CF28B68DB272970"
        role="button"
        data-automationid="reconcileBankItems">
       Reconcile 1630 items
     </a>
     ```
   - Click this button to reach the reconciliation screen

4. **Reconciliation Screen URL**
   - Direct URL: `https://go.xero.com/BankRec/BankRec.aspx?accountID=93D5D790E7A14C9D9CF28B68DB272970`
   - Account ID: `93D5D790E7A14C9D9CF28B68DB272970`

## Reconciliation Actions

The reconciliation screen provides four main actions:

### 1. Match
- Used when an existing Xero transaction matches the bank statement line
- Links bank feed item to existing invoice/bill/transaction

### 2. Create
**Primary action for most reconciliations**

Creates a new transaction with:

- **Who**: The Contact
  - Xero attempts to auto-detect existing contacts
  - If detection fails, search historical data in `/home/hub/public_html/fins/Docs/Xero/learning-data/`
  - If no match found, create new contact

- **What**: Account from Chart of Accounts (COA)
  - Select the correct account code
  - Account codes start with letters indicating type:
    - `A###` - Cost of Sales accounts (e.g., "A100 - Accomm - Host Pay")
    - `B###` - Expense accounts (e.g., "B100 - Rent")

- **Why**: Transaction description
  - Provide meaningful description when possible
  - If no context available, copy the bank statement description exactly
  - Examples:
    - `15/01/2025 "NECLSCHGMXN 000000.29"`
    - `24/02/2025 "NEPOSCHGUSD 000000.46"`

- **Category**: Cost of Sales vs Expense
  - **Cost of Sales**: All accounts starting with `A`
  - **Expense**: All accounts starting with `B`

### 3. Transfer
- Used for inter-account transfers
- **Use sparingly** - discuss manually for rare cases

### 4. Discuss
- Flag transactions for discussion
- **Rarely used** - monthly reports serve this purpose better

## Pre-Reconciliation Workflow

### Year-Long Prep File
**Location**: `/home/hub/public_html/fins/scripts/xero/recon/{YEAR}-prep.md`

**Purpose**: Month-by-month guidance to review BEFORE starting reconciliation

**Structure**:
- **General Guidance Section**: Recurring exclusions and patterns that apply to all months
  - Example: Loan transactions to exclude (require separate account setup)
  - Pre-flight checklist
  - Standard workflow reminders

- **Monthly Sections** (January - December): Each month contains:
  - Outstanding invoices to watch for (group payments with 10%/45%/45% terms)
  - Known unusual items specific to that month
  - Special instructions or notes

**Workflow**:
1. Before starting each month's reconciliation, open the year's prep file
2. Read the "General Guidance" section
3. Read the specific month's section
4. Use this context when making reconciliation decisions
5. After reconciliation, update the prep file with new patterns or items for future months

**Example**: `2025-prep.md` contains guidance for all of 2025, with January noting a €50,225 loan transaction to exclude

---

## Incoming Payment Patterns (Credits)

**Important**: Revenue reconciliation is straightforward. The complexity and uncertainty requiring manual confirmation typically comes from EXPENSES (debits), not income (credits).

When processing CREDIT transactions (incoming payments), there are only 3 main categories:

### Pre-Reconciliation Check: Outstanding Sales Invoices

**ORACLE FILE**: `/home/hub/public_html/fins/scripts/xero/recon/{YEAR}/Invoices/invoices.json`

This file contains:
- All Sales Invoices awaiting payment (auto-fetched from Xero API)
- Payment schedules extracted from quotation PDFs attached to invoices
- Contact person details, due dates, and amounts
- Current payment status for each installment

**Before starting each month's reconciliation:**
1. Review the year's `invoices.json` file for outstanding group payments
2. Check the prep file for additional context/notes
3. Note payment amounts to watch for (with ±€5-10 tolerance for sender errors)
4. Use MATCH action in Xero to link incoming payments to specific invoices

**Cross-Year Note**: When reconciling in 2026, continue referencing `2025/Invoices/invoices.json` until all 2025 invoices are fully paid

### 1. Standard Individual Student Payments (Default)
- **Who (Contact)**: ULearn-Student (catchall contact)
- **What (Account Code)**: 100 (General Course Sales)
- **Pattern**: Single student course payments
- **Most common incoming transaction type**
- **Default action**: When in doubt, use this categorization for revenue

**CRITICAL: Don't Overthink Individual Payments**

The reconciliation workflow for individual student payments is deliberately simple:

1. **Is it a CREDIT (incoming payment)?** ✓
2. **Is it Blackhall Green rent (€3,350)?** No
3. **Is it a group payment against an invoice?** No (or not specified in prep file)
4. **Then:** ULearn-Student + Account 100 → Done!

**Do NOT:**
- ❌ Search for the person's name in Xero contacts
- ❌ Try to create individual contacts for each payment
- ❌ Try to match payment names (e.g., "KARLA SP") to student records
- ❌ Worry about customer attribution in Xero

**DO:**
- ✅ Simply categorize to ULearn-Student + Account 100
- ✅ Copy the bank description exactly to the transaction description
- ✅ Move on to the next transaction

**Why This Works:**
- **Xero = Accounting, not CRM** - we only need to know it's course sales revenue
- Customer attribution happens in **Fidelo** (student/booking database) and **HubSpot** (deal tracking)
- The "Incoming Payments" task separately matches payments to students
- Future integration will connect HubSpot Deals + Fidelo records for attribution

**Example:**
```
Bank Transaction: "KARLA SP" - €1,667.60 (Received)
Xero Reconciliation:
  Contact: ULearn-Student
  Account: 100
  Description: "KARLA SP"
  ✓ Done in 10 seconds
```

No need to find who "KARLA" is, what course they booked, or when. That's handled elsewhere.

### 2. Group Payments

**Overview:**
- **Pattern**: Usually larger payments, but can be smaller for deposits
- **Important**: Check for unpaid Sales Invoices before starting reconciliation
- **Action**: Use "Match" to link payment to existing group invoice if reference matches
- Cross-reference payment amount with outstanding invoice balances

**Payment Terms (Variable - Not Standardized):**

While the **standard structure** is typically 3 installments (10% / 45% / 45%), payment terms are **NOT set in stone**. Sales can agree to any payment structure to close the deal:
- Standard: 10% / 45% / 45%
- Alternative: 50% / 50%
- Custom: €250 deposit + remainder in 2 payments
- Any other structure agreed by sales team

**CRITICAL: Payment terms are NOT stored as a schedule in Xero** - they are communicated to the client but not structured as a payment schedule in Xero itself. However, the quotation PDF (containing the payment schedule) is **always attached** to the Sales Invoice in Xero.

#### Retrieving Payment Schedules from Invoice Attachments

**Protocol: When New Sales Invoice Detected in Xero**

When a new Sales Invoice appears in Xero during reconciliation, the quotation PDF (containing payment schedule) is **always attached** to the invoice in Xero.

**Workflow Using Xero Attachments API:**

1. **List Attachments on Invoice**
   ```
   GET https://api.xero.com/api.xro/2.0/Invoices/{InvoiceID}/Attachments
   ```
   - Returns list of all files attached to the invoice
   - Quotation PDF will be in this list (100% of the time)

2. **Download Quotation PDF**
   ```
   GET https://api.xero.com/api.xro/2.0/Invoices/{InvoiceID}/Attachments/{FileName}
   ```
   - Download the quotation/proposal PDF
   - Verify the quotation amount matches the Xero invoice amount exactly

3. **Parse PDF for Payment Schedule**
   - Read the PDF content to extract payment schedule
   - Document the EXACT payment amounts and due dates
   - Example from INV-0396 (IES-Marius-Torres26):
     ```
     Total: €17,618.00
     Payment 1: €1,761.80 (10%) - Upon receipt
     Payment 2: €7,928.10 (45%) - 19 Dec 2025
     Payment 3: €7,928.10 (45%) - 16 Jan 2026 (4 weeks pre-arrival)
     ```

4. **Record Payment Schedule in Prep File**
   - Add the invoice and payment schedule to the year's prep file
   - Include: Invoice number, total amount, contact, payment amounts, due dates
   - This becomes reference material for matching payments in future months

5. **Match Payments During Reconciliation**
   - **Exact Match**: Look for BOI transactions matching the scheduled payment amounts exactly
   - **Tolerance Match**: Also check for amounts ±€5 to ±€10 from scheduled amount
   - **Reasons for Variance**:
     - Sender payment error/rounding
     - Outside SEPA zone: Sender may not have paid their bank fees (though rare for groups)
     - Currency conversion differences

6. **Identify Sender from BOI Description**
   - BOI transaction description will contain sender information
   - Match description to invoice contact name patterns:
     - Contact person at the agency
     - Teacher's name
     - Company/school name sending the group
   - Use this to confirm the payment links to the correct invoice

**Example Workflow:**

```
New Invoice Found: INV-0396 - IES-Marius-Torres26 - €17,618.00

→ GET /Invoices/INV-0396/Attachments → List files
→ Find quotation PDF (e.g., "IES-Marius-Torres26-Quote.pdf")
→ GET /Invoices/INV-0396/Attachments/IES-Marius-Torres26-Quote.pdf
→ Parse PDF, extract payment schedule:
    €1,761.80 (deposit)
    €7,928.10 (19 Dec 2025)
    €7,928.10 (16 Jan 2026)
→ Add to 2025-prep.md under appropriate months
→ During Dec 2025 reconciliation:
    - Find BOI transaction: €7,928.10 or €7,920-€7,935
    - Check description for "IES" or "Marius" or "Torres"
    - MATCH to INV-0396, Payment 2
```

**Important Notes:**
- Quotation PDF attached to Xero invoice is the **single source of truth** for payment schedules
- Do NOT assume standard 10/45/45 terms - always verify from the quotation PDF
- Payment amount tolerance (±€5-10) accounts for common sender errors
- Most group senders are within SEPA, but non-SEPA senders may short-pay by bank fee amounts
- Xero Attachments API documentation: `/home/hub/public_html/fins/Docs/Xero/API/xero-accounting-openapi.yaml`

### 3. Blackhall Green Apartment Rental Income
- **Who (Contact)**: Blackhall Green - Apartment
- **What (Account Code)**: 101 (Rental Income)
- **Amount**: €3,350 per month (consistent)
- **Type**: RECEIVE (this is income TO ULearn, not an expense)
- **Pattern**: Monthly recurring payment
- Very easy to identify in historical data

### Summary: Revenue Reconciliation Simplicity
Apart from Group payments and Blackhall rental income, **ALL other revenue** is simply:
- Contact: "ULearn-Student"
- Account: 100 (General Course Sales)
- No individual customer attribution needed in Xero

## AI Learning Process & Data Sources

### AI Reconciliation Prompt

You are a professional bookkeeping assistant. Your task is to reconcile transactions in Xero following this order of priority:

1. **Apply bank rules first** - Match transactions using preset bank rules wherever they apply
2. **Best match in Xero** - If no bank rule applies, use Xero's suggested best match. If it is correct, there must be some sort of tie between the payment reference and the document reference
3. **Professional judgment** - If neither applies, use your knowledge of the business Chart of Accounts (COA) and transactions which are attached to make the right call. Additionally, you can look to see what it was previously categorized as to make 100% sure

After reconciling, provide a clear summary of what you matched or cash coded. The summary should be grouped by category or type of transaction. Date the number of transactions and total value per category. Highlight any transactions that require any judgment or manual coding. Flag anything you are unsure about or that may require review.

Your goal is to keep the reconciliation accurate, efficient, and easy for me to review. We will work firstly in monthly batches.

**Critical Rule**: Do not reconcile anything if you are at all unsure - just add any doubts to your report at the end with your intended suggestion so I can perform the manual review and reconciliation myself afterwards.

### Reconciliation Decision Priority Order

The AI follows this strict hierarchy when reconciling transactions:

**Priority 1: Bank Rules** (Highest Priority)
- Xero's preset automated matching rules
- If a bank rule applies, it MUST be used
- These rules are configured in Xero and represent established business patterns

**Priority 2a: Xero Auto-Match**
- Xero's real-time matching system for existing documents (Bills, Invoices)
- **Very high probability match**
- Only use if there is a clear tie between:
  - Payment reference (from bank)
  - Document reference (in Xero)
- Example: Bank payment ref "INV-1234" matching existing Xero invoice "INV-1234"
- **Match Action**: Link bank transaction to existing Xero document
- **Tab in UI**: "Find & Match" tab with suggested matches

**Priority 2b: Xero Create Suggestion**
- Xero's suggestion for Contact/Account/Description when creating new transaction
- **Much more common than Auto-Match**
- **Lower certainty** - Xero makes educated guess based on bank rules/history
- Requires thorough checking and validation against AI decision
- **Create Action**: Use suggestion ONLY if it matches our AI decision (Priority 3)
- **Tab in UI**: "Create" tab with pre-filled fields
- **Validation Required**: Compare Contact and Account Code with AI decision before accepting

**Priority 3: Historical Reconciled Transactions**
- Location: `/home/hub/public_html/fins/Docs/Xero/learning-data/`
- 14,875 reconciled transactions (2017-2025)
- Look for similar transaction patterns:
  - Same description pattern
  - Similar amount ranges
  - Same contact
  - Same account code
- Use "Create" action to make new transaction based on historical pattern

**Priority 4: Chart of Accounts (COA) + Professional Judgment**
- Use knowledge of business operations
- Apply appropriate account codes from COA
- Account structure:
  - `A###` = Cost of Sales
  - `B###` = Expense accounts
- **Create Action**: Make new transaction with appropriate categorization

**Priority 5: Discovery Log**
- Location: `/home/hub/public_html/fins/Docs/Xero/learning-data/discovery.md`
- Newly learned patterns from manual training
- Continuously updated as patterns are confirmed

**Critical Rule**: If uncertain at ANY priority level, flag for manual review rather than guess

### Foreign Exchange (ForEx) Transaction Pattern

**Pattern Recognition:**

When encountering ForEx transactions (GBP, USD, etc.), BOI provides the foreign amount and exchange rate in the description:

**Example Format:** `P0801GB 7.99@1.20650`
- `P0801GB` = Payment reference code with currency (GB = GBP)
- `7.99` = Amount in foreign currency (£7.99)
- `@1.20650` = Exchange rate used
- EUR amount varies based on daily rate

**Search Strategy:**
1. Extract the **foreign currency amount** from the description (e.g., "7.99")
2. Search historical data using the **reference pattern** (e.g., "P0801GB")
3. The foreign amount stays constant across months (e.g., £7.99 Audible subscription)
4. The EUR amount will vary with exchange rates
5. Match pattern to find Contact and Account Code

**Example:**
- BOI Description: "P0801GB 7.99@1.20650"
- Search for: "P0801GB"
- Historical matches show: Audible - CARD, Account B121
- Pattern: Monthly £7.99 subscription
- EUR amounts vary: €8.89, €9.08, €9.58, €9.64 (depending on FX rate)

### Confidence Scoring System

**Confidence Baseline: 80%**

- **≥ 80% Confidence**: Automatic reconciliation (with human review)
- **< 80% Confidence**: Manual confirmation required

Items below 80% confidence are added to the monthly report's "Confirm Required" section for human review.

### Monthly Report Structure

Reports are saved to: `/home/hub/public_html/fins/scripts/xero/recon/{YEAR}/{MM}-{month}-report.md`

Example: `/home/hub/public_html/fins/scripts/xero/recon/2025/01-jan-report.md`

**Report Sections:**

**1. Executive Summary**
- Total transactions in month
- Successfully reconciled count (with breakdown by method)
- Transactions requiring confirmation
- Total value reconciled vs pending

**2. Reconciled Transactions** (≥80% confidence)

Grouped by category/type with:
- Date
- Number of transactions per category
- Total value per category
- Method used (Bank Rule / Match / Create)

Example format:
```
Bank Charges (B127)
- 15 transactions
- Total: €45.23
- Method: Historical Pattern (Create)
- Confidence: 95%

Student Payments (100)
- 23 transactions
- Total: €12,450.00
- Method: Bank Rule
- Confidence: 100%
```

**3. Confirm Required** (<80% confidence)
- Transactions flagged for manual review
- AI's suggested reconciliation with reasoning
- Confidence score and uncertainty factors
- Grouped by category for efficient batch review

**4. Transactions Requiring Professional Judgment**
- Items where AI applied COA knowledge
- Unusual amounts or patterns
- Recommended for spot-check review even if reconciled

**5. New Patterns Discovered**
- Novel transaction types encountered
- Suggested categorizations
- Pending confirmation for addition to discovery.md

**6. Audit Trail**
- All reconciliation actions taken
- Confidence scores logged
- Data sources used for each decision

### Training Feedback Loop

1. Human reviews "Confirm Required" items
2. Corrections/confirmations added to `discovery.md`
3. Patterns strengthen over time
4. Future similar transactions gain higher confidence
5. "Confirm Required" section shrinks each month

**Expected Evolution:**
- Initially: Many items require confirmation
- After 3-6 months: Down to 1-2 confirmations per month
- Long-term: Fully autonomous reconciliation with spot-check reviews

## Contact Group Auto-Categorization

### Data-Driven Contact Groups

**Philosophy:** Transaction history is more reliable than manual contact tagging.

**Rule:** Contacts should be automatically assigned to groups based on their transaction patterns, not manual maintenance.

### Contact Group: "Accomm Hosts"

**Auto-Assignment Rule:**
- Any contact with a transaction (spend/bill) to account **"A100 - Accomm - Host Pay"** should automatically be in the Contact Group "Accomm Hosts"

**Rationale:**
- Manual maintenance of contact groups is error-prone and becomes outdated
- Fidelo (Student & Host database) is the source of truth for host relationships
- Transaction history defines the categorization automatically
- Simple rule: If they get paid to Host Pay account → they're a host

**Implementation Approach:**
1. Query all bank transactions where `AccountCode = "A100"`
2. Extract unique contact IDs
3. Ensure those contacts are in "Accomm Hosts" group
4. Run periodically (monthly or on-demand)

**Benefits for AI Reconciliation:**
- When creating future bills for contacts in "Accomm Hosts" group, default to "A100 - Accomm - Host Pay"
- High confidence rule: Contact in group + payment → use Host Pay account
- Automatic learning: new hosts get added when first payment is made

### General Pattern: Data-Driven Contact Categorization

**Apply this logic to other groups:**

| Contact Group | Transaction Pattern | Account Code(s) |
|---------------|-------------------|----------------|
| Accomm Hosts | Host payments | A100 - Accomm - Host Pay |
| Employees | Payroll/wages | Payroll/Wages accounts |
| Software Vendors | SaaS subscriptions | Technology/Software accounts |
| Utilities | Utility bills | Utilities account |
| Property/Landlords | Rent payments | Rent/Property accounts |

**Key Insight:** Let transaction history automatically categorize contacts rather than relying on manual tagging.

### Contact Name Variations & Aliases

**Challenge:** Bank statements may show nicknames, shortened names, or variations of the contact's formal name in Xero.

**Solution:** When encountering a name mismatch during reconciliation:

1. **Search for variations** - Check for:
   - Nicknames (Kay vs Kathleen)
   - Shortened names (Pat vs Patricia/Patrick)
   - Common name variations in the region

2. **Add a note to the Contact record in Xero** - Once the match is found, add an explanatory note to the contact:
   - Example: "Also called Kay" or "Bank statements show as Kay Kavanagh"
   - This creates a searchable record for future reconciliations

3. **Use the full contact name** - Always reconcile using the existing contact's full name in Xero, even if the bank shows a variation

**Common Irish Name Variations:**
- Kay = Kathleen
- Pat = Patricia/Patrick
- Mick/Micky = Michael
- Paddy = Patrick
- Liz = Elizabeth
- Maggie = Margaret

**Example:**
```
Bank Statement: "Kay Kavanagh" - €420.00
Historical Search: No match for "Kay"
Search variation: "Kathleen Kavanagh" - Found! (A100 - Host Pay)
Action: Reconcile to "Kathleen Kavanagh", add note "Also called Kay"
```

---

## Revenue & Taxation - Entertainment Expenses

**Updated Revenue Rules (2024/2025)**: Revenue Ireland tightened restrictions on entertainment expenses.

### Staff Entertainment
- ❌ **NOT ALLOWED**: Staff parties, meals with alcohol, staff drinks
- ❌ **NOT DEDUCTIBLE**: Large meals and alcoholic beverages for staff
- ✅ **ALLOWED**: Light refreshments, sandwiches, tea/coffee for staff meetings

### Client Entertainment
- ❌ **NOT ALLOWED**: Large meals, alcohol for clients
- ✅ **ALLOWED**: Light refreshments, sandwiches, tea/coffee

### ULearn Exception - Social Activities (A108/109/109b)
**Special Case**: ULearn provides social activities as part of the service to customers (students).

- **Account Codes**: A108 / A109 / A109b - Social Activities
- **Category**: Cost of Sales (A-codes)
- **Justification**: Social events (outings, parties, activities) are an expected part of the student experience and delivered service
- **Use This Instead**: Rather than "Entertainment" categories, code social events/parties/activities to A108/A109/A109b

**Examples:**
- Student welcome party → A108 Social
- Group outing to museum → A109 Social
- Student dinner event → A109b Social
- Coffee/sandwiches during student orientation → A108 Social

**Do NOT use B115 (Entertainment) for these - they are Cost of Sales (part of service delivery), not Entertainment.**

---

## Point of Sale (POS) Transaction Patterns

POS transactions appear in bank statements with format: `POSC[DATE][DESCRIPTION]`

### EuroZone vs Non-EuroZone Detection

**Non-Euro Transactions** show ForEx conversion in description:
- Format: `C[DATE][CURRENCY][Amount]@[Rate]`
- Example: `C3112MX638.00@0.04747` = €30.29 (Mexico, Pesos)
- Example: `P3112MX300.00@0.04746` = €14.24 (Mexico, Pesos)

**EuroZone Transactions** do NOT show conversion:
- Format: `POSC[DATE] [Description]`
- Example: `POSC15JAN 519 - CANAS` (Spain, Euros)
- Example: `POSC15JAN LICENCIA TA` (Spain, Euros)
- Example: `POSC16JAN AEROP. ADOL` (Spain, Euros)

### Spanish POS Transactions

**Madrid Airport (Adolfo Suárez)**
- Pattern: `POSC[DATE]JAN AEROP. ADOL`
- Location: Madrid Airport (Adolfo Suárez)
- Typical: Coffee & sandwiches
- **Coding**: B111 - Travel International
- **Description**: "Subsist - Sandwich & Coffee"

**Example:**
```
POSC16JAN AEROP. ADOL - €51.65
Contact: Travel Expenses
Account: B111 - Travel International
Description: Subsist - Sandwich & Coffee (Madrid Airport)
```

**Other Spanish POS**
- Pattern: `POSC[DATE]JAN [Description]`
- Common: CANAS (café), LICENCIA TA (taxi/license)
- Location: Spain (EuroZone - no ForEx shown)

### Travel vs Transport Categories

**B111 - Travel (National/International)**
- **For**: ULearn staff & directors traveling for work
- **Examples**:
  - Flights for staff
  - Staff taxis to/from meetings
  - Staff meals during business travel (subsistence)
  - Airport coffees/sandwiches while traveling

**B114 - Transport**
- **For**: Moving students/clients (customer service)
- **Examples**:
  - Airport transfers for students
  - Bus rentals for student trips
  - Taxis transporting students to activities

**Rule**: Staff/Director travel = B111 Travel | Customer/Client transport = B114 Transport

**Examples:**
```
Taxi taking staff to client meeting → B111 Travel
Taxi taking students to airport → B114 Transport
Coffee for director at airport → B111 Travel (Subsistence)
Bus rental for student field trip → B114 Transport
```

---

## Critical Gotchas & Known Issues

### ⚠️ Account Code Selection - Autocomplete Danger

**CRITICAL**: When typing account codes in Xero's reconciliation form, the autocomplete dropdown can select SIMILAR but WRONG accounts.

**Problem Example:**
- Typing "B127" and pressing ArrowDown + Enter
- Xero shows TWO accounts:
  1. **B127** - Bank Fees ✅ (correct)
  2. **B127.A** - Bad - debt provision ❌ (completely wrong!)
- Blindly pressing ArrowDown + Enter may select B127.A instead of B127

**Why This Matters:**
- B127.A is NOT a tracking category on B127
- B127.A is a completely SEPARATE account for bad debt provisions
- Reconciling to the wrong account creates incorrect financial records
- The error is not immediately obvious when reviewing transactions

**Solution:**
Instead of typing just the account code (e.g., "B127"), type the **full account name**:
- ✅ Type: "Bank Fees" → selects B127 correctly
- ❌ Type: "B127" → may select B127.A incorrectly

**Implementation in Code:**
```javascript
// WRONG - May select B127.A
await page.type(accountSelector, 'B127', { delay: 100 });

// CORRECT - Selects B127 (Bank Fees)
await page.type(accountSelector, 'Bank Fees', { delay: 100 });
```

**Verification Method:**
After reconciliation, verify via Journals API:
```javascript
const journal = await xero.getJournals({
  ifModifiedSince: new Date(todayStart)
});
// Check journal.journalLines[].accountCode matches expected code
```

**Location in Code:**
- `/home/hub/public_html/fins/scripts/xero/reconcile/reconcile-single.js:212`
- Fixed: November 21, 2025

**Related Accounts with Similar Risk:**
- Any account with sub-accounts using dot notation (e.g., B100, B100.A)
- Any account codes that are prefixes of other codes (e.g., A100 vs A1001)

### ⚠️ Cost Category Selection Required

**CRITICAL**: When using the "Create" action in Xero reconciliation, you MUST select the correct Cost Category in addition to the account code.

**Category Rules:**
- **Cost of Sales**: All Chart of Accounts codes starting with `A` (e.g., A100 - Accomm - Host Pay)
- **Expense**: All Chart of Accounts codes starting with `B` (e.g., B127 - Bank Fees)

**Example - Bank Fees Reconciliation:**
1. **Who**: Bank Charges (Contact)
2. **What**: B127 - Bank Fees (Account Code)
3. **Category**: Expense ✅ (MUST be selected - because B127 starts with 'B')
4. **Why**: Transaction description

**Common Mistake:**
- Filling in Contact and Account Code but forgetting to select the Category dropdown
- This will cause the reconciliation to fail or be incomplete

**Implementation in Code:**
```javascript
// After filling Contact and Account fields, must also select Category
await page.select(categorySelector, 'EXPENSE'); // For B-codes
// OR
await page.select(categorySelector, 'COGSALES'); // For A-codes
```

**Verification:**
- After reconciliation, check that the journal entry shows the correct account type
- B-code accounts should appear under "Expenses" in reports
- A-code accounts should appear under "Cost of Sales" in reports

---

## Automation Strategy

### Phase 1: Observer Mode (Current)
- Read-only scraping of unreconciled transactions
- No actions performed
- Data collection for pattern learning

### Phase 2: Pattern Learning (In Progress)
- Manual training with real examples
- Building discovery.md pattern database
- Establishing confidence baselines

### Phase 3: Semi-Automated Reconciliation
- Suggest reconciliations with confidence scores
- Require human approval before execution
- Focus on "Create" action
- Generate monthly reconciliation reports

### Phase 4: Autonomous Operation
- Automatic reconciliation of high-confidence items (≥80%)
- Monthly reports for spot-checking
- Continuous learning from corrections

---

## AI Decision-Making Protocol (Updated: 2025-11-22)

### Current Approach - Thoroughness Over Efficiency

**Objective**: Prove the system works correctly end-to-end. Once accuracy is confirmed, THEN optimize for efficiency (potentially creating shorthand files for frequently-occurring patterns).

**For each transaction, the AI must:**

1. **Use the Full Knowledge Base** - Review as many files as needed:
   - Manual.md (procedures, decision trees, rules)
   - discovery.md (validated training examples)
   - Matching.md (auto-match technical details)
   - chart-of-accounts.json (verify account codes/names)
   - Historical reconciliation data (2024, 2023, 2022... in that order)

2. **Document Reasoning** - Show which Knowledge Base sources were consulted to arrive at the decision

3. **Don't Optimize Prematurely** - If searching 5-10 files is needed to make a confident decision, do it. Time/overhead is not the concern right now.

4. **Historical Search Order** - Start with 2024 → 2023 → 2022 (most recent first, as patterns are most likely there)

**Note**: This thorough approach is temporary. As patterns become established and validated, we may create shorthand reference files for frequently-occurring transactions to improve efficiency.
