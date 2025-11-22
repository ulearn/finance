/**
 * Test Payment Data Processor
 * Verifies that the shared processor handles data correctly from both sources
 */

const PaymentDataProcessor = require('./payment-data-processor');

function testProcessor() {
    console.log('='.repeat(70));
    console.log('PAYMENT DATA PROCESSOR TEST');
    console.log('='.repeat(70));

    const processor = new PaymentDataProcessor();

    // Test 1: CSV-style data
    console.log('\n1. CSV-STYLE DATA');
    console.log('-'.repeat(70));
    const csvRecord = {
        date: '01/10/2025',           // DD/MM/YYYY format
        amount: '€1,234.56',          // Currency with symbol and comma
        course: '450.00',             // Course fee
        agent: 'ABC Agency',          // B2B
        type: 'Prior to arrival',     // Payment type
        method: 'Credit Card',        // Payment method
        _source: 'csv'
    };

    const processedCSV = processor.processRecord(csvRecord);
    console.log('Input:', JSON.stringify(csvRecord, null, 2));
    console.log('Output:', JSON.stringify(processedCSV, null, 2));
    console.log('Summary:', processor.getSummary(processedCSV));
    const validationCSV = processor.validateRecord(processedCSV);
    console.log('Validation:', validationCSV.valid ? '✓ Valid' : '✗ Invalid', validationCSV.errors);

    // Test 2: API-style data (similar structure, different format)
    console.log('\n2. API-STYLE DATA');
    console.log('-'.repeat(70));
    const apiRecord = {
        payment_date: '2025-10-01',   // YYYY-MM-DD format
        payment_amount: 1234.56,      // Numeric amount
        course_fee: 450.00,           // Course fee
        agency_name: 'ABC Agency',    // B2B (different field name)
        payment_type: 'Prior to arrival',
        payment_method: 'Credit Card',
        _source: 'api'
    };

    const processedAPI = processor.processRecord(apiRecord);
    console.log('Input:', JSON.stringify(apiRecord, null, 2));
    console.log('Output:', JSON.stringify(processedAPI, null, 2));
    console.log('Summary:', processor.getSummary(processedAPI));
    const validationAPI = processor.validateRecord(processedAPI);
    console.log('Validation:', validationAPI.valid ? '✓ Valid' : '✗ Invalid', validationAPI.errors);

    // Test 3: Refund data
    console.log('\n3. REFUND DATA');
    console.log('-'.repeat(70));
    const refundRecord = {
        date: '15/10/2025',
        amount: '-€500.00',           // Negative amount
        course: '-200.00',
        agent: '',                    // B2C
        type: 'Refund',               // REFUND TYPE
        method: 'Bank Transfer',
        _source: 'csv'
    };

    const processedRefund = processor.processRecord(refundRecord);
    console.log('Input:', JSON.stringify(refundRecord, null, 2));
    console.log('Output:', JSON.stringify(processedRefund, null, 2));
    console.log('Summary:', processor.getSummary(processedRefund));
    console.log('Is Refund?', processor.isRefund(processedRefund) ? '✓ YES' : '✗ NO');

    // Test 4: TransferMate Escrow data
    console.log('\n4. TRANSFERMATE ESCROW DATA');
    console.log('-'.repeat(70));
    const escrowRecord = {
        date: '20/10/2025',
        amount: '2500.00',
        course: '2500.00',
        agent: 'XYZ Partners',        // B2B
        type: 'Prior to arrival',
        method: 'TransferMate Escrow', // ESCROW METHOD
        _source: 'api'
    };

    const processedEscrow = processor.processRecord(escrowRecord);
    console.log('Input:', JSON.stringify(escrowRecord, null, 2));
    console.log('Output:', JSON.stringify(processedEscrow, null, 2));
    console.log('Summary:', processor.getSummary(processedEscrow));
    console.log('Is Escrow?', processor.isTransferMateEscrow(processedEscrow) ? '✓ YES' : '✗ NO');

    // Test 5: Field name normalization
    console.log('\n5. FIELD NAME NORMALIZATION');
    console.log('-'.repeat(70));
    const testFields = [
        'Date', 'date', 'payment_date', 'PaymentDate',
        'Amount', 'payment_amount', 'total',
        'Course', 'course_1', 'course_fee',
        'Agent', 'agency', 'agent_name',
        'Type', 'payment_type', 'transaction_type',
        'Method', 'payment_method'
    ];

    testFields.forEach(field => {
        console.log(`  ${field.padEnd(20)} → ${processor.normalizeFieldName(field)}`);
    });

    // Test 6: Compare CSV vs API - Should produce identical output
    console.log('\n6. CONSISTENCY CHECK: CSV vs API');
    console.log('-'.repeat(70));

    const csvData = {
        date: '01/10/2025',
        amount: '€1,000.00',
        course: '€400.00',
        agent: 'Test Agency',
        type: 'Prior to arrival',
        method: 'Credit Card',
        _source: 'csv'
    };

    const apiData = {
        payment_date: '2025-10-01',
        payment_amount: 1000.00,
        course_fee: 400.00,
        agency_name: 'Test Agency',
        payment_type: 'Prior to arrival',
        payment_method: 'Credit Card',
        _source: 'api'
    };

    const csvProcessed = processor.processRecord(csvData);
    const apiProcessed = processor.processRecord(apiData);

    console.log('CSV Result:');
    console.log(`  Date: ${csvProcessed.date}, Amount: ${csvProcessed.amount}, Course: ${csvProcessed.course}`);
    console.log(`  Agent: ${csvProcessed.agent}, Type: ${csvProcessed.type}, Method: ${csvProcessed.method}`);

    console.log('\nAPI Result:');
    console.log(`  Date: ${apiProcessed.date}, Amount: ${apiProcessed.amount}, Course: ${apiProcessed.course}`);
    console.log(`  Agent: ${apiProcessed.agent}, Type: ${apiProcessed.type}, Method: ${apiProcessed.method}`);

    // Compare key fields
    const keysMatch = csvProcessed.date === apiProcessed.date &&
                      csvProcessed.amount === apiProcessed.amount &&
                      csvProcessed.course === apiProcessed.course &&
                      csvProcessed.agent === apiProcessed.agent &&
                      csvProcessed.type === apiProcessed.type &&
                      csvProcessed.method === apiProcessed.method;

    console.log('\n' + '='.repeat(70));
    if (keysMatch) {
        console.log('✓ SUCCESS: CSV and API produce identical standardized output!');
    } else {
        console.log('✗ FAILURE: CSV and API outputs differ!');
    }
    console.log('='.repeat(70));
}

// Run test
testProcessor();
