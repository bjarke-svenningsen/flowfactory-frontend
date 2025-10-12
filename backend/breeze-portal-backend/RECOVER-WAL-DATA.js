// Recover data from WAL file by checkpointing
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\n═══════════════════════════════════════');
console.log('🔄 RECOVER DATA FRA WAL FIL');
console.log('═══════════════════════════════════════\n');

const dbPath = path.join(__dirname, 'breeze.db');

try {
  // Open database
  const db = new Database(dbPath);
  
  console.log('📊 Før WAL checkpoint:\n');
  
  // Check current data
  try {
    const users = db.prepare('SELECT COUNT(*) as count FROM users').get();
    const posts = db.prepare('SELECT COUNT(*) as count FROM posts').get();
    const orders = db.prepare('SELECT COUNT(*) as count FROM orders').get();
    const customers = db.prepare('SELECT COUNT(*) as count FROM customers').get();
    const files = db.prepare('SELECT COUNT(*) as count FROM files').get();
    
    console.log(`Users: ${users.count}`);
    console.log(`Posts: ${posts.count}`);
    console.log(`Orders: ${orders.count}`);
    console.log(`Customers: ${customers.count}`);
    console.log(`Files: ${files.count}`);
  } catch (e) {
    console.log('❌ Kunne ikke læse data:', e.message);
  }
  
  console.log('\n🔄 Udfører WAL checkpoint...\n');
  
  // Checkpoint WAL file - this writes all data from WAL to main database
  db.pragma('wal_checkpoint(TRUNCATE)');
  
  console.log('✅ WAL checkpoint udført!\n');
  console.log('📊 Efter WAL checkpoint:\n');
  
  // Check data again
  try {
    const users = db.prepare('SELECT COUNT(*) as count FROM users').get();
    const posts = db.prepare('SELECT COUNT(*) as count FROM posts').get();
    const orders = db.prepare('SELECT COUNT(*) as count FROM orders').get();
    const customers = db.prepare('SELECT COUNT(*) as count FROM customers').get();
    const files = db.prepare('SELECT COUNT(*) as count FROM files').get();
    
    console.log(`Users: ${users.count}`);
    console.log(`Posts: ${posts.count}`);
    console.log(`Orders: ${orders.count}`);
    console.log(`Customers: ${customers.count}`);
    console.log(`Files: ${files.count}`);
    
    // Show users
    if (users.count > 0) {
      console.log('\n👤 Brugere:');
      const userList = db.prepare('SELECT id, name, email FROM users').all();
      userList.forEach(u => {
        console.log(`   - ${u.name} (${u.email})`);
      });
    }
    
    // Show orders
    if (orders.count > 0) {
      console.log('\n📦 Ordrer:');
      const orderList = db.prepare('SELECT id, customer_name, total_amount FROM orders LIMIT 10').all();
      orderList.forEach(o => {
        console.log(`   - Ordre ${o.id}: ${o.customer_name}`);
      });
    }
    
  } catch (e) {
    console.log('❌ Kunne ikke læse data:', e.message);
  }
  
  db.close();
  
  console.log('\n═══════════════════════════════════════');
  console.log('✅ KLAR!');
  console.log('═══════════════════════════════════════\n');
  console.log('Genstart backend nu og se om dit data er der!\n');
  
} catch (error) {
  console.error('❌ Fejl:', error.message);
  console.error(error);
}
