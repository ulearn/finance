/**
 * Analyze Course Types in Master Data
 */

const data = require('./2025/master-invoices-2025.json');

// Analyze all course categories and types
const courseCategories = {};
const courseNames = {};

data.invoices.forEach(invoice => {
    invoice.courses.forEach(course => {
        // Track categories
        const cat = course.category || 'Unknown';
        if (!courseCategories[cat]) {
            courseCategories[cat] = 0;
        }
        courseCategories[cat]++;

        // Track course names
        const name = course.name || 'Unknown';
        if (!courseNames[name]) {
            courseNames[name] = 0;
        }
        courseNames[name]++;
    });
});

console.log('=== COURSE CATEGORIES ===');
Object.entries(courseCategories)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
        console.log(`${count.toString().padStart(4)} | ${cat}`);
    });

console.log('\n=== COURSE NAMES (Top 30) ===');
Object.entries(courseNames)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .forEach(([name, count]) => {
        console.log(`${count.toString().padStart(4)} | ${name}`);
    });

console.log('\n=== AFTERNOON/EVENING COURSES ===');
Object.entries(courseNames)
    .filter(([name]) => {
        const n = name.toLowerCase();
        return n.includes('afternoon') || n.includes('evening') || n.includes('ge30') || n.includes('gem30') || n.includes('intensive');
    })
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, count]) => {
        console.log(`${count.toString().padStart(4)} | ${name}`);
    });

console.log('\n=== GE20/GE220/PLUS COURSES ===');
Object.entries(courseNames)
    .filter(([name]) => {
        const n = name.toLowerCase();
        return n.includes('ge20') || n.includes('ge220') || n.includes('plus');
    })
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, count]) => {
        console.log(`${count.toString().padStart(4)} | ${name}`);
    });

console.log('\n=== ACCOMMODATION LINE ITEMS ===');
let accommCount = 0;
let accommTotal = 0;

data.invoices.forEach(invoice => {
    invoice.lineItems.forEach(item => {
        const desc = item.description.toLowerCase();
        if (desc.includes('apartment') || desc.includes('accommodation') || desc.includes('homestay') || desc.includes('residence')) {
            accommCount++;
            accommTotal += item.nadc;
        }
    });
});

console.log(`Total accommodation line items: ${accommCount}`);
console.log(`Total accommodation revenue: €${accommTotal.toFixed(2)}`);
