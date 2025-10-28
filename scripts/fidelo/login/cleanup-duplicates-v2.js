#!/usr/bin/env node
// Clean up duplicate teacher payment records - Version 2
// Find all records with the same composite_key, keep only latest

const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'hub_payroll',
    port: process.env.DB_PORT || 3306
  });

  console.log('Finding duplicate composite_keys...');

  // Find all composite keys that have multiple records
  const [duplicateKeys] = await conn.execute(`
    SELECT composite_key, COUNT(*) as count
    FROM teacher_payments
    WHERE composite_key IS NOT NULL
    GROUP BY composite_key
    HAVING COUNT(*) > 1
  `);

  console.log(`Found ${duplicateKeys.length} composite keys with duplicates`);

  let totalDeleted = 0;

  for (const { composite_key } of duplicateKeys) {
    // Get all records for this composite_key, ordered by import_date DESC
    const [records] = await conn.execute(`
      SELECT id, import_date, firstname, select_value
      FROM teacher_payments
      WHERE composite_key = ?
      ORDER BY import_date DESC, id DESC
    `, [composite_key]);

    // Keep the first one (latest), delete the rest
    const keepId = records[0].id;
    const deleteIds = records.slice(1).map(r => r.id);

    if (deleteIds.length > 0) {
      await conn.execute(`
        DELETE FROM teacher_payments WHERE id IN (${deleteIds.join(',')})
      `);

      totalDeleted += deleteIds.length;
      console.log(`  Kept ID ${keepId} (${records[0].firstname}, ${records[0].select_value}), deleted ${deleteIds.length} duplicates`);
    }
  }

  console.log(`✓ Total deleted: ${totalDeleted} duplicate records`);

  // Now handle NULL composite_key records if any remain
  const [nullRecords] = await conn.execute(`
    SELECT COUNT(*) as count FROM teacher_payments WHERE composite_key IS NULL
  `);

  if (nullRecords[0].count > 0) {
    console.log(`\nWarning: ${nullRecords[0].count} records still have NULL composite_key`);
    console.log('These should be populated before next import');
  } else {
    console.log('\n✓ All records have composite_key assigned');
  }

  await conn.end();
})();
