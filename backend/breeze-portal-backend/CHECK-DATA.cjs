// CHECK-DATA.cjs - Tjek om data er i Railway database
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// Load .env
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

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL mangler');
  process.exit(1);
}

console.log('\n🔍 TJEKKER DATA I RAILWAY DATABASE');
console.log('='.repeat(80));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkData() {
  try {
    const client = await pool.connect();
    console.log('\n✓ Forbundet til Railway!\n');
    
    // Check customers
    const customers = await client.query('SELECT COUNT(*) FROM customers');
    console.log(`📦 Customers: ${customers.rows[0].count}`);
    if (customers.rows[0].count > 0) {
      const sample = await client.query('SELECT id, company_name FROM customers LIMIT 3');
      sample.rows.forEach(c => console.log(`   - ${c.id}: ${c.company_name}`));
    }
    
    // Check quotes
    const quotes = await client.query('SELECT COUNT(*) FROM quotes');
    console.log(`\n📋 Quotes: ${quotes.rows[0].count}`);
    if (quotes.rows[0].count > 0) {
      const sample = await client.query('SELECT id, quote_number, title FROM quotes LIMIT 3');
      sample.rows.forEach(q => console.log(`   - ${q.id}: ${q.quote_number} - ${q.title}`));
    }
    
    // Check invoices
    const invoices = await client.query('SELECT COUNT(*) FROM invoices');
    console.log(`\n💰 Invoices: ${invoices.rows[0].count}`);
    if (invoices.rows[0].count > 0) {
      const sample = await client.query('SELECT id, invoice_number FROM invoices LIMIT 3');
      sample.rows.forEach(i => console.log(`   - ${i.id}: ${i.invoice_number}`));
    }
    
    // Check posts
    const posts = await client.query('SELECT COUNT(*) FROM posts');
    console.log(`\n📝 Posts: ${posts.rows[0].count}`);
    if (posts.rows[0].count > 0) {
      const sample = await client.query('SELECT id, content FROM posts LIMIT 3');
      sample.rows.forEach(p => console.log(`   - ${p.id}: ${p.content.substring(0, 50)}...`));
    }
    
    // Check users
    const users = await client.query('SELECT COUNT(*) FROM users');
    console.log(`\n👤 Users: ${users.rows[0].count}`);
    if (users.rows[0].count > 0) {
      const sample = await client.query('SELECT id, email, name FROM users');
      sample.rows.forEach(u => console.log(`   - ${u.id}: ${u.email} (${u.name})`));
    }
    
    client.release();
    
    console.log('\n' + '='.repeat(80));
    
  } catch (error) {
    console.error('\n❌ FEJL:', error.message);
  } finally {
    await pool.end();
  }
}

checkData();
