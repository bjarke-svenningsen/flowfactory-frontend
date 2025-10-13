// FIX-RAILWAY-LOGIN.cjs - Opret admin user direkte i Railway
const dotenv = require('dotenv');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

dotenv.config({ path: path.join(__dirname, '.env') });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL mangler i .env');
  process.exit(1);
}

console.log('\n🔧 FIX RAILWAY LOGIN');
console.log('='.repeat(80));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixLogin() {
  try {
    console.log('\n1️⃣ Forbinder til Railway PostgreSQL...');
    const client = await pool.connect();
    console.log('   ✓ Forbundet!');
    
    console.log('\n2️⃣ Sletter evt. eksisterende admin bruger...');
    await client.query("DELETE FROM users WHERE email = 'bjarke.sv@gmail.com'");
    console.log('   ✓ Gamle brugere slettet');
    
    console.log('\n3️⃣ Hasher password med bcrypt...');
    const password = 'admin123';
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('   ✓ Password hashet:', hashedPassword.substring(0, 30) + '...');
    
    console.log('\n4️⃣ Opretter ny admin bruger...');
    await client.query(`
      INSERT INTO users (name, email, password, is_admin, is_approved, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, ['Bjarke Svenningsen', 'bjarke.sv@gmail.com', hashedPassword, 1, 1]);
    console.log('   ✓ Admin bruger oprettet!');
    
    console.log('\n5️⃣ Verificerer bruger...');
    const result = await client.query("SELECT id, name, email, is_admin FROM users WHERE email = 'bjarke.sv@gmail.com'");
    if (result.rows.length > 0) {
      console.log('   ✓ Bruger verificeret:');
      console.log('     - ID:', result.rows[0].id);
      console.log('     - Name:', result.rows[0].name);
      console.log('     - Email:', result.rows[0].email);
      console.log('     - Admin:', result.rows[0].is_admin);
    }
    
    client.release();
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ SUCCESS! Admin bruger er klar i Railway!');
    console.log('='.repeat(80));
    console.log('');
    console.log('Login credentials:');
    console.log('  Email:    bjarke.sv@gmail.com');
    console.log('  Password: admin123');
    console.log('');
    console.log('Test nu på: https://flowfactory-denmark.netlify.app');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ FEJL:', error.message);
  } finally {
    await pool.end();
  }
}

fixLogin();
