/**
 * Test the Assignment Tracker system
 */

const AssignmentTracker = require('../../scripts/assign/assignment-tracker');

async function testTracker() {
    console.log('═══════════════════════════════════════════');
    console.log('ASSIGNMENT TRACKER TEST');
    console.log('═══════════════════════════════════════════\n');

    const tracker = new AssignmentTracker();

    // Initialize file
    console.log('1️⃣ Initializing assignment file...\n');
    await tracker.ensureFileExists();

    // Load current data
    console.log('\n2️⃣ Loading assignments...\n');
    let data = await tracker.loadAssignments();
    console.log('Current stats:', data.stats);

    // Add sample BOI transaction (from Xero recon file)
    console.log('\n3️⃣ Adding BOI transaction...\n');
    await tracker.addBoiTransaction(
        'd963f85954b84ffba41778d7816413c6',  // dataId from xero recon
        '1,656.00',
        '21 Nov 2025',
        'Badamkhand Otgonba SP',
        '931'
    );

    // Add sample Stripe transactions (from our live run)
    console.log('4️⃣ Adding Stripe transactions...\n');
    await tracker.addStripeTransaction(
        'py_3SYRfHL17ol1v2QQ1in56EGj',  // Laia Padros charge ID
        108,
        '2025-11-28',
        'Laia Padros'
    );

    await tracker.addStripeTransaction(
        'ch_giacomo_ferri_250',  // Giacomo Ferri (example ID)
        250,
        '2025-11-28',
        'Giacomo Ferri'
    );

    // Add sample Revolut transaction
    console.log('5️⃣ Adding Revolut transaction (example)...\n');
    await tracker.addRevolutTransaction(
        'revolut_order_12345',
        500,
        '2025-11-29',
        'Test Customer'
    );

    // Get unprocessed transactions
    console.log('\n6️⃣ Getting unprocessed transactions...\n');
    const unprocessed = await tracker.getUnprocessedTransactions();
    console.log(`BOI: ${unprocessed.boi.length} unprocessed`);
    console.log(`Stripe: ${unprocessed.stripe.length} unprocessed`);
    console.log(`Revolut: ${unprocessed.revolut.length} unprocessed`);

    // Update status - simulate successful assignment
    console.log('\n7️⃣ Updating Laia Padros to "assigned"...\n');
    await tracker.updateStatus('stripe', 'py_3SYRfHL17ol1v2QQ1in56EGj', 'assigned', {
        fideloPaymentId: 37027,
        fideloStudentId: '30737',
        fideloInvoice: 'D2025559'
    });

    // Update status - simulate duplicate detection
    console.log('8️⃣ Updating Giacomo Ferri to "duplicate"...\n');
    await tracker.updateStatus('stripe', 'ch_giacomo_ferri_250', 'duplicate', {
        fideloStudentId: '30779',
        fideloInvoice: 'P20251016',
        notes: 'Payment already exists on this invoice'
    });

    // Load final data
    console.log('\n9️⃣ Final stats:\n');
    data = await tracker.loadAssignments();
    console.log(data.stats);

    console.log('\n✅ Test complete!');
    console.log('\nCheck the file at:');
    console.log(tracker.getCurrentMonthFile().filepath);
}

testTracker()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('Error:', error);
        process.exit(1);
    });
