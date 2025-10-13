// FIX-ADMIN-FINAL.cjs - Opret admin med KORREKT schema (role kolonne)
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:bWBKtSXRuaoeNzdgKRbZGgWYwFUnTDLg@shortline.proxy.rlwy.net:56745/railway';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixAdmin() {
  try {
    console.log('\n🔧 FIX RAILWAY ADMIN (MED ROLE KOLONNE)');
    console.log('='.repeat(80));
    
    const client = await pool.connect();
    console.log('\n1️⃣ Forbundet til Railway!');
    
    console.log('\n2️⃣ Sletter gammel admin...');
    await client.query("DELETE FROM users WHERE email = 'bjarke.sv@gmail.com'");
    console.log('   ✓ Slettet');
    
    console.log('\n3️⃣ Hasher password...');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    console.log('   ✓ Password hashet');
    
    console.log('\n4️⃣ Opretter admin bruger (med role="admin")...');
    await client.query(`
      INSERT INTO users (email, password, name, role, is_approved, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, ['bjarke.sv@gmail.com', hashedPassword, 'Bjarke Svenningsen', 'admin', true]);
    console.log('   ✓ Admin bruger oprettet!');
    
    console.log('\n5️⃣ Verificerer...');
    const result = await client.query("SELECT id, email, role FROM users WHERE email = 'bjarke.sv@gmail.com'");
    if (result.rows.length > 0) {
      console.log('   ✓ Bruger verificeret:');
      console.log('     Email:', result.rows[0].email);
      console.log('     Role:', result.rows[0].role);
    }
    
    client.release();
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ SUCCESS! Admin bruger er KLAR!');
    console.log('='.repeat(80));
    console.log('');
    console.log('Login på: https://flowfactory-denmark.netlify.app');
    console.log('');
    console.log('Email:    bjarke.sv@gmail.com');
    console.log('Password: admin123');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ FEJL:', error.message);
  } finally {
    await pool.end();
  }
}

fixAdmin();
