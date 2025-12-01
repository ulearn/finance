const PaymentWorkflow = require('/home/hub/public_html/fins/scripts/assign/workflow');

(async () => {
    const workflow = new PaymentWorkflow({ dryRun: true });

    const txn = {
        date: '2025-11-07',
        amount: 2320,
        description: 'ULEARN29160        SP',
        reference: '931',
        source: 'boi',
        id: 'test-29160'
    };

    console.log('Testing ULEARN29160 workflow processing...\n');
    const result = await workflow.processTransaction(txn);

    console.log('\n=== RESULT ===');
    console.log('Status:', result.status);
    console.log('Match Method:', result.matchMethod);
    console.log('Booking Found:', !!result.booking);
    if (result.booking) {
        console.log('  Booking ID:', result.booking.bookingId || result.booking.id);
        console.log('  Student:', result.booking.customerNumber, result.booking.customer_name || result.booking.customerName);
        console.log('  Amount Open:', result.booking.amount_open);
    }
    console.log('Error:', result.error);
    if (result.discrepancy) {
        console.log('Discrepancy:', result.discrepancy.reason);
    }
})().catch(err => console.error('Error:', err.message));
