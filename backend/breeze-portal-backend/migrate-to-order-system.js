// migrate-to-order-system.js
// Migration script to update existing quotes database to new order management system

import Database from 'better-sqlite3';

const db = new Database('breeze.db');

console.log('🔄 Starting database migration...\n');

try {
  // Check if migration is needed
  const tableInfo = db.pragma('table_info(quotes)');
  const hasOrderNumber = tableInfo.some(col => col.name === 'order_number');
  
  if (hasOrderNumber) {
    console.log('✅ Database already migrated. Skipping...');
    process.exit(0);
  }
  
  console.log('📋 Step 1: Adding new columns to quotes table...');
  
  // Add new columns to quotes table
  db.exec(`
    ALTER TABLE quotes ADD COLUMN order_number TEXT;
    ALTER TABLE quotes ADD COLUMN parent_order_id INTEGER DEFAULT NULL;
    ALTER TABLE quotes ADD COLUMN sub_number INTEGER DEFAULT NULL;
    ALTER TABLE quotes ADD COLUMN is_extra_work INTEGER DEFAULT 0;
  `);
  
  console.log('✅ New columns added\n');
  
  console.log('📋 Step 2: Migrating existing quote numbers to order numbers...');
  
  // Get all existing quotes
  const quotes = db.prepare('SELECT * FROM quotes WHERE quote_number IS NOT NULL').all();
  
  let orderCounter = 1;
  for (const quote of quotes) {
    const orderNumber = String(orderCounter).padStart(4, '0');
    db.prepare('UPDATE quotes SET order_number = ? WHERE id = ?').run(orderNumber, quote.id);
    console.log(`  Migrated quote ${quote.id}: ${quote.quote_number} → Order ${orderNumber}`);
    orderCounter++;
  }
  
  console.log(`✅ Migrated ${quotes.length} quotes\n`);
  
  console.log('📋 Step 3: Creating invoices table...');
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      order_id INTEGER NOT NULL,
      full_order_number TEXT NOT NULL,
      invoice_date TEXT DEFAULT (datetime('now')),
      due_date TEXT,
      payment_terms TEXT DEFAULT 'Netto 14 dage',
      subtotal REAL DEFAULT 0,
      vat_rate REAL DEFAULT 25,
      vat_amount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      notes TEXT,
      status TEXT DEFAULT 'draft',
      created_by INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      sent_at TEXT,
      paid_at TEXT,
      FOREIGN KEY(order_id) REFERENCES quotes(id),
      FOREIGN KEY(created_by) REFERENCES users(id)
    );
  `);
  
  console.log('✅ Invoices table created\n');
  
  console.log('📋 Step 4: Creating invoice_lines table...');
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      unit_price REAL NOT NULL,
      discount_percent REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      line_total REAL NOT NULL,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );
  `);
  
  console.log('✅ Invoice lines table created\n');
  
  console.log('📋 Step 5: Removing old quote_number column...');
  
  // SQLite doesn't support DROP COLUMN, so we keep it for now
  // It will be ignored by the new system
  console.log('ℹ️  Old quote_number column kept for reference (not used by new system)\n');
  
  console.log('✅ Migration completed successfully!\n');
  console.log('📊 Summary:');
  console.log(`   - ${quotes.length} quotes migrated to new order system`);
  console.log('   - Order numbers start from 0001');
  console.log('   - Invoice numbers will start from 5000');
  console.log('   - Ekstraarbejde system ready (format: 0001-01, 0001-02, etc.)');
  console.log('\n🎉 Database is ready for the new order management system!');
  
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  console.error(error);
  process.exit(1);
} finally {
  db.close();
}
