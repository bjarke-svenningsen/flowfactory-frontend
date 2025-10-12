// Check ALL possible database locations
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const locations = [
  '../../breeze.db',  // Root
  'breeze.db',  // Current backend
  'database-backups/backup-temp-backend-2025-10-12.db',  // Backup
  '../../temp-backend/breeze.db'  // Temp backend
];

console.log('\n═══════════════════════════════════════');
console.log('🔍 SØGER EFTER DIT DATA OVERALT');
console.log('═══════════════════════════════════════\n');

for (const loc of locations) {
  const fullPath = path.join(__dirname, loc);
  console.log(`\n📁 ${loc}\n${'='.repeat(60)}`);
  
  try {
    const db = new Database(fullPath, { readonly: true });
    
    // Get table list
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log(`\n📊 Tabeller: ${tables.map(t => t.name).join(', ')}\n`);
    
    // Try to count data
    for (const table of tables) {
      try {
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
        if (count.count > 0) {
          console.log(`✓ ${table.name}: ${count.count}`);
          
          // Show sample data for important tables
          if (['users', 'posts', 'orders', 'customers'].includes(table.name)) {
            const sample = db.prepare(`SELECT * FROM ${table.name} LIMIT 2`).all();
            sample.forEach(row => {
              console.log(`  →`, JSON.stringify(row).substring(0, 100) + '...');
            });
          }
        }
      } catch (e) {
        // Skip
      }
    }
    
    db.close();
  } catch (error) {
    console.log(`❌ Kunne ikke åbne: ${error.message}`);
  }
}

console.log('\n═══════════════════════════════════════\n');
