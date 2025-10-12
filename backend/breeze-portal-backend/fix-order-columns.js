import Database from 'better-sqlite3';
const db = new Database('breeze.db');

console.log('Checking quotes table structure...\n');

// Check current structure
const columns = db.prepare("PRAGMA table_info(quotes)").all();
console.log('Current quotes table columns:');
columns.forEach(col => console.log(`  - ${col.name} (${col.type})`));

// Check if order_number exists
const hasOrderNumber = columns.some(col => col.name === 'order_number');
console.log('\nHas order_number column:', hasOrderNumber);

if (!hasOrderNumber) {
  console.log('\nAdding order_number column...');
  try {
    // Add missing columns
    db.prepare('ALTER TABLE quotes ADD COLUMN order_number TEXT').run();
    console.log('✓ Added order_number');
    
    // Update existing quotes to have order numbers
    const quotes = db.prepare('SELECT id FROM quotes WHERE order_number IS NULL ORDER BY id').all();
    quotes.forEach((quote, index) => {
      const orderNum = String(index + 1).padStart(4, '0');
      db.prepare('UPDATE quotes SET order_number = ? WHERE id = ?').run(orderNum, quote.id);
    });
    console.log(`✓ Updated ${quotes.length} quotes with order numbers`);
    
  } catch (error) {
    console.error('ERROR:', error.message);
  }
} else {
  console.log('\n✓ order_number column already exists');
}

// Check other required columns
const requiredCols = ['parent_order_id', 'sub_number', 'is_extra_work'];
requiredCols.forEach(colName => {
  const exists = columns.some(col => col.name === colName);
  if (!exists) {
    console.log(`\nAdding ${colName} column...`);
    try {
      if (colName === 'parent_order_id' || colName === 'sub_number') {
        db.prepare(`ALTER TABLE quotes ADD COLUMN ${colName} INTEGER`).run();
      } else {
        db.prepare(`ALTER TABLE quotes ADD COLUMN ${colName} INTEGER DEFAULT 0`).run();
      }
      console.log(`✓ Added ${colName}`);
    } catch (error) {
      console.error(`ERROR adding ${colName}:`, error.message);
    }
  }
});

console.log('\n✅ Database structure updated!');
db.close();
