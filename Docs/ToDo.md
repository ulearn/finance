
PAYROLL
1. Create Payroll Periods for 2026
2. Add pension deduction logic 

XERO
1. Reconciliation Ai
a) Historical analysis: Begin by trawling previous years (in reverse order 2024 first then 2023 etc) to get an idea of what references were reconciled
i) I want to grant you access to our Google Sites company Wiki - how to? Usually requires a login - API access?
ii)Video library => I don't currently have an easy way to get you watching videos but possibly we could scrape the audio transcriptions at some point

h) HubSpot API Integration: Set up API access to HubSpot for broader financial tasks beyond reconciliation:
   - RECONCILIATION: Not needed - quotations attached to Xero invoices (using Xero Attachments API instead)
   - INCOMING PAYMENTS: Required for payment attribution/identification (see section 2 below)
   - FINANCIAL REPORTING: Access to deal pipeline data, revenue forecasting, customer attribution
   - INTEGRATION: Will work alongside Fidelo API for complete customer/payment visibility 

e) Begin the Reconciliation process by producing a line item report for January 2025 - I will use that to initially cross reference the unreconciled items and see how close you are to each one. 
f) There will be unknown items - Bank of Ireland (BOI) is just not good at producing the required narrative / transaction (txn) ids and information to allow us to reconcile. Sadly this often requires an actual phone call to the bank. We are exploring switching to Revolut because of this but we want to retain BOI for legacy relationship reasons (may now be moot and possibly Revolut just ends a lot of this bullshit in 2026 but it's not that straightforward as we have our outgoing Bulk Payment files going thru BOI - not sure if we can easily do that in Revolut - so research required before making that switch. We do have a Revolut Account its just not really used that often) 
g) Ultimately we want to move toward a situation where you can be employed as an Ai Finanical Bookkeeping Assistant. You will learn from existing Process manuals and write new ones. You will use existing Xero Bank Rules and improve upon them by updating or indeed just offsite them completely into Knowledge Bases and code so that we move toward a semi-automated Reconciliation process. Any doubts are always to be escalated to your manager - me! :) 

================================================================================================
2. Incoming Payments AI
More difficult - why? Firstly because the process involves identifying who sent the payment and that means connecting to at least 2 other APIs, mainly Fidelo (our Student Information System) but also HubSpot (our sales platform). But certainly possible to start by:

A) Get the Xero Revenue on a specific date
b) Create the flow chart for how to identify a payment
c) Specifically check against Invoices - particularly for larger payments of over €5,000 - these are generally for Groups rather than individuals and Groups will always have Invoice that the Payment is to be matched against (often these are paid in installments and so requires Matching & "Split" payments to correctly reconcile)

d) Possible Candidates:
   - Create a Fidelo connection to pull down a list of outstanding payments
   - This could be added to by pulling in HubSpot Pipeline Deals with outstanding balances
   - In the event that the sum exactly matches the outstanding then you can be certain that the Payer has been found
   - In the event of near matches a high probability candidate has been found and instead of Reconciling directly in Xero the could be output to that day's list that requires checking / further investigation

e) Data Sources & Integration (Added 2025-11-22):
   - Xero Bank Transactions: Use existing Puppeteer + API access from reconciliation automation work
   - HubSpot API: Contact and Deal lookup for payment attribution/identification
   - Fidelo API: Student information and payment assignment capability

f) Workflow (Added 2025-11-22):
   1. Pull bank line data from Xero (using existing access infrastructure)
   2. Identify customer via HubSpot contact/deal search and/or Fidelo student records
   3. Assign payment in Fidelo system
   4. Notify staff (see notification options below)

g) Notification & Output Options (Added 2025-11-22):

   BASIC OPTION:
   - Alert: "Incoming Payment!"
   - Link to: HubSpot Contact

   ENHANCED OPTION:
   - Display: Name & Amount (as currently done)
   - Links to: HubSpot Contact, HubSpot Deal, Fidelo record

   DASHBOARD OPTION (PREFERRED):
   - Single dashboard showing all verified incoming payments for selected date
   - Date selector for historical viewing
   - Replace current email blast to all hands (sales@, info@, accomm@, neil@)
   - Permission controls to hide sensitive financial info from staff who don't need it
     (e.g., accomm@ doesn't need to see payment amounts - current email setup exposes
     this to everyone, which is not ideal)
   - Could maintain optional email/Slack ping notifications alongside dashboard

h) Current Output System:
   - "Incoming Payments" email sent to all hands (sales@, info@, accomm@, director neil@, etc.)
   - Problem: Everyone gets same exact information regardless of need-to-know
   - Solution: Dashboard with role-based permissions + optional targeted notifications 
