// OPRET-ADMIN-SQLITE.js - Opret admin bruger i SQLite database
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('═══════════════════════════════════════');
console.log('🔧 OPRET ADMIN I SQLITE DATABASE');
console.log('═══════════════════════════════════════\n');

const email = 'bjarke.sv@gmail.com';
const password = 'Olineersej123';
const name = 'Bjarke';

try {
  // Connect to SQLite database
  const dbPath = path.join(__dirname, 'breeze.db');
  console.log('📊 Database path:', dbPath);
  
  const db = new Database(dbPath);
  console.log('✅ Forbundet til SQLite database!\n');
  
  // Check if user already exists
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  
  if (existing) {
    console.log('⚠️  Bruger findes allerede!');
    console.log('   Email:', existing.email);
    console.log('   Name:', existing.name);
    console.log('   Is Admin:', existing.is_admin);
    console.log('   Created:', existing.created_at);
    
    // Make sure user is admin
    if (existing.is_admin === 0) {
      console.log('\n💾 Opdaterer til admin...');
      db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(existing.id);
      console.log('✅ Bruger opdateret til admin!');
    } else {
      console.log('\n✅ Bruger er allerede admin!');
    }
    
  } else {
    console.log('💾 Opretter ny admin bruger...');
    
    const password_hash = bcrypt.hashSync(password, 10);
    
    const info = db.prepare(`
      INSERT INTO users (name, email, password_hash, position, department, phone, avatar_url, is_admin)
      VALUES (?, ?, ?, 'CEO', '', '', '', 1)
    `).run(name, email.toLowerCase(), password_hash);
    
    console.log('✅ Admin bruger oprettet!');
    console.log('   User ID:', info.lastInsertRowid);
  }
  
  // Verify user exists and get details
  const user = db.prepare('SELECT id, name, email, is_admin, created_at FROM users WHERE email = ?')
    .get(email.toLowerCase());
  
  console.log('\n📋 Bruger i SQLite database:');
  console.log('   ID:', user.id);
  console.log('   Name:', user.name);
  console.log('   Email:', user.email);
  console.log('   Is Admin:', user.is_admin);
  console.log('   Created:', user.created_at);
  
  db.close();
  
  console.log('\n═══════════════════════════════════════');
  console.log('🎉 KLAR! LOGIN SKULLE VIRKE NU!');
  console.log('═══════════════════════════════════════\n');
  
  console.log('🌐 TEST LOGIN NU:');
  console.log('   URL:      https://flowfactory-denmark.netlify.app');
  console.log('   Email:    bjarke.sv@gmail.com');
  console.log('   Password: Olineersej123\n');
  
  console.log('═══════════════════════════════════════\n');
  
} catch (error) {
  console.error('❌ Fejl:', error.message);
  console.error('\nFuld fejl:', error);
  process.exit(1);
}
