const FideloSearch = require('/home/hub/public_html/fins/scripts/assign/fidelo-search');

const testCases = [
    { desc: 'ULEARNP2024929     SP', amount: 2320, date: '2025-11-07', expected: 'P2024929' },
    { desc: 'ID29297            SP', amount: 371, date: '2025-11-17', expected: '29297' },
    { desc: '158771690530723 P2 IP', amount: 1360, date: '2025-11-12', expected: 'P2 or 5-6 digit' },
    { desc: '158619782030727 P2 IP', amount: 1360, date: '2025-11-11', expected: 'P2 or 5-6 digit' },
    { desc: 'pmntx2 ULearn Ltd. SP', amount: 1352, date: '2025-11-06', expected: 'No obvious ref' },
    { desc: 'Andrea Michelle Di SP', amount: 2260.5, date: '2025-11-04', expected: 'Name match' }
];

(async () => {
    const search = new FideloSearch();

    console.log('TESTING UNKNOWN TRANSACTIONS WITH FIXED REGEX\n');
    console.log('='.repeat(80));

    for (const test of testCases) {
        console.log(`\n${test.desc} (€${test.amount})`);
        console.log(`Expected: ${test.expected}`);
        console.log('-'.repeat(80));

        try {
            const result = await search.findBooking(test.desc, test.amount);

            if (result.success) {
                console.log(`✅ MATCH FOUND!`);
                console.log(`   Method: ${result.reason}`);
                console.log(`   Booking: ${result.booking.bookingId}`);
                console.log(`   Student: ${result.booking.studentName}`);
                console.log(`   Student ID: ${result.booking.customerId || 'N/A'}`);
                console.log(`   Invoice: ${result.booking.documentNumber}`);
                console.log(`   Amount: €${result.booking.amount} (Open: €${result.booking.amountOpen})`);

                if (result.reference) {
                    console.log(`   Reference used: ${result.reference}`);
                }
            } else {
                console.log(`❌ NO MATCH`);
                console.log(`   Reason: ${result.reason}`);
            }
        } catch (error) {
            console.log(`❌ ERROR: ${error.message}`);
        }
    }

    console.log('\n' + '='.repeat(80));
    console.log('TEST COMPLETE\n');
})();
