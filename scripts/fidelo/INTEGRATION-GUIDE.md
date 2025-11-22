# Payment Data Processor Integration Guide

## Overview

The `payment-data-processor.js` module provides **unified data processing** for payment imports, ensuring consistency whether data comes from CSV files or the Fidelo API.

## Benefits

✅ **Consistency**: CSV and API imports produce identical output
✅ **Maintainability**: Single source of truth for data cleaning logic
✅ **Reliability**: Standardized field names and formats
✅ **Refund Detection**: Consistent identification across all sources
✅ **B2B/B2C Split**: Reliable channel classification

## Test Results

```bash
node test-processor.js
```

**Results**: ✓ CSV and API produce identical standardized output!

## Integration Steps

### Option 1: Update Existing Scripts

#### For CSV Import (`import-sql.js`)

Replace the existing `parseDate` and field cleaning logic with:

```javascript
const PaymentDataProcessor = require('./payment-data-processor');
const processor = new PaymentDataProcessor();

// When processing each CSV row:
const rawData = { ...row, _source: 'csv' };
const processed = processor.processRecord(rawData);
const validation = processor.validateRecord(processed);

if (validation.valid) {
    // Insert processed data
} else {
    console.error('Validation failed:', validation.errors);
}
```

#### For API Sync (`payment-detail-api.js`)

Replace the existing `cleanFieldValue` and `prepareValue` methods with:

```javascript
const PaymentDataProcessor = require('./payment-data-processor');
const processor = new PaymentDataProcessor();

// When processing each API response:
const rawData = { ...apiRecord, _source: 'api' };
const processed = processor.processRecord(rawData);
const validation = processor.validateRecord(processed);

if (validation.valid) {
    // Insert processed data
} else {
    console.error('Validation failed:', validation.errors);
}
```

### Option 2: Create New Unified Import Script

Create a single `unified-import.js` that handles both sources:

```javascript
const PaymentDataProcessor = require('./payment-data-processor');

class UnifiedPaymentImport {
    constructor() {
        this.processor = new PaymentDataProcessor();
    }

    async importFromCSV(filePath) {
        // Parse CSV
        const rows = await parseCSV(filePath);

        for (const row of rows) {
            const rawData = { ...row, _source: 'csv' };
            await this.importRecord(rawData);
        }
    }

    async importFromAPI(startDate, endDate) {
        // Fetch from API
        const apiData = await fetchFromFidelo(startDate, endDate);

        for (const record of apiData.entries) {
            const rawData = { ...record, _source: 'api' };
            await this.importRecord(rawData);
        }
    }

    async importRecord(rawData) {
        // Process using shared logic
        const processed = this.processor.processRecord(rawData);
        const validation = this.processor.validateRecord(processed);

        if (!validation.valid) {
            console.error('Invalid record:', validation.errors);
            return false;
        }

        // Insert to database
        await this.insertToDatabase(processed);
        return true;
    }
}
```

## Key Features of the Processor

### 1. Date Parsing

Handles multiple formats:
- `DD/MM/YYYY` (Fidelo CSV format)
- `YYYY-MM-DD` (API format)
- `YYYY-MM-DDTHH:MM:SS` (ISO datetime)

All converted to MySQL `DATE` format: `YYYY-MM-DD`

### 2. Currency Cleaning

Handles:
- `€1,234.56`
- `-€500.00`
- `1234.56`
- Negative amounts (refunds)

All converted to numeric: `1234.56` or `-500.00`

### 3. Field Name Normalization

Maps different field names to standard columns:

| Source Field       | Standard Column |
|--------------------|----------------|
| date, payment_date, PaymentDate | date |
| amount, payment_amount, total | amount |
| course, course_1, course_fee | course |
| agent, agency, agent_name | agent |
| type, payment_type | type |
| method, payment_method | method |

### 4. Refund Detection

```javascript
processor.isRefund(record)  // Returns true if type contains 'refund'
```

### 5. B2B/B2C Classification

```javascript
processor.getChannel(record)  // Returns 'B2B' or 'B2C' based on agent field
```

### 6. TransferMate Escrow Detection

```javascript
processor.isTransferMateEscrow(record)  // Returns true if method contains 'transfermate' or 'escrow'
```

## Verification

After integration, run the verification script:

```bash
node verify-sync.js
```

This will check:
- ✓ All critical columns present
- ✓ Refunds identified correctly
- ✓ B2B/B2C split working
- ✓ Data consistency

## Dashboard Compatibility

The processor ensures these critical fields are always present and correctly formatted:

1. **date** (DATE) - Payment date
2. **amount** (DECIMAL) - Payment amount
3. **course** (DECIMAL) - Course fees
4. **agent** (VARCHAR) - Agent name (B2B identifier)
5. **type** (VARCHAR) - Payment type (identifies refunds)
6. **method** (VARCHAR) - Payment method (identifies escrow)

These are exactly what the sales payroll dashboards expect.

## Migration Plan

### Phase 1: Test (CURRENT)
- ✓ Processor created
- ✓ Tests passing
- ✓ Verification script ready

### Phase 2: CSV Integration (RECOMMENDED NEXT)
1. Back up existing `import-sql.js`
2. Integrate processor into CSV import
3. Test with historical CSV files
4. Verify dashboard still works

### Phase 3: API Integration
1. Back up existing `payment-detail-api.js`
2. Integrate processor into API sync
3. Test with API data fetch
4. Verify consistency with CSV data

### Phase 4: Production
- Use unified processor for all future imports
- Monitor dashboards for accuracy
- Keep verification script for ongoing checks

## Questions?

Run tests anytime:
```bash
node test-processor.js       # Test the processor
node verify-sync.js          # Verify database consistency
```

## Files

- `payment-data-processor.js` - Shared processing utility
- `test-processor.js` - Test suite
- `verify-sync.js` - Database verification
- `INTEGRATION-GUIDE.md` - This file
