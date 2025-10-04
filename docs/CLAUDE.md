You are operating in a Node.Js environment in Phusion Passenger 
You do not have root/sudo access in this shared linux VPS server 
You can run nvm and install standard packages that way

Server URL: https://hub.ulearnschool.com/fins/
Main Index: /home/hub/public_html/fins/index.js

On creation, we ran this cPanel instruction for "fins" nodeJS environment: we are in a shared VPS linux Phusion Passenger environment - the node_modules are synlinked to start 

  cPanel instructions "fins" nodeJs environment: Enter to the virtual environment.To enter to virtual environment, run the command: source 
  /home/hub/nodevenv/public_html/fins/20/bin/activate && cd /home/hub/public_html/fins

INDEX & FILE / FOLDER ARCHITECTURE RULES
The index is located at: /home/hub/public_html/fins/index.js 
- CARDINAL RULE: The index should never contain any business logic!! it is for routing/endpoints/authoirzation ONLY!!!
    All business logic goes to the files in /home/hub/public_html/fins/scripts/.../


Basic Instructions
Restart Server: From the fins/ directory the command is: touch tmp/restart.txt
Logs: When I say "read log" or "read the log files" or similar, I mean review the last 50-75lines of /home/hub/public_html/fins/fins.log

COMMANDS
Search commands like "grep" can be run without asking me (non-editing & non-destructive procedure)


GIT
Repo: https://github.com/ulearn/fins
- We are only operating on the master claude
- Never create or push commits or do anything destructive with git repo without asking permission
- It is read only for you

=========================================================================================================

PROJECT SPECIFIC CONTEXT
1) Payroll - Sales Commissions 
we are working in /home/hub/public_html/fins/payroll/sales/pay building into management & employee reports dashboard 

Manager Dash: /home/hub/public_html/fins/payroll/sales/dashboard.js/.html
REACT employee dashboards: 
/home/hub/public_html/fins/payroll/sales/b2c-diego.js/.html
/home/hub/public_html/fins/payroll/sales/b2b-cenker.js/.html

==============================================================================================================
TIMELINE NOTES (Reverse Cronology)
03.10.2025
I should also state that we have several payments of "method" "TransferMate Escrow". These are manually recorded in the system and reflect 
payments into an Escrow Account (ie: not settled to our account). I believe I have accounted for any Escrows taht were refunded (sent back to sender) at this point so we can 
include these TransferMate Escorw payment methods as either 
1) They have settled to our bank account (if that is the case they should really be updated to "TransferMate" to indicate release from Escrow but they are not done) 
2) They remain in Escrow and therefore their visa status is still Pending

I am not particularly happy about having this noise but lets crack on anyway - in future the "TransferMate Escrow" method will either be 
a) Removed completey (we will track escrows externally)
b) Only used when the funds are actually still in escrow (unlike now where they are describing 2 states (some are in escrow and most are in bank) 

01.10.2025
1) Fidelo API Files Update: 
  So the structure is:
  - bookings-api.js = API utility functions (helper library) /home/hub/public_html/fins/scripts/fidelo/bookings-api.js
  - fidelo-sync.js = Full bookings sync to database (production) /home/hub/public_html/fins/scripts/fidelo/fidelo-sync.js
  - payments-api.js = Payments sync to database (production) /home/hub/public_html/fins/scripts/fidelo/payments-api.js
  - Payment Detail (still broken): /home/hub/public_html/fins/scripts/fidelo/import-pay-detail-api.js


23.09.2025 - 
1) The Fidelo API is not working
2) We created a MySql database to house the invocming revenue data 
3) we created 3 dashboards to display the calculated year on year monthly data for commissions / Payroll 
/home/hub/public_html/fins/payroll/sales/dashboard.js/.html
/home/hub/public_html/fins/payroll/sales/b2b-cenker.js/.html
/home/hub/public_html/fins/payroll/sales/b2c-diego.js/.html

Required functions:
  1. Central MySQL Data Provider (mysql-data.js)
  - Handles all database connections and queries
  - Uses correct .env path for credentials
  - Provides methods for all three dashboards: getDashboardData(), getB2BData(), getB2CData()

  2. Main Dashboard (dashboard.js)
  - Now requires and uses mysql-data.js
  - Falls back to zeros if MySQL fails (no mock data)
  - Processes real data for both B2C and B2B channels

  3. B2B Dashboard (b2b-cenker.js)
  - Uses getB2BData() method for Cenker's commission calculations
  - 10% commission on YoY course fee growth ONLY (not the entire "Amount")
  - Falls back to zeros if connection fails

  4. B2C Dashboard (b2c-diego.js)
  - Uses getB2CData() method for Diego's commission calculations
  - 1% commission on total revenue
  - Falls back to zeros if connection fails

  5. Verified Working with Real Data:
  - January 2025: B2C €41,820.48 (43 bookings), B2B €91,665.19 (148 bookings)
  - No more divergence between dashboards - all use same data source
  - Clean architecture with central MySQL logic