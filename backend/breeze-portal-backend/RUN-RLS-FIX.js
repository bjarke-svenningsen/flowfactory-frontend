// RUN-RLS-FIX.js - Automatic Supabase RLS Fix
// Usage: node RUN-RLS-FIX.js "postgresql://..."

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

async function enableRLS(databaseUrl) {
  console.log('🔧 Connecting to Supabase...');
  
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to database!');

    // Read SQL script
    const sqlScript = fs.readFileSync(path.join(__dirname, 'ENABLE-RLS.sql'), 'utf8');
    
    // Split into individual ALTER TABLE statements
    const statements = sqlScript
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.toUpperCase().includes('ALTER TABLE'));

    console.log(`\n📋 Found ${statements.length} tables to enable RLS on\n`);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Execute each statement
    for (const statement of statements) {
      const match = statement.match(/ALTER TABLE (\w+)/i);
      const tableName = match ? match[1] : 'unknown';
      
      try {
        await pool.query(statement);
        console.log(`✅ ${tableName}`);
        successCount++;
      } catch (error) {
        console.log(`❌ ${tableName} - ${error.message}`);
        errorCount++;
        errors.push({ table: tableName, error: error.message });
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 RESULTAT:');
    console.log('='.repeat(50));
    console.log(`✅ Success: ${successCount} tables`);
    console.log(`❌ Errors: ${errorCount} tables`);
    
    if (errors.length > 0) {
      console.log('\n❌ ERRORS:');
      errors.forEach(e => {
        console.log(`   - ${e.table}: ${e.error}`);
      });
    }

    if (successCount > 0) {
      console.log('\n🎉 RLS enabled on ' + successCount + ' tables!');
      console.log('👉 Check Supabase Dashboard → Advisors → Security warnings should be gone!');
    }

    await pool.end();
    console.log('\n✅ Done!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

// Get DATABASE_URL from command line argument
const databaseUrl = process.argv[2];

if (!databaseUrl) {
  console.error('❌ Missing DATABASE_URL!');
  console.log('\nUsage:');
  console.log('  node RUN-RLS-FIX.js "postgresql://user:pass@host:port/db"');
  console.log('\nOr set environment variable:');
  console.log('  $env:DATABASE_URL="postgresql://..."; node RUN-RLS-FIX.js');
  process.exit(1);
}

if (!databaseUrl.startsWith('postgresql://')) {
  console.error('❌ Invalid DATABASE_URL! Must start with postgresql://');
  process.exit(1);
}

console.log('🚀 Starting Supabase RLS Fix...\n');
enableRLS(databaseUrl);
