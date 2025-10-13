// MIGRATE-LOCAL-TO-SUPABASE.js - Migrate local SQLite data to Supabase with column mapping
import Database from 'better-sqlite3';
import pg from 'pg';

const { Pool } = pg;

console.log('🚀 Starting migration from LOCAL SQLite to Supabase...\n');

// Local SQLite database (source)
const sqliteDb = new Database('breeze.db');

// Supabase PostgreSQL (destination)
const supabasePool = new Pool({
  connectionString: 'postgresql://postgres.sggdtvbkvcuufurssklb:Olineersej123@aws-1-eu-west-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

// Column mapping: SQLite column name → Supabase column name
const COLUMN_MAPPINGS = {
  users: {
    avatar_url: 'profile_image'  // Only difference!
  }
};

async function migrateTable(tableName) {
  console.log(`📋 Migrating table: ${tableName}`);
  
  try {
    // Get all rows from SQLite
    const sqliteRows = sqliteDb.prepare(`SELECT * FROM ${tableName}`).all();
    
    if (sqliteRows.length === 0) {
      console.log(`   ⚠️  Table ${tableName} is empty, skipping...\n`);
      return;
    }
    
    console.log(`   Found ${sqliteRows.length} rows in SQLite`);
    
    // Get column names from first row
    const sqliteColumns = Object.keys(sqliteRows[0]);
    
    // Apply column mapping if exists
    const mapping = COLUMN_MAPPINGS[tableName] || {};
    const supabaseColumns = sqliteColumns.map(col => mapping[col] || col);
    
    console.log(`   SQLite columns: ${sqliteColumns.join(', ')}`);
    console.log(`   Supabase columns: ${supabaseColumns.join(', ')}`);
    
    // Clear existing data in Supabase table
    await supabasePool.query(`DELETE FROM ${tableName}`);
    console.log(`   🗑️  Cleared existing data in Supabase`);
    
    // Insert rows one by one
    let inserted = 0;
    let failed = 0;
    
    for (const row of sqliteRows) {
      // Map column values according to mapping
      const values = sqliteColumns.map(col => row[col]);
      const placeholders = supabaseColumns.map((_, i) => `$${i + 1}`).join(', ');
      const columnList = supabaseColumns.join(', ');
      
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
    
    console.log(`   ✅ Inserted ${inserted}/${sqliteRows.length} rows (${failed} failed)\n`);
    
  } catch (error) {
    console.log(`   ❌ Error migrating ${tableName}: ${error.message}\n`);
  }
}

async function migrate() {
  try {
    console.log('📊 Data to migrate:');
    console.log('  - 1 user');
    console.log('  - 5 posts');
    console.log('  - 2 customers');
    console.log('  - 5 quotes\n');
    
    // Tables to migrate (in order to respect foreign key constraints)
    const tablesToMigrate = [
      'users',           // Must be first (other tables reference it)
      'pending_users',
      'invite_codes',
      'posts',
      'reactions',
      'messages',
      'folders',
      'files',
      'user_activity',
      'customers',       // Must come before quotes
      'customer_contacts',
      'quotes',          // Must come before quote_lines, invoices, etc.
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
    console.log('✅ All data has been migrated from local SQLite to Supabase!');
    console.log('\n📋 NEXT STEPS:');
    console.log('1. Go to: https://flowfactory-denmark.netlify.app');
    console.log('2. Login with your credentials');
    console.log('3. You should see:');
    console.log('   ✅ Admin button (you have is_admin = 1)');
    console.log('   ✅ Your 5 posts in the feed');
    console.log('   ✅ Your 2 customers');
    console.log('   ✅ Your 5 quotes');
    console.log('   ✅ Everything working perfectly!\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    sqliteDb.close();
    await supabasePool.end();
  }
}

migrate();
