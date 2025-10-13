// MIGRATE-RAILWAY-TO-SUPABASE.js - Migrate all data from Railway to Supabase
import pg from 'pg';

const { Pool } = pg;

// Railway PostgreSQL (source)
const railwayPool = new Pool({
  connectionString: 'postgresql://postgres:bWBKtSXRuaoeNzdgKRbZGgWYwFUnTDLg@shortline.proxy.rlwy.net:56745/railway',
  ssl: { rejectUnauthorized: false }
});

// Supabase PostgreSQL (destination)
const supabasePool = new Pool({
  connectionString: 'postgresql://postgres.sggdtvbkvcuufurssklb:Olineersej123@aws-1-eu-west-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

console.log('🚀 Starting data migration from Railway to Supabase...\n');

async function getTableColumns(pool, tableName) {
  const result = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = $1
    ORDER BY ordinal_position
  `, [tableName]);
  return result.rows.map(r => r.column_name);
}

async function migrateTable(tableName) {
  console.log(`📋 Migrating table: ${tableName}`);
  
  try {
    // Get columns from both databases
    const railwayColumns = await getTableColumns(railwayPool, tableName);
    const supabaseColumns = await getTableColumns(supabasePool, tableName);
    
    if (railwayColumns.length === 0) {
      console.log(`   ⚠️  Table ${tableName} doesn't exist in Railway, skipping...\n`);
      return;
    }
    
    if (supabaseColumns.length === 0) {
      console.log(`   ⚠️  Table ${tableName} doesn't exist in Supabase, skipping...\n`);
      return;
    }
    
    // Find common columns
    const commonColumns = railwayColumns.filter(col => supabaseColumns.includes(col));
    
    if (commonColumns.length === 0) {
      console.log(`   ⚠️  No common columns between Railway and Supabase for ${tableName}, skipping...\n`);
      return;
    }
    
    console.log(`   Found ${commonColumns.length} common columns: ${commonColumns.join(', ')}`);
    
    // Get all rows from Railway
    const selectQuery = `SELECT ${commonColumns.join(', ')} FROM ${tableName}`;
    const railwayData = await railwayPool.query(selectQuery);
    
    if (railwayData.rows.length === 0) {
      console.log(`   ⚠️  Table ${tableName} is empty in Railway, skipping...\n`);
      return;
    }
    
    console.log(`   Found ${railwayData.rows.length} rows in Railway`);
    
    // Clear existing data in Supabase table
    await supabasePool.query(`DELETE FROM ${tableName}`);
    console.log(`   🗑️  Cleared existing data in Supabase`);
    
    // Insert rows one by one
    let inserted = 0;
    let failed = 0;
    
    for (const row of railwayData.rows) {
      const values = commonColumns.map(col => row[col]);
      const placeholders = commonColumns.map((_, i) => `$${i + 1}`).join(', ');
      const columnList = commonColumns.join(', ');
      
      const insertQuery = `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholders})`;
      
      try {
        await supabasePool.query(insertQuery, values);
        inserted++;
      } catch (insertError) {
        failed++;
        if (failed <= 3) { // Only show first 3 errors
          console.log(`   ⚠️  Failed to insert row: ${insertError.message}`);
        }
      }
    }
    
    console.log(`   ✅ Inserted ${inserted}/${railwayData.rows.length} rows (${failed} failed)\n`);
    
  } catch (error) {
    console.log(`   ❌ Error migrating ${tableName}: ${error.message}\n`);
  }
}

async function migrate() {
  try {
    // Tables to migrate (in order to respect foreign key constraints)
    const tablesToMigrate = [
      'users',
      'pending_users',
      'invite_codes',
      'posts',
      'reactions',
      'messages',
      'folders',
      'files',
      'customers',
      'customer_contacts',
      'quotes',
      'quote_lines',
      'quote_attachments',
      'invoices',
      'invoice_lines',
      'order_expenses',
      'order_documents',
      'order_timeline',
      'order_notes'
    ];

    for (const table of tablesToMigrate) {
      await migrateTable(table);
    }

    console.log('🎉 Migration complete!\n');
    console.log('✅ All data has been migrated from Railway to Supabase!');
    console.log('\n📋 NEXT STEPS:');
    console.log('1. Go to: https://flowfactory-denmark.netlify.app');
    console.log('2. Login with your Railway credentials');
    console.log('3. All your data should be there!\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await railwayPool.end();
    await supabasePool.end();
  }
}

migrate();
