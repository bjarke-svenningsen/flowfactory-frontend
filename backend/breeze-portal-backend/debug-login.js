import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const db = new Database('breeze.db');

console.log('=== DEBUG LOGIN ===\n');

const testEmail = 'bjarke.sv@gmail.com';
const testPassword = 'Olineersej123';

console.log('Looking for email:', testEmail);
console.log('With email.toLowerCase():', testEmail.toLowerCase());
console.log('');

// Test 1: Find user
const user = db.prepare('SELECT * FROM users WHERE email = ?').get(testEmail.toLowerCase());

if (!user) {
  console.log('❌ USER NOT FOUND!');
  console.log('Let me check all users:');
  const allUsers = db.prepare('SELECT id, name, email FROM users').all();
  console.log(allUsers);
} else {
  console.log('✅ User found!');
  console.log('ID:', user.id);
  console.log('Name:', user.name);
  console.log('Email:', user.email);
  console.log('Hash:', user.password_hash.substring(0, 30) + '...');
  console.log('');
  
  // Test 2: Check password
  console.log('Testing password:', testPassword);
  const match = bcrypt.compareSync(testPassword, user.password_hash);
  console.log('Password match:', match);
  
  if (!match) {
    console.log('');
    console.log('❌ PASSWORD DOES NOT MATCH!');
    console.log('Creating new hash...');
    
    const newHash = bcrypt.hashSync(testPassword, 10);
    console.log('New hash:', newHash.substring(0, 30) + '...');
    
    // Test new hash
    const newMatch = bcrypt.compareSync(testPassword, newHash);
    console.log('New hash match:', newMatch);
    
    console.log('');
    console.log('Updating database...');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);
    console.log('✅ Password updated!');
  } else {
    console.log('✅ PASSWORD MATCHES!');
  }
}

db.close();
console.log('\n=== DONE ===');
