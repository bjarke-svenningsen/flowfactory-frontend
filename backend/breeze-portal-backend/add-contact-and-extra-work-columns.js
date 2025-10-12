// Migration script to add contact person and extra work columns to quotes table
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'breeze.db');
const db = new Database(dbPath);

console.log('Starting migration: Adding contact_person_id and extra work columns...');

try {
  // Add contact_person_id column to quotes table
  db.exec(`
    ALTER TABLE quotes ADD COLUMN contact_person_id INTEGER;
  `);
  console.log('✅ Added contact_person_id column to quotes table');
} catch (error) {
  if (error.message.includes('duplicate column')) {
    console.log('⚠️  contact_person_id column already exists');
  } else {
    console.error('❌ Error adding contact_person_id:', error.message);
  }
}

try {
  // Add is_extra_work column to quotes table
  db.exec(`
    ALTER TABLE quotes ADD COLUMN is_extra_work INTEGER DEFAULT 0;
  `);
  console.log('✅ Added is_extra_work column to quotes table');
} catch (error) {
  if (error.message.includes('duplicate column')) {
    console.log('⚠️  is_extra_work column already exists');
  } else {
    console.error('❌ Error adding is_extra_work:', error.message);
  }
}

try {
  // Add parent_order_id column to quotes table
  db.exec(`
    ALTER TABLE quotes ADD COLUMN parent_order_id INTEGER;
  `);
  console.log('✅ Added parent_order_id column to quotes table');
} catch (error) {
  if (error.message.includes('duplicate column')) {
    console.log('⚠️  parent_order_id column already exists');
  } else {
    console.error('❌ Error adding parent_order_id:', error.message);
  }
}

try {
  // Add sub_number column to quotes table
  db.exec(`
    ALTER TABLE quotes ADD COLUMN sub_number INTEGER;
  `);
  console.log('✅ Added sub_number column to quotes table');
} catch (error) {
  if (error.message.includes('duplicate column')) {
    console.log('⚠️  sub_number column already exists');
  } else {
    console.error('❌ Error adding sub_number:', error.message);
  }
}

// Verify the changes
const tableInfo = db.prepare('PRAGMA table_info(quotes)').all();
console.log('\n📋 Current quotes table structure:');
tableInfo.forEach(col => {
  console.log(`  - ${col.name} (${col.type})`);
});

db.close();
console.log('\n✅ Migration completed successfully!');
