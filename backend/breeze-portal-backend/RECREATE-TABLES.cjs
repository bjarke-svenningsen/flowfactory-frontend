// RECREATE-TABLES.cjs
// Drop og genopret tabeller på Railway med korrekt struktur
const path = require('path');
const fs = require('fs');

// Load .env explicitly
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

const { Pool } = require('pg');

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function recreateTables() {
  try {
    console.log('\n🔄 DROPPER OG GENopretter RAILWAY TABELLER');
    console.log('='.repeat(80));
    
    console.log('\n1️⃣ Forbinder til Railway...');
    const client = await pgPool.connect();
    console.log('   ✓ Forbundet!');
    
    console.log('\n2️⃣ Dropper alle tabeller...');
    await client.query('DROP TABLE IF EXISTS invoice_lines CASCADE');
    await client.query('DROP TABLE IF EXISTS invoices CASCADE');
    await client.query('DROP TABLE IF EXISTS quote_attachments CASCADE');
    await client.query('DROP TABLE IF EXISTS quote_lines CASCADE');
    await client.query('DROP TABLE IF EXISTS quotes CASCADE');
    await client.query('DROP TABLE IF EXISTS customers CASCADE');
    await client.query('DROP TABLE IF EXISTS order_expenses CASCADE');
    await client.query('DROP TABLE IF EXISTS order_documents CASCADE');
    await client.query('DROP TABLE IF EXISTS order_timeline CASCADE');
    await client.query('DROP TABLE IF EXISTS order_notes CASCADE');
    await client.query('DROP TABLE IF EXISTS customer_contacts CASCADE');
    await client.query('DROP TABLE IF EXISTS reactions CASCADE');
    await client.query('DROP TABLE IF EXISTS posts CASCADE');
    await client.query('DROP TABLE IF EXISTS messages CASCADE');
    await client.query('DROP TABLE IF EXISTS files CASCADE');
    await client.query('DROP TABLE IF EXISTS folders CASCADE');
    await client.query('DROP TABLE IF EXISTS user_activity CASCADE');
    await client.query('DROP TABLE IF EXISTS pending_users CASCADE');
    await client.query('DROP TABLE IF EXISTS invite_codes CASCADE');
    // Don't drop users table - keep admin user
    console.log('   ✓ Tabeller droppet!');
    
    console.log('\n3️⃣ Genstart Railway backend så den kan oprette tabellerne igen...');
    console.log('   Gå til Railway dashboard og klik "Restart" på backend servicen');
    console.log('   Eller vent et par minutter - Railway genstarter automatisk ved næste request');
    
    client.release();
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ TABELLER DROPPET!');
    console.log('='.repeat(80));
    console.log('');
    console.log('Næste skridt:');
    console.log('  1. Vent 30 sekunder (Railway opretter tabeller ved næste request)');
    console.log('  2. Kør: .\\UPLOAD-DATA-NOW.bat');
    console.log('  3. Refresh websiden og se dit data!');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ FEJL:', error);
    console.error('\nDetaljer:', error.message);
  } finally {
    await pgPool.end();
  }
}

recreateTables();
