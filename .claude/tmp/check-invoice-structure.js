const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function checkInvoiceStructure() {
    const curlCommand = `curl -s "https://ulearn.fidelo.com/api/1.1/ts/booking/40187?include_inactive_services=1&include_credit_notes=1" \
      -H "Authorization: Bearer 699c957fb710153384dc0aea54e5dbec" \
      -H "Accept: application/json"`;

    const { stdout } = await execPromise(curlCommand);
    const data = JSON.parse(stdout);

    const invoice = data.data.invoices.find(inv => inv.number === 'D2024523');

    console.log('Invoice D2024523 Line Items:\n');
    console.log(JSON.stringify(invoice.items, null, 2));
}

checkInvoiceStructure();
