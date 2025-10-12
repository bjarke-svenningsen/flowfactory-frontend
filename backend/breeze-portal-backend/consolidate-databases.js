// consolidate-databases.js - Merge multiple database files into one
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_LOCATIONS = [
  path.join(__dirname, 'breeze.db'),
  path.join(__dirname, '..', '..', 'breeze.db'),
  path.join(__dirname, '..', '..', 'temp-backend', 'breeze.db')
];

console.log('🔍 Database Consolidation Tool\n');

// Find existing databases
const existingDatabases = DB_LOCATIONS.filter(dbPath => {
  if (fs.existsSync(dbPath)) {
    const stats = fs.statSync(dbPath);
    console.log(`✅ Found database: ${dbPath}`);
    console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`   Modified: ${stats.mtime.toLocaleString('da-DK')}\n`);
    return true;
  }
  return false;
});

if (existingDatabases.length === 0) {
  console.log('❌ No databases found!');
  process.exit(1);
}

if (existingDatabases.length === 1) {
  console.log('✅ Only one database found - no consolidation needed!');
  process.exit(0);
}

// Open all databases and check content
console.log('\n📊 Analyzing database content...\n');

const dbData = existingDatabases.map(dbPath => {
  const db = new Database(dbPath, { readonly: true });
  
  let users = 0, posts = 0, files = 0, orders = 0, customers = 0;
  
  try {
    // Check if tables exist before querying
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map(t => t.name);
    
    if (tableNames.includes('users')) {
      users = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
    }
    if (tableNames.includes('posts')) {
      posts = db.prepare('SELECT COUNT(*) as cnt FROM posts').get().cnt;
    }
    if (tableNames.includes('files')) {
      files = db.prepare('SELECT COUNT(*) as cnt FROM files').get().cnt;
    }
    if (tableNames.includes('quotes')) {
      orders = db.prepare('SELECT COUNT(*) as cnt FROM quotes').get().cnt;
    }
    if (tableNames.includes('customers')) {
      customers = db.prepare('SELECT COUNT(*) as cnt FROM customers').get().cnt;
    }
  } catch (error) {
    console.error(`⚠️  Error reading ${dbPath}:`, error.message);
  }
  
  db.close();
  
  return {
    path: dbPath,
    users,
    posts,
    files,
    orders,
    customers,
    total: users + posts + files + orders + customers,
    isEmpty: users === 0 && posts === 0 && files === 0 && orders === 0 && customers === 0
  };
});

// Display comparison
console.log('Database Comparison:');
console.log('='.repeat(80));
dbData.forEach((data, index) => {
  console.log(`\nDatabase ${index + 1}: ${data.path}`);
  console.log(`  Users: ${data.users}`);
  console.log(`  Posts: ${data.posts}`);
  console.log(`  Files: ${data.files}`);
  console.log(`  Orders: ${data.orders}`);
  console.log(`  Customers: ${data.customers}`);
  console.log(`  Total entries: ${data.total}`);
});
console.log('\n' + '='.repeat(80));

// Find database with most data
const primaryDb = dbData.reduce((max, current) => 
  current.total > max.total ? current : max
);

console.log(`\n✅ Recommended primary database: ${primaryDb.path}`);
console.log(`   (Has most data: ${primaryDb.total} entries)`);

// Backup other databases
const TARGET_DB = path.join(__dirname, 'breeze.db');
const BACKUP_DIR = path.join(__dirname, 'database-backups');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];

console.log('\n📦 Creating backups...\n');

existingDatabases.forEach(dbPath => {
  if (dbPath !== primaryDb.path) {
    const backupName = `backup-${path.basename(path.dirname(dbPath))}-${timestamp}.db`;
    const backupPath = path.join(BACKUP_DIR, backupName);
    
    try {
      fs.copyFileSync(dbPath, backupPath);
      console.log(`✅ Backed up: ${dbPath}`);
      console.log(`   → ${backupPath}`);
    } catch (error) {
      console.error(`❌ Failed to backup ${dbPath}:`, error.message);
    }
  }
});

// Copy primary database to correct location if needed
if (primaryDb.path !== TARGET_DB) {
  console.log(`\n📋 Copying primary database to: ${TARGET_DB}`);
  
  try {
    // Backup existing target if it exists
    if (fs.existsSync(TARGET_DB)) {
      const targetBackup = path.join(BACKUP_DIR, `backup-target-${timestamp}.db`);
      fs.copyFileSync(TARGET_DB, targetBackup);
      console.log(`   Backed up existing target to: ${targetBackup}`);
    }
    
    // Copy primary to target
    fs.copyFileSync(primaryDb.path, TARGET_DB);
    console.log(`✅ Primary database copied successfully!`);
  } catch (error) {
    console.error(`❌ Failed to copy primary database:`, error.message);
    process.exit(1);
  }
}

console.log('\n✅ Database consolidation complete!');
console.log('\n📝 Summary:');
console.log(`   Primary database: ${TARGET_DB}`);
console.log(`   Backups location: ${BACKUP_DIR}`);
console.log(`   Users: ${primaryDb.users}`);
console.log(`   Posts: ${primaryDb.posts}`);
console.log(`   Files: ${primaryDb.files}`);
console.log(`   Orders: ${primaryDb.orders}`);
console.log(`   Customers: ${primaryDb.customers}`);

console.log('\n⚠️  IMPORTANT:');
console.log('   1. Restart your backend server to use the consolidated database');
console.log('   2. Verify all data is accessible');
console.log('   3. Delete backup files once verified');
console.log('   4. Consider deleting old database files from root and temp-backend');
