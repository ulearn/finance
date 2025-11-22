#!/usr/bin/env node
const XeroAPIClient = require('../xero-client');

async function checkJanuaryReconciliation() {
  const xero = new XeroAPIClient();
  
  try {
    await xero.ensureValidToken();
    
    console.log('📊 Checking January 2025 Bank Reconciliation Status\n');
    
    // Get bank account
    const accountsResponse = await xero.xero.accountingApi.getAccounts(
      xero.tenantId,
      null,
      'Type=="BANK" AND Status=="ACTIVE"'
    );
    
    const bankAccount = accountsResponse.body.accounts[0];
    console.log(`Bank Account: ${bankAccount.name} (${bankAccount.code})\n`);
    
    // Get transactions for January 2025
    const where = 'Date >= DateTime(2025, 1, 1) AND Date <= DateTime(2025, 1, 31)';
    
    const txnsResponse = await xero.xero.accountingApi.getBankTransactions(
      xero.tenantId,
      null,
      where,
      'Date DESC'
    );
    
    const transactions = txnsResponse.body.bankTransactions || [];
    
    console.log(`Total January 2025 Bank Transactions: ${transactions.length}\n`);
    
    const reconciled = transactions.filter(t => t.status === 'RECONCILED');
    const unreconciled = transactions.filter(t => t.status !== 'RECONCILED');
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`✅ RECONCILED: ${reconciled.length}`);
    console.log(`❌ UNRECONCILED: ${unreconciled.length}`);
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    
    if (reconciled.length > 0) {
      console.log('RECONCILED TRANSACTIONS:\n');
      reconciled.forEach((t, i) => {
        const date = new Date(t.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const amount = t.total.toFixed(2);
        const type = t.type === 'SPEND' ? 'SPEND  ' : 'RECEIVE';
        const contact = t.contact ? t.contact.name : 'No Contact';
        const account = t.lineItems[0]?.accountCode || 'N/A';
        
        console.log(`${i+1}. ${date} | ${type} | €${amount.padStart(10)} | ${contact.substring(0,25).padEnd(25)} | ${account}`);
        console.log(`   ${t.reference || 'No ref'} - ${(t.lineItems[0]?.description || 'No description').substring(0,60)}`);
        console.log('');
      });
    }
    
    if (unreconciled.length > 0) {
      console.log('\n═══════════════════════════════════════════════════════════════\n');
      console.log('UNRECONCILED TRANSACTIONS:\n');
      unreconciled.forEach((t, i) => {
        const date = new Date(t.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const amount = t.total.toFixed(2);
        const type = t.type === 'SPEND' ? 'SPEND  ' : 'RECEIVE';
        
        console.log(`${i+1}. ${date} | ${type} | €${amount.padStart(10)} | ${t.reference || 'No ref'}`);
        console.log(`   ${(t.lineItems[0]?.description || 'No description').substring(0,70)}`);
        console.log('');
      });
    }
    
    // Summary by account
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    console.log('RECONCILED BY ACCOUNT:\n');
    
    const byAccount = {};
    reconciled.forEach(t => {
      const accountCode = t.lineItems[0]?.accountCode || 'Unknown';
      const accountName = t.lineItems[0]?.accountName || 'Unknown';
      const key = `${accountCode} - ${accountName}`;
      
      if (!byAccount[key]) {
        byAccount[key] = { count: 0, total: 0, type: t.type };
      }
      byAccount[key].count++;
      byAccount[key].total += Math.abs(t.total);
    });
    
    Object.entries(byAccount)
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([account, data]) => {
        console.log(`${account}`);
        console.log(`  Count: ${data.count} | Total: €${data.total.toFixed(2)}`);
        console.log('');
      });
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.text);
    }
    process.exit(1);
  }
}

checkJanuaryReconciliation();
