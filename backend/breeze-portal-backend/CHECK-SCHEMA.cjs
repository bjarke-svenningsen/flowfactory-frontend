// CHECK-SCHEMA.cjs - Check Railway users table schema
const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:bWBKtSXRuaoeNzdgKRbZGgWYwFUnTDLg@shortline.proxy.rlwy.net:56745/railway';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkSchema() {
  try {
    console.log('\n🔍 TJEKKER RAILWAY USERS TABLE SCHEMA');
    console.log('='.repeat(80));
    
    const client = await pool.connect();
    
    // Get table schema
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position;
    `);
    
    console.log('\nUsers tabel kolonner i Railway:\n');
    result.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(20)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    console.log('\n' + '='.repeat(80));
    
    client.release();
    
  } catch (error) {
    console.error('\n❌ FEJL:', error.message);
  } finally {
    await pool.end();
  }
}

checkSchema();
