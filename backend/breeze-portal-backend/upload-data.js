// upload-data.js - Upload SQLite data to Railway PostgreSQL
const dotenv = require('dotenv');
const path = require('path');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

// Load .env from backend directory
dotenv.config({ path: path.join(__dirname, '.env') });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL er ikke sat i .env filen!');
  console.error('   .env path:', path.join(__dirname, '.env'));
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
    
    const customers = sqliteDb.prepare('SELECT * FROM customers').all();
    const quotes = sqliteDb.prepare('SELECT * FROM quotes').all();
    const posts = sqliteDb.prepare('SELECT * FROM posts').all();
    const folders = sqliteDb.prepare('SELECT * FROM folders').all();
    const files = sqliteDb.prepare('SELECT * FROM files').all();
    
    console.log(`   ✓ ${customers.length} customers`);
    console.log(`   ✓ ${quotes.length} quotes`);
    console.log(`   ✓ ${posts.length} posts`);
    console.log(`   ✓ ${folders.length} folders`);
    console.log(`   ✓ ${files.length} files`);
    
    console.log('\n2️⃣ Forbinder til Railway PostgreSQL...');
    const client = await pgPool.connect();
    console.log('   ✓ Forbundet til Railway!');
    
    console.log('\n3️⃣ Clearer eksisterende data på Railway (beholder users)...');
    await client.query('DELETE FROM invoice_lines');
    await client.query('DELETE FROM invoices');
    await client.query('DELETE FROM quote_lines');
    await client.query('DELETE FROM quotes');
    await client.query('DELETE FROM customers');
    await client.query('DELETE FROM reactions');
    await client.query('DELETE FROM posts');
    await client.query('DELETE FROM files');
    await client.query('DELETE FROM folders');
    await client.query('DELETE FROM messages');
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
    
    console.log('\n6️⃣ Uploader posts...');
    for (const post of posts) {
      await client.query(`
        INSERT INTO posts (id, user_id, content, created_at)
        VALUES ($1, $2, $3, $4)
      `, [post.id, post.user_id, post.content, post.created_at]);
    }
    console.log(`   ✓ ${posts.length} posts uploaded`);
    
    console.log('\n7️⃣ Uploader folders...');
    for (const folder of folders) {
      await client.query(`
        INSERT INTO folders (id, name, parent_id, created_by, created_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [folder.id, folder.name, folder.parent_id, folder.created_by, folder.created_at]);
    }
    console.log(`   ✓ ${folders.length} folders uploaded`);
    
    console.log('\n8️⃣ Uploader files...');
    for (const file of files) {
      await client.query(`
        INSERT INTO files (id, filename, original_name, file_path, file_size, mime_type, folder_id, uploaded_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [file.id, file.filename, file.original_name, file.file_path, file.file_size, file.mime_type, file.folder_id, file.uploaded_by, file.created_at]);
    }
    console.log(`   ✓ ${files.length} files uploaded`);
    
    client.release();
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ SUCCESS! DATA UPLOADED TIL RAILWAY!');
    console.log('='.repeat(80));
    console.log('');
    console.log('Næste skridt:');
    console.log('  1. Kør: node switch-to-production.js');
    console.log('  2. Git: git add . && git commit -m "Switch to production" && git push');
    console.log('  3. Åbn: https://flowfactory-denmark.netlify.app');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ FEJL:', error);
    console.error('\nDetaljer:', error.message);
  } finally {
    await pgPool.end();
    sqliteDb.close();
  }
}

uploadData();
