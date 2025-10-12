import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const db = new Database('breeze.db');

// Først - lav users tabel hvis den ikke findes
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
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
  );
`);

const hash = bcrypt.hashSync('Olineersej123', 10);

// Slet evt. eksisterende
db.prepare('DELETE FROM users WHERE email = ?').run('bjarke.sv@gmail.com');

// Opret ny
db.prepare(`
  INSERT INTO users (name, email, password_hash, is_admin)
  VALUES (?, ?, ?, 1)
`).run('Bjarke Lüthi Svenningsen', 'bjarke.sv@gmail.com', hash);

console.log('✅ DONE! Log ind nu med:');
console.log('Email: bjarke.sv@gmail.com');
console.log('Password: Olineersej123');

db.close();
