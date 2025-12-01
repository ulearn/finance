  BANK OF IRELAND (BOI) - 21 transactions (€42,663.38)

  High Value Unknowns:
  1. €8,000 - RevoTrans IP (28 Nov) - Possibly Revolut batch?
  => yes this is just me pulling down the Revolut funds into BOI for use - do not double count this - already assigning in Revolut

  2. €5,614 - x4 ULearn Ltd. SP (17 Nov) - Multiple payment batch
  Ok - I am guessing that this is a batch payment from TransferMate. You are not yet connected to TransferMate but we should have API this week. Confirmed - here is the email: 

   

TransferMate Education Team

 

Dear Sir/ Madame,


Please be advised that the payment(s) below have been forwarded to your account.


Pmnt ID

Company Name

Reference

Bank Account Name

Paid Amnt(PC)

Pmnt Curr

690665

ULearn Ltd.

Moana Johanna Frauchiger FIDELO-XML-SERVICE30748

ULearn Ltd

554

EUR

691193

ULearn Ltd.

Regzeddagva Boldbaatar FIDELO-XML-SERVICE29211

ULearn Ltd

1450

EUR

691201

ULearn Ltd.

Enkhmaa Bayasgalan FIDELO-XML-SERVICE29210

ULearn Ltd

1450

EUR

691421

ULearn Ltd.

RAQUEL ALVAREZ FERNANDEZ FIDELO-XML-SERVICE30753

ULearn Ltd 2160

EUR 5614

Should you have any questions, please contact tmedurelationshipmanagers@transfermate.com

 Kind regards,

Manolo Ofiaza

=> This raises another point. We may resolve this by accessing the API so I@m not going to sweat it too much but currently we receive email notifications from 
TM to our accounts@ email. These will make us aware of Payment Notifcations of all sorts 
a) Payment arrived & sent to Escrow 
eg: Dear Sir/Madam,

Please be advised that the student payment(s) below are being held in TransferMate’s Escrow account.

The student(s) have been notified and the payment receipt(s) have been forwarded to them via email. 

Sent for payment date

First Name

Surname

Residence country

Reference Number

Course Name

Pay Amount

Pmnt Curr

14/11/2025

SaranzayaKhishigbayar

Mongolia
ULEARNP2025929
1970
EUR

Should you have any questions, please contact tmedurelationshipmanagers@transfermate.com.

Kind Regards
Maksim Valkov


b) Payment arrived and is registered "normally" (ie: not an exotic coutnry) 
c) Payout to our accounts (like the one above)

============================================================================================
  3. €2,625 - ULEARNP2025771 SP (24 Nov) - Has reference but no Fidelo match
  Same thing here - this variety of Bank Description in BOI is TransferMate payout. Email Notification:
  
Sent for payment date

First Name

Surname

Residence country

Reference Number

Course Name

Pay Amount

Pmnt Curr

24/11/2025

Yan

Wang

China

ULEARNP2025771

Course Fees

2625

EUR

  4. €2,320 - ULEARN29160 SP (7 Nov) - Student ID format but no match
  Matched 29160 = Actra	Actra Agency Mongolia	29160	D2024437	Baljir, Anujin
  => Why didn't it match? Fail

  5. €2,320 - ULEARNP2024929 SP (7 Nov) - Has reference but large discrepancy
  
  6. €2,260.5 - Andrea Michelle Di SP (4 Nov) - Name truncated
  The system should really find that - yes its truncated but still there's enough there to find the student. 
eg: To retrieve the current results in JSON format, please use the following information.

Endpoint
https://ulearn.fidelo.com/api/1.0/gui2/b56eab683e450abb7100bfa45fc238fd/search
Post
_token=API_TOKEN&filter[search]=Andrea%20Michelle&filter[customer_birthday_original]=%2C&filter[cancellation_date_original]=%2C&filter[confirmed_date_original]=%2C&filter[course_period]=%2C&filter[booking_created_filter]=%2C&filter[document_date_original]=%2C&filter[accommodation_last_end_original]=%2C&filter[course_last_end_original]=%2C&filter[course_last_end_date_original]=%2C&filter[first_course_start_original]=%2C&filter[accommodation_last_end_date_original]=%2C&filter[paymentterms_next_date_original]=%2C&filter[all_end_original]=%2C&filter[all_start_original]=%2C&filter[service_period_filter]=%2C&filter[course_contact_original]=%2C&filter[accommodation_from_original]=%2C&filter[course_from_original]=%2C&filter[accommodation_first_start_original]=%2C&filter[changed_original]=%2C&filter[visum_contact_original]=%2C&filter[accommodation_category_original][]=&filter[accommodation_additional_services_original][]=&filter[course_additional_services_original][]=&filter[agency_id][]=&filter[agency_category_id][]=&filter[agencylist_id][]=&filter[has_student_app]=&filter[flex_26]=&filter[flex_27]=&filter[newsletter_original]=&filter[confirmed_original][]=&filter[filter_booking_type]=&filter[checkin_original]=&filter[checkout_original]=&filter[corresponding_language_original][]=&filter[flex_19]=&filter[customer_country_original][]=&filter[country_groups][]=&filter[course_ids_original][]=&filter[course_category_original][]=&filter[course_language_original][]=&filter[creator_id_original][]=&filter[currency_id_original][]=&filter[filter_documents][]=&filter[flex_29_original][]=&filter[customer_gender_original][]=&filter[has_group]=&filter[flex_28_original][]=&filter[insurance_ids][]=&filter[customer_minor]=&filter[customer_language_original][]=&filter[customer_nationality_original][]=&filter[filter_payment_status]=&filter[accommodation_provider_id][]=&filter[subagency]=&filter[sales_person_original][]=&filter[school_id][]=&filter[filter_referrer][]=&filter[filter_special][]=&filter[sponsored_original]=&filter[activities_status_original][]=&filter[courses_status_original][]=&filter[insurances_status_original][]=&filter[invoice_status][]=&filter[accommodations_status_original][]=&filter[customer_status_original][]=&filter[visa_required]=&filter[flex_10]=&filter[transfer_mode]=&filter[flex_8]=&filter[visum_status_original][]=

=> NOTE: Here I'm using GUI2 (you may be using Bookings API but it should be the same result). It's literally the first student returned! From there its checking the available invoices to apply the payment  

  7. €2,160 - 1580214041P2025951 IP (7 Nov) - Has reference but large discrepancy
Its not a large discrepency - it is already applied and you duplicated it either in this run or a previous one - duplication failed.
D2025526	
R20253937 R20253938	=> 10/11/2025 / 07/11/2025	1580214041P2025951 IP	Bank Transfer	Agent	Prior to arrival	€2,160.00	Team, Accounts	
Duplicate:  
R20254041 R20254042	=> 24/11/2025 / 07/11/2025	1580214041P2025951 IP - Ai	Cash	Student	Prior to arrival	€2,160.00
I'm going to delete that but please check it 

Agency Payments (BLUE CONSULTORIA):
  8. €1,509.6 - BLUE CONSULTORIA E GP (11 Nov) - Multiple possible matches
  9. €1,423.2 - BLUE CONSULTORIA E GP (11 Nov) - Multiple possible matches

  Mongolian Students (€1,656 each):
  10. €1,656 - Badamkhand Otgonba SP (21 Nov) - Slack match but no Fidelo booking
  	Actra	Actra Agency Mongolia	29150	D2024451	Otgonbayar, Badamkhand	badambadam039@gmail.com	
  11. €1,656 - Tsengelbayar Mends SP (19 Nov) - Found booking, large discrepancy
  Actra	Actra Agency Mongolia	29058	D2024427	Mendsaikhan, Tsengelbayar	tsengell73@gmail.com
    Correct - 1840 outstanding
    Only 1656 received

  12. €1,656 - Sodnom Bat-Erdene SP (18 Nov) - Found booking, large discrepancy
Tricky one - there is actually a second Booking here (renewal maybe... Not sure) not just a second invoice
=> We've never really dealt with this issue afaik... This is a fidelo work-around for holidays / renewals and other breaks in service time (the student takes time away etc).
Really it should all be in one Booking with several invoices but whatever...
=> I'm marking this as correct because it does require human review right now 


  Other References/IDs:
  13. €1,681 - ULEARNP2025979 SP (20 Nov) - Has reference, large discrepancy
  14. €1,550 - ULEARND2025380TMUL SP (4 Nov) - Has reference, large discrepancy
  15. €1,360 - 158771690530723 P2 IP (12 Nov) - No name extracted
  16. €1,360 - 158619782030727 P2 IP (11 Nov) - No name extracted
  17. €1,352 - pmntx2 ULearn Ltd. SP (6 Nov) - Large discrepancy
  18. €1,344 - ULEARNP2025995TMUL SP (27 Nov) - Has reference, large discrepancy
  19. €371 - ID29297 SP (17 Nov) - ID format but no name match
  20. €300 - ADMIN FEE ULEARNP2 SP (3 Nov) - Admin fee payment
  21. €245.08 - ST-LNBGU7YSVCQG SP (5 Nov) - Stripe reference format

  ---
  REVOLUT MERCHANT - 4 transactions (€8,288.80)

  All with "Unknown" customer name:
  22. €5,529.80 - Unknown (3 Nov) - No customer data from Revolut API
  23. €1,279 - Unknown (10 Nov) - No customer data from Revolut API
  24. €900 - Unknown (6 Nov) - No customer data from Revolut API
  25. €480 - Unknown (21 Nov) - No customer data from Revolut API

  ---
  Analysis:

  BOI Issues:
  - Many have Fidelo references (P2025xxx, D2025xxx) but failed matching due to "large discrepancy"
  - Agency payments (BLUE) have multiple possible matches - ambiguous
  - Mongolian students: 1 no Fidelo booking, 2 found but discrepancy
  - Some are batch/admin payments (x4, admin fee)

  Revolut Issues:
  - API returning "Unknown" for customer name - missing metadata
  - All 4 need manual investigation to identify customer

  These 25 require manual intervention - either booking not in Fidelo, amount discrepancies >€10, or missing customer information.
