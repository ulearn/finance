#!/usr/bin/env node
// Clean up duplicate teacher payment records
// Keep only the record with latest import_date for each composite_key

const mysql = require('mysql2/promise');
const { generateCompositeKey } = require('./generate-composite-key.js');
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'hub_payroll',
    port: process.env.DB_PORT || 3306
  });

  console.log('Finding duplicates...');

  // For records without composite_key, generate and assign them
  const [nullKeyRecords] = await conn.execute(`
    SELECT id, firstname, select_value, classname, days
    FROM teacher_payments
    WHERE composite_key IS NULL
  `);

  console.log(`Found ${nullKeyRecords.length} records with NULL composite_key`);
  console.log('These are duplicates - assigning composite keys and keeping only latest...');

  // Group by generated composite key
  const keyGroups = {};
  for (const record of nullKeyRecords) {
    const key = generateCompositeKey(record.firstname, record.select_value, record.classname, record.days);
    if (!keyGroups[key]) {
      keyGroups[key] = [];
    }
    keyGroups[key].push(record.id);
  }

  console.log(`Found ${Object.keys(keyGroups).length} unique composite keys among duplicates`);

  // For each group, find the record with latest import_date to keep
  let deleted = 0;
  for (const [key, ids] of Object.entries(keyGroups)) {
    // Get all records with these IDs, ordered by import_date DESC
    const [records] = await conn.execute(`
      SELECT id, import_date
      FROM teacher_payments
      WHERE id IN (${ids.join(',')})
      ORDER BY import_date DESC, id DESC
    `);

    // Keep the first one (latest), delete the rest
    const keepId = records[0].id;
    const deleteIds = records.slice(1).map(r => r.id);

    if (deleteIds.length > 0) {
      // Update the keeper with composite_key
      await conn.execute(
        'UPDATE teacher_payments SET composite_key = ? WHERE id = ?',
        [key, keepId]
      );

      // Delete the duplicates
      await conn.execute(`
        DELETE FROM teacher_payments WHERE id IN (${deleteIds.join(',')})
      `);

      deleted += deleteIds.length;
      if (deleted % 10 === 0) {
        console.log(`  Processed ${deleted} duplicates...`);
      }
    }
  }

  console.log(`✓ Deleted ${deleted} duplicate records`);

  // Verify no NULL composite_keys remain
  const [remaining] = await conn.execute(`
    SELECT COUNT(*) as count FROM teacher_payments WHERE composite_key IS NULL
  `);
  console.log(`Remaining NULL composite_keys: ${remaining[0].count}`);

  await conn.end();
})();
