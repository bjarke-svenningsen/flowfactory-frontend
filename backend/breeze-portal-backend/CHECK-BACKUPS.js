// Check backup databases to find real data
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backups = [
  'breeze.db',
  'database-backups/backup-temp-backend-2025-10-12.db',
  'database-backups/backup-Virksomhedsportal-2025-10-12.db'
];

console.log('\n═══════════════════════════════════════');
console.log('🔍 TJEKKER ALLE DATABASER FOR DIT DATA');
console.log('═══════════════════════════════════════\n');

for (const dbPath of backups) {
  const fullPath = path.join(__dirname, dbPath);
  console.log(`\n📁 ${dbPath}\n${'='.repeat(60)}`);
  
  try {
    const db = new Database(fullPath, { readonly: true });
    
    const users = db.prepare('SELECT COUNT(*) as count FROM users').get();
    const posts = db.prepare('SELECT COUNT(*) as count FROM posts').get();
    const files = db.prepare('SELECT COUNT(*) as count FROM files').get();
    const orders = db.prepare('SELECT COUNT(*) as count FROM orders').get();
    const customers = db.prepare('SELECT COUNT(*) as count FROM customers').get();
    
    console.log(`Users: ${users.count}`);
    console.log(`Posts: ${posts.count}`);
    console.log(`Files: ${files.count}`);
    console.log(`Orders: ${orders.count}`);
    console.log(`Customers: ${customers.count}`);
    console.log(`\n📊 Total entries: ${users.count + posts.count + files.count + orders.count + customers.count}`);
    
    // Show actual user details
    if (users.count > 0) {
      console.log('\n👤 Brugere:');
      const userList = db.prepare('SELECT id, name, email FROM users').all();
      userList.forEach(u => {
        console.log(`   - ${u.name} (${u.email})`);
      });
    }
    
    // Show posts
    if (posts.count > 0) {
      console.log('\n📝 Posts:');
      const postList = db.prepare('SELECT id, content, created_at FROM posts LIMIT 5').all();
      postList.forEach(p => {
        const preview = p.content.substring(0, 50);
        console.log(`   - Post ${p.id}: ${preview}...`);
      });
      if (posts.count > 5) {
        console.log(`   ... og ${posts.count - 5} flere`);
      }
    }
    
    // Show orders
    if (orders.count > 0) {
      console.log('\n📦 Ordrer:');
      const orderList = db.prepare('SELECT id, customer_name, total_amount, created_at FROM orders LIMIT 5').all();
      orderList.forEach(o => {
        console.log(`   - Ordre ${o.id}: ${o.customer_name} - ${o.total_amount} kr`);
      });
      if (orders.count > 5) {
        console.log(`   ... og ${orders.count - 5} flere`);
      }
    }
    
    db.close();
  } catch (error) {
    console.log(`❌ Kunne ikke læse: ${error.message}`);
  }
}

console.log('\n═══════════════════════════════════════\n');
