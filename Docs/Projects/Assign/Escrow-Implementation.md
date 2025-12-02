# TransferMate Escrow Payment Tracking - Implementation Guide

## Overview

TransferMate escrow payments require special handling as they represent funds held externally (not in ULearn's BOI account) pending visa approval. These cannot be assigned in Fidelo until visa is approved and funds are released.

## Architecture

### Files Created
- `/scripts/assign/escrow.js` - Escrow tracking module (class)
- `/scripts/assign/escrow-tracking.json` - Persistent escrow payment records

### Integration Points
- `/scripts/assign/workflow.js` - Main payment workflow (integration required)

## Escrow Lifecycle

### Phase 1: INCOMING ESCROW (Funds Enter Escrow Account)

**Detection Signal:**
```
TransferMate email body contains:
  "being held in TransferMate's Escrow account"
  OR
  "are being held in TransferMate's Escrow account"
```

**Actions:**
1. **SKIP** Fidelo assignment (do not attempt API call)
2. **RECORD** to `escrow-tracking.json` with status="PENDING"
3. **POST** to Slack #financial with escrow warning message

**Slack Message Format:**
```
🔒 *ESCROW PAYMENT RECEIVED*
Escrow ID: `ESC-2025-001`
Student: *Ariuntsetseg Gansukh* (ID: 30785)
Amount: €120
Invoice: P20251025

⚠️ *FUNDS IN TRANSFERMATE ESCROW ACCOUNT*
• Status: Visa Application Pending
• NOT in ULearn BOI account
• NOT assigned in Fidelo
• Student remains "Unconfirmed"

⏳ Awaiting visa decision...
✅ Will auto-assign when visa approved & escrow released
❌ Will track refund if visa refused (fees: €250-€315)
```

### Phase 2A: ESCROW RELEASED (Visa Approved)

**Detection:**
- Incoming BOI transaction matches pending escrow record
- No "refund" indicators in transaction description

**Actions:**
1. UPDATE escrow record: status="RELEASED", link release_transaction_id
2. PROCEED with normal payment assignment workflow
3. Student can now be confirmed in Fidelo
4. POST Slack update: "Escrow ESC-2025-XXX released → assigning payment"

### Phase 2B: ESCROW REFUNDED (Visa Refused)

**Detection:**
- Outgoing/refund transaction matches pending escrow record

**Actions:**
1. UPDATE escrow record: status="REFUNDED", link refund_transaction_id
2. CALCULATE fees retained: €250 visa + €50/€65 admin
3. POST Slack update with fee breakdown
4. CLOSE loop (no Fidelo assignment needed)

## Data Structure

### Escrow Tracking Record
```json
{
  "escrow_id": "ESC-2025-001",
  "student_id": 30785,
  "student_name": "Ariuntsetseg Gansukh",
  "invoice": "P20251025",
  "amount": 120,
  "date_entered": "2025-12-01",
  "status": "PENDING|RELEASED|REFUNDED",
  "source": "transfermate_email",
  "source_reference": "email-message-id",
  "source_data": {...},
  "release_transaction_id": null,
  "release_date": null,
  "refund_transaction_id": null,
  "refund_date": null,
  "fees_retained": {
    "visa_support": 0,
    "admin_course": 0,
    "admin_accommodation": 0
  },
  "notes": []
}
```

## Workflow Integration (TODO)

### Constructor Addition
```javascript
const EscrowTracker = require('./escrow');

constructor(options = {}) {
    // ... existing code ...
    this.escrowTracker = new EscrowTracker();
}
```

### loadTransferMatePayouts() Enhancement
```javascript
async loadTransferMatePayouts(startDate, endDate) {
    // ... existing Gmail fetch code ...

    // Load escrow tracker
    await this.escrowTracker.load();

    // For each TransferMate email:
    for (const email of emails) {
        // Check for incoming escrow
        if (this.escrowTracker.detectIncomingEscrow(email)) {
            // Record escrow
            const escrowRecord = await this.escrowTracker.recordIncoming({
                studentId: /* extract from email */,
                studentName: /* extract from email */,
                invoice: /* extract from email */,
                amount: /* extract from email */,
                transactionDate: email.date,
                source: 'transfermate_email',
                sourceReference: email.id,
                sourceData: email
            });

            // Mark email/payment with escrow flag
            email.isEscrow = true;
            email.escrowId = escrowRecord.escrow_id;
        }

        // ... continue with normal processing ...
    }
}
```

### processTransaction() Enhancement
```javascript
async processTransaction(transaction) {
    // Check if transaction is linked to pending escrow
    const matchingEscrow = await this.escrowTracker.findMatchingEscrow(transaction);

    if (matchingEscrow && matchingEscrow.status === 'PENDING') {
        console.log(`   🔒 ESCROW PAYMENT: ${matchingEscrow.escrow_id}`);

        // Post escrow notification to Slack
        const message = this.escrowTracker.formatSlackEscrowMessage(matchingEscrow, transaction);
        await this.slackNotifier.sendMessage(message, this.slackChannel);

        // Return special status to skip assignment
        return {
            status: 'escrow_pending',
            escrowId: matchingEscrow.escrow_id,
            transaction: transaction,
            message: 'Payment in TransferMate escrow - awaiting visa approval'
        };
    }

    // ... continue with normal assignment workflow ...
}
```

## Testing Plan

1. **Test Escrow Detection:**
   - Fetch real TransferMate emails from Gmail
   - Verify detection of "being held in TransferMate's Escrow account" phrase
   - Ensure released payments are NOT flagged as escrow

2. **Test Escrow Recording:**
   - Record incoming escrow payment
   - Verify escrow-tracking.json update
   - Check escrow ID generation (ESC-2025-XXX)

3. **Test Escrow Slack Messages:**
   - Verify Slack message format
   - Check all required fields present
   - Test message threading

4. **Test Release Matching:**
   - Simulate BOI transaction matching pending escrow
   - Verify status update to "RELEASED"
   - Test normal assignment workflow proceeds

5. **Test Refund Tracking:**
   - Simulate refund transaction
   - Verify status update to "REFUNDED"
   - Check fee calculation (€250 + €50/€65)

## Fees Reference

**Visa Refusal Retention Fees:**
- Visa Support Fee: €250 (always retained)
- Admin Fee (Course): €50 (retained if course booked)
- Admin Fee (Accommodation): €65 (retained if accommodation booked)

**Total Range:** €300 - €365 depending on booking type

## Future Enhancements

1. **Escrow Dashboard:**
   - List all pending escrow payments
   - Track total escrow value
   - Show aging (days in escrow)

2. **Escrow Alerts:**
   - Alert if escrow pending > 30 days
   - Weekly summary of pending escrows

3. **Automated Release Detection:**
   - Automatically detect releases from TransferMate email patterns
   - Match releases to pending escrows by invoice reference

4. **Refund Fee Automation:**
   - Automatically calculate fees based on booking type
   - Generate refund invoices

## Related Documentation

- Main Workflow: `/Docs/Projects/Assign/Manual.md`
- Payment Methods: `/Docs/CLAUDE.md` (lines 67-75)
- Fidelo API: `/Docs/Projects/Assign/Fidelo-API.md`

## Status

**Implementation Date:** 2025-12-02
**Status:** Module created, integration pending
**Testing:** Not yet tested with real escrow emails

---

**Note:** Escrow payments will naturally phase out over 6 months as legacy "TransferMate Escrow" method gets cleaned up. New escrow tracking system is external to Fidelo to avoid conflicts with their payment model.
