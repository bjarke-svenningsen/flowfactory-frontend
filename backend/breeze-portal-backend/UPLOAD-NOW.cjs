// UPLOAD-NOW.cjs
// Upload lokale SQLite data til Railway PostgreSQL
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

const Database = require('better-sqlite3');
const { Pool } = require('pg');

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.length < 10) {
  console.error('❌ DATABASE_URL er ikke sat korrekt!');
  console.error('   DATABASE_URL:', process.env.DATABASE_URL);
  process.exit(1);
}

console.log('\n🚀 UPLOADER DATA TIL RAILWAY');
console.log('='.repeat(80));
console.log('DATABASE_URL:', process.env.DATABASE_URL.substring(0, 50) + '...');

const sqliteDb = new Database(path.join(__dirname, 'breeze.db'));
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function uploadData() {
  try {
    console.log('\n1️⃣ Henter data fra lokal SQLite database...');
    
    // Get all data from SQLite
    const customers = sqliteDb.prepare('SELECT * FROM customers').all();
    const quotes = sqliteDb.prepare('SELECT * FROM quotes').all();
    const quote_lines = sqliteDb.prepare('SELECT * FROM quote_lines').all();
    const invoices = sqliteDb.prepare('SELECT * FROM invoices').all();
    const invoice_lines = sqliteDb.prepare('SELECT * FROM invoice_lines').all();
    const users = sqliteDb.prepare('SELECT * FROM users').all();
    const posts = sqliteDb.prepare('SELECT * FROM posts').all();
    
    console.log(`   ✓ ${customers.length} customers`);
    console.log(`   ✓ ${quotes.length} quotes`);
    console.log(`   ✓ ${quote_lines.length} quote_lines`);
    console.log(`   ✓ ${invoices.length} invoices`);
    console.log(`   ✓ ${invoice_lines.length} invoice_lines`);
    console.log(`   ✓ ${users.length} users`);
    console.log(`   ✓ ${posts.length} posts`);
    
    console.log('\n2️⃣ Forbinder til Railway PostgreSQL...');
    const client = await pgPool.connect();
    console.log('   ✓ Forbundet til Railway!');
    
    console.log('\n3️⃣ Clearer eksisterende data på Railway...');
    await client.query('DELETE FROM reactions');
    await client.query('DELETE FROM posts');
    await client.query('DELETE FROM invoice_lines');
    await client.query('DELETE FROM invoices');
    await client.query('DELETE FROM quote_lines');
    await client.query('DELETE FROM quotes');
    await client.query('DELETE FROM customers');
    await client.query('DELETE FROM users');
    console.log('   ✓ Eksisterende data clearet');
    
    console.log('\n4️⃣ Uploader customers...');
    for (const customer of customers) {
      await client.query(`
        INSERT INTO customers (id, customer_number, company_name, contact_person, att_person, email, phone, address, postal_code, city, cvr_number, created_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [customer.id, customer.customer_number, customer.company_name, customer.contact_person, customer.att_person, customer.email, customer.phone, customer.address, customer.postal_code, customer.city, customer.cvr_number, customer.created_by, customer.created_at]);
    }
    console.log(`   ✓ ${customers.length} customers uploaded`);
    
    console.log('\n5️⃣ Uploader quotes...');
    for (const quote of quotes) {
      await client.query(`
        INSERT INTO quotes (id, quote_number, order_number, parent_order_id, sub_number, is_extra_work, customer_id, contact_person_id, title, requisition_number, date, valid_until, status, notes, terms, subtotal, vat_rate, vat_amount, total, created_by, created_at, sent_at, accepted_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      `, [quote.id, quote.quote_number, quote.order_number, quote.parent_order_id, quote.sub_number, quote.is_extra_work, quote.customer_id, quote.contact_person_id, quote.title, quote.requisition_number, quote.date, quote.valid_until, quote.status, quote.notes, quote.terms, quote.subtotal, quote.vat_rate, quote.vat_amount, quote.total, quote.created_by, quote.created_at, quote.sent_at, quote.accepted_at]);
    }
    console.log(`   ✓ ${quotes.length} quotes uploaded`);
    
    console.log('\n6️⃣ Uploader quote_lines...');
    for (const line of quote_lines) {
      await client.query(`
        INSERT INTO quote_lines (id, quote_id, description, quantity, unit, unit_price, discount_percent, discount_amount, line_total, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [line.id, line.quote_id, line.description, line.quantity, line.unit, line.unit_price, line.discount_percent, line.discount_amount, line.line_total, line.sort_order]);
    }
    console.log(`   ✓ ${quote_lines.length} quote_lines uploaded`);
    
    console.log('\n7️⃣ Uploader invoices...');
    for (const invoice of invoices) {
      await client.query(`
        INSERT INTO invoices (id, invoice_number, order_id, full_order_number, invoice_date, due_date, payment_terms, subtotal, vat_rate, vat_amount, total, notes, status, created_by, created_at, sent_at, paid_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      `, [invoice.id, invoice.invoice_number, invoice.order_id, invoice.full_order_number, invoice.invoice_date, invoice.due_date, invoice.payment_terms, invoice.subtotal, invoice.vat_rate, invoice.vat_amount, invoice.total, invoice.notes, invoice.status, invoice.created_by, invoice.created_at, invoice.sent_at, invoice.paid_at]);
    }
    console.log(`   ✓ ${invoices.length} invoices uploaded`);
    
    console.log('\n8️⃣ Uploader invoice_lines...');
    for (const line of invoice_lines) {
      await client.query(`
        INSERT INTO invoice_lines (id, invoice_id, description, quantity, unit, unit_price, discount_percent, discount_amount, line_total, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [line.id, line.invoice_id, line.description, line.quantity, line.unit, line.unit_price, line.discount_percent, line.discount_amount, line.line_total, line.sort_order]);
    }
    console.log(`   ✓ ${invoice_lines.length} invoice_lines uploaded`);
    
    console.log('\n9️⃣ Uploader users...');
    for (const user of users) {
      await client.query(`
        INSERT INTO users (id, email, password, name, role, department, phone, profile_image, is_approved, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [user.id, user.email, user.password_hash || user.password, user.name, user.is_admin ? 'admin' : 'user', user.department, user.phone, user.profile_image, user.is_approved, user.created_at]);
    }
    console.log(`   ✓ ${users.length} users uploaded`);
    
    console.log('\n🔟 Uploader posts...');
    for (const post of posts) {
      await client.query(`
        INSERT INTO posts (id, user_id, content, created_at)
        VALUES ($1, $2, $3, $4)
      `, [post.id, post.user_id, post.content, post.created_at]);
    }
    console.log(`   ✓ ${posts.length} posts uploaded`);
    
    client.release();
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ SUCCESS! DATA UPLOADED TIL RAILWAY!');
    console.log('='.repeat(80));
    console.log('');
    console.log('Refresh nu websiden på: https://flowfactory-denmark.netlify.app');
    console.log('Du skulle nu se alle dine kunder, tilbud, ordre og opslag!');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ FEJL:', error);
    console.error('\nDetaljer:', error.message);
    console.error('\nStack:', error.stack);
  } finally {
    await pgPool.end();
    sqliteDb.close();
  }
}

uploadData();
