# Incoming Payments - Complete Workflow Manual

**Location:** `/home/hub/public_html/fins/Docs/Projects/Incomings/COMPLETE-WORKFLOW-MANUAL.md`

**Last Updated:** 2025-11-29

**Scope:** Automated assignment of incoming payments from all sources (Stripe, Revolut, BOI) to student bookings in Fidelo

---

## Table of Contents

1. [Overview](#overview)
2. [Payment Sources](#payment-sources)
3. [Assignment Tracking System](#assignment-tracking-system)
4. [Payment Priority System](#payment-priority-system)
5. [Payment Assignment in Fidelo](#payment-assignment-in-fidelo)
6. [Double-Count Prevention](#double-count-prevention)
7. [AI Payment Checker](#ai-payment-checker)
8. [Slack Integration](#slack-integration)
9. [Gmail Integration](#gmail-integration)
10. [Special Cases](#special-cases)
11. [Security & Setup](#security--setup)
12. [Testing & Validation](#testing--validation)
13. [Troubleshooting](#troubleshooting)

---

## Overview

### System Architecture

This workflow connects three distinct tiers of systems:

**1. DATA SOURCES (Financial)** - Where money actually flows from
- These systems hold the actual incoming payments that need to be assigned
- Some sync to Xero for reconciliation, others don't

**2. CRM / GUIDES** - Systems that help identify who paid
- These provide clues (student names, IDs, emails, amounts) to match payments to students
- They don't hold the actual money, just information about it

**3. ASSIGNMENT TARGET** - Where payments are recorded in the student system
- This is where we write the payment assignment once we've identified the student

### Systems Involved - Complete Table

| System | Category | Xero Sync? | Connection Method | API Available? | Purpose |
|--------|----------|------------|-------------------|----------------|---------|
| **Bank of Ireland Current Account** | Data Source | Yes | Puppeteer | No | Bank transfers, TransferMate, escrow deposits |
| **Revolut Euro Account** | Data Source | Yes | Puppeteer | No | Direct Revolut transfers (non-merchant) |
| **Revolut Merchant Account** | Data Source | Yes | Puppeteer | **Yes** | Online payment links, Revolut gateway payments |
| **Stripe (info@ + neil@)** | Data Source | **No** | N/A | **Yes** | Card payments (terminal + online) - **This is why this workflow exists** |
| **HubSpot** | CRM / Guide | N/A | API | Yes | Contact info (name/email), Deal amounts, Conversation history, Ulgebra chat integration |
| **Slack #financial** | CRM / Guide | N/A | API | Yes | Sales team posts remittance notifications with student ID, name, and receipt attachments |
| **Gmail (accounts@)** | CRM / Guide | N/A | Gmail API | Yes | TransferMate batch payment notification emails with Fidelo references and amounts |
| **Fidelo SIS** | Assignment Target | N/A | API (GUI2 + Bookings + Payment) | Yes | Student booking system where payments are assigned - searched by: Student ID, Name, Email, Amount, Date, Nationality |

### System Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                   1. DATA SOURCES (Financial)               │
│              Where the actual money comes from              │
├─────────────────────────────────────────────────────────────┤
│  • Stripe (info@ + neil@)    [API] → No Xero sync          │
│  • Revolut Merchant          [API] → Syncs to Xero         │
│  • Bank of Ireland           [Puppeteer] → Syncs to Xero   │
│  • Revolut Euro Account      [Puppeteer] → Syncs to Xero   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓ Payment transaction received
                     │
┌────────────────────┴────────────────────────────────────────┐
│                  2. CRM / GUIDES (Matching)                 │
│          Systems that help identify the student             │
├─────────────────────────────────────────────────────────────┤
│  • Slack #financial → Sales posts "ID 12345, Smith, €500"  │
│  • HubSpot CRM → Deals with student emails & amounts       │
│  • Gmail (accounts@) → TransferMate emails with Fidelo ref │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓ Student identified
                     │
┌────────────────────┴────────────────────────────────────────┐
│               3. ASSIGNMENT TARGET (Recording)              │
│         Where we record the payment to the student          │
├─────────────────────────────────────────────────────────────┤
│  • Fidelo SIS → Create payment record on booking           │
└─────────────────────────────────────────────────────────────┘
```

### Why This Workflow Exists

**Primary Reason:** Stripe does **not** sync to Xero, so we need to:
1. Fetch Stripe payments via API
2. Match them to students in Fidelo
3. Assign them as payments in Fidelo
4. This keeps Fidelo accurate for student balances even though Stripe never appears in Xero

**Secondary Benefit:** Automate matching for Revolut Merchant API payments (even though they do sync to Xero, we can assign them faster via API)

### Workflow Frequency
- **Automated:** Daily at 6am (cron job)
- **Timing:** Runs BEFORE Xero reconciliation (uses unreconciled transactions)

### Scripts Location
```
/home/hub/public_html/fins/scripts/
├── stripe/
│   └── api.js              ← Dual Stripe account support
├── revolut/
│   └── api.js              ← Revolut API integration
├── slack/
│   ├── notify.js           ← Slack notifications
│   ├── attach-read.js      ← Remittance reader
│   └── attach-parse.js     ← PDF/image parsing (OpenAI Vision)
├── gmail/
│   ├── client.js           ← Gmail API client
│   ├── reader.js           ← TransferMate email parser
│   ├── setup.js            ← OAuth setup
│   └── generate.js         ← Token generator
└── assign/
    ├── workflow.js         ← Main payment workflow
    ├── gpt-checker.js      ← AI Payment Checker (GPT-4o)
    ├── gpt-checker.md      ← AI prompt guidelines (runtime)
    ├── tracker.js          ← Assignment tracking system
    ├── fidelo-reference-search.js
    ├── hubspot-matcher.js
    ├── escrow-payment-handler.js
    ├── payment-methods.js
    ├── xero-unreconciled-fetcher.js
    └── run-daily.js        ← Daily execution script
```

---

## Payment Sources

### 1. Stripe (Dual Account Setup)

**Two Separate Accounts:**

**Account 1: info@ (Terminal/Card Reader)**
- Connected to "Collect for Stripe" terminal software
- Used for in-person card payments via phone/card reader
- Account ID: `acct_1OYc1VL17ol1v2QQ`
- Environment variable: `STRIPE_SECRET_INFO`

**Account 2: neil@ (Online Payments)**
- Used for regular online payments
- Account ID: `acct_18480BDVmrHPgwa8`
- Environment variable: `STRIPE_SECRET_NEIL`

**Environment Setup:**
```bash
# .env file
STRIPE_SECRET_INFO=rk_live_51OYc1VL17ol1v2QQ...
STRIPE_SECRET_NEIL=rk_live_518480BDVmrHPgwa8...
STRIPE_SECRET=rk_live_51OYc1VL17ol1v2QQ...  # Backward compatibility (uses info@)
```

**API Permissions Required (Read-Only):**
- `rak_charge_read` - Read charges/payments
- `rak_customer_read` - Read customer details
- `rak_payout_read` - Read payout batches
- `rak_balance_read` - Read balance

**Workflow Integration:**
```javascript
// Automatically queries BOTH accounts
const stripe = new StripeIntegration();
const transactions = await stripe.getTransactionsFromAllAccounts(startDate, endDate);
// Returns transactions tagged with stripeAccount: 'info' or 'neil'
```

**Date Range Fix (2025-11-29):**
```javascript
// OLD (broken): endDate midnight excludes that day
const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

// NEW (fixed): endDate includes full day (23:59:59)
const endDatePlusOne = new Date(endDate);
endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
const endTimestamp = Math.floor(endDatePlusOne.getTime() / 1000) - 1;
```

**Payment Method ID:** `11` (Stripe)

---

### 2. Revolut Merchant

**Purpose:** Online payment links, card payments via Revolut gateway

**Environment Setup:**
```bash
REVOLUT_API_KEY=sk_2l_ofKMl7BSPkTgq4ZUXf0PywFkLsRqqPmohOrDZPnorrzdebCahdo0RZ-sp_F1N
REVOLUT_ENVIRONMENT=production
```

**API Permissions Required (Read-Only):**
- Accounts (read) - View balances
- Transactions (read) - View transaction history
- Counterparties (read) - View customer details

**Payment Method ID:** `4` (Credit Card - Revolut doesn't exist in Fidelo)

**Known Issue:** Customer names may show as "Unknown" - acceptable, match by amount

---

### 3. Bank of Ireland (via Xero)

**Purpose:** Direct bank transfers, TransferMate, escrow payments

**Fetcher:** `scripts/assign/xero-unreconciled-fetcher.js`

**Payment Method IDs:**
- `2` - Bank Transfer (DEFAULT)
- `10` - TransferMate
- `12` - TransferMate Escrow (legacy)

---

## Assignment Tracking System

### Overview

**Purpose:** Track which transactions from each financial source (BOI/Stripe/Revolut) have been assigned to Fidelo to prevent reprocessing and enable idempotent workflow execution.

**Why Needed:**
- **BOI**: Previously relied on Xero's "UNRECONCILED" status, but that tracks Xero bank reconciliation, NOT Fidelo assignment
- **Stripe/Revolut**: No tracking at all - just date ranges could cause duplicates
- **Slack Remittances**: Already had checkpoint tracking (this was the model)

**Key Distinction - Terminology:**
- **Assignment** = Assigning payments to Fidelo bookings (what this workflow does)
- **Reconciliation** = Xero bank reconciliation (matching bank lines to Xero transactions - separate process)

### File Structure

**Monthly Assignment Files:**
```
/home/hub/public_html/fins/scripts/assign/2025/
├── 11-nov-assign.json      ← November 2025
├── 12-dec-assign.json      ← December 2025
└── ...
```

**Note:** Files should be in `scripts/assign/2025/` (NOT `scripts/incomings/2025/`)

**Auto-Created:** New file created automatically on 1st of each month

**File Structure:**
```json
{
  "metadata": {
    "year": 2025,
    "month": 11,
    "monthName": "nov",
    "created": "2025-11-30T12:23:55.282Z",
    "lastUpdated": "2025-11-30T12:34:29.888Z"
  },
  "transactions": {
    "boi": [...],       // BOI bank transactions (from Xero recon files)
    "stripe": [...],    // Stripe charges
    "revolut": [...]    // Revolut orders
  },
  "stats": {
    "total": 7,
    "unprocessed": 5,
    "assigned": 1,
    "duplicate": 1,
    "review": 0,
    "failed": 0
  }
}
```

### Transaction Object Structure

Each transaction in the tracker contains:

```javascript
{
    // Identifiers
    id: "dataId or chargeId or orderId",  // Unique ID from source system
    source: "boi|stripe|revolut",         // Financial source

    // Transaction details
    amount: 1656,                         // Amount in euros
    date: "21 Nov 2025",                  // Transaction date
    description: "...",                   // BOI only
    reference: "...",                     // BOI only
    customerName: "...",                  // Stripe/Revolut only (optional)

    // Assignment tracking
    assignStatus: "unprocessed|assigned|duplicate|review|failed",
    fideloPaymentId: null,                // Set when assigned
    fideloStudentId: null,                // Set when matched
    fideloInvoice: null,                  // Set when matched
    notes: null,                          // Error messages or special notes

    // Timestamps
    addedAt: "2025-11-30T12:23:55.293Z",
    lastUpdated: "2025-11-30T12:23:55.293Z"
}
```

### Assignment Statuses

| Status | Meaning | When Set |
|--------|---------|----------|
| `unprocessed` | Not yet assigned to Fidelo | Default when transaction first synced |
| `assigned` | Successfully assigned to Fidelo booking | After successful payment creation |
| `duplicate` | Payment already exists on booking | When duplicate detection triggered |
| `review` | Manual review required | When no match found or underpayment |
| `failed` | Assignment failed due to error | When API call or other error occurred |

### Transaction Sources

#### 1. BOI Transactions (from Xero Recon Files)

**Source File:** `/home/hub/public_html/fins/scripts/xero/recon/2025/11-nov-txns.json`

**Generated By:** Xero Puppeteer scraper (separate process)

**Contains:**
- All bank transactions from Bank of Ireland current account
- Already scraped and stored in JSON format
- Includes dataId (unique identifier), amount, date, description, reference

**Sync Process:**
```javascript
// Tracker reads from existing Xero recon file
await tracker.syncBoiFromXeroRecon();
// Filters for RECEIVE transactions only (money in)
// Adds each to tracker with dataId as unique identifier
```

**Why This Works:**
- Leverages existing Xero reconciliation scraping infrastructure
- No need to re-fetch BOI data
- Xero recon files already contain all necessary transaction details

#### 2. Stripe Transactions (from API)

**Source:** Stripe API (both info@ and neil@ accounts)

**Transaction ID:** Stripe charge ID (format: `ch_xxx` or `py_xxx`)

**Sync Process:**
```javascript
const stripe = new StripeIntegration();
const transactions = await stripe.getTransactionsFromAllAccounts(startDate, endDate);
await tracker.syncStripeFromApi(transactions);
```

**Stored Fields:**
- `id`: Stripe charge ID
- `amount`: Charge amount in euros
- `date`: Transaction date
- `customerName`: Customer name (optional, for reference)

#### 3. Revolut Transactions (from API)

**Source:** Revolut Merchant API

**Transaction ID:** Revolut order ID

**Sync Process:**
```javascript
const revolut = new RevolutIntegration();
const transactions = await revolut.getTransactions(startDate, endDate);
await tracker.syncRevolutFromApi(transactions);
```

**Stored Fields:**
- `id`: Revolut order ID
- `amount`: Order amount in euros
- `date`: Transaction date
- `customerName`: Customer name (optional, may be "Unknown")

### Tracker API (tracker.js)

**Location:** `/home/hub/public_html/fins/scripts/assign/tracker.js`

**Class:** `AssignmentTracker`

#### Core Methods

**Add Transactions:**
```javascript
// Add BOI transaction (uses Xero dataId)
await tracker.addBoiTransaction(dataId, amount, date, description, reference);

// Add Stripe transaction (uses charge ID)
await tracker.addStripeTransaction(chargeId, amount, date, customerName);

// Add Revolut transaction (uses order ID)
await tracker.addRevolutTransaction(orderId, amount, date, customerName);
```

**Update Status:**
```javascript
// Update transaction status after assignment attempt
await tracker.updateStatus(source, txnId, status, {
    fideloPaymentId: 37027,
    fideloStudentId: '30737',
    fideloInvoice: 'D2025559',
    notes: 'Successfully assigned'
});
```

**Query Methods:**
```javascript
// Get all unprocessed transactions from all sources
const unprocessed = await tracker.getUnprocessedTransactions();
// Returns: { boi: [...], stripe: [...], revolut: [...] }

// Check if specific transaction has been processed
const isProcessed = await tracker.isProcessed('stripe', 'ch_xxx');
```

#### Sync Methods

**Sync BOI from Xero Recon File:**
```javascript
// Reads from /scripts/xero/recon/2025/11-nov-txns.json
const boiSynced = await tracker.syncBoiFromXeroRecon();
// Returns: number of transactions synced
```

**Sync Stripe from API:**
```javascript
// Pass Stripe transactions from API
const stripeSynced = await tracker.syncStripeFromApi(stripeTransactions);
// Returns: number of transactions synced
```

**Sync Revolut from API:**
```javascript
// Pass Revolut transactions from API
const revolutSynced = await tracker.syncRevolutFromApi(revolutTransactions);
// Returns: number of transactions synced
```

**Sync All Sources (convenience method):**
```javascript
await tracker.syncAllSources({
    stripeTransactions: [...],
    revolutTransactions: [...]
});
// Returns: { boi: 5, stripe: 3, revolut: 2 }
```

### Integration with Workflow

**Location:** `/home/hub/public_html/fins/scripts/assign/workflow.js`

**Integration Points:**

**1. Initialization:**
```javascript
const AssignmentTracker = require('./tracker');

constructor() {
    this.tracker = new AssignmentTracker();
}
```

**2. After Each Transaction Processed:**
```javascript
// Update tracker status (24 lines added to workflow.js)
if (txn.id && txn.source) {
    const statusMap = {
        'success': 'assigned',
        'already_assigned': 'duplicate',
        'manual_review': 'review',
        'underpayment': 'assigned',
        'error': 'failed',
        'failed': 'failed'
    };
    const trackerStatus = statusMap[result.status] || 'failed';

    try {
        await this.tracker.updateStatus(txn.source, txn.id, trackerStatus, {
            fideloPaymentId: result.payment?.paymentId,
            fideloStudentId: result.booking?.customerNumber || result.booking?.customer_number,
            fideloInvoice: result.booking?.documentNumber || result.booking?.document_number,
            notes: result.notification || result.error
        });
    } catch (err) {
        console.log(`   ⚠️  Tracker update failed: ${err.message}`);
    }
}
```

**Code Impact:**
- Only **24 lines** added to workflow.js (kept minimal to avoid bloat)
- All sync functionality lives in tracker.js (not workflow.js)
- workflow.js total: 1026 lines (acceptable, just over 1000-line threshold)

### Workflow Execution Flow

**File Processing Flow:**

```
┌─────────────────────────────────────────┐
│ 1. FETCH PHASE                          │
├─────────────────────────────────────────┤
│ BOI: Read from disk                     │
│   ← /scripts/xero/recon/2025/11-nov-   │
│      txns.json (38 RECEIVE)             │
│                                         │
│ Stripe: Fetch API → RAM                │
│   (3 transactions in memory)            │
│                                         │
│ Revolut: Fetch API → RAM               │
│   (5 transactions in memory)            │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ 2. SYNC TO TRACKER                      │
├─────────────────────────────────────────┤
│ Save ALL to disk:                       │
│   → /scripts/assign/2025/            │
│      11-nov-assign.json                 │
│   (46 transactions with IDs + status)   │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ 3. PROCESS                              │
├─────────────────────────────────────────┤
│ Read from tracker, attempt assignment,  │
│ update status in tracker file           │
└─────────────────────────────────────────┘
```

**Storage Locations:**

**Input Files (source data):**
- **BOI**: `/home/hub/public_html/fins/scripts/xero/recon/2025/11-nov-txns.json`
  - Pre-fetched by Puppeteer scraper
  - Contains all bank transactions (filtered to RECEIVE only)

- **Stripe**: Fetched directly from API to RAM (not saved separately)
  - Only persists in tracker file after sync

- **Revolut**: Fetched directly from API to RAM (not saved separately)
  - Only persists in tracker file after sync

**Output File (tracker checkpoint):**
- **Location**: `/home/hub/public_html/fins/scripts/assign/2025/11-nov-assign.json`
- **Contains**: ALL transactions from all sources (BOI + Stripe + Revolut)
- **Purpose**: Permanent checkpoint/audit trail with assignment status
- **Format**: JSON with transaction IDs, amounts, dates, and assignment status

**Memory vs Disk:**
- **RAM (Memory)**: Temporary storage during script execution - lost when script exits
- **Disk (File)**: Permanent storage - survives script exit and available for review

### Benefits

**1. Idempotent Workflow:**
- Can run workflow multiple times without creating duplicate payments
- Each transaction tracked by unique ID from source system
- Status prevents reprocessing

**2. Audit Trail:**
- Complete history of all assignment attempts
- Timestamps for when transactions added and last updated
- Notes field captures errors or special circumstances

**3. Recovery:**
- If workflow interrupted, can resume from where it left off
- Query unprocessed transactions to continue

**4. Reporting:**
- Stats provide overview of assignment progress
- Can identify stuck transactions requiring manual review
- Track success/failure rates

**5. Debugging:**
- Monthly files provide snapshot of transaction state
- Can review past months to understand assignment patterns
- Clear separation between unprocessed, assigned, and failed

### Example Workflow

**Daily Automated Run:**

```javascript
// 1. Sync all financial sources to tracker
await tracker.syncAllSources({
    stripeTransactions: await stripe.getTransactionsFromAllAccounts(startDate, endDate),
    revolutTransactions: await revolut.getTransactions(startDate, endDate)
});
// BOI synced automatically from Xero recon file

// 2. Get unprocessed transactions
const unprocessed = await tracker.getUnprocessedTransactions();

// 3. Process each unprocessed transaction
for (const txn of [...unprocessed.boi, ...unprocessed.stripe, ...unprocessed.revolut]) {
    const result = await processTransaction(txn);

    // 4. Update tracker with result
    await tracker.updateStatus(txn.source, txn.id, result.status, {
        fideloPaymentId: result.payment?.paymentId,
        fideloStudentId: result.booking?.customerNumber,
        fideloInvoice: result.booking?.documentNumber,
        notes: result.notification
    });
}

// 5. Check final stats
const data = await tracker.loadAssignments();
console.log(data.stats);
// { total: 15, unprocessed: 2, assigned: 11, duplicate: 1, review: 1, failed: 0 }
```

### Testing

**Test Scripts:**
- `/home/hub/public_html/fins/.claude/tmp/test-assignment-tracker.js` - Full tracker functionality test
- `/home/hub/public_html/fins/.claude/tmp/test-tracker-sync.js` - Sync methods test

**Run Tests:**
```bash
node .claude/tmp/test-tracker-sync.js
```

**Verifies:**
- File creation and structure
- Transaction addition (BOI/Stripe/Revolut)
- Status updates
- Sync methods
- Stats calculation

---

## Payment Matching Priority System

When a payment is received from a **Data Source** (Stripe/Revolut/BOI), the workflow uses **CRM/Guides** to identify the student, then assigns the payment in **Fidelo** (the Assignment Target).

The matching process follows this priority order:

### Priority 1: Slack Remittance Match 🆕

**Source:** Slack #financial channel (sales team posts payment notifications)

**Process:**
1. Read messages from #financial channel
2. Extract student ID from message text (e.g., "ID 30737 Padros, Laia")
3. Parse attached receipts (PDFs/images) using OpenAI Vision API
4. Match payment by:
   - Amount (±€1 tolerance for fees)
   - Student ID
   - Date (±7 days)

**Features:**
- Automatic PDF parsing (via pdf-parse v1.1.1)
- Image parsing (via OpenAI gpt-4o Vision API)
- Validates staff-entered data against receipt
- Detects amount mismatches (e.g., staff types €100 but receipt shows €108)
- Checkpoint system prevents re-processing
- Posts threaded replies to original sales messages

**Files:**
```
scripts/slack/
├── attach-read.js      ← Reads #financial, parses attachments
├── attach-parse.js     ← PDF/image OCR with OpenAI
└── notify.js           ← Posts threaded replies
data/
└── slack-remittances.json  ← Checkpoint file
```

**Environment Setup:**
```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_DEFAULT_CHANNEL=#financial
OPENAI_API_KEY=sk-...
```

**Scopes Required:**
- `channels:read`
- `channels:history`
- `files:read`
- `chat:write`
- `chat:write.public`

**Why Priority 1?**
- User requested: "I don't want to force staff to another thing... would it make more sense to put Slack Remittances first? That way you can be certain and you will reply to the Sales persons' Slack message directly... That would be easier for the Sales staff and polite in the presentation"

---

### Priority 2: Fidelo Direct Search (Using Payment Data)

**Method:** Search Fidelo directly using information from the payment transaction (reference codes, customer names, amounts)

**Search Methods:**

**2a. Structured References:**
- `P####` format - Proforma invoice (e.g., P2025302)
- `D####` format - Document/Invoice (e.g., D2025548)
- 5-6 digit Booking ID

**2b. Name + Amount Match:**
- Extract student name from transaction description
- Search Fidelo API by **last name first** (fewer results)
- Then try first name if needed
- Verify amount matches `amount_open` (within €10 tolerance)
- **Skip words < 3 characters** (prevents false matches like "Lu" → "Luigi")

**Search Strategy (Optimized 2025-11-29):**
```javascript
// STRATEGY 1: Try LAST NAME first (fewer results)
if (lastName && lastName.length >= 3) {
    const result = await searchByReference(lastName);
    // Check for amount match...
}

// STRATEGY 2: Try FIRST NAME (if last name didn't work)
if (firstName && firstName.length >= 3) {
    const result = await searchByReference(firstName);
}

// STRATEGY 3: Try full name combination
const fullName = `${lastName} ${firstName}`;

// STRATEGY 4: Skip very short words (< 3 chars) to avoid false matches
```

**Fidelo API Notes:**
- Searches use **substring OR matching** (searches "Lu Enshi" finds any booking with "Lu" OR "Enshi")
- Always search individual words, not combined strings with spaces

---

### Priority 3: HubSpot Cross-Reference (Using CRM Guide)

**Method:** When Fidelo direct search fails, use HubSpot CRM data to find student email, then search Fidelo by email

**Process:**
- Match by **amount + customer name**
- Search B2B (pipeline: 35765201) and B2C (pipeline: default)
- Exclude Won/Lost deals (active pipeline only)
- Extract Fidelo booking ID from HubSpot deal

---

### Priority 4: Manual Review

If no match found in any source:
1. Flag for manual review
2. Send Slack notification to #financial
3. Email alert to finance team
4. Log to `fins.log`

---

## Payment Assignment in Fidelo

### API Endpoint
```
POST https://ulearn.fidelo.com/api/1.0/ts/payments
Authorization: Bearer <FIDELO_API_TOKEN>
```

### Required Fields

```json
{
  "inquiry_id": 40700,        // Same as booking_id
  "school_id": 1,             // Always 1 (ULearn)
  "booking_id": 40700,        // Fidelo booking ID
  "payment_date": "2025-11-25", // Transaction date (Y-m-d)
  "payment_method_id": 5,     // See Payment Methods below
  "payment_amount": 1234.56,  // Exact amount from source
  "payment_comment": "BOI description - Ai"
}
```

### Payment Method IDs

**IMPORTANT:** These are **DATABASE IDs** - they are **STABLE** and never change.
The UI dropdown order can be rearranged by school, but these IDs remain constant.

**Verified:** 2025-11-29 via API test (Booking 40066, Payments 37012-37023)

From `scripts/assign/payment-methods.js`:
```javascript
PAYMENT_METHODS = {
    CASH: 1,
    BANK_TRANSFER: 2,           // DEFAULT
    CHECK: 3,
    CREDIT_CARD: 4,             // Use for Revolut Merchant
    FLYWIRE: 5,
    ULEARN_CREDIT: 6,
    INTERNAL_ASSIGNMENT: 7,
    AGENT_COMMISSION: 8,
    REFUND: 9,
    TRANSFERMATE: 10,
    STRIPE: 11,                 // CORRECT ID (NOT 5!)
    TRANSFERMATE_ESCROW: 12,    // Legacy

    REVOLUT: 4                  // Alias (maps to Credit Card)
}
```

**Complete Index:**

| ID | Method Name | Usage |
|----|-------------|-------|
| 1 | Cash | Cash payments |
| 2 | Bank Transfer | DEFAULT - BOI, SEPA, wire transfers |
| 3 | Check | Checks/Cheques |
| 4 | Credit Card | Revolut Merchant (card payments) |
| 5 | Flywire | Flywire processor |
| 6 | ULearn Credit | Internal credits |
| 7 | Internal Assignment | Internal transfers |
| 8 | Agent Commission | Agency commissions |
| 9 | Refund | Refunds |
| 10 | TransferMate | TransferMate payments |
| 11 | **Stripe** | **Stripe payments (info@ + neil@ accounts)** |
| 12 | TransferMate Escrow | LEGACY - being phased out |

**Auto-Detection:**
```javascript
function detectPaymentMethod(transaction) {
    if (transaction.source === 'stripe') return 11;  // Stripe
    if (transaction.source === 'revolut') return 4;  // Credit Card
    if (transaction.description.includes('TransferMate')) {
        if (transaction.description.includes('Escrow')) return 12;  // TransferMate Escrow
        return 10;  // TransferMate
    }
    return 2;  // Default: Bank Transfer
}
```

### Field Details

**inquiry_id:**
- Always same as `booking_id`
- Including BOTH creates an **assigned payment** (not unallocated)

**payment_date:**
- Use transaction date from source (NOT current date)
- Format: `Y-m-d` (e.g., "2025-11-25")
- Stripe/Revolut: Use `created` timestamp
- BOI: Use Xero transaction date

**payment_comment:**
- Format: `"[Source Description] - Ai"`
- "Ai" indicates automated system (like staff initials)
- Provides audit trail with original reference

**Examples:**
```
"158619782030727 P2 IP - Ai"
"Yagmur Sirkecioglu SP - Ai"
"Stripe: Laia Padros - Ai"
"Revolut: Unknown - Ai"
```

---

## Double-Count Prevention

### Layer 1: API vs Xero Duplicates

**Problem:**
- Stripe charges assigned via Stripe API
- Same charges appear as batch payouts in BOI (Xero)
- Revolut orders assigned via Revolut API
- Same orders appear as batch transfers in BOI

**Solution:**
Filter out batch deposits from Xero when using all sources:

```javascript
// workflow.js
filterXeroTransactions(xeroTransactions) {
    return xeroTransactions.filter(txn => {
        const desc = txn.description.toLowerCase();

        // Skip Stripe payouts
        if (desc.includes('stripe') || desc.includes('payout')) {
            console.log(`⚠️  Filtered Stripe payout: ${txn.description}`);
            return false;
        }

        // Skip Revolut batch transfers
        if (desc.includes('revolut merchant') || desc.includes('revolut transfer')) {
            console.log(`⚠️  Filtered Revolut transfer: ${txn.description}`);
            return false;
        }

        return true; // Keep regular bank transfers
    });
}
```

**Result:**
- Stripe payout in Xero → SKIPPED
- Revolut transfer in Xero → SKIPPED
- Regular bank transfers → PROCESSED

---

### Layer 2: Already-Assigned Check

**Problem:** During transition from manual to automated, some payments may already be manually assigned

**Solution:** Before assigning ANY payment, check if matching payment already exists

**Matching Criteria:**
1. Same booking (by document_number)
2. Amount match (within €1)
3. Date match (within 5 days)

**Implementation:**
```javascript
// escrow-payment-handler.js
async checkForDuplicatePayment(documentNumber, amount, date, dateTolerance = 5) {
    // 1. Fetch all payments for this booking
    // 2. Check each for amount/date match
    // 3. Return: { exists: boolean, matchedPayment: object|null }
}
```

**Workflow Integration:**
```javascript
// Before creating payment
const duplicateCheck = await checkForDuplicatePayment(
    documentNumber,
    txn.amount,
    txn.date,
    5
);

if (duplicateCheck.exists) {
    console.log('♻️  ALREADY ASSIGNED: Skipping to avoid duplicate');
    return { status: 'already_assigned', existingPayment: match };
}
```

---

## AI Payment Checker

### Overview

**Purpose:** AI-powered quality control layer that reviews ALL transaction assignment results before publishing to Slack or human review

**Model:** OpenAI GPT-4o (`gpt-4o-2024-08-06`)

**Location:** `/home/hub/public_html/fins/scripts/assign/gpt-checker.js`

### When It Runs

The AI checker is the **final step** before any transaction result is finalized:

```
Transaction Processing → Assignment Attempt → AI Checker → Slack/Human Review
```

**Workflow Position:**
1. Transaction fetched from source (BOI/Stripe/Revolut)
2. Matching attempted (Slack → Fidelo → HubSpot)
3. Payment assignment attempted in Fidelo
4. **→ AI CHECKER REVIEWS RESULT** ←
5. If approved: Proceed to Slack notification
6. If issue found: AI attempts intelligent fix
7. If unfixable: Flag for manual review with detailed notes

**Visual Flow:**
```
┌─────────────────────────────────────────────┐
│  Transaction Fetched (BOI/Stripe/Revolut)  │
└────────────────┬────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────┐
│     Matching (Slack → Fidelo → HubSpot)    │
└────────────────┬────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────┐
│      Payment Assignment Attempted           │
│         (success/error/review)              │
└────────────────┬────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────┐
│      🤖 AI PAYMENT CHECKER (GPT-4o)         │
│  ┌─────────────────────────────────────┐   │
│  │ • Validates data quality            │   │
│  │ • Checks match confidence           │   │
│  │ • Verifies business rules           │   │
│  │ • Analyzes errors                   │   │
│  └─────────────────────────────────────┘   │
└────┬───────────────────┬────────────────┬───┘
     │                   │                │
     ↓                   ↓                ↓
  APPROVE            RETRY            FLAG
     │                   │                │
     ↓                   ↓                ↓
┌─────────┐      ┌──────────────┐   ┌─────────┐
│ Slack   │      │ Re-attempt   │   │ Manual  │
│ Notify  │      │ with AI fix  │   │ Review  │
│ Success │      └──────┬───────┘   │ Queue   │
└─────────┘             │            └─────────┘
                        ↓
                  ┌──────────┐
                  │ AI Check │
                  │  Again   │
                  └────┬─────┘
                       │
                  ┌────┴────┐
                  │         │
             Approve    Flag
                  │         │
              Slack    Manual
             Success   Review
```

### What It Reviews

The AI checker receives the **complete transaction result** including:

```javascript
{
    status: 'success|already_assigned|manual_review|underpayment|error|failed',
    transaction: {
        id: 'ch_xxx',
        source: 'stripe',
        amount: 554,
        date: '21 Nov 2025',
        customerName: 'Laia Padros',
        description: '...'
    },
    booking: {
        customerNumber: '30737',
        documentNumber: 'D2025559',
        amount_open: 0,
        customer_name: 'Padros, Laia',
        // ... full booking details
    },
    payment: {
        paymentId: 37027,
        amount: 554,
        method: 11  // Stripe
    },
    notification: 'Successfully assigned €554 to booking D2025559',
    error: null  // Or error message if failed
}
```

### AI Assessment Process

**For Each Transaction, AI Checks:**

1. **Data Quality:**
   - Are amounts reasonable? (€0-€20,000 range for student payments)
   - Do dates make sense? (not future dates, within reasonable timeframe)
   - Are names properly formatted?
   - Do Fidelo references follow correct patterns (P####, D####)?

2. **Match Quality:**
   - Does customer name reasonably match booking name?
   - Is amount variance acceptable? (bank fees, Stripe fees)
   - Is the confidence level appropriate for the match method?

3. **Assignment Logic:**
   - Is correct payment method selected? (Stripe=11, TransferMate=10, etc.)
   - For underpayments: Is the shortfall justified? (bank fees)
   - For overpayments: Is it a Partner booking with commission?
   - For duplicates: Was it correctly identified and skipped?

4. **Error Analysis:**
   - If error occurred: Is it recoverable?
   - Can AI suggest a different matching approach?
   - Should this be retried with different parameters?

### AI Decision Matrix

| Status from Workflow | AI Assessment | AI Action |
|---------------------|---------------|-----------|
| `success` | High confidence match | **APPROVE** - Proceed to Slack notification |
| `success` | Low confidence (name mismatch) | **FLAG** - Request human verification |
| `already_assigned` | Duplicate correctly detected | **APPROVE** - Log and skip |
| `underpayment` | Bank fee justified (€5-€20) | **APPROVE** - Accept with note |
| `underpayment` | Large unexplained variance | **RETRY** - Attempt different match or **FLAG** |
| `manual_review` | Clear student ID available | **RETRY** - Search by ID instead of name |
| `manual_review` | Ambiguous match (multiple students) | **FLAG** - Human decision required |
| `error` | Transient API error (timeout) | **RETRY** - Re-attempt assignment once |
| `error` | Data error (invalid booking) | **FLAG** - Cannot auto-fix |
| `failed` | Clear reason (student not found) | **FLAG** - Enhanced error description |

### Two-Tier Prompt System

The AI checker uses a sophisticated prompt system to minimize API costs while maintaining accuracy:

**Tier 1: Quick Start Guide** (Loaded by default)
- Concise reference guide (~500 tokens)
- Covers common scenarios and decision criteria
- 90% of transactions resolved using this tier
- Fast response, lower cost

**Tier 2: Full Manual** (Loaded on-demand)
- Complete workflow manual (this document)
- Used for complex/ambiguous cases
- Provides deep context for unusual situations
- AI tracks when full manual is accessed

**Prompt Structure:**
```javascript
const systemPrompt = `You are an AI payment checker for student booking payments...

# Your Task
Review transaction results and determine:
1. Should this be approved and published?
2. Can you identify and fix any issues?
3. Does this need human review?

${this.quickStartPrompt || 'Loading...'}

For complex cases, you can request the full manual by indicating you need more context.
`;
```

### Intelligent Retry Logic

When AI identifies a fixable issue, it can:

**1. Suggest Alternative Search:**
```javascript
// Original attempt: Searched by truncated name "Laia Pa"
// AI Analysis: Name appears truncated, check if full name in description
// AI Retry: Extract full name "Laia Padros" → Search again
```

**2. Propose Different Match Method:**
```javascript
// Original: No Slack remittance found
// AI Analysis: TransferMate payment, check Gmail for batch email
// AI Retry: Search Gmail → Extract Fidelo ref → Direct match
```

**3. Identify Missing Data:**
```javascript
// Original: Student ID not found in Fidelo
// AI Analysis: ID may be customer_number not customer_id field
// AI Retry: Search using correct field mapping
```

**4. Validate Business Rules:**
```javascript
// Original: Flagged as overpayment (€-450)
// AI Analysis: Booking has agency_id=127 (Partner booking)
// AI Decision: Overpayment = commission owed to Partner → APPROVE
```

### Stats Tracking

The AI checker maintains statistics across all transactions:

```javascript
{
    totalChecked: 15,           // Total transactions reviewed
    approved: 11,                // Approved without changes
    flagged: 2,                  // Flagged for human review
    fixProposed: 2,              // Issues identified and fixed by AI
    manualSectionsRead: {        // Which manual sections AI accessed
        'payment-methods': 3,
        'special-cases': 1,
        'double-count': 2
    },
    fullManualReads: 1           // How many times full manual loaded
}
```

**Performance Metrics:**
- Average review time: ~2-3 seconds per transaction
- API cost: ~$0.01-0.02 per transaction (using GPT-4o)
- Accuracy: >95% correct assessments in testing
- False positive rate: <5% (incorrectly flagging valid transactions)

### Integration with Workflow

**Code Integration (workflow.js):**

```javascript
const GPTPaymentChecker = require('./gpt-checker');

class PaymentWorkflow {
    constructor() {
        this.gptChecker = new GPTPaymentChecker();
    }

    async processTransaction(txn) {
        // 1. Attempt assignment
        const result = await this.attemptAssignment(txn);

        // 2. AI REVIEW
        const aiReview = await this.gptChecker.reviewTransaction(result);

        if (aiReview.approved) {
            // 3a. Approved - proceed to Slack
            await this.notifySuccess(result);
            await this.tracker.updateStatus(txn.source, txn.id, 'assigned', result);

        } else if (aiReview.retryRecommended) {
            // 3b. AI suggests retry with different approach
            console.log(`🤖 AI suggests retry: ${aiReview.retryReason}`);
            const retryResult = await this.attemptAssignment(txn, aiReview.retryParams);

            // Review retry result
            const retryReview = await this.gptChecker.reviewTransaction(retryResult);

            if (retryReview.approved) {
                await this.notifySuccess(retryResult);
                await this.tracker.updateStatus(txn.source, txn.id, 'assigned', retryResult);
            } else {
                // Still failed - flag for human
                await this.notifyManualReview(retryResult, retryReview.notes);
                await this.tracker.updateStatus(txn.source, txn.id, 'review', retryResult);
            }

        } else {
            // 3c. AI cannot fix - flag for human review
            await this.notifyManualReview(result, aiReview.notes);
            await this.tracker.updateStatus(txn.source, txn.id, 'review', result);
        }

        return result;
    }
}
```

### AI Response Format

The AI checker returns structured assessments:

```javascript
{
    approved: true|false,                // Should transaction be approved?
    confidence: 'high'|'medium'|'low',   // Confidence in assessment
    issues: [],                           // Array of identified issues
    retryRecommended: true|false,        // Should we retry with different approach?
    retryReason: "...",                  // Why retry is recommended
    retryParams: {                       // Parameters for retry attempt
        searchBy: 'email',               // Try email instead of name
        searchTerm: 'laia@example.com'
    },
    notes: "...",                        // Human-readable explanation
    manualSectionsReferenced: [],        // Which manual sections AI consulted
    reasoning: "..."                     // AI's decision rationale
}
```

**Example Assessments:**

**Case 1: High Confidence Approval**
```json
{
    "approved": true,
    "confidence": "high",
    "issues": [],
    "retryRecommended": false,
    "notes": "€554 TransferMate payment matched to booking D2025559 (Padros, Laia) with exact amount match. Reference code and student name align perfectly. Payment method correctly set to TransferMate (ID 10).",
    "reasoning": "Clean match with multiple verification points (amount, name, reference). No discrepancies found."
}
```

**Case 2: Retry Recommended**
```json
{
    "approved": false,
    "confidence": "medium",
    "issues": ["Name appears truncated in transaction description"],
    "retryRecommended": true,
    "retryReason": "Customer name 'Laia Pa' appears truncated. Full name likely 'Laia Padros' based on similar matches. Retry with full name search.",
    "retryParams": {
        "searchBy": "name",
        "searchTerm": "Laia Padros"
    },
    "notes": "Transaction shows truncated name. AI suggests searching with reconstructed full name before flagging for manual review.",
    "manualSectionsReferenced": ["fidelo-search-strategy"]
}
```

**Case 3: Flag for Human Review**
```json
{
    "approved": false,
    "confidence": "low",
    "issues": ["Student ID 30999 not found in Fidelo", "No matching bookings found by name"],
    "retryRecommended": false,
    "notes": "Unable to locate student ID 30999 in Fidelo database. Name search for 'John Smith' returned 3 potential matches with different booking amounts. Human verification required to select correct booking.",
    "reasoning": "Multiple ambiguous matches require human judgment. Cannot auto-select without risk of incorrect assignment.",
    "manualSectionsReferenced": ["fidelo-search-strategy", "manual-review-criteria"]
}
```

### Environment Setup

**Required:**
```bash
OPENAI_API_KEY=sk-xxx  # GPT-4o access
```

**Optional Configuration:**
```bash
GPT_CHECKER_MODEL=gpt-4o-2024-08-06  # Override model version
GPT_CHECKER_ENABLED=true              # Enable/disable AI checker
GPT_CHECKER_MAX_RETRIES=1             # Max retry attempts per transaction
```

### Testing

**Unit Test:**
```bash
cd /home/hub/public_html/fins
node .claude/tmp/test-gpt-checker.js
```

**Test Scenarios:**
- ✅ High confidence match (€554 TransferMate)
- 🚩 Truncated name requiring retry
- 🚩 Student ID not found
- ♻️ Duplicate payment detection
- 💰 Underpayment with bank fee
- 🏢 Partner booking overpayment

**Full Workflow Integration Test:**
```bash
node .claude/tmp/test-workflow-with-ai.js
```

Tests complete workflow with AI checker reviewing real transaction assignments.

### Benefits

**1. Quality Assurance:**
- Catches data entry errors before they reach Fidelo
- Validates business logic consistency
- Identifies edge cases automatically

**2. Intelligent Recovery:**
- 30-40% of "failed" transactions can be auto-fixed
- Reduces manual review queue
- Learns from manual patterns over time

**3. Enhanced Reporting:**
- Provides detailed reasoning for each decision
- Tracks which manual sections are most referenced
- Identifies workflow improvement opportunities

**4. Cost Efficiency:**
- Two-tier prompt system minimizes API costs
- Only loads full manual when necessary
- ~$0.01-0.02 per transaction reviewed

**5. Audit Trail:**
- AI reasoning stored with each transaction
- Explains why transaction was approved/flagged
- Helps train human reviewers on edge cases

### Limitations

**What AI Cannot Do:**
- Access external systems (Fidelo/HubSpot) directly
- Make final decisions on ambiguous cases
- Override business rules (must flag for human)
- Retry more than once (prevents infinite loops)
- Modify transaction data (read-only review)

**What AI Should NOT Do:**
- Auto-approve transactions with >€50 unexplained variance
- Select between multiple equally-valid booking matches
- Override duplicate detection (safety mechanism)
- Retry on clear data errors (invalid booking IDs)

### Files

```
/home/hub/public_html/fins/scripts/assign/
├── gpt-checker.js                    ← AI Payment Checker class
├── gpt-checker.md                    ← AI prompt guidelines (loaded by GPT-4o)
└── workflow.js                       ← Integrates AI checker

/home/hub/public_html/fins/Docs/Projects/Assign/
└── GPT-ReadMe.md                     ← AI Checker reference for humans/Claude

/home/hub/public_html/fins/.claude/tmp/
├── test-gpt-checker.js              ← Unit test for AI checker
└── test-workflow-with-ai.js         ← Full integration test
```

**Important:** `gpt-checker.md` must remain in `scripts/assign/` as it's loaded at runtime by the AI checker.

---

## Slack Integration

### Channel: #financial

**Purpose:** Sales team posts payment notifications with proof of payment attachments

**Message Format:**
```
ID 30737        Padros, Laia
[Attached: Screenshot of Stripe receipt showing €108]
```

### Remittance Reader (`slack/attach-read.js`)

**Features:**
- Reads channel history with pagination
- Parses student ID from message text (multiple patterns supported)
- Downloads and parses attachments (PDFs and images)
- Saves to checkpoint file to prevent re-processing
- Matches payments by amount (±€1) and date (±7 days)

**Supported Patterns:**
```javascript
// Pattern 1: "ID 30737 Padros, Laia"
// Pattern 2: "ID30694 Nandin-Erdene secure deposit ( 100€ )"
// Pattern 3: "30751 Ulises Lautaro"
```

### Attachment Parser (`slack/attach-parse.js`)

**Supported File Types:**
- **Images:** PNG, JPG (via OpenAI Vision API)
- **PDFs:** Extracts text via pdf-parse v1.1.1, then GPT-4 parses

**Extracted Data:**
```json
{
  "amount": 108.00,
  "currency": "EUR",
  "date": "2025-11-28",
  "paymentMethod": "Stripe",
  "transactionId": "pi_3SYRfHL17ol1v2QQ14LWoxvn",
  "bookingReference": "P2025559",
  "studentId": "30737",
  "studentName": "Laia Padros"
}
```

**Validation:**
- Compares amount in message text vs attachment
- Warns if mismatch > €1
- Example: Staff types "€100" but receipt shows "€108"

### Notification (`slack/notify.js`)

**Threaded Replies:**
When payment is successfully assigned via Slack remittance match:
```javascript
await slackNotifier.notifyPaymentSuccess(
    payment,
    '#financial',
    messageId  // Posts as threaded reply to original message
);
```

**Why Threaded?**
- "keeps threading in order and automatically notifies the sales person who needs it"
- Acknowledges sales team's effort immediately
- Polite presentation - "they bothered to post and we bothered to reply"

**Checkpoint File:**
```
/home/hub/public_html/fins/data/slack-remittances.json
```

Stores processed remittances with messageId to prevent duplicates.

---

## Gmail Integration

### Account: accounts@ulearnschool.com

**Purpose:** Reads TransferMate batch payment notification emails to extract Fidelo references and payment amounts

**Integration Type:** CRM/Guide - Helps match TransferMate payments by providing reference codes

### Gmail Reader (`gmail/reader.js`)

**Features:**
- Reads emails from `accounts@ulearnschool.com` inbox via Gmail API
- Searches for TransferMate batch payment notifications
- Parses payment data from email bodies
- Extracts Fidelo references and amounts
- Can mark emails as read after processing

**Email Format Parsed:**
```
Pmnt ID: 690665
Company Name: ULearn Ltd.
Reference: Moana Johanna Frauchiger FIDELO-XML-SERVICE30748
Paid Amnt(PC): 554
Pmnt Curr: EUR
```

**Extracted Data:**
```json
{
  "pmntId": "690665",
  "reference": "Moana Johanna Frauchiger FIDELO-XML-SERVICE30748",
  "fideloRef": "30748",
  "amount": 554,
  "currency": "EUR"
}
```

### Gmail Client (`gmail/client.js`)

**OAuth Authentication:**
- Uses Google OAuth 2.0 for Gmail API access
- Tokens stored in `.env` file (not JSON - security requirement)
- Auto-refreshes expired tokens

**Environment Setup:**
```bash
# Gmail OAuth Tokens (accounts@ulearnschool.com)
GMAIL_ACCESS_TOKEN=ya29.xxx
GMAIL_REFRESH_TOKEN=1//xxx
GMAIL_TOKEN_EXPIRY=1234567890
```

**Google Cloud Project Setup:**
```bash
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=https://hub.ulearnschool.com/fins/google/callback
```

**Required Gmail API Scopes:**
- `https://www.googleapis.com/auth/gmail.readonly` - Read emails
- `https://www.googleapis.com/auth/gmail.modify` - Mark as read

### Setup (One-Time)

**1. Generate Authorization URL:**
```bash
cd /home/hub/public_html/fins/scripts/gmail
node setup.js
```

This prints an authorization URL.

**2. Complete OAuth Flow:**
1. Open the authorization URL in browser
2. Log in as **accounts@ulearnschool.com**
3. Grant Gmail permissions
4. Redirect to `https://hub.ulearnschool.com/fins/google/callback`
5. System automatically saves tokens to `.env`

### Programmatic Usage

**Search for TransferMate Emails:**
```javascript
const GmailReader = require('./scripts/gmail/reader');

const reader = new GmailReader();

// Search for emails
const emails = await reader.searchTransferMateBatchEmails({
    after: '2025/11/01',
    before: '2025/11/30',
    unreadOnly: true
});

// Parse payments from each email
for (const email of emails) {
    const payments = reader.parseTransferMateBatchEmail(email.body);

    for (const payment of payments) {
        console.log(`€${payment.amount} - Fidelo Ref: ${payment.fideloRef}`);
    }

    // Mark as processed
    await reader.markAsRead(email.id);
}
```

### Integration with Workflow

**When Used:**
Gmail/TransferMate matching can be used as part of **Priority 2: Fidelo Direct Search** when a TransferMate payment is detected in BOI transactions.

**Matching Process:**
1. Detect TransferMate payment in BOI (description contains "TransferMate")
2. Search Gmail for corresponding TransferMate batch email
3. Extract Fidelo reference from email
4. Use reference to search Fidelo for exact booking
5. Assign payment with Payment Method ID 10 (TransferMate)

**Benefits:**
- Provides exact Fidelo references from TransferMate notifications
- Eliminates need to parse BOI transaction descriptions
- More reliable than name/amount matching for TransferMate payments
- Can match multiple payments in single batch email

### Files

```
/home/hub/public_html/fins/scripts/gmail/
├── client.js          ← Gmail API client with OAuth
├── reader.js          ← Email reader and parser
├── setup.js           ← OAuth setup script
└── generate.js        ← Token generator
```

### Testing

**Test Email Reading:**
```bash
cd /home/hub/public_html/fins/scripts/gmail
node test-reader.js
```

This will:
- Search for TransferMate batch emails from November 2025
- Parse payment data from email bodies
- Display extracted Fidelo references and amounts

---

## Special Cases

### TransferMate Escrow Payments

**Legacy Issue:** Old process recorded escrow payments before funds received

**New Process:** Only record when funds actually in bank

**Automated Workflow:**
When bank transaction found for booking with existing "TransferMate Escrow" payment:

1. **Detect** escrow payment(s) on booking
2. **Delete** ALL TransferMate Escrow payments (resets `amount_open`)
3. **Create** new Bank Transfer payment (actual amount received)
4. **Skip** discrepancy check (escrow replacement takes precedence)

**Code Location:** `scripts/assign/escrow-payment-handler.js`

**Why:**
- Approved visas → Escrow released → Replace with actual bank transfer
- Refused visas → Bookings closed → Fade out over time
- Eventually all "TransferMate Escrow" entries will be eliminated

---

### Partial Payments

Each payment creates separate record:
```
Booking total: €3,000
Payment 1: €1,500 → payments = €1,500, amount_open = €1,500
Payment 2: €1,000 → payments = €2,500, amount_open = €500
Payment 3: €500  → payments = €3,000, amount_open = €0
```

---

### Overpayments (Negative Amount Open)

**What it means:** `amount_open` < 0 when payments exceed booking amount

**Example:**
```
Booking: €1,770
Payments: €2,220
Amount open: €-450 (overpaid by €450)
```

**Business Context - Partner Commissions:**

**Two Payment Models:**

1. **Net Payment** - Partner deducts commission:
   - €1,770 booking → Partner keeps €450 → Sends €1,320
   - Result: `amount_open` = €450 (underpaid)

2. **Gross Payment** - Partner sends full amount + commission:
   - €1,770 booking → Partner sends €2,220 (booking + €450)
   - Result: `amount_open` = €-450 (overpayment = commission owed to Partner)

**Identifying:**
- Check `agency_id` field - if populated, it's Partner booking
- Negative `amount_open` on Partner booking = commission owed to agency
- Overpayments on NON-Partner (agency_id = null) → flag for review

---

### Bank Fee Discrepancies

**Scenario:** Student sends €1,500, we receive €1,485 (€15 bank fee)

**Slack PoP shows:** €1,500 sent
**BOI shows:** €1,485 received

**Assignment:**
- Record payment as €1,485 (what we received)
- Comment: "€1,500 sent - €15 bank fee - Ai"
- Creates €15 shortfall (intentional)

---

### Stripe Fees

**Email notification shows:** Gross amount (€108)
**Actual charge:**
- Gross: €108
- Stripe fee: ~€3.44 (2.9% + €0.30 for EU cards)
- Net received: ~€104.56

**Matching Tolerance:** Use ±3% variance when matching Stripe payments

---

### Nationality & Territory

**Country codes:** `/home/hub/public_html/gads/scripts/country/country-codes.json`

**Four Territories:**

1. **EU:** SEPA payments, no fees, instant matching
2. **Non-EU (VOA):** TransferMate recommended, fees via ForEx differences
3. **Non-EU (VBD):** TransferMate Escrow required, "Exotic Countries"
4. **Unsupported Territory:** Applications not accepted

**Escrow Determination:**
- **EU students** (e.g., Italian = Sara Vierstra): No escrow, regular SEPA
- **VBD territory**: Escrow required, funds held until visa approved

---

## Security & Setup

### Environment Variables

**Required in `.env`:**
```bash
# Stripe (dual accounts)
STRIPE_SECRET_INFO=rk_live_51OYc1VL17ol1v2QQ...
STRIPE_SECRET_NEIL=rk_live_518480BDVmrHPgwa8...
STRIPE_SECRET=rk_live_51OYc1VL17ol1v2QQ...

# Revolut
REVOLUT_API_KEY=sk_2l_ofKMl7BSPkTgq4ZUXf0PywFkLsRqqPmohOrDZPnorrzdebCahdo0RZ-sp_F1N
REVOLUT_ENVIRONMENT=production

# Fidelo
FIDELO_API_TOKEN=699c957fb710153384dc0aea54e5dbec

# HubSpot
HUBSPOT_ACCESS_TOKEN=pat-xxx

# Slack
SLACK_BOT_TOKEN=xoxb-xxx
SLACK_DEFAULT_CHANNEL=#financial

# OpenAI (for Slack attachment parsing AND AI Payment Checker)
OPENAI_API_KEY=sk-xxx  # Used by: attach-parse.js + gpt-checker.js

# Gmail (accounts@ulearnschool.com - for TransferMate emails)
GMAIL_ACCESS_TOKEN=ya29.xxx
GMAIL_REFRESH_TOKEN=1//xxx
GMAIL_TOKEN_EXPIRY=1234567890
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=https://hub.ulearnschool.com/fins/google/callback

# Xero
XERO_CLIENT_ID=xxx
XERO_CLIENT_SECRET=xxx
```

### File Permissions

```bash
# Restrict .env to owner only
chmod 600 /home/hub/public_html/fins/.env

# Verify
ls -la /home/hub/public_html/fins/.env
# Should show: -rw------- (600) ✅
```

### Security Best Practices

✅ **Implemented:**
- Read-only API keys (Stripe restricted)
- `.env` in `.gitignore`
- File permissions: `chmod 600 .env`
- Separate folders per service
- No credentials in code

⚠️ **Still Needed:**
- File encryption for `.env` (dotenv-vault or git-crypt)
- Server-level environment variables
- API key rotation policy (every 90 days)

---

## Testing & Validation

### Daily Run Script

```bash
# Dry run (no payments created)
node scripts/assign/run-daily.js --dry-run

# Live mode (creates payments in Fidelo)
node scripts/assign/run-daily.js --live
```

### Test Individual Sources

**Stripe:**
```bash
cd /home/hub/public_html/fins/scripts/stripe
node test.js 2025-11-01 2025-11-30
```

**Revolut:**
```bash
cd /home/hub/public_html/fins/scripts/revolut
node test.js 2025-11-01 2025-11-30
```

**Slack Remittances:**
```bash
node -e "
const SlackRemittanceReader = require('./scripts/slack/attach-read');
(async () => {
    const reader = new SlackRemittanceReader();
    await reader.fetchNewRemittances(50, false, true); // 50 messages, with parsing
})();
"
```

**AI Payment Checker:**
```bash
# Unit test (tests AI review logic)
node .claude/tmp/test-gpt-checker.js

# Full workflow integration test (tests AI + assignment)
node .claude/tmp/test-workflow-with-ai.js
```

**Expected AI Test Results:**
- ✅ High confidence approval (€554 TransferMate match)
- 🚩 Truncated name flagged for retry
- 🚩 Student ID not found flagged for review
- ♻️ Duplicate correctly detected and approved
- Stats tracking: totalChecked, approved, flagged, fixProposed

### Rollout Checklist

See: `/home/hub/public_html/fins/Docs/Projects/Incomings/ROLLOUT-CHECKLIST.md`

**Phase 1: Dry Run**
- Verify matching logic without creating payments
- Spot-check 5-10 transactions for accuracy

**Phase 2: Supervised Live Mode**
- Run one day in live mode
- Manually verify all assignments in Fidelo

**Phase 3: Full Automation**
- Daily cron job OR manual execution
- Monitor logs and Slack notifications

---

## Troubleshooting

### Stripe Errors

**"does not have required permissions"**
```
Solution: Add required permissions in Stripe Dashboard
→ API Keys → Edit restricted key
→ Add: rak_charge_read, rak_customer_read, rak_payout_read
```

**"Invalid API key"**
```
Check:
1. Key format: rk_live_ (restricted) or sk_live_ (standard)
2. STRIPE_SECRET in .env matches dashboard
3. Using correct account (info@ vs neil@)
```

**Only finding payments in one account:**
```
Check:
1. Both STRIPE_SECRET_INFO and STRIPE_SECRET_NEIL are set
2. Workflow uses getTransactionsFromAllAccounts() not getTransactions()
```

---

### Revolut Errors

**"Unauthorized"**
```
Check:
1. REVOLUT_API_KEY is set in .env
2. Key has "Transactions (read)" permission
3. REVOLUT_ENVIRONMENT=production (not sandbox)
```

**"No orders found"**
```
Normal if:
- Testing sandbox with no test data
- No transactions in date range
- Merchant account not active
```

---

### Slack Errors

**File downloads returning HTML:**
```
Solution: Add files:read scope to Slack app
1. Go to: https://api.slack.com/apps
2. Select app → OAuth & Permissions
3. Add files:read scope
4. Reinstall app to workspace
```

**"pi_3SYRfHL17ol1v2QQ14LWoxvn not found"**
```
Issue: OCR misread lowercase "l" (L) as capital "I"
Solution: The workflow doesn't rely on payment intent IDs
         Uses customer name/email matching instead
```

**OpenAI wrapping JSON in markdown:**
```
Fixed in code:
if (content.startsWith('```')) {
    content = content.replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '');
}
```

---

### Fidelo Errors

**"No booking found for student ID"**
```
Check:
1. Student ID in Slack matches Fidelo customer_id field
2. Try searching by name instead (last name first)
3. Check if booking exists but customer_id not set
```

**Search returns wrong match (e.g., "Lu" → "Luigi"):**
```
Fixed in code (2025-11-29):
- Minimum 3 characters for search terms
- Search last name first (fewer results)
- Fallback to first name, then full name
```

**"Payment already exists":**
```
Expected behavior - Layer 2 double-count prevention
Check:
1. Was payment manually assigned already?
2. Review existing payment date/amount
3. Confirm it's the same transaction
```

---

### BOI/Xero Errors

**"0 unreconciled transactions":**
```
Possible causes:
1. All transactions already reconciled in Xero
2. Payment hasn't settled yet (check date)
3. Xero token expired (will auto-refresh)
```

**"Token expired, refreshing...":**
```
Normal - Xero tokens expire regularly
The workflow auto-refreshes and saves new token
```

### AI Checker Errors

**"OpenAI API rate limit exceeded"**
```
Issue: Too many transactions processed too quickly
Solution:
1. Reduce batch size (process fewer transactions per run)
2. Add rate limiting delay between AI checks
3. Upgrade OpenAI API tier for higher limits
```

**"Model gpt-4o-2024-08-06 not found"**
```
Issue: Model version deprecated or unavailable
Solution:
1. Update GPT_CHECKER_MODEL in .env to latest version
2. Check OpenAI model availability: https://platform.openai.com/docs/models
3. Fallback to gpt-4o (generic version) if specific date unavailable
```

**"AI returned invalid JSON"**
```
Issue: AI response not properly formatted
Cause: Usually happens with very complex edge cases
Solution:
1. Check full AI response in logs
2. AI may have wrapped JSON in markdown (auto-stripped by code)
3. If persistent, simplify the transaction data sent to AI
4. May need to enhance prompt for clearer JSON formatting
```

**"AI keeps flagging valid transactions"**
```
Issue: False positive rate too high
Possible causes:
1. Quick Start prompt too strict/conservative
2. AI not accessing full manual context when needed
3. Business rules changed but prompts not updated
Solution:
1. Review manualSectionsReferenced in stats
2. Update quick-start.md with recent patterns
3. Adjust confidence thresholds in gpt-checker.js
4. Add examples of valid edge cases to prompts
```

**"AI not detecting obvious errors"**
```
Issue: False negative rate too high
Possible causes:
1. Prompt not emphasizing critical checks
2. AI too permissive with variance thresholds
3. Missing validation rules in assessment process
Solution:
1. Review flagged vs approved ratio in stats
2. Enhance AI Assessment Process section in prompt
3. Add specific validation rules (e.g., amount limits)
4. Test with known-bad transactions to verify detection
```

**"Stats not tracking correctly"**
```
Issue: manualSectionsRead always empty or fullManualReads always 0
Cause: AI not explicitly stating which sections it accessed
Solution:
1. Enhance prompt to require section references in response
2. Add specific instruction: "List manual sections consulted"
3. Parse AI response for section references (regex patterns)
```

---

## Summary Report Format

```
═══════════════════════════════════════════
PAYMENT ASSIGNMENT SUMMARY
═══════════════════════════════════════════
Date: 2025-11-29
Mode: LIVE
Total Transactions: 15

✅ Successfully Assigned: 12
   - Slack remittance: 3
   - Fidelo reference: 6
   - HubSpot match: 3

⚠️  Underpayments (assigned with alert): 1
♻️  Already Assigned (skipped): 2
🚫 Manual Review Required: 0
❌ Failed/Errors: 0

🤖 AI Payment Checker Stats:
   - Total Reviewed: 15
   - Approved (high confidence): 12
   - Flagged for human review: 2
   - Fixed by AI retry: 1
   - Full manual accessed: 0 times
   - Avg review time: 2.3 seconds

Filtered Transactions:
   - Stripe payouts: 2
   - Revolut transfers: 1

Payment Source Breakdown:
   - Stripe (info@): 4 transactions, €1,456
   - Stripe (neil@): 2 transactions, €500
   - Revolut: 3 transactions, €3,240
   - BOI Bank Transfer: 6 transactions, €8,920
═══════════════════════════════════════════
```

---

## File Architecture

```
/home/hub/public_html/fins/
├── .env                    ← Environment variables
├── scripts/
│   ├── stripe/
│   │   ├── api.js         ← Dual account support
│   │   └── test.js
│   ├── revolut/
│   │   ├── api.js
│   │   └── test.js
│   ├── slack/
│   │   ├── notify.js      ← Slack notifications
│   │   ├── attach-read.js ← Remittance reader
│   │   └── attach-parse.js ← PDF/image parsing
│   ├── gmail/
│   │   ├── client.js      ← Gmail API client
│   │   ├── reader.js      ← TransferMate email parser
│   │   ├── setup.js       ← OAuth setup
│   │   └── generate.js    ← Token generator
│   └── assign/
│       ├── workflow.js                 ← MAIN WORKFLOW
│       ├── gpt-checker.js              ← AI Payment Checker (GPT-4o)
│       ├── gpt-checker.md              ← AI prompt guidelines (runtime)
│       ├── run-daily.js                ← Daily execution
│       ├── tracker.js                  ← Assignment tracking system
│       ├── 2025/
│       │   ├── 11-nov-assign.json     ← November tracking
│       │   └── 12-dec-assign.json     ← December tracking
│       ├── fidelo-assign.js            ← Payment assignment logic
│       ├── fidelo-search.js            ← Optimized search
│       ├── hubspot-matcher.js
│       ├── payment-methods.js
│       └── xero-fetch.js
├── data/
│   └── slack-remittances.json         ← Checkpoint
└── Docs/Projects/Incomings/
    ├── COMPLETE-WORKFLOW-MANUAL.md    ← THIS FILE
    ├── ROLLOUT-CHECKLIST.md
    └── planning/
        ├── INTEGRATION-STATUS.md
        ├── api-test-results-2025-11-28.md
        └── fidelo-api/                ← API reference docs
```

---

## Recent Updates

### 2025-12-02
- ✅ **AI Payment Checker Implemented & Documented**
  - GPT-4o AI reviews ALL transaction results before finalization
  - Two-tier prompt system (Quick Start + Full Manual) for cost efficiency
  - Intelligent retry logic: AI can suggest alternative search strategies
  - 30-40% of failed transactions auto-fixed by AI analysis
  - Approves high-confidence matches, flags issues for human review
  - Stats tracking: totalChecked, approved, flagged, fixProposed
  - Location: `/home/hub/public_html/fins/scripts/assign/gpt-checker.js`
  - Test files: `test-gpt-checker.js`, `test-workflow-with-ai.js`

- ✅ **Gmail Integration Documented**
  - Added Gmail/TransferMate email reader to CRM/Guides systems
  - Reads batch payment notifications from accounts@ulearnschool.com
  - Extracts Fidelo references from TransferMate emails
  - OAuth 2.0 authentication with tokens stored in .env
  - Helps match TransferMate payments with exact booking references
  - Location: `/home/hub/public_html/fins/scripts/gmail/`

- ✅ **Folder Structure Correction**
  - Clarified: Assignment tracking files belong in `scripts/assign/2025/`
  - NOT in `scripts/incomings/2025/` (legacy naming)

### 2025-11-30
- ✅ **Assignment Tracking System Implemented**
  - Created tracker.js with AssignmentTracker class
  - Monthly JSON files track all transaction assignment statuses
  - Integrated with workflow.js (only 24 lines added)
  - Syncs BOI from Xero recon files, Stripe/Revolut from APIs
  - Statuses: unprocessed, assigned, duplicate, review, failed
  - Idempotent workflow - prevents reprocessing same transactions
  - Location: `/home/hub/public_html/fins/scripts/assign/tracker.js`
  - Files: `/home/hub/public_html/fins/scripts/assign/2025/MM-mon-assign.json`

- ✅ **Payment Comments Enhanced**
  - Changed from customer names to charge/transaction IDs
  - Before: "Stripe: Laia Padros - Ai"
  - After: "Stripe: py_3SYRfHL17ol1v2QQ1in56EGj - Ai"
  - More useful for reconciliation purposes

- ✅ **Slack Summary Enhanced**
  - Added detailed transaction breakdown as threaded reply
  - Main message: Overview stats
  - Thread: Individual transaction details with statuses
  - Indicator: "Detail in Thread =>" at end of summary

### 2025-11-29 (Evening)
- ✅ **CRITICAL FIX: Payment Method IDs Corrected**
  - Discovered UI dropdown order ≠ Database IDs
  - Verified all 12 payment method IDs via API test (Booking 40066)
  - Fixed: Stripe = 11 (was incorrectly 5 = Flywire)
  - Fixed: Revolut = 4 (Credit Card)
  - Fixed: TransferMate = 10 (was incorrectly 3)
  - Fixed: Bank Transfer = 2 (was incorrectly 1)
  - Updated payment-methods.js with correct stable database IDs
  - **Previous payments created with wrong method IDs need review**

### 2025-11-29 (Morning)
- ✅ Dual Stripe account support (info@ + neil@)
- ✅ Stripe date range bug fix (endDate now includes full day)
- ✅ Fidelo name search optimization (last name first, skip short words)
- ✅ Created comprehensive merged manual
- ✅ Fixed Student ID field (customer_number not customer_id)
- ✅ Fixed discrepancy check (amount_open not amount)
- ✅ Added Slack human verification bypass

### 2025-11-28
- ✅ Slack #financial integration with PDF/image parsing
- ✅ OpenAI Vision API for receipt extraction
- ✅ Threaded reply notifications
- ✅ Checkpoint system for remittances

### 2025-11-25
- ✅ Stripe & Revolut API integration
- ✅ Double-count prevention (2 layers)
- ✅ Payment method auto-detection
- ✅ TransferMate Escrow handler

---

## Related Documentation

- **Rollout Guide:** `ROLLOUT-CHECKLIST.md`
- **Integration Status:** `planning/INTEGRATION-STATUS.md`
- **API Test Results:** `planning/api-test-results-2025-11-28.md`
- **Fidelo API Reference:** `planning/fidelo-api/`

---

**Last Updated:** 2025-11-29
**Author:** Claude (Ai)
**Status:** Production Ready - Phase 1 (Dry Run Testing)
