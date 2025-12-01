https://fideloschoolpayments.docs.apiary.io/#

Payments/Create a new paymentPOSThttps://private-anon-89ca05308a-fideloschoolpayments.apiary-mock.com/api/1.0/ts/paymentsAttributes
inquiry_id
number
123
school_id
required
number
1
booking_id
number
456
payment_date
required
string
Format Y-m-d

2016-01-01
payment_method_id
required
number
1
payment_amount
required
number
1234.56
payment_comment
string
Text
payment_firstname
string
Vorname
payment_lastname
string
Nachname
payment_transaction_code
string
#342343
RequestWith booking
Headers
Content-Type:application/json
Body
Show JSON Schema
{
    "inquiry_id": 123,
    "school_id": 1,
    "booking_id": 456,
    "payment_date": "2016-01-01",
    "payment_method_id": 1,
    "payment_amount": 1234.56,
    "payment_comment": "Text",
}
Response
200
Headers
Content-Type:application/json
Body
{
  "payment_id": 1234,
  "status": 200,
  "message": "Payment successfully created"
}
RequestWithout booking
Headers
Content-Type:application/json
Body
Show JSON Schema
{
    "school_id": 1,
    "payment_date": "2016-01-01",
    "payment_method_id": 1,
    "payment_amount": 1234.56,
    "payment_comment": "Text",
    "payment_firstname": "Vorname",   // optional
    "payment_lastname": "Nachname",   // optional
    "payment_transaction_code": "#342343" // optional
}
Response
200
Headers
Content-Type:application/json
Body
{
  "unallocated_payment_id": 1234,
  "status": 200,
  "message": "Unallocated payment successfully created"
}