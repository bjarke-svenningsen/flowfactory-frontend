import Database from 'better-sqlite3';
const db = new Database('breeze.db');

console.log('Creating customer_contacts table...\n');

try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS customer_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      title TEXT,
      email TEXT,
      phone TEXT,
      is_primary INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    )
  `).run();
  
  console.log('✅ customer_contacts table created successfully!');
  
  // Check structure
  const columns = db.prepare("PRAGMA table_info(customer_contacts)").all();
  console.log('\nTable structure:');
  columns.forEach(col => console.log(`  - ${col.name} (${col.type})`));
  
} catch (error) {
  console.error('❌ Error:', error.message);
}

db.close();
