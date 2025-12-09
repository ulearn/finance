Endpoint
https://ulearn.fidelo.com/api/1.0/gui2/e012597a49e0b3d0306f48e499505673/search
Post
_token=API_TOKEN&filter[search]=&filter[search_time_from_1]=24%2F09%2F2025&filter[search_time_until_1]=01%2F10%2F2025&filter[timefilter_basedon]=kip.payment_date&filter[search_2]=0&filter[search_3]=0&filter[search_4]=0&filter[search_5]=0&filter[search_6]=0&filter[search_7]=0&filter[search_8]=0&filter[search_9]=0&filter[search_10]=0&filter[search_11]=0&filter[inbox_filter]=0&filter[group_search]=0&filter[search_14]=0

What is wrong with it? Can you fix it? Will you fix it?

2) We're having issues with the TransferMate App. It may need to be uninstalled as it does not appear to handle Escrow payments. See prior thread.

I need a response please and a solution.

Regards,

Neil



Hi Neil,
 
There are several updates pending in your software. Please run them all before testing the API endpoint provided below. If you prefer, I can run these updates for you.
The filters shown in the payment details API are broken. I have already sent a request to the development team to fix them.
 
Once the updates are install, please try the following endpoint: https://ulearn.fidelo.com/api/1.0/gui2/e012597a49e0b3d0306f48e499505673/search?_token=9feb2576ba97b2743550120aa5dd935c&ids[]=36559
The Response from this endpoint contains the following fields. Please, let me know if this is enough or you would like me to add more:
{
  "hits": 1,
  "entries": {
    "2447": {
      "id": "2447",
      "ts_ij.school_id": "Ja",
      "ts_ij.school_id_original": "1",
      "tc_c.lastname": "Flute",
      "tc_c.firstname": "Fenella",
      "document_numbers": "I-C1-EUR-23018, I-C1-EUR-23019",
      "tc_c_n.lastname": "CPS-1269",
      "payment_method": "Brutto vor Anreise",
      "payment_method_original": "1",
      "sales_person_id": "Gierling, Dennis",
      "sales_person_id_original": "12",
      "nationality": "Angolanisch",
      "nationality_original": "AO",
      "ts_g.short": "",
      "ts_i.status_id": "",
      "ts_i.status_id_original": "0",
      "ka.ext_1": "",
      "ka_c.name": null,
      "ts_an.number": null,
      "currency_id": "€",
      "currency_id_original": "1",
      "course_names_short": "G20<br/>PL",
      "course_names_short_original": "G20{||}PL",
      "course_dates_until": "12.05.2023<br/>26.05.2023",
      "course_dates_until_original": "2023-05-12{||}2023-05-26",
      "course_dates_from": "02.05.2023<br/>15.05.2023",
      "course_dates_from_original": "2023-05-02{||}2023-05-15",
      "total_course_weeks": "4",
      "accommodation_names_short": "ER / FS / GF",
      "accommodation_dates_from": "30.04.2023",
      "accommodation_dates_from_original": "2023-04-30",
      "accommodation_dates_until": "13.05.2023",
      "accommodation_dates_until_original": "2023-05-13",
      "ts_i.inbox": false,
      "ts_i.inbox_original": "default",
      "comment": "",
      "receipt_number": "RP-23106",
      "total_amount": "€1.285,00",
      "total_amount_original": null,
      "course_amount": "€285,00",
      "course_amount_original": null,
      "accommodation_amount": "€700,00",
      "accommodation_amount_original": null,
      "transfer_amount": "€120,00",
      "transfer_amount_original": null,
      "insurance_amount": "€0,00",
      "insurance_amount_original": null,
      "additional_course_amount": "€100,00",
      "additional_course_amount_original": null,
      "additional_accommodation_amount": "€80,00",
      "additional_accommodation_amount_original": null,
      "additional_general_amount": "€0,00",
      "additional_general_amount_original": null,
      "extraPosition_amount": "€0,00",
      "extraPosition_amount_original": null,
      "kipo.amount_inquiry": "€0,00",
      "kipo.amount_inquiry_original": null,
      "date": "09.05.2023",
      "date_original": "2023-05-09",
      "kpm.name": "Check",
      "sender": "Kunde",
      "sender_original": "customer",
      "kip.type_id": "Vor Anreise",
      "kip.type_id_original": "1",
      "creator_id": "Otero, Ruben",
      "creator_id_original": "69",
      "created": "09.05.2023",
      "created_original": null,
      "editor_id": "Otero, Ruben",
      "editor_id_original": "69",
      "changed": "09.05.2023",
      "changed_original": null
    }
  }
}
 
 
I will have a look at the issue with TM and reply in the other ticket.
Regards
Ruben Otero
Customer Success Manager
Fidelo Software GmbH

+49 221 975807 56 | support@fidelo.com | www.fidelo.com

Avatar	
Accounts TeamOctober 2, 2025 at 9:46 AM
Thanks Ruben - I will run the updates now & check the endpoints

Best,

Neil

Avatar	
Accounts TeamOctober 2, 2025 at 10:42 AM
Updates all ran

We rely on the Payment Detail screen for Payroll Commissions. From memory the sales commissions require:
1) Course/Accomm split
2) Payment Detail shows payments being assigned in the right order, ie: partial payments are assigned to the Course Fee first until it is fully paid and then other services.

=> This is key for commissions as some sales staff are only paid commission on Course Fees (not accomm / other services).

3) Direct / Agent filtering
Again a key element - we have to calculate commissions for B2C (Direct) and B2B (Agent) separately

=====================================
ENDPOINT
Not sure which UI page "e012597a49e0b3d0306f48e499505673" relates to - is there a UI page for that Endpoint? Would be useful to view - check it against the above requirements.

1) Course/Accomm Split
I see "course_amount" - could work

2) Fee Allocation Order - not sure from that example but probably all payments follow the "course first" pattern - could work

2) Direct/Agent - No fields shown

So - not sure Ruben... This would require investigation & additional work on our side.
=====================================

Ideally we don't want to start a new endpoint - just wanna grab the Payment Details data by API & avoid manual transcription every month.

I'll await your update for a timeline to fix the Incoming Payment API as that would be the preferred outcome.

Best,

Neil

Avatar	
Ruben OteroOctober 2, 2025 at 4:59 PM
Hi Neil,
 
The endpoint I gave you is from the Payment details list. See screenshot below:
 

 
The field for Direct / Agent is "sender": agency/customer.
Regards
Ruben Otero
Customer Success Manager
Fidelo Software GmbH

+49 221 975807 56 | support@fidelo.com | www.fidelo.com

Avatar	
Accounts TeamOctober 2, 2025 at 5:05 PM
Yes - you're right.

I checked it again - it does now connect although the wait time is several minutes it does eventually respond instead of failing

That may be usable for our purposes (nightly updates will only pull 3/4 row records.

I'll run it on our side and revert

Thanks for the responses today :)

Best,

Neil

Avatar	
Accounts TeamOctober 3, 2025 at 3:00 PM
So your specific API request responds quickly - near instantly

Can you make another simple API request that also resolves based on date range?
eg: 01/10/2025 to 02/10/2025

That's all we need to filter

Avatar	
Accounts TeamOctober 4, 2025 at 1:58 PM
Question:

Does the field "sender": agency/customer mean "Paid By" ?

Avatar	
Ruben OteroOctober 6, 2025 at 1:58 PM
Hi Neil,
 
I hope you are doing well. See my answers in red:
 
Can you make another simple API request that also resolves based on date range?
eg: 01/10/2025 to 02/10/2025
I have created a request for the development team so that a filter can be used to achieve
 
Does the field "sender": agency/customer mean "Paid By" ?
The sender is the person the invoice is addressed to.
Regards
Ruben Otero
Customer Success Manager
Fidelo Software GmbH

+49 221 975807 56 | support@fidelo.com | www.fidelo.com

Avatar	
Accounts TeamOctober 10, 2025 at 8:36 AM
Hi Ruben,

On the question of API connections...

Is this API Endpoint also broken? (Accounting/Pay Provider/Pay Teachers)

Endpoint
https://ulearn.fidelo.com/api/1.0/gui2/2962d7de1e4d84081eac5d2e261bb197/search
Post
_token=API_TOKEN&filter[search_time_from_1]=25%2F08%2F2025&filter[search_time_until_1]=02%2F11%2F2025&filter[salary_status]=0&filter[teacher_fiter]=0&orderby[db_column]=select_value&orderby[order]=ASC

Thanks for your help

Neil

Avatar	
Accounts TeamOctober 10, 2025 at 8:37 AM
● Curl Request:
curl -X POST 'https://ulearn.fidelo.com/api/1.0/gui2/2962d7de1e4d84081eac5d2e261bb197/search' \
-H 'Content-Type: application/x-www-form-urlencoded' \
-d '_token=699c957fb710153384dc0aea54e5dbec&filter[search_time_from_1]=25%2F08%2F2025&filter[search_time_until_1]=02%2F11%2F2025&filter[salary_status]=0&filter[teacher_fite
r]=0&orderby[db_column]=select_value&orderby[order]=ASC'

Response:
{
"hits": 0,
"entries": []
}

Shows 0 - but UI is populated for that same query

Avatar	
Ruben OteroOctober 13, 2025 at 5:56 PM
Hi Neil,
 
Thank you for your request. We have reviewed it and forwarded it to our development team for further processing. They will take it from here.
 
As soon as we have any updates, we will pass them on to you immediately.
 
 
 
Regards
Ruben Otero
Customer Success Manager
Fidelo Software GmbH

+49 221 975807 56 | support@fidelo.com | www.fidelo.com

