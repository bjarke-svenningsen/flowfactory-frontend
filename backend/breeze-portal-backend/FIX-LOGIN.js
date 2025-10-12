// FIX-LOGIN.js - Godkend brugeren så login virker!
import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = 'postgresql://postgres:bWBKtSXRuaoeNzdgKRbZGgWYwFUnTDLg@shortline.proxy.rlwy.net:56745/railway';

async function fixLogin() {
  console.log('═══════════════════════════════════════');
  console.log('🔧 FIX LOGIN - GODKEND BRUGER');
  console.log('═══════════════════════════════════════\n');

  const email = 'bjarke.sv@gmail.com';

  try {
    const pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    console.log('✅ Forbundet til PostgreSQL!\n');

    // Opdater is_approved til TRUE
    console.log('💾 Opdaterer is_approved til TRUE...');
    await pool.query('UPDATE users SET is_approved = TRUE WHERE email = $1', [email.toLowerCase()]);
    
    console.log('✅ Bruger godkendt!\n');

    // Verificer opdatering
    const result = await pool.query('SELECT email, name, is_approved FROM users WHERE email = $1', [email.toLowerCase()]);
    
    if (result.rows.length > 0) {
      const user = result.rows[0];
      console.log('📋 Opdateret bruger:');
      console.log('   Email:', user.email);
      console.log('   Name:', user.name);
      console.log('   Is Approved:', user.is_approved);
      console.log('');
    }

    await pool.end();

    console.log('═══════════════════════════════════════');
    console.log('🎉 KLAR! LOGIN SKULLE VIRKE NU!');
    console.log('═══════════════════════════════════════\n');
    
    console.log('🌐 TEST LOGIN NU:');
    console.log('   URL:      https://flowfactory-denmark.netlify.app');
    console.log('   Email:    bjarke.sv@gmail.com');
    console.log('   Password: Olineersej123\n');

    console.log('═══════════════════════════════════════\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Fejl:', error.message);
    process.exit(1);
  }
}

fixLogin();
