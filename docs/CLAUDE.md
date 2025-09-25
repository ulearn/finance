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