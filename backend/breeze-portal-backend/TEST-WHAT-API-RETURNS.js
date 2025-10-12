// TEST-WHAT-API-RETURNS.js
// Direct test to see what API endpoints actually return
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'breeze.db');
console.log('\n📊 Testing database at:', DB_PATH);
console.log('=' .repeat(80));

const db = new Database(DB_PATH);

// Test 1: Check customers table
console.log('\n✅ TEST 1: Customers in database');
console.log('-'.repeat(80));
const customers = db.prepare('SELECT * FROM customers').all();
console.log(`Found ${customers.length} customers:`);
customers.forEach(c => {
  console.log(`  - ID: ${c.id}, Name: ${c.company_name}, Number: ${c.customer_number}`);
});

// Test 2: Check posts table
console.log('\n✅ TEST 2: Posts in database');
console.log('-'.repeat(80));
const posts = db.prepare('SELECT * FROM posts').all();
console.log(`Found ${posts.length} posts:`);
posts.forEach(p => {
  console.log(`  - ID: ${p.id}, User: ${p.user_id}, Content: ${p.content.substring(0, 50)}...`);
});

// Test 3: Check quotes table
console.log('\n✅ TEST 3: Quotes in database');
console.log('-'.repeat(80));
const quotes = db.prepare('SELECT * FROM quotes').all();
console.log(`Found ${quotes.length} quotes:`);
quotes.forEach(q => {
  console.log(`  - ID: ${q.id}, Customer: ${q.customer_id}, Title: ${q.title}, Order: ${q.order_number}`);
});

// Test 4: Check invoices table
console.log('\n✅ TEST 4: Invoices in database');
console.log('-'.repeat(80));
const invoices = db.prepare('SELECT * FROM invoices').all();
console.log(`Found ${invoices.length} invoices:`);
invoices.forEach(i => {
  console.log(`  - ID: ${i.id}, Number: ${i.invoice_number}, Order: ${i.order_id}`);
});

// Test 5: Check folders table
console.log('\n✅ TEST 5: Folders in database');
console.log('-'.repeat(80));
const folders = db.prepare('SELECT * FROM folders').all();
console.log(`Found ${folders.length} folders:`);
folders.forEach(f => {
  console.log(`  - ID: ${f.id}, Name: ${f.name}, Parent: ${f.parent_id}`);
});

// Test 6: Check files table
console.log('\n✅ TEST 6: Files in database');
console.log('-'.repeat(80));
const files = db.prepare('SELECT * FROM files').all();
console.log(`Found ${files.length} files:`);
files.forEach(f => {
  console.log(`  - ID: ${f.id}, Name: ${f.original_name}, Folder: ${f.folder_id}`);
});

// Test 7: Check users table
console.log('\n✅ TEST 7: Users in database');
console.log('-'.repeat(80));
const users = db.prepare('SELECT id, name, email, is_admin FROM users').all();
console.log(`Found ${users.length} users:`);
users.forEach(u => {
  console.log(`  - ID: ${u.id}, Name: ${u.name}, Email: ${u.email}, Admin: ${u.is_admin}`);
});

console.log('\n' + '='.repeat(80));
console.log('📊 DATABASE CONTENT SUMMARY');
console.log('='.repeat(80));
console.log(`✓ ${customers.length} customers`);
console.log(`✓ ${posts.length} posts`);
console.log(`✓ ${quotes.length} quotes`);
console.log(`✓ ${invoices.length} invoices`);
console.log(`✓ ${folders.length} folders`);
console.log(`✓ ${files.length} files`);
console.log(`✓ ${users.length} users`);
console.log('='.repeat(80));

db.close();
