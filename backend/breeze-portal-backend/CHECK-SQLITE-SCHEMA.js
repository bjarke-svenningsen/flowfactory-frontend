// CHECK-SQLITE-SCHEMA.js - Check local SQLite database schema
import Database from 'better-sqlite3';

const db = new Database('breeze.db');

console.log('📋 Tables in local SQLite:');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
tables.forEach(t => console.log('  -', t.name));

console.log('\n📋 Users table structure:');
const userCols = db.prepare('PRAGMA table_info(users)').all();
userCols.forEach(c => console.log(`  - ${c.name} (${c.type})`));

console.log('\n🔍 Sample user data:');
const users = db.prepare('SELECT * FROM users LIMIT 1').all();
if (users.length > 0) {
  console.log('Columns in actual data:', Object.keys(users[0]));
}

console.log('\n📊 Data counts:');
const counts = {
  users: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
  posts: db.prepare('SELECT COUNT(*) as count FROM posts').get().count,
  customers: db.prepare('SELECT COUNT(*) as count FROM customers').get().count,
  quotes: db.prepare('SELECT COUNT(*) as count FROM quotes').get().count,
  messages: db.prepare('SELECT COUNT(*) as count FROM messages').get().count,
};
console.log(counts);

db.close();
