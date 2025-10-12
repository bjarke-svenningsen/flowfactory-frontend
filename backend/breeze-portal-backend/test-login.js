import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const db = new Database('breeze.db');

console.log('=== CHECKING DATABASE ===\n');

// Check users table
try {
  const users = db.prepare('SELECT id, name, email, is_admin FROM users').all();
  console.log('Users in database:', users.length);
  users.forEach(u => {
    console.log(`  - ${u.name} (${u.email}) ${u.is_admin ? '[ADMIN]' : ''}`);
  });
  console.log('');
  
  // Test login
  const testEmail = 'bjarke.sv@gmail.com';
  const testPassword = 'Olineersej123';
  
  console.log('=== TESTING LOGIN ===');
  console.log('Email:', testEmail);
  console.log('Password:', testPassword);
  console.log('');
  
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(testEmail.toLowerCase());
  
  if (!user) {
    console.log('❌ USER NOT FOUND IN DATABASE!');
    console.log('Creating user now...\n');
    
    const hash = bcrypt.hashSync(testPassword, 10);
    db.prepare(`
      INSERT INTO users (name, email, password_hash, is_admin)
      VALUES (?, ?, ?, 1)
    `).run('Bjarke Lüthi Svenningsen', testEmail.toLowerCase(), hash);
    
    console.log('✅ USER CREATED!');
  } else {
    console.log('✅ User found!');
    const passwordMatch = bcrypt.compareSync(testPassword, user.password_hash);
    
    if (passwordMatch) {
      console.log('✅ PASSWORD CORRECT!');
      console.log('\n🎉 LOGIN SHOULD WORK!');
    } else {
      console.log('❌ PASSWORD WRONG!');
      console.log('Fixing password...\n');
      
      const hash = bcrypt.hashSync(testPassword, 10);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
      
      console.log('✅ PASSWORD FIXED!');
    }
  }
  
} catch (error) {
  console.log('❌ ERROR:', error.message);
}

db.close();
console.log('\n=== DONE ===');
console.log('Restart backend now!');
