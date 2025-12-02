# Incoming Payments Automation - Rollout Checklist

## ✅ Pre-Flight Checks

### 1. **API Credentials**
- [x] Stripe API key configured (read-only, restricted)
- [x] Revolut Merchant API key configured
- [x] Fidelo API token configured
- [x] HubSpot API token configured
- [x] Slack Bot Token configured (with `files:read` scope)
- [x] OpenAI API key configured (for attachment parsing)

### 2. **Slack Setup**
- [x] Bot invited to #financial channel
- [x] Bot has required scopes: `channels:read`, `channels:history`, `files:read`, `chat:write`
- [x] Remittance checkpoint created: `data/slack-remittances.json`
- [x] 33 remittances loaded and ready

### 3. **Double-Count Prevention**
- [x] Layer 1: Stripe payout filtering (Xero transactions)
- [x] Layer 2: Duplicate payment detection (Fidelo ±€1, ±5 days)
- [x] Escrow payment replacement logic (TransferMate → TransferMate/Bank Transfer)

### 4. **Attachment Parsing**
- [x] PDF parsing working (pdf-parse v1.1.1)
- [x] Image parsing working (OpenAI Vision)
- [x] Tested on real Slack messages (2 PDFs + 4 images successful)

### 5. **Workflow Logic**
- [x] Priority 1: Slack remittance (threaded replies)
- [x] Priority 2: Fidelo reference search (P####/D####)
- [x] Priority 3: HubSpot match
- [x] Priority 4: Manual review
- [x] Notifications sent to #financial channel

---

## 🧪 Phase 1: Dry Run Testing

**Goal**: Verify matching logic without creating payments

```bash
# Test with today's transactions (DRY RUN)
node scripts/assign/run-daily.js --dry-run
```

**Expected Results:**
- [ ] Transactions fetched from Stripe, Revolut, Xero
- [ ] Slack remittances loaded (33+ entries)
- [ ] Matches found via Slack/Fidelo/HubSpot
- [ ] No duplicate payments detected
- [ ] Slack notifications formatted correctly (in dry-run, not actually sent)
- [ ] Manual review items flagged appropriately

**Review:**
- [ ] Check console output for errors
- [ ] Verify match accuracy (spot-check 5-10 transactions)
- [ ] Confirm discrepancy handling (€1-€10 = underpayment, >€10 = manual review)

---

## 🟡 Phase 2: Supervised Live Mode

**Goal**: Create real payments with manual verification

```bash
# LIVE MODE - creates payments in Fidelo!
node scripts/assign/run-daily.js --live
```

**Process:**
1. Run LIVE mode for ONE DAY
2. Manually verify each payment in Fidelo Admin
3. Check #financial channel for threaded replies
4. Confirm no duplicates were created

**Verification Checklist:**
- [ ] All payments created in correct bookings
- [ ] Amounts match (within ±€1 tolerance)
- [ ] Payment methods correct (Bank Transfer, Stripe, Revolut)
- [ ] Escrow payments properly replaced
- [ ] Slack notifications sent as threaded replies
- [ ] Manual review items flagged in Slack

**If Issues Found:**
- [ ] Document the issue
- [ ] Fix and re-test in dry-run mode
- [ ] Do NOT proceed to Phase 3 until 100% accurate

---

## 🟢 Phase 3: Full Automation

**Goal**: Run daily without supervision

### Option A: Manual Daily Run
```bash
# Run every morning
node scripts/assign/run-daily.js --live
```

### Option B: Cron Job (Automated)
```bash
# Add to crontab (runs at 9 AM daily)
0 9 * * * cd /home/hub/public_html/fins && node scripts/assign/run-daily.js --live >> logs/incoming-payments.log 2>&1
```

**Monitoring:**
- [ ] Set up log rotation (`logs/incoming-payments.log`)
- [ ] Monitor #financial channel for errors
- [ ] Weekly review of "Manual Review" items
- [ ] Monthly audit: compare Fidelo payments to bank statements

---

## 🚨 Rollback Plan

**If something goes wrong:**

1. **Stop the automation**
   ```bash
   # Remove cron job if automated
   crontab -e  # Delete the line
   ```

2. **Revert to manual processing**
   - Resume human payment assignment
   - Document what went wrong

3. **Delete duplicate payments** (if created)
   - Use Fidelo Admin to delete payments
   - Check `data/slack-remittances.json` for checkpoint

4. **Fix the issue**
   - Update code
   - Test in dry-run mode
   - Re-deploy when confident

---

## 📊 Success Metrics

**Week 1 Goals:**
- [ ] >90% automatic assignment rate
- [ ] <5% manual review rate
- [ ] 0 duplicate payments
- [ ] 0 incorrect bookings

**Month 1 Goals:**
- [ ] >95% automatic assignment rate
- [ ] <2% manual review rate
- [ ] Time saved: ~30-60 min/day

**Future Enhancements:**
- [ ] Email remittance detection (scan incoming emails)
- [ ] Bird.com chat integration (parse conversations)
- [ ] Remove Slack posting requirement (staff no longer need to post)
- [ ] AI booking reference extraction from unstructured messages

---

## 🎯 Current Status

**Built & Tested:**
- ✅ Multi-source integration (Stripe, Revolut, Xero/BOI)
- ✅ Slack remittance reading + attachment parsing (PDF + images)
- ✅ Double-count prevention (2 layers)
- ✅ Payment workflow (4-step priority)
- ✅ Slack notifications (threaded replies)
- ✅ Escrow handling (TransferMate replacement)

**Ready for:** Phase 1 (Dry Run Testing)

**Next Step:** Run `node scripts/assign/run-daily.js --dry-run` and review results

---

## 📞 Support

**If you encounter issues:**
1. Check logs: `logs/incoming-payments.log`
2. Review Slack #financial for error notifications
3. Check Fidelo Admin for duplicate payments
4. Review checkpoint: `data/slack-remittances.json`

**Common Issues:**
- **"No transactions found"**: Check date range, API credentials
- **"Already assigned"**: Double-count prevention working correctly
- **"Manual review required"**: Large discrepancy (>€10) or no match found
- **"Attachment parse failed"**: OpenAI API key or file download issue
