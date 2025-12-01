/**
 * Test the tracker sync functionality
 */

const AssignmentTracker = require('../../scripts/assign/tracker');

async function testSync() {
    console.log('═══════════════════════════════════════════');
    console.log('TESTING TRACKER SYNC FUNCTIONALITY');
    console.log('═══════════════════════════════════════════\n');

    const tracker = new AssignmentTracker();

    // Test 1: Sync BOI from Xero recon file
    console.log('Test 1: Sync BOI from Xero recon file\n');
    const boiSynced = await tracker.syncBoiFromXeroRecon();
    console.log(`Result: ${boiSynced} transactions synced\n`);

    // Test 2: Sync Stripe transactions (mock data)
    console.log('Test 2: Sync Stripe transactions\n');
    const mockStripeTransactions = [
        {
            id: 'py_3SYRfHL17ol1v2QQ1in56EGj',
            amount: 108,
            date: '2025-11-28',
            customerName: 'Laia Padros'
        },
        {
            id: 'ch_test_250',
            amount: 250,
            date: '2025-11-28',
            customerName: 'Test Customer'
        }
    ];
    const stripeSynced = await tracker.syncStripeFromApi(mockStripeTransactions);
    console.log(`Result: ${stripeSynced} transactions synced\n`);

    // Test 3: Sync Revolut transactions (mock data)
    console.log('Test 3: Sync Revolut transactions\n');
    const mockRevolutTransactions = [
        {
            id: 'revolut_order_123',
            amount: 500,
            date: '2025-11-29',
            customerName: 'Test Revolut Customer'
        }
    ];
    const revolutSynced = await tracker.syncRevolutFromApi(mockRevolutTransactions);
    console.log(`Result: ${revolutSynced} transactions synced\n`);

    // Test 4: Get unprocessed transactions
    console.log('Test 4: Get unprocessed transactions\n');
    const unprocessed = await tracker.getUnprocessedTransactions();
    console.log(`Unprocessed BOI: ${unprocessed.boi.length}`);
    console.log(`Unprocessed Stripe: ${unprocessed.stripe.length}`);
    console.log(`Unprocessed Revolut: ${unprocessed.revolut.length}\n`);

    // Test 5: Check final stats
    console.log('Test 5: Final stats\n');
    const data = await tracker.loadAssignments();
    console.log('Stats:', data.stats);

    console.log('\n✅ All tests complete!');
    console.log('\nCheck the assignment file:');
    console.log(tracker.getCurrentMonthFile().filepath);
}

testSync()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('Error:', error);
        process.exit(1);
    });
