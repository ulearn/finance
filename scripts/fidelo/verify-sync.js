/**
 * Payment Detail Sync Verification Script
 *
 * Compares CSV import data vs API sync data to ensure consistency
 * Use this after running API sync to verify data integrity
 */

const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function verifySync() {
    console.log('='.repeat(70));
    console.log('PAYMENT DETAIL SYNC VERIFICATION');
    console.log('='.repeat(70));

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306
    });

    console.log('✓ Connected to database\n');

    // 1. Check import sources
    console.log('1. DATA SOURCES');
    console.log('-'.repeat(70));
    try {
        const [sources] = await connection.execute(`
            SELECT
                import_source,
                COUNT(*) as record_count,
                MIN(date) as earliest_date,
                MAX(date) as latest_date
            FROM payment_detail
            WHERE import_source IS NOT NULL
            GROUP BY import_source
        `);

        if (sources.length === 0) {
            console.log('⚠️  No import_source data found - checking api_response_key instead...');

            const [apiCheck] = await connection.execute(`
                SELECT
                    CASE
                        WHEN api_response_key IS NOT NULL THEN 'api'
                        ELSE 'csv'
                    END as source,
                    COUNT(*) as record_count,
                    MIN(date) as earliest_date,
                    MAX(date) as latest_date
                FROM payment_detail
                GROUP BY source
            `);

            apiCheck.forEach(row => {
                console.log(`  ${row.source.toUpperCase()}:`);
                console.log(`    Records: ${row.record_count}`);
                console.log(`    Date range: ${row.earliest_date} to ${row.latest_date}`);
            });
        } else {
            sources.forEach(row => {
                console.log(`  ${row.import_source.toUpperCase()}:`);
                console.log(`    Records: ${row.record_count}`);
                console.log(`    Date range: ${row.earliest_date} to ${row.latest_date}`);
            });
        }
    } catch (e) {
        console.log('⚠️  Could not determine import sources:', e.message);
    }

    // 2. Check critical columns exist
    console.log('\n2. CRITICAL COLUMNS (Required by Dashboard)');
    console.log('-'.repeat(70));
    const requiredColumns = ['date', 'amount', 'course', 'agent', 'type', 'method'];
    const [allColumns] = await connection.execute('SHOW COLUMNS FROM payment_detail');
    const columnNames = allColumns.map(col => col.Field);

    requiredColumns.forEach(col => {
        if (columnNames.includes(col)) {
            console.log(`  ✓ ${col}`);
        } else {
            console.log(`  ✗ ${col} - MISSING!`);
        }
    });

    // 3. Check refund identification
    console.log('\n3. REFUND IDENTIFICATION');
    console.log('-'.repeat(70));

    // Check if type column exists and has 'Refund' values
    if (columnNames.includes('type')) {
        const [refundCheck] = await connection.execute(`
            SELECT
                type,
                COUNT(*) as count,
                SUM(CAST(REPLACE(SUBSTRING(amount, 2), ',', '') AS DECIMAL(10,2))) as total_amount
            FROM payment_detail
            WHERE type IS NOT NULL AND type != ''
            GROUP BY type
            ORDER BY count DESC
            LIMIT 10
        `);

        console.log('  Type field values:');
        refundCheck.forEach(row => {
            const isRefund = row.type.toLowerCase().includes('refund');
            const marker = isRefund ? '🔴' : '  ';
            const amount = row.total_amount ? parseFloat(row.total_amount).toFixed(2) : '0.00';
            console.log(`    ${marker} ${row.type}: ${row.count} records (€${amount})`);
        });

        // Get refund statistics
        const [refundStats] = await connection.execute(`
            SELECT
                COUNT(*) as refund_count,
                SUM(CAST(REPLACE(SUBSTRING(amount, 2), ',', '') AS DECIMAL(10,2))) as refund_total,
                MIN(date) as earliest_refund,
                MAX(date) as latest_refund
            FROM payment_detail
            WHERE type = 'Refund'
        `);

        if (refundStats[0].refund_count > 0) {
            console.log('\n  Refund Summary:');
            console.log(`    Total refunds: ${refundStats[0].refund_count}`);
            const refundTotal = refundStats[0].refund_total ? parseFloat(refundStats[0].refund_total).toFixed(2) : '0.00';
            console.log(`    Total amount: €${refundTotal}`);
            console.log(`    Date range: ${refundStats[0].earliest_refund} to ${refundStats[0].latest_refund}`);
        } else {
            console.log('\n  ⚠️  No records with type="Refund" found!');
        }
    } else {
        console.log('  ✗ "type" column not found - refunds cannot be identified!');
    }

    // 4. Check B2B vs B2C split
    console.log('\n4. B2B vs B2C DISTRIBUTION (Based on agent field)');
    console.log('-'.repeat(70));

    if (columnNames.includes('agent')) {
        const [distribution] = await connection.execute(`
            SELECT
                CASE
                    WHEN agent IS NOT NULL AND agent != '' THEN 'B2B'
                    ELSE 'B2C'
                END as channel,
                COUNT(*) as record_count,
                SUM(CAST(REPLACE(SUBSTRING(amount, 2), ',', '') AS DECIMAL(10,2))) as total_amount
            FROM payment_detail
            GROUP BY channel
        `);

        distribution.forEach(row => {
            console.log(`  ${row.channel}:`);
            console.log(`    Records: ${row.record_count}`);
            const totalAmount = row.total_amount ? parseFloat(row.total_amount).toFixed(2) : '0.00';
            console.log(`    Total: €${totalAmount}`);
        });
    } else {
        console.log('  ⚠️  "agent" column not found - cannot split B2B/B2C');
    }

    // 5. Check TransferMate Escrow
    console.log('\n5. TRANSFERMATE ESCROW (Special handling)');
    console.log('-'.repeat(70));

    if (columnNames.includes('method')) {
        const [escrowCheck] = await connection.execute(`
            SELECT
                COUNT(*) as count,
                SUM(CASE WHEN CAST(REPLACE(SUBSTRING(amount, 2), ',', '') AS DECIMAL(10,2)) > 0 THEN 1 ELSE 0 END) as positive,
                SUM(CASE WHEN CAST(REPLACE(SUBSTRING(amount, 2), ',', '') AS DECIMAL(10,2)) < 0 THEN 1 ELSE 0 END) as negative,
                SUM(CAST(REPLACE(SUBSTRING(amount, 2), ',', '') AS DECIMAL(10,2))) as total
            FROM payment_detail
            WHERE method = 'TransferMate Escrow'
        `);

        if (escrowCheck[0].count > 0) {
            console.log(`  TransferMate Escrow records: ${escrowCheck[0].count}`);
            console.log(`    Incoming (positive): ${escrowCheck[0].positive}`);
            console.log(`    Refunds (negative): ${escrowCheck[0].negative}`);
            const escrowTotal = escrowCheck[0].total ? parseFloat(escrowCheck[0].total).toFixed(2) : '0.00';
            console.log(`    Net total: €${escrowTotal}`);
        } else {
            console.log('  No TransferMate Escrow records found');
        }
    } else {
        console.log('  ⚠️  "method" column not found');
    }

    // 6. Check for data from last night (API sync)
    console.log('\n6. RECENT API SYNC DATA (Last 24 hours)');
    console.log('-'.repeat(70));

    try {
        // Check for records added in last 24 hours
        const [recentData] = await connection.execute(`
            SELECT
                DATE(import_date) as import_date,
                COUNT(*) as records,
                MIN(date) as earliest_payment,
                MAX(date) as latest_payment
            FROM payment_detail
            WHERE import_date >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            GROUP BY DATE(import_date)
            ORDER BY import_date DESC
        `);

        if (recentData.length > 0) {
            console.log('  Recent imports:');
            recentData.forEach(row => {
                console.log(`    ${row.import_date}: ${row.records} records`);
                console.log(`      Payment dates: ${row.earliest_payment} to ${row.latest_payment}`);
            });
        } else {
            console.log('  ℹ️  No records imported in the last 24 hours');
            console.log('  (Note: This might indicate API sync has not run yet,');
            console.log('   or the import_date field is not being set)');
        }
    } catch (e) {
        console.log('  ⚠️  Could not check recent imports:', e.message);
    }

    // 7. Check for duplicate records
    console.log('\n7. DUPLICATE CHECK');
    console.log('-'.repeat(70));

    try {
        // Check if we have composite_key column (from API sync)
        if (columnNames.includes('composite_key')) {
            const [dupCheck] = await connection.execute(`
                SELECT composite_key, COUNT(*) as count
                FROM payment_detail
                WHERE composite_key IS NOT NULL
                GROUP BY composite_key
                HAVING COUNT(*) > 1
                LIMIT 5
            `);

            if (dupCheck.length > 0) {
                console.log('  ⚠️  Found duplicate composite_keys (should not happen):');
                dupCheck.forEach(row => {
                    console.log(`    ${row.composite_key}: ${row.count} times`);
                });
            } else {
                console.log('  ✓ No duplicate composite_keys found');
            }
        } else {
            console.log('  ℹ️  No composite_key column (CSV imports don\'t use this)');
        }

        // Check for potential duplicate receipts/invoices
        const receiptColumn = columnNames.find(col =>
            col.includes('receipt') || col.includes('invoice') || col.includes('reference')
        );

        if (receiptColumn) {
            const [receiptDups] = await connection.execute(`
                SELECT \`${receiptColumn}\`, COUNT(*) as count
                FROM payment_detail
                WHERE \`${receiptColumn}\` IS NOT NULL AND \`${receiptColumn}\` != ''
                GROUP BY \`${receiptColumn}\`
                HAVING COUNT(*) > 1
                LIMIT 5
            `);

            if (receiptDups.length > 0) {
                console.log(`\n  Multiple entries for same ${receiptColumn}:`);
                receiptDups.forEach(row => {
                    console.log(`    ${row[receiptColumn]}: ${row.count} times`);
                });
                console.log('  (This might be OK for partial payments)');
            }
        }
    } catch (e) {
        console.log('  ⚠️  Could not check duplicates:', e.message);
    }

    // 8. Sample data comparison
    console.log('\n8. SAMPLE DATA COMPARISON');
    console.log('-'.repeat(70));

    try {
        // Get one CSV record
        const [csvSample] = await connection.execute(`
            SELECT date, amount, course, agent, type, method
            FROM payment_detail
            WHERE (import_source = 'csv' OR api_response_key IS NULL)
            AND date IS NOT NULL
            LIMIT 1
        `);

        // Get one API record
        const [apiSample] = await connection.execute(`
            SELECT date, amount, course, agent, type, method
            FROM payment_detail
            WHERE api_response_key IS NOT NULL
            AND date IS NOT NULL
            LIMIT 1
        `);

        console.log('  CSV Sample:');
        if (csvSample.length > 0) {
            console.log(`    Date: ${csvSample[0].date}`);
            console.log(`    Amount: ${csvSample[0].amount}`);
            console.log(`    Course: ${csvSample[0].course}`);
            console.log(`    Agent: ${csvSample[0].agent || '(none - B2C)'}`);
            console.log(`    Type: ${csvSample[0].type}`);
            console.log(`    Method: ${csvSample[0].method}`);
        } else {
            console.log('    No CSV records found');
        }

        console.log('\n  API Sample:');
        if (apiSample.length > 0) {
            console.log(`    Date: ${apiSample[0].date}`);
            console.log(`    Amount: ${apiSample[0].amount}`);
            console.log(`    Course: ${apiSample[0].course}`);
            console.log(`    Agent: ${apiSample[0].agent || '(none - B2C)'}`);
            console.log(`    Type: ${apiSample[0].type}`);
            console.log(`    Method: ${apiSample[0].method}`);
        } else {
            console.log('    No API records found');
        }
    } catch (e) {
        console.log('  Could not get samples:', e.message);
    }

    // 9. Final recommendations
    console.log('\n9. RECOMMENDATIONS');
    console.log('-'.repeat(70));

    const issues = [];

    if (!columnNames.includes('type')) {
        issues.push('✗ CRITICAL: "type" column missing - refunds cannot be identified');
    }
    if (!columnNames.includes('date')) {
        issues.push('✗ CRITICAL: "date" column missing - dashboard will fail');
    }
    if (!columnNames.includes('amount')) {
        issues.push('✗ CRITICAL: "amount" column missing - dashboard will fail');
    }
    if (!columnNames.includes('agent')) {
        issues.push('✗ WARNING: "agent" column missing - cannot split B2B/B2C');
    }

    if (issues.length > 0) {
        issues.forEach(issue => console.log(`  ${issue}`));
        console.log('\n  🔧 ACTION REQUIRED: Fix these issues before relying on API sync');
    } else {
        console.log('  ✓ All critical columns present');
        console.log('  ✓ Data structure looks good');
        console.log('  ✓ API sync should work correctly with dashboard');
    }

    console.log('\n' + '='.repeat(70));
    console.log('VERIFICATION COMPLETE');
    console.log('='.repeat(70));

    await connection.end();
}

// Run verification
verifySync()
    .then(() => {
        console.log('\n✓ Verification finished successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n✗ Verification failed:', error.message);
        process.exit(1);
    });
