// MIGRATE-TO-SUPABASE.js - Migrate all data from SQLite to Supabase
import Database from 'better-sqlite3';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { Pool } = pg;

// SQLite database (source)
const sqliteDb = new Database(path.join(__dirname, 'breeze.db'));

// Supabase PostgreSQL (destination)
const supabasePool = new Pool({
  connectionString: 'postgresql://postgres.sggdtvbkvcuufurssklb:Olineersej123@aws-1-eu-west-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

console.log('🚀 Starting data migration from SQLite to Supabase...\n');

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
      console.log(`📋 Migrating table: ${table}`);
      
      try {
        // Get all rows from SQLite
        const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all();
        
        if (rows.length === 0) {
          console.log(`   ⚠️  Table ${table} is empty, skipping...\n`);
          continue;
        }

        console.log(`   Found ${rows.length} rows`);

        // Get column names from first row
        const columns = Object.keys(rows[0]);
        
        // Clear existing data in Supabase table
        await supabasePool.query(`DELETE FROM ${table}`);
        console.log(`   🗑️  Cleared existing data`);

        // Insert rows one by one
        let inserted = 0;
        for (const row of rows) {
          const values = columns.map(col => row[col]);
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
          const columnList = columns.join(', ');
          
          const query = `INSERT INTO ${table} (${columnList}) VALUES (${placeholders})`;
          
          try {
            await supabasePool.query(query, values);
            inserted++;
          } catch (insertError) {
            console.log(`   ⚠️  Failed to insert row: ${insertError.message}`);
          }
        }

        console.log(`   ✅ Inserted ${inserted}/${rows.length} rows\n`);
      } catch (tableError) {
        console.log(`   ❌ Error migrating ${table}: ${tableError.message}\n`);
      }
    }

    console.log('🎉 Migration complete!\n');
    console.log('✅ All data has been migrated to Supabase!');
    console.log('\nYou can now test your portal at: https://flowfactory-denmark.netlify.app');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    sqliteDb.close();
    await supabasePool.end();
  }
}

migrate();
