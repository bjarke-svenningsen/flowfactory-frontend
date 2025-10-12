// Auto-create admin for Bjarke
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const db = new Database('breeze.db');

const name = 'Bjarke Lüthi Svenningsen';
const email = 'bjarke.sv@gmail.com';
const password = 'Olineersej123';

// Hash password
const password_hash = bcrypt.hashSync(password, 10);

// Check if user exists
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());

if (existing) {
  console.log('✅ Bruger eksisterer allerede!');
  console.log('Email:', email);
  console.log('Du kan logge ind nu!');
} else {
  // Create user
  const info = db.prepare(`
    INSERT INTO users (name, email, password_hash, is_admin)
    VALUES (?, ?, ?, 1)
  `).run(name, email.toLowerCase(), password_hash);
  
  console.log('✅ ADMIN BRUGER OPRETTET!');
  console.log('------------------------');
  console.log('Navn:', name);
  console.log('Email:', email);
  console.log('Password: Olineersej123');
  console.log('------------------------');
  console.log('Gå til https://flowfactory-denmark.netlify.app og log ind!');
}

db.close();
