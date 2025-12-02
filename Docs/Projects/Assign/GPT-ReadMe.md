# AI Payment Checker Integration

**Version:** 1.0
**Date:** 2025-12-01
**Model:** GPT-4o (gpt-4o-2024-08-06)

---

## Overview

The AI Payment Checker uses OpenAI's GPT-4o to review ALL payment assignment results before finalizing. This provides an intelligent second-check layer that can:

1. **Validate successful assignments** - Confirm they're correct
2. **Diagnose errors** - Understand why assignments failed and suggest fixes
3. **Resolve manual review cases** - Attempt to match payments the automated system couldn't

---

## Architecture

### Two-Tier Prompt System

**Quick Start Guide** (`gpt-checker.md`)
- Compact 7-8 page guide with essential patterns
- Reference extraction rules, payment methods, common errors
- Loaded first to minimize token usage
- GPT can request full manual if needed

**Full Manual Fallback** (`../../Docs/Projects/Incomings/Manual.md`)
- Comprehensive documentation
- Only loaded when Quick Start insufficient
- GPT explicitly requests it via `needsFullManual: true`

### Stats Tracking

The system tracks:
- Total transactions checked
- Approved, flagged, fix proposed counts
- Which manual sections GPT referenced (for improving Quick Start)
- How many times full manual was needed

---

## Integration with Workflow

### Process Flow

1. **Load Data Sources** (Xero, Stripe, Revolut, Slack, Gmail)
2. **Process Each Transaction** (Slack → TransferMate → Fidelo → HubSpot)
3. **Create Payments in Fidelo** (if matched)
4. **AI Checker Review** ← NEW STEP
   - Reviews ALL results (success, error, manual review)
   - Validates assignments
   - Proposes fixes for errors
   - Attempts to resolve manual review cases
5. **Send Slack Notifications** (enhanced with AI insights)
6. **Generate Summary Report** (includes AI stats)

### Configuration Options

```javascript
const workflow = new PaymentAssignmentWorkflow({
    dryRun: false,              // Set to true for testing
    useAIChecker: true,          // Enable/disable AI checker (default: true)
    deferSlackNotifications: true // Wait for AI review before Slack (default: true)
});
```

---

## Output Format

The AI checker provides structured JSON assessments:

```json
{
  "transactionId": "ch_xxx",
  "status": "success|error|manual_review",
  "aiAssessment": {
    "isCorrect": true,
    "confidence": "high",
    "reasoning": "TransferMate email match is highly reliable...",
    "issues": [],
    "suggestions": []
  },
  "recommendedAction": "approve",
  "proposedFix": null,
  "manualSectionsRead": ["Payment Matching Priority", "Amount Tolerances"],
  "needsFullManual": false
}
```

### Recommended Actions

- **approve** - Assignment is correct, proceed
- **fix** - Problem identified, fix proposed (e.g., student ID suggestion)
- **human_review** - Too complex, escalate to human operator

---

## Example Assessments

### Successful Assignment
```
Transaction: €554 Stripe payment
Matched: Student 30748 via TransferMate email
AI Action: approve
AI Confidence: high
AI Reasoning: TransferMate email match is the most reliable method...
```

### Proposed Fix
```
Transaction: €1,450 "ULEARN29211"
Status: manual_review (no match)
AI Action: fix
AI Confidence: medium
AI Reasoning: Student ID 29211 clearly visible in description
Proposed Fix:
  Student ID: 29211
  Method: reference_extraction
  Notes: Search Fidelo by student ID 29211
```

### Human Review Required
```
Transaction: €500 "Andrea Di"
Status: manual_review (truncated name)
AI Action: human_review
AI Confidence: low
AI Reasoning: Name too short to disambiguate
Issues: Multiple possible matches, insufficient identifying information
Suggestions: Contact student for additional details (invoice number, date)
```

---

## Summary Reports

### Console Output
```
═══════════════════════════════════════════
PAYMENT ASSIGNMENT SUMMARY
═══════════════════════════════════════════
Total Transactions: 15
✅ Successfully Assigned: 10
⚠️  Underpayments: 2
🚫 Manual Review Required: 3
❌ Failed/Errors: 0

🤖 AI CHECKER STATS:
   Total Reviewed: 15
   ✅ Approved: 10
   🔧 Fix Proposed: 3
   🚩 Flagged: 2
   📖 Full Manual Reads: 1
═══════════════════════════════════════════
```

### Slack Notifications

Each transaction detail includes AI insights:
```
1. ✅ €1,342 - Martinez, Elena
   Student ID: 30706 | Payment ID: 37032
   🤖 AI: approve (high)

2. 🚫 €500 - Andrea Di
   Needs review: truncated name
   🤖 AI: human_review (low)

3. ⚠️ €1,485 - Smith, John
   Student ID: 29160 | Shortfall: €15
   🤖 AI: approve (medium) → Likely ForEx fee
```

---

## Testing

### Unit Test (GPT Checker Only)
```bash
node /home/hub/public_html/fins/.claude/tmp/test-gpt-checker.js
```

Tests the AI checker with sample transaction results.

### Integration Test (Full Workflow)
```bash
node /home/hub/public_html/fins/.claude/tmp/test-workflow-with-ai.js
```

Tests complete workflow with AI checker reviewing all results.

---

## Monitoring & Improvement

### Track Manual Section Usage

The system logs which sections of the manual GPT reads most frequently. Add popular sections to the Quick Start guide to reduce token usage and improve performance.

```javascript
// Example stats output
Manual Sections Referenced:
  Payment Matching Priority: 8 times
  Amount Tolerances: 5 times
  Special Cases - TransferMate Escrow: 3 times
  Common Errors & Fixes: 12 times
```

### API Usage

- **Model:** gpt-4o-2024-08-06
- **Rate Limiting:** 500ms delay between calls
- **Timeout:** 30 seconds per transaction
- **Response Format:** JSON (structured output)
- **Temperature:** 0.3 (deterministic, low creativity)

---

## Files

| File | Purpose |
|------|---------|
| `gpt-checker.js` | Main AI checker class with OpenAI integration |
| `gpt-checker.md` | Quick Start prompt guide (compact) |
| `workflow.js` | Payment workflow with AI checker integration |
| `test-gpt-checker.js` | Unit test for AI checker |
| `test-workflow-with-ai.js` | Integration test for complete workflow |
| `../../Docs/Projects/Incomings/Manual.md` | Full manual (fallback reference) |

---

## Environment Variables Required

```bash
OPENAI_API_KEY=sk-...
```

Ensure this is set in `/home/hub/public_html/fins/.env`

---

## Future Enhancements

1. **Automatic Fix Application** - Apply high-confidence fixes automatically
2. **Learning from Human Corrections** - Track when humans override AI suggestions
3. **Confidence Thresholds** - Configurable thresholds for auto-approve vs. human review
4. **Batch Processing** - Parallel API calls for multiple transactions
5. **Cost Tracking** - Monitor OpenAI API usage and costs

---

## Support

If the AI checker fails or produces unexpected results:
1. Check OpenAI API key is valid
2. Review logs for API error messages
3. Verify network connectivity
4. Check rate limits haven't been exceeded

The workflow will continue without AI assessments if the checker fails (graceful degradation).
