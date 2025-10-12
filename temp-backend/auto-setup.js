// auto-setup.js - Automatisk setup af admin bruger
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'fs';

console.log('\n🔧 Automatisk Setup af FlowFactory Portal\n');
console.log('═'.repeat(50));

// Slet gammel database hvis den findes
const dbPath = './breeze.db';
if (fs.existsSync(dbPath)) {
  console.log('🗑️  Sletter gammel database...');
  try {
    fs.unlinkSync(dbPath);
    console.log('✅ Gammel database slettet');
  } catch (err) {
    console.log('⚠️  Kunne ikke slette database - den er måske i brug');
    console.log('   Stop backend serveren først og prøv igen');
    process.exit(1);
  }
}

// Opret ny database
console.log('📊 Opretter ny database...');
const db = new Database('breeze.db');
db.pragma('journal_mode = WAL');

// Opret tabeller
console.log('🔨 Opretter tabeller...');

db.prepare(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  position TEXT DEFAULT '',
  department TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  is_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS invite_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  created_by INTEGER NOT NULL,
  used_by INTEGER DEFAULT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(created_by) REFERENCES users(id),
  FOREIGN KEY(used_by) REFERENCES users(id)
);`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS pending_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  position TEXT DEFAULT '',
  department TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  type TEXT DEFAULT 'like',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(post_id, user_id),
  FOREIGN KEY(post_id) REFERENCES posts(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  recipient_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(sender_id) REFERENCES users(id),
  FOREIGN KEY(recipient_id) REFERENCES users(id)
);`).run();

console.log('✅ Alle tabeller oprettet');

// Opret admin bruger
console.log('\n👤 Opretter admin bruger...');
const adminData = {
  name: 'Bjarke Lüthi Svenningsen',
  email: 'bjarke.sv@gmail.com',
  password: 'Olineersej123'
};

const password_hash = bcrypt.hashSync(adminData.password, 10);

const info = db.prepare(`
  INSERT INTO users (name, email, password_hash, is_admin, position, department)
  VALUES (?, ?, ?, 1, 'Administrator', 'Ledelsen')
`).run(adminData.name, adminData.email.toLowerCase(), password_hash);

console.log('\n✅ Admin bruger oprettet succesfuldt!');
console.log('═'.repeat(50));
console.log(`\nBruger ID: ${info.lastInsertRowid}`);
console.log(`Navn: ${adminData.name}`);
console.log(`Email: ${adminData.email}`);
console.log(`Adgangskode: ${adminData.password}`);
console.log(`Admin: Ja`);
console.log('\n🎉 Setup komplet! Du kan nu logge ind på portalen.');
console.log('\n📝 Login oplysninger:');
console.log(`   Email: ${adminData.email}`);
console.log(`   Adgangskode: ${adminData.password}`);
console.log('\n🌐 Gå til http://localhost:8000 og log ind!\n');

db.close();
