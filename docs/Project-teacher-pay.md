> The output required is to match the fidelo's weekly payment output. We will need some kinda react dashboard for the initial display

  The issue we have with Fidelo (and the reason we are pulling this data here) is that it only outputs WEEKLY timeframes. However our payroll runs on the last
  Thursday of the month and should include the Wednesday and then cutoff. See the csv file for a sample of the output from Fidelo (API will do similar): /home/hub/public_html/fins/scripts/fidelo/data/accounting_pay_provider_pay_teachers.csv

  The director of studies (DOS) has oversight on the daily teacher hours in anoother screen in Fidelo but its inacessible to API. Weekly is the highest
  resolution we can get over API

  Lets take an example month - Sept 2025
  Week#1: Week beginning 25/08/2025
  - Last Thursday of August was the 28th so we paid staff up to & including the 27th.
  - Therefore this payroll must run from the 28th of August and include that day which was excluded in August Payroll
  - Week has a cutoff and therefore requires further input & editing by DOS

  Weeks#2/3/4 (01, 08, 15/08/2025)
  - These are all fine - complete weeks without any cutoff interruption
  - Their Totals can be used without further interference

  Week#5 (Week Beginning 22/08/2025)
  - This will include 22, 23, 24
  - Payroll payment will execute on Thurday 25th of September
  - This Week has a cutoff and requires editing/updating by DOS

  GOALS
  1) The ultimate goal is rather simple - collate the data the columns "Teacher" / "Hours" / "Per lesson/month" and output the Teachers Gross Pay ("Hours" x "Per lesson/month" (which provides their hourly rate)
  We were using a pivot table to produce this. For our manual work so far please see: /home/hub/public_html/fins/scripts/fidelo/data/My-Fidelo-Feb_pay_teachers.csv
  Not complicated really:
    EMPLOYEE	  HOURS   RATE    PAY
    Jim           20      20      400
    Dave          10      10      200

  2) If we paid by the week this would be easy - we would just collate the data directly from Fidelo's weekly output but that isn't the case. So the goal of
  this monthly payroll application will be to pull in the data (cron & "Refresh Data" button on the Dashboard) and leave space in the cutoff weeks (meaning the
  first and last week of every month) so the DOS can input daily information that is missing in this output.

  Further Explanations
  The output does show the days a Teacher worked in any given week (in the "Days" column you see Monday, Tuesday, Wednesday etc). So if we are in Week#1 and a
  Teacher only worked Monday/Tuesday/Wednesday we will exclude the total for that week - pretty straightforward as all those days were paid in the prior month
  and not included in this month. Similarly, if we were in the final week of a payroll month (could be week 4 or 5 depending on the month - in Sept it was
  Week#5) and a teacher had only worked Thursday and Friday of that week none of the Total Hours would be inluded as the cutoff only runs up to and inluding
  Wednesday.

  But if a teacher works Tuesday/Thursday/Friday it becomes impossible to decipher which days to allocate the Total Hours to. The system does not indicate how
  many hours were worked on each day via this API (nor does it do so in the UI in Fidelo - its just how the dates are presented - they are using a simple 52
  week per year method and are not willing or able to update that display for us)

  To summarise
  1) Mon/Tues/Wed are not included in the first week of a monthly payroll period
  2) Thurs/Fri are not included in the final week of a monthly payroll  period 
  3) Therefore we need a way to allow editing of the First & Final Weeks of the Monthly Payroll Period. Initially a setup like this would be fine:

    TEACHER	            WEEK#1      WEEK#2	WEEK#3	WEEK#4	WEEK#5
    ------------------------------------------------------------------------
    Booth, Dave		                15	    15	    15	
    Leave
    Sick
    ------------------------------------------------------------------------
    Clarke, David		            10	    10	    8	
    Leave                                           2
    Sick
    ------------------------------------------------------------------------
    Henchy, Fergal		            30	    30	    6	
    Leave 
    Sick                                      6

More Granular Logic
We could allow the Dashboard to populate WEEK#1 Hours IF:
1) The Teacher ONLY worked on Thursday and/or Friday
2) Otherwise WEEK#1 remains blank until checked & manually input

Similar contrary logic applies to the final week- dashboard can populate WEEK#5 directly from Fidelo output IF:
1) The Teacher ONLY worked on Mon and/or Tues and/or Wed as those days are all before the cutoff (runs up to & including Wednesday)
2) Otherwise WEEK5 remains blank until checked & manually input

To clarify both First & Final week logic - if the Teacher has worked hours during the days before the cutoff (Mon/Tues/Wed) AND after the cutoff (Tues/Thurs) it requires manual checking - the system does not provide enough information via API to assign hours to correct days- we only have the days worked and a weekly total. The DOS does have & will input that information


Users
1) During the testing we can use
User: accounts@ulearnschool.com
Pass: Aracna5bia
In production it makes more sense to use the guy who will be pulling the data & inputting
User:dos@ulearnschool.com
Pass: Aracna5bia


=================================================================================
More additions
LEAVE HOURS (Accrued/Requested/Used)
We will be connecting this to Zoho People API. The Leave hours accured each month is 8% of the hours worked. So we will build add
a LEAVE Tab to the Dashboard display. That will just perform a simple sum (Total Hours Worked (once confirmed) X 0.08). This accrued
total wil then be used to populate the Leave Balance in the Employees' Zoho Profile. 

Requests - when granted the DOS will just input the Leave into Fidelo. THere are various categories there but here we're only interested 
in "OUT SICK" and "PAID LEAVE" - any other form of employee absence is not relevant (not paid).

We also pay Bank Holidays so they should be flagged. A person is paid an "average days pay" for the Bank Holiday so if they worked an 
average of 6 hours per day over the preceeding 12 weeks they will be paid 6 hours at their normal rate on Bank Holidays

Finally we also enforce company holidays on Good Friday and over the Christmas period. That automatically deducts Paid Leave from any 
accrued balance the employee may have and if they have none left they are not paid for those days.

Sick Pay 
NOTE: In Ireland staff have 5 Sick Days entitlement where they are paid at 70% of their standard normal pay. IF their rate has changed it is averaged over the
 previous 13 weeks. Staff must be in employment for a minimum of 13 weeks to be entitled to sick pay. There is no accrual calculation per se and the days do 
not carry from year to year 


ReAuthorize URL Zoho API Application: https://hub.ulearnschool.com/fins/payroll/zoho/auth-url