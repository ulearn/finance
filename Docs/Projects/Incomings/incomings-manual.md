# Incoming Payments Manual

**Scope:** Accounts Receivable - Identifying and assigning incoming payments to student bookings

**Systems Involved:**
- Xero (Payment source)
- Fidelo (Booking/payment assignment destination)
- HubSpot (Cross-reference for customer matching)
- Slack (Proof of Payment validation)

---

## Overview

This process handles incoming payments from the bank that need to be assigned to student bookings in Fidelo. The workflow crosses multiple platforms to identify the correct student/booking and record the payment accurately.

**Timing:** Runs BEFORE Xero reconciliation (unreconciled transactions only)

**Frequency:** Daily at 6am (automated cron job)

---

## Payment Priority System

When a payment comes in from the bank, we use this priority order to identify the booking:

### Priority 1: Fidelo Search (FASTEST)
Search Fidelo bookings API in this order:

**1a. Structured References:**
- **P#### format** - Proforma invoice (e.g., P2025302)
- **D#### format** - Document/Invoice (German: "Dokument")
- **5-digit Booking ID** - Direct booking number / Student ID

**1b. Name + Amount Match:**
- Extract student name from bank description (firstname, lastname, or both)
- Match against `customer_firstname` and `customer_lastname` in Fidelo bookings
- Verify amount matches booking `amount` or `amount_open` (within €10 tolerance)

Search Fidelo FIRST before moving to HubSpot � Immediate match if found

### Priority 2: HubSpot Cross-Reference
When no structured reference exists:
- Match by **amount + customer name**
- Search in B2B (pipeline: 35765201) and B2C (pipeline: default)
- Exclude Won/Lost deals (active pipeline only)


---

## Payment Assignment in Fidelo

### API Method: POST /api/1.0/ts/payments

**Endpoint:** `https://ulearn.fidelo.com/api/1.0/ts/payments`

**Authentication:** Bearer token in .env (`FIDELO_API_TOKEN`)

**Required Request Body:**
```json
{
  "inquiry_id": 40700,
  "school_id": 1,
  "booking_id": 40700,
  "payment_date": "2025-11-23",
  "payment_method_id": 1,
  "payment_amount": 1234.56,
  "payment_comment": "BOI description text - Ai"
}
```

**Success Response:**
```json
{
  "payment_id": 36991,
  "status": 200,
  "message": "Payment successfully created"
}
```

---

## Field Mappings & Rules

### 1. inquiry_id
**Value:** Same as booking_id (both set to the Fidelo booking ID)

**Why:** Including BOTH inquiry_id and booking_id creates an **assigned payment** (not unallocated)

**Example:** `"inquiry_id": 40700`

---

### 2. school_id
**Value:** Always `1` (ULearn English School Dublin)

**Static:** This never changes

**Example:** `"school_id": 1`

---

### 3. booking_id
**Value:** The Fidelo booking ID found via reference search or matching

**Source:**
- Search result from Fidelo API by P####/D#### reference
- Or matched booking from HubSpot cross-reference

**Example:** `"booking_id": 40700`

---

### 4. payment_date
**Value:** Date from Xero bank transaction (NOT today's date)

**Format:** `Y-m-d` (e.g., "2025-11-23")

**Important:** This should match the actual bank settlement date in Xero, not the date we're processing it

**Xero Field:** Transaction date from unreconciled credit transaction

**Example:** `"payment_date": "2025-11-23"`

**Note:** Fidelo may also record a `createDate` automatically which logs when we assigned the payment (system timestamp)

---

### 5. payment_method_id
**Value:** ID representing the payment method

**Default:** Bank Transfer (unless confirmed otherwise)

**Method IDs:**
- `1` - Bank Transfer (DEFAULT - use unless confirmed otherwise)
- `?` - Stripe (confirmed via Stripe notification)
- `?` - TransferMate (reference includes "TransferMate")
- `?` - TransferMate Escrow (reference includes "Escrow")
- `?` - Cash (rare - would be noted in description)

**Determination Logic:**
1. Check bank description for "Stripe", "TransferMate", "Cash"
2. If TransferMate: check if "Escrow" is mentioned
3. Default to Bank Transfer if uncertain

**Example:** `"payment_method_id": 1`

**TODO:** Document complete method_id mapping from Fidelo

---

### 6. payment_amount
**Value:** Exact amount from Xero bank transaction

**Format:** Decimal number (e.g., 1234.56)

**Important:**
- Use the EXACT amount from the bank
- Include cents/decimal places
- Do not round

**Xero Field:** Credit amount from unreconciled transaction

**Example:** `"payment_amount": 1234.56`

---

### 7. payment_comment
**Value:** Bank description + "Ai" initial

**Format:** `"[BOI Description] - Ai"`

**Source:** The description/reference from the Bank of Ireland transaction

**Examples:**
- `"158619782030727 P2 IP - Ai"`
- `"Yagmur Sirkecioglu SP - Ai"`
- `"BLUE CONSULTORIA E GP - Ai"`
- `"Revolut: 690c8752-328d-a153-a4f4-644cdbec0db5 - Ai"`

**Purpose:**
- Provides audit trail
- Shows original bank reference
- "Ai" indicates automated system (like staff initials)

**Manual Process Equivalent:** Diana pastes BOI description and initials it

**Example:** `"payment_comment": "158619782030727 P2 IP - Ai"`

---

### 8. payment_paid_by (Student vs Partner)
**Field Name:** TBD - may be `payment_firstname`/`payment_lastname` or separate field

**Values:**
- **Student** (default assumption)
- **Partner/Agent** (when payment comes from agency)

**Determination Logic:**

**Indicators of PARTNER payment:**
1. BOI description contains agency/company name (not individual):
   - "BLUE CONSULTORIA E GP"
   - "pmntx2 ULearn Ltd. SP"
   - Company names in uppercase
2. HubSpot deal shows B2B pipeline (35765201)
3. Fidelo booking shows `agency_id` ` null
4. Slack PoP shows agency letterhead/business transfer

**Indicators of STUDENT payment:**
1. BOI description contains individual name:
   - "Yagmur Sirkecioglu SP"
   - "Fischer, Christian"
2. HubSpot deal shows B2C pipeline (default)
3. Fidelo booking shows `agency_id` = null

**Tricky Cases:**
- Some student names look like company names (uppercase, formal)
- Some agencies pay on behalf of students
- Use **cross-check with HubSpot + Slack** when uncertain

**Default:** Assume **Student** unless confirmed Partner via agency_id or deal pipeline

---

## Sample Payment Creation

### Example 1: Direct Reference Match (P2025302)

**Xero Transaction:**
```
Date: 2025-11-11
Description: "158619782030727 P2 IP"
Amount: �1,360.00
```

**Fidelo Search:**
- Extract reference: "P2025302" (from full description)
- Search bookings by document_number = "P2025302"
- Found: Booking ID 40700 (Rodrigues Silva, Vinicius)

**API Request:**
```json
{
  "inquiry_id": 40700,
  "school_id": 1,
  "booking_id": 40700,
  "payment_date": "2025-11-11",
  "payment_method_id": 1,
  "payment_amount": 1360.00,
  "payment_comment": "158619782030727 P2 IP - Ai"
}
```

**Result:** Payment ID 36991 created 

---

### Example 2: HubSpot Cross-Reference Match

**Xero Transaction:**
```
Date: 2025-11-12
Description: "Yagmur Sirkecioglu SP"
Amount: �826.20
```

**Fidelo Search:**
- No structured reference found
- Search HubSpot by name "Yagmur Sirkecioglu" + amount �826.20
- Found: B2C deal (pipeline: default)
- Deal shows Fidelo booking ID 41234

**API Request:**
```json
{
  "inquiry_id": 41234,
  "school_id": 1,
  "booking_id": 41234,
  "payment_date": "2025-11-12",
  "payment_method_id": 1,
  "payment_amount": 826.20,
  "payment_comment": "Yagmur Sirkecioglu SP - Ai"
}
```

---

### Example 3: Partner Payment (B2B)

**Xero Transaction:**
```
Date: 2025-11-11
Description: "BLUE CONSULTORIA E GP"
Amount: �1,509.60
```

**HubSpot Search:**
- Company name match: "BLUE CONSULTORIA"
- Found: B2B deal (pipeline: 35765201) for student "Kuhl, Maurivan"
- Deal shows Fidelo booking ID 41567

**Fidelo Verification:**
- Booking 41567 shows agency_id = 688
- Confirms this is a Partner payment

**API Request:**
```json
{
  "inquiry_id": 41567,
  "school_id": 1,
  "booking_id": 41567,
  "payment_date": "2025-11-11",
  "payment_method_id": 1,
  "payment_amount": 1509.60,
  "payment_comment": "BLUE CONSULTORIA E GP - Ai"
}
```

**Note:** Payment recorded as Partner payment (agency_id indicates B2B)

---

## Special Cases

### TransferMate Escrow Payments
**Current Issue:** "TransferMate Escrow" method describes TWO states:
1. Funds still in escrow (not settled to our account)
2. Funds released from escrow (settled to our account)

**For Now:**
- Include "TransferMate Escrow" payments in processing
- Assume either:
  - Settled to bank (should update method to "TransferMate")
  - Still in escrow (visa status remains Pending)

**Future:** This will be cleaned up - escrows tracked externally or only used for actual escrow state

---

### Partial Payments
When a student pays in installments:
- Each payment creates a separate payment record
- `payment_amount` shows individual payment amount
- Fidelo's `payments` field accumulates total
- `amount_open` reduces with each payment

**Example:**
```
Booking total: �3,000
Payment 1: �1,500 � payments = �1,500, amount_open = �1,500
Payment 2: �1,000 � payments = �2,500, amount_open = �500
Payment 3: �500 � payments = �3,000, amount_open = �0
```

---

### Overpayments (Negative Amount Open)

**What it means:** `amount_open` is negative when `payments` exceeds `amount`

**Example:**
```
Booking total: €1,770
Payments: €2,220
Amount open: €-450 (overpaid by €450)
```

**Business Context - Partner Commissions:**

When bookings show **overpayments** (negative `amount_open`), this typically represents **Partner agency commissions** owed.

**Two Payment Models:**
1. **Net Payment** - Partner sends us net amount (after deducting their commission)
   - Example: €1,770 booking → Partner keeps €450 commission → Sends us €1,320
   - Result: `amount_open` = €450 (underpaid - still owe €450)

2. **Gross Payment** - Partner sends us gross amount (full booking price + commission)
   - Example: €1,770 booking → Partner sends us €2,220 (booking + €450 commission)
   - Result: `amount_open` = €-450 (overpaid - we owe Partner €450 back)

**Why Gross Payments Happen:**
- Some agencies prefer to pay the full amount upfront
- We hold the commission amount on their behalf
- Overpayment serves as a **record of commission owed to Partner**
- These are reconciled separately with Partner agencies

**Identifying Gross vs Net:**
- Check `agency_id` field - if populated, it's a Partner booking
- Negative `amount_open` on Partner bookings = commission owed to agency
- Positive `amount_open` on Partner bookings = still awaiting payment

**Automation Handling:**
- Overpayments are **expected and normal** for Partner bookings with `agency_id`
- Do NOT flag negative `amount_open` as errors if `agency_id` is populated
- Overpayments on NON-Partner bookings (agency_id = null) should be flagged for review

---

### Bank Fee Discrepancies
**Issue:** Student sends �1,500, we receive �1,485 (�15 bank fee deducted)

**Slack PoP Validation:**
- PoP shows student sent �1,500
- Our bank shows �1,485 received
- Discrepancy = �15 bank fee

**Assignment:**
- Record payment as �1,485 (what we received)
- Note in comment: "�1,500 sent - �15 bank fee - Ai"
- This creates �15 shortfall in booking (intentional)

---

## Error Handling

### Payment Already Assigned
If the same payment is attempted twice:
- API should return error (duplicate prevention)
- Log warning: "Payment already exists for booking X"
- Skip and continue to next payment

### Booking Not Found
If reference search returns no matches:
1. Try HubSpot cross-reference
2. Try Slack PoP search
3. If still no match: Flag for manual review
4. Send notification email to staff

**Email Fields:**
- Date
- Amount
- Description
- Status: "Unmatched - Manual Review Required"

### Multiple Matches
If search returns multiple possible bookings:
1. Check amounts match exactly
2. Check dates are close (within 7 days)
3. If still ambiguous: Flag for manual review
4. Notify staff with all possible matches

---

## Notification System

### Success Notification
**Recipients:** info@, dos@, neil@, sales@, success@

**Skip notification for:** Accommodation payments (separate process)

**Email Format:**
```
Subject: Incoming Payment Assigned - [Student Name]

Payment Details:
- Student: Rodrigues Silva, Vinicius
- Booking: D2025237 (P2025302)
- Amount: �1,360.00
- Date: 2025-11-11
- Method: Bank Transfer
- Payment ID: 36991

Bank Description: "158619782030727 P2 IP"

Status:  Successfully assigned
```

### Manual Review Notification
**Email Format:**
```
Subject: Incoming Payment - Manual Review Required

Payment Details:
- Amount: �826.20
- Date: 2025-11-12
- Bank Description: "Unknown Sender"

Status: � No matching booking found

Possible Actions:
1. Search Fidelo manually
2. Check HubSpot for recent deals
3. Review Slack PoP channel

[Link to dashboard]
```

---

## Testing & Validation

### Before Full Automation
Test with historical email samples:
- `/home/hub/public_html/fins/Docs/Xero/learning-data/Incomings/emails.md`
- Contains real examples from 11/05/25 - 11/12/25
- Validate matching accuracy
- Verify notification format

### Test Cases
1. **Direct reference (P####)** - Should match immediately
2. **Name + amount** - Should match via HubSpot
3. **Partner payment** - Should identify agency correctly
4. **Partial payment** - Should create separate record
5. **No match** - Should flag for manual review
6. **Multiple matches** - Should request clarification

---

## Automation Workflow

### Daily Cron Job (6am)
```bash
# Pseudo-code workflow
1. Pull unreconciled credit transactions from Xero
2. For each transaction:
   a. Extract reference/description
   b. Try Priority 1: Fidelo reference search
   c. If no match, try Priority 2: HubSpot cross-reference
   d. If no match, try Priority 3: Slack PoP search
   e. If match found: Assign payment via API
   f. If no match: Flag for manual review
3. Generate summary report
4. Send notifications
5. Log all actions to fins.log
```

### Location
Scripts location: `/home/hub/public_html/fins/scripts/incomings/`

---

## TODO

- [ ] Document complete payment_method_id mapping
- [ ] Build Fidelo search by reference function
- [ ] Build HubSpot cross-reference matcher
- [ ] Build Slack PoP search integration
- [ ] Create notification email templates
- [ ] Build manual review dashboard
- [ ] Set up daily cron job
- [ ] Test with historical data samples
- [ ] Document "Student vs Partner" field mapping

---

## Related Documentation

- Payment API specs: `/home/hub/public_html/fins/Docs/Projects/Incomings/payments-api.md`
- Sample contact: `/home/hub/public_html/fins/Docs/Projects/Incomings/sample-contact.md`
- Project plan: `/home/hub/public_html/fins/Docs/Projects/Incomings/plan.md`
- Email samples: `/home/hub/public_html/fins/Docs/Xero/learning-data/Incomings/emails.md`
- Xero manual: `/home/hub/public_html/fins/Docs/Xero/Manual.md` (separate - Xero-only tasks)

---

**Last Updated:** 2025-11-23
**Author:** Claude (Ai)
**Status:** Draft - Pre-automation phase
