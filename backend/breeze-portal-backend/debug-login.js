// DEBUG-LOGIN.js - Find ud af hvorfor login fejler
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

const DATABASE_URL = 'postgresql://postgres:bWBKtSXRuaoeNzdgKRbZGgWYwFUnTDLg@shortline.proxy.rlwy.net:56745/railway';

async function debugLogin() {
  console.log('═══════════════════════════════════════');
  console.log('🔍 DEBUG LOGIN - FIND PROBLEMET');
  console.log('═══════════════════════════════════════\n');

  const testEmail = 'bjarke.sv@gmail.com';
  const testPassword = 'Olineersej123';

  try {
    const pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    console.log('✅ Forbundet til PostgreSQL!\n');

    // Find brugeren
    console.log('📊 Søger efter bruger:', testEmail);
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [testEmail.toLowerCase()]);

    if (result.rows.length === 0) {
      console.log('❌ PROBLEM: Bruger findes IKKE i databasen!');
      console.log('   Email:', testEmail.toLowerCase());
      console.log('\n💡 Vi skal oprette brugeren igen!\n');
      await pool.end();
      process.exit(1);
    }

    const user = result.rows[0];
    
    console.log('✅ Bruger fundet!\n');
    console.log('📋 Bruger data:');
    console.log('   ID:', user.id);
    console.log('   Email:', user.email);
    console.log('   Name:', user.name);
    console.log('   Role:', user.role || 'ikke sat');
    console.log('   Department:', user.department || 'ikke sat');
    console.log('   Is Approved:', user.is_approved);
    console.log('   Created:', user.created_at);
    console.log('');

    // Tjek password kolonne
    console.log('🔐 Password info:');
    if (user.password_hash) {
      console.log('   Kolonnenavn: password_hash');
      console.log('   Hash:', user.password_hash.substring(0, 30) + '...');
    } else if (user.password) {
      console.log('   Kolonnenavn: password');
      console.log('   Hash:', user.password.substring(0, 30) + '...');
    } else {
      console.log('   ❌ PROBLEM: Ingen password kolonne fundet!');
      await pool.end();
      process.exit(1);
    }
    console.log('');

    // Test password
    console.log('🧪 Tester password verification...');
    const storedHash = user.password_hash || user.password;
    const passwordMatch = bcrypt.compareSync(testPassword, storedHash);

    if (passwordMatch) {
      console.log('✅ Password matcher! Hash er korrekt!');
    } else {
      console.log('❌ PROBLEM: Password matcher IKKE!');
      console.log('   Test password:', testPassword);
      console.log('   Stored hash:', storedHash.substring(0, 30) + '...');
      console.log('\n💡 Vi skal opdatere password hashen!');
    }
    console.log('');

    // Tjek is_approved
    if (typeof user.is_approved !== 'undefined') {
      if (user.is_approved === false) {
        console.log('⚠️  PROBLEM: is_approved er FALSE!');
        console.log('   Backend tillader måske ikke login hvis brugeren ikke er godkendt!');
        console.log('\n💡 Vi skal sætte is_approved til TRUE!');
      } else {
        console.log('✅ is_approved er TRUE - det er OK!');
      }
    } else {
      console.log('ℹ️  is_approved kolonne findes ikke - OK');
    }
    console.log('');

    // Sammenligning med backend login flow
    console.log('📊 Backend login flow check:');
    console.log('   1. Find user by email:', result.rows.length > 0 ? '✅' : '❌');
    console.log('   2. Password verification:', passwordMatch ? '✅' : '❌');
    console.log('   3. User approved:', user.is_approved !== false ? '✅' : '❌');
    console.log('');

    // Konklusion
    console.log('═══════════════════════════════════════');
    console.log('📝 KONKLUSION:');
    console.log('═══════════════════════════════════════\n');

    if (result.rows.length === 0) {
      console.log('❌ Bruger findes ikke - opret bruger igen!');
    } else if (!passwordMatch) {
      console.log('❌ Password hash er forkert - opdater password!');
      console.log('\n💡 FIX: Jeg kan lave et script der opdaterer password hashen!');
    } else if (user.is_approved === false) {
      console.log('❌ Bruger er ikke godkendt - sæt is_approved til TRUE!');
      console.log('\n💡 FIX: Jeg kan opdatere is_approved nu!');
    } else {
      console.log('✅ Alt ser korrekt ud i databasen!');
      console.log('\n💡 Problem er måske i backend koden...');
      console.log('   Tjek backend/server.js login endpoint');
    }
    console.log('');

    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ Fejl:', error.message);
    console.error('\nFuld fejl:', error);
    process.exit(1);
  }
}

debugLogin();
