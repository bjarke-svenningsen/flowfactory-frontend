// Test what data the API actually returns
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'breeze.db');

console.log('\n═══════════════════════════════════════');
console.log('🧪 TEST: Hvad returnerer API\'en?');
console.log('═══════════════════════════════════════\n');

console.log('📂 Database fil:', dbPath);
console.log('');

try {
  const db = new Database(dbPath);
  
  // Test customers endpoint data
  console.log('👥 KUNDER (som API vil returnere):\n');
  const customers = db.prepare(`
    SELECT id, company_name, contact_person, email, phone 
    FROM customers 
    ORDER BY id
  `).all();
  
  customers.forEach(c => {
    console.log(`${c.id}. ${c.company_name}`);
    console.log(`   Kontakt: ${c.contact_person}`);
    console.log(`   Email: ${c.email || 'Ingen'}`);
    console.log(`   Tlf: ${c.phone || 'Ingen'}\n`);
  });
  
  // Test quotes endpoint data
  console.log('📄 TILBUD (som API vil returnere):\n');
  const quotes = db.prepare(`
    SELECT id, title, customer_id, status, total_price
    FROM quotes
    ORDER BY id
  `).all();
  
  quotes.forEach(q => {
    console.log(`${q.id}. ${q.title || 'Tilbud #' + q.id}`);
    console.log(`   Kunde ID: ${q.customer_id}`);
    console.log(`   Status: ${q.status}`);
    console.log(`   Pris: ${q.total_price} kr\n`);
  });
  
  // Test posts endpoint data
  console.log('📝 POSTS (som API vil returnere):\n');
  const posts = db.prepare(`
    SELECT id, user_id, content, created_at
    FROM posts
    ORDER BY id DESC
    LIMIT 5
  `).all();
  
  posts.forEach(p => {
    const preview = p.content.substring(0, 60);
    console.log(`Post ${p.id}: ${preview}...`);
  });
  
  db.close();
  
  console.log('\n═══════════════════════════════════════');
  console.log('✅ Dette er hvad API\'en SKAL vise dig!');
  console.log('═══════════════════════════════════════\n');
  console.log('Hvis du IKKE ser dette i portalen:');
  console.log('1. Clear browser cache (Ctrl+Shift+Delete)');
  console.log('2. Luk og genstart backend');
  console.log('3. Hard refresh i browser (Ctrl+F5)\n');
  
} catch (error) {
  console.error('❌ Fejl:', error.message);
}
