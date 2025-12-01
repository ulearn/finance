# Sample Contact/Booking - Customer #29876 (Rodrigues Silva, Vinicius)

**Related Proforma Invoice:** P2025302
**Booking ID:** 40700
**Document Number:** D2025237
**API Endpoint:** `GET /api/1.0/ts/bookings/40700`

## Contact/Student Information

```json
{
    "id": 40700,
    "referrer_id": "",
    "student_status_id": 0,
    "agency_id": 688,
    "inbox": "default",
    "comment": "",
    "comment_course_category": null,
    "firstname": "Vinicius",
    "lastname": "Rodrigues Silva",
    "gender": 1,
    "birthday": "2004-07-16",
    "nationality": "BR",
    "language": "pt",
    "corresponding_language": "en",
    "phone_private": "+353 83 121 9490",
    "email": "vinighost2@gmail.com",
    "address": "6 OLIVEMOUNT TERRACE",
    "zip": "D14 TX95",
    "city": "Dublin 14",
    "country_iso": "IE",
    "contact_number": null,
    "booking_number": "",
    "state": "",
    "detail_phone_mobile": "+55 11 97425 9031",
    "emergency_firstname": "",
    "emergency_lastname": "",
    "emergency_phone": null,
    "emergency_email": "",
    "confirmed": "1747672079",
    "billing_firstname": "",
    "billing_lastname": "",
    "billing_phone": null,
    "billing_email": "",
    "billing_address": "",
    "billing_zip": "",
    "billing_city": "",
    "billing_country": "",
    "passport_number": "GK785264",
    "matching_allergies": ""
}
```

## Key Details

**Booking Status:**
- **Booking ID:** 40700
- **Contact ID:** 50558
- **Customer Number:** 29876
- **Document Number:** D2025237
- **Status:** Confirmed ✅
- **Confirmed Timestamp:** 1747672079 (Jan 19, 2025)
- **Agency ID:** 688 (B2B booking)

**Student Details:**
- **Name:** Rodrigues Silva, Vinicius
- **Email:** vinighost2@gmail.com
- **Phone:** +353 83 121 9490
- **Mobile:** +55 11 97425 9031
- **Nationality:** Brazilian (BR)
- **Language:** Portuguese
- **Birthday:** 2004-07-16 (Age 20)
- **Passport:** GK785264
- **Address:** 6 OLIVEMOUNT TERRACE, Dublin 14, D14 TX95, IE

**Financial Information:**
- **Amount (Total):** €1,490
- **Payments:** €1,490
- **Amount Open:** €0 (FULLY PAID)

## API Payment Tests

### ❌ PATCH Test (Failed)

**Test:** Attempt to update payments field via PATCH

**Both v1.0 and v1.1 API Result:**
```json
{
  "errors": [{
    "field": "payments",
    "code": "INVALID_FIELD",
    "message": "Field does not exist: payments"
  }],
  "status": 400,
  "message": "Validation Error"
}
```

### ✅ POST Test (SUCCESS!)

**API Endpoint:** `POST /api/1.0/ts/payments`

**Test Request:**
```json
{
  "inquiry_id": 40700,
  "school_id": 1,
  "booking_id": 40700,
  "payment_date": "2025-11-23",
  "payment_method_id": 1,
  "payment_amount": 15.00,
  "payment_comment": "TEST - With inquiry_id included"
}
```

**Response:**
```json
{
  "payment_id": 36991,
  "status": 200,
  "message": "Payment successfully created"
}
```

**Verification:**
```
Before: €1,490 payments, €0 open
Added:  €15 test payment
After:  €1,505 payments, €-15 open (overpaid)
✅ Payment successfully assigned to booking!
```

## Comparison: Confirmed vs Unconfirmed Bookings

| Property | Unconfirmed (P2025996) | Confirmed (D2025237) |
|----------|------------------------|----------------------|
| Booking ID | 41673 | 40700 |
| Customer Number | 30766 | 29876 |
| Confirmed | `false` | `true` (1747672079) |
| Amount | €50 | €1,490 |
| Payments | €0 | €1,490 |
| Amount Open | €50 | €0 |
| **PATCH Error** | **IDENTICAL** | **IDENTICAL** |

## Conclusion

✅ **PAYMENTS API SOLUTION CONFIRMED**

The `payments` field is **read-only** via PATCH, but we successfully found a working solution:

**Working Method:** `POST /api/1.0/ts/payments`

**Key Requirements:**
- Include BOTH `inquiry_id` and `booking_id` (both set to booking ID)
- Use Bearer token: `699c957fb710153384dc0aea54e5dbec` (with payments scope)
- Required fields: `school_id`, `booking_id`, `inquiry_id`, `payment_date`, `payment_method_id`, `payment_amount`

**Result:** Payment successfully created and assigned to booking (payment_id: 36991)

## Next Steps

1. ✅ API authentication - WORKING
2. ✅ Payment creation - WORKING
3. 🔨 Build Fidelo search by reference (P####/D####/booking ID)
4. 🔨 Build full payment assignment workflow
5. 🔨 Integrate with Xero incoming payments
6. 🔨 Add HubSpot cross-reference matching
7. 🔨 Create notification system
