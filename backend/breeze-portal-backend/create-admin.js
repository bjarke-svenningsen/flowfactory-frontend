// create-admin.js - Script til at oprette første admin bruger
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function createAdmin() {
  console.log('\n🔐 Opret Admin Bruger til FlowFactory Portal\n');
  console.log('═'.repeat(50));
  
  const name = await question('Fulde navn: ');
  const email = await question('Email: ');
  const password = await question('Adgangskode: ');
  const confirmPassword = await question('Bekræft adgangskode: ');
  
  if (password !== confirmPassword) {
    console.log('\n❌ Adgangskoderne matcher ikke!');
    rl.close();
    return;
  }
  
  if (password.length < 6) {
    console.log('\n❌ Adgangskoden skal være mindst 6 tegn!');
    rl.close();
    return;
  }
  
  const db = new Database('breeze.db');
  
  // Check if admin already exists
  const existingAdmin = db.prepare('SELECT * FROM users WHERE is_admin = 1').get();
  if (existingAdmin) {
    console.log('\n⚠️  En admin bruger eksisterer allerede!');
    const proceed = await question('Vil du oprette en ny admin alligevel? (ja/nej): ');
    if (proceed.toLowerCase() !== 'ja') {
      console.log('\nAfbrudt.');
      rl.close();
      db.close();
      return;
    }
  }
  
  // Check if email exists
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    console.log('\n❌ Denne email er allerede i brug!');
    rl.close();
    db.close();
    return;
  }
  
  try {
    const password_hash = bcrypt.hashSync(password, 10);
    
    const info = db.prepare(`
      INSERT INTO users (name, email, password_hash, is_admin, position, department)
      VALUES (?, ?, ?, 1, 'Administrator', 'Ledelsen')
    `).run(name, email.toLowerCase(), password_hash);
    
    console.log('\n✅ Admin bruger oprettet succesfuldt!');
    console.log('═'.repeat(50));
    console.log(`\nBruger ID: ${info.lastInsertRowid}`);
    console.log(`Navn: ${name}`);
    console.log(`Email: ${email}`);
    console.log(`Admin: Ja`);
    console.log('\nDu kan nu logge ind på portalen med disse oplysninger.');
    console.log('\n💡 Tip: Generer invite-koder fra admin panelet for at invitere andre brugere.');
    
  } catch (error) {
    console.log('\n❌ Fejl ved oprettelse af admin:', error.message);
  }
  
  db.close();
  rl.close();
}

createAdmin();
