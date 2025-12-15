/**
 * Merge all monthly JSON files for a given year into one master file
 * Usage: node merge-year.js 2017
 */

const fs = require('fs').promises;
const path = require('path');

async function mergeYear(year) {
    const yearDir = `/home/hub/public_html/fins/scripts/fidelo/hourly/${year}`;

    console.log(`Merging all ${year} monthly files...`);

    // Array to hold all invoices
    const allInvoices = [];

    // Read all monthly files
    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

    for (const month of months) {
        const filename = `${month}-${year}.json`;
        const filepath = path.join(yearDir, filename);

        // Also try master-invoices format for month 01
        const altFilename = `master-invoices-${year}.json`;
        const altFilepath = path.join(yearDir, altFilename);

        try {
            let data;
            try {
                const content = await fs.readFile(filepath, 'utf8');
                data = JSON.parse(content);
            } catch (err) {
                // Try alternative filename
                const content = await fs.readFile(altFilepath, 'utf8');
                data = JSON.parse(content);
            }

            const invoices = data.invoices || [];
            console.log(`  ${month}/${year}: ${invoices.length} invoices`);
            allInvoices.push(...invoices);

        } catch (err) {
            console.log(`  ${month}/${year}: File not found, skipping`);
        }
    }

    // Calculate totals
    const totalRevenue = allInvoices.reduce((sum, inv) => sum + inv.totals.nadc, 0);
    const totalDiscounts = allInvoices.reduce((sum, inv) => sum + inv.totals.discount, 0);
    const totalCommissions = allInvoices.reduce((sum, inv) => sum + inv.totals.commission, 0);
    const agentStudents = allInvoices.filter(inv => inv.agent.hasAgent).length;
    const directStudents = allInvoices.filter(inv => !inv.agent.hasAgent).length;

    // Create master file
    const masterData = {
        generated: new Date().toISOString(),
        period: `${year}-01-01 to ${year}-12-31`,
        description: `Master data: All D-invoices (with payments) for ${year} - excludes proformas and credit notes`,
        summary: {
            totalInvoices: allInvoices.length,
            totalRevenue: totalRevenue,
            totalDiscounts: totalDiscounts,
            totalCommissions: totalCommissions,
            agentStudents: agentStudents,
            directStudents: directStudents
        },
        invoices: allInvoices
    };

    // Save merged file
    const outputPath = path.join(yearDir, `all-${year}.json`);
    await fs.writeFile(outputPath, JSON.stringify(masterData, null, 2));

    console.log(`\n✅ Merged ${allInvoices.length} invoices for ${year}`);
    console.log(`   Total Revenue: €${totalRevenue.toFixed(2)}`);
    console.log(`   Output: ${outputPath}\n`);
}

const year = process.argv[2] || '2017';
mergeYear(year).catch(console.error);
