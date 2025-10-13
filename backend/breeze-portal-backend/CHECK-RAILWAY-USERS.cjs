// CHECK-RAILWAY-USERS.cjs - Tjek users i Railway database
const dotenv = require('dotenv');
const path = require('path');
const { Pool } = require('pg');

dotenv.config({ path: path.join(__dirname, '.env') });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL mangler i .env');
  process.exit(1);
}

console.log('\n🔍 TJEK RAILWAY USERS TABLE');
console.log('='.repeat(80));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkUsers() {
  try {
    console.log('\n1️⃣ Forbinder til Railway PostgreSQL...');
    const client = await pool.connect();
    console.log('   ✓ Forbundet!');
    
    console.log('\n2️⃣ Henter ALLE brugere fra Railway...');
    const result = await client.query('SELECT id, name, email, role, is_approved, created_at FROM users ORDER BY id');
    
    console.log(`\n   ✓ Fundet ${result.rows.length} brugere:\n`);
    
    if (result.rows.length === 0) {
      console.log('   ⚠️ INGEN BRUGERE I RAILWAY DATABASE!');
      console.log('   Dette er hvorfor login fejler.');
      console.log('\n   Løsning: Kør FIX-RAILWAY-LOGIN.bat');
    } else {
      result.rows.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.name || '(no name)'}`);
        console.log(`      Email:    ${user.email}`);
        console.log(`      Role:     ${user.role}`);
        console.log(`      Approved: ${user.is_approved}`);
        console.log(`      Created:  ${user.created_at}`);
        console.log('');
      });
      
      // Check if bjarke.sv@gmail.com exists
      const bjarkeUser = result.rows.find(u => u.email === 'bjarke.sv@gmail.com');
      if (!bjarkeUser) {
        console.log('   ⚠️ BJARKE.SV@GMAIL.COM FINDES IKKE!');
        console.log('   Løsning: Kør FIX-RAILWAY-LOGIN.bat');
      } else {
        console.log('   ✓ bjarke.sv@gmail.com findes i databasen');
        console.log('   ⚠️ Men password er forkert');
        console.log('   Løsning: Kør FIX-RAILWAY-LOGIN.bat for at opdatere password');
      }
    }
    
    client.release();
    
    console.log('\n' + '='.repeat(80));
    
  } catch (error) {
    console.error('\n❌ FEJL:', error.message);
  } finally {
    await pool.end();
  }
}

checkUsers();
