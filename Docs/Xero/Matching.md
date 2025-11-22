XERO SUGGESTED AUTO-MATCHING

This differs from Bank Rules & Xero Suggested Guesses which would both attmept to Create a new transaction by filling the fields in the "Create" Tab. Auto-Matching 
on the other hand uses an existing Xero Transaction to match against the Bank of Ireland (BOI) bank transaction.

============================================================
HTML SELECTOR REFERENCE 
The Xero Transaction on the right hand side will auto select the tab "Match". There will be no fields to fill as it now references an existing Xero transaction (ie: if the Match is correct and accepted by "OK" then we do not have to create a new Xero Transaction during the Reconciliation). 

It also appears in green colour. Here is a sample of the HTML / CSS Selector under that condition:
<div class="info c0">
      <div class="details-container">
        <div class="icon transfer" style="visibility: visible;" id="ext-gen2994" title="Bank Transaction">&nbsp;</div>
        <div class="details" id="ext-gen2996"><span>2 Jul 2025</span><span>Payment: multiple items</span><span>Ref: SEPA_20250702  </span></div>

        <div class="amount set" id="ext-gen2995">4,772.85</div>
  <div class="amount">&nbsp;</div>
      </div>
    </div>

============================================================
TRAINING EXAMPLES: 
These were pulled Reconcile Screen Page 19 on 22/11/2025 @ 12:00. URL: https://go.xero.com/BankRec/BankRec.aspx?accountID=93D5D790-E7A1-4C9D-9CF2-8B68DB272970&page=19

1) 
BOI LINE:
3 Jul 2025
CONTRA CTO
331
More details
Spent
4,772.85

XERO SUGGESTED MATCH:
2 Jul 2025
Payment: multiple items
Ref: SEPA_20250702
4,772.85

COORRECT:
a) Amount Matches
b) BOI Description "CONTRA CTO" refers to Bulk SEPA files that we use for Weekly Accounts Payable and Payroll and it aligns with Xero Txns with this format "Payment: multiple items Ref: SEPA_20250702"
c) Dates: BOI Txn happens on/after the Xero Txn (if it happened before it would require Review) 


2) 
BOI LINE: 
6 Jul 2025
Harvey Norman
43.90

XERO SUGGESTED MATCH:
3 Jul 2025
Hodges Figgis
22.00

COORRECT:
a) Amount Matches
b) While BOI Description Contact differs from the Spend Money/Receipt ("Hodges Figgis") it is because Waterstones is the parent company of Hodges Figgis (they're both bookshops in Dublin)
c) Dates: BOI Txn happens on/after the Xero Txn (if it happened before it would require Review) 

3) 
BOI LINE: 
7 Jul 2025
POSC06JUL HARVEY NORM
221
More details
Spent
43.90

XERO SUGGESTED MATCH:
6 Jul 2025
Harvey Norman
43.90

CORRECT:
a) Name match (BOI Description & Xero Transaction Contact)
b) Dates - BOI Transaction happens on or after the Xero Transaction (if BOI happened before Xero it would require Review)


=========================================
  BOI LINE:
  2 Jul 2025
  SECURE DEPOSIT SP
  931
  More details
  Spent
  Received: 250.00

  SUGGESTED MATCH:
  16 May 2025
  Payment: INSTITUT RONDA
  Ref: Secure Deposit
  €250
  2 Other Possible Matches Found

  Reason Incorrect:
  A) No Contact reference in the BOI Description