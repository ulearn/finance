/**
 * Verify Direct students always show higher €/hour than Agent students
 */

const years = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

console.log('================================================================================');
console.log('DIRECT vs AGENT RATE VERIFICATION');
console.log('================================================================================');
console.log('');

years.forEach(year => {
    try {
        const data = require(`./${year}/all-courses-${year}.json`);

        const directMorning = data.data.morning.filter(b => b.studentType === 'direct');
        const agentMorning = data.data.morning.filter(b => b.studentType === 'agent');

        const directHours = directMorning.reduce((sum, b) => sum + b.totalHours, 0);
        const directRevenue = directMorning.reduce((sum, b) => sum + b.courseFeeNADC, 0);
        const directRate = directHours > 0 ? directRevenue / directHours : 0;

        const agentHours = agentMorning.reduce((sum, b) => sum + b.totalHours, 0);
        const agentRevenue = agentMorning.reduce((sum, b) => sum + b.courseFeeNADC, 0);
        const agentRate = agentHours > 0 ? agentRevenue / agentHours : 0;

        const status = directRate > agentRate ? '✅' : '❌';

        console.log(`${year} Morning Courses: ${status}`);
        console.log(`  Direct: ${directMorning.length} bookings, ${directHours} hrs, €${directRate.toFixed(2)}/hr`);
        console.log(`  Agent:  ${agentMorning.length} bookings, ${agentHours} hrs, €${agentRate.toFixed(2)}/hr`);
        console.log(`  Difference: €${(directRate - agentRate).toFixed(2)}/hr`);
        console.log('');
    } catch (e) {
        console.log(`${year}: Error - ${e.message}`);
        console.log('');
    }
});
