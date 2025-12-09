Customize Leave Balance API
To update the leave balance of leave types for a particular employee

Request URL:

https://people.zoho.com/api/v2/leavetracker/settings/customize-balance/<erecno>

Header:

Authorization:Zoho-oauthtoken 1000.8cb99dxxxxxxxxxxxxx9be93.9b8xxxxxxxxxxxxxxxf

Scope:

ZOHOPEOPLE.leave.CREATE

Request Method:

POST

Request Parameters:

Paramter Name	Values Allowed	Default Value	Description
balanceData	JSONObject	template - balanceData	Leave balance details to be updated
dataFormat	String	Organization Date Format	Date Format to be used for Date in balanceData
Balance Data Template:

{
   "<leavetype-id>": {
       "date": "String",
       "newBalance": "double",
       "reason": "String"
   },
   "<leavetype-id>": {
       "date": "String",
       "newBalance": "double",
       "reason": "String"
   }
   ...
}

 

Error Codes and Message:

Code	Message
9002	Permission denied to access this API. Only Admin can access this API
7055	Ensure date is in '*******' format for the parameter 'date'
9001	Employee ID does not exist
9002	Permission denied to access this API. Only Admin can access this API
9001	Update the Date of Joining for this employee to display their leave information and enable them to perform leave related actions.
7055	Ensure date is in 'dd-MMM-yyyy' format for the parameter 'date'
9001	Provide valid data for parameter 'balanceData'
9001	Leave type - ************ does not exist
9001	Leave type IDs ************, ************ do not exist
9001	Leave type - ************ is not effective on the specified date
9001	Leave type - ************ is not applicable for this employee
 	 
Threshold Limit: 30 requests | Lock period: 5 minutes

Threshold Limit - Number of API calls allowed within a minute.
Lock Period - Wait time before consecutive API requests.



================================================================================
Sample Request:
 https://people.zoho.com/api/v2/leavetracker/settings/customize-balance/100002000000312
Sample Response:
{
    "message": "Balance customized successfully !"
}



================================================================================
// ADD LEAVE BALANCE API
================================================================================

Add Leave Balance API
To modify an employee's leave balance

Request URL:

https://people.zoho.com/api/leave/addBalance?balanceData=<balanceData>&dateFormat=<dateFormat> 

Header:

Authorization:Zoho-oauthtoken 1000.8cb99dxxxxxxxxxxxxx9be93.9b8xxxxxxxxxxxxxxxf

Scope:

ZOHOPEOPLE.leave.ALL 

Request Parameters:

*balanceData
(Json string)	{
   "<EmpErecno>":
     {
        "<LeaveType ID>":
           {
             "date":"<Date>",
             "count":"<Balance>"
          },
          ...
      },
      ... 
}
dateFormat
(String)	
Specify the date format

(Org date format will be considered if nothing is specified)
Note:

The above API will add/subtract the given count. 
Example:
1)Existing balance is 20, if count = 4, new balance will be 24.
2)Existing balance is 20, if count = -4, new balance will be 16.
​
 Threshold Limit:  30 requests | Lock period: 5 minutes

Threshold Limit - Number of API calls allowed within a minute.
Lock Period - Wait time before consecutive API requests.

=============================================================================================

Request
https://people.zoho.com/api/leave/addBalance?balanceData=<balanceData>&dateFormat=<dateFormat>
Header
Authorization:Zoho-oauthtoken 1000.8cb99dxxxxxxxxxxxxx9be93.9b8xxxxxxxxxxxxxxxf
Response
{
    "response": {
        "result": {
            "addedCount": 20,
            "errorCount": 2
        },
        "message": "Data partially updated",
        "uri": "/api/leave/addBalance",
        "errors": {
            "500161005": {
                "500042139": "Ensure date is in 'dd-MMM-yyyy' format for the parameter 'Date'"
            },
            "500169009": {
                "500042112": "Leave type is not applicable for the employee"
            }
        },
        "status": 2
    }
}