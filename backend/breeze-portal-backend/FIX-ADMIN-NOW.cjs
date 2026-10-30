// FIX-ADMIN-NOW.cjs - Opret admin user i Railway (hardcoded connection)
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

// Railway connection string (hardcoded)
const DATABASE_URL = 'postgresql://postgres:bWBKtSXRuaoeNzdgKRbZGgWYwFUnTDLg@shortline.proxy.rlwy.net:56745/railway';

console.log('\nðŸ”§ FIX RAILWAY ADMIN USER');
console.log('='.repeat(80));

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixAdmin() {
  try {
    console.log('\n1ï¸âƒ£ Forbinder til Railway PostgreSQL...');
    const client = await pool.connect();
    console.log('   âœ“ Forbundet!');
    
    console.log('\n2ï¸âƒ£ Sletter gammel admin bruger...');
    await client.query("DELETE FROM users WHERE email = 'bjarke.sv@gmail.com'");
    console.log('   âœ“ Gammel bruger slettet');
    
    console.log('\n3ï¸âƒ£ Hasher password (admin123)...');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    console.log('   âœ“ Password hashet');
    
    console.log('\n4ï¸âƒ£ Opretter admin bruger...');
    await client.query(`
      INSERT INTO users (name, email, password, is_admin, is_approved, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, ['Bjarke Svenningsen', 'bjarke.sv@gmail.com', hashedPassword, 1, 1]);
    console.log('   âœ“ Admin bruger oprettet!');
    
    console.log('\n5ï¸âƒ£ Verificerer...');
    const result = await client.query("SELECT id, name, email, is_admin FROM users WHERE email = 'bjarke.sv@gmail.com'");
    if (result.rows.length > 0) {
      console.log('   âœ“ Bruger verificeret:');
      console.log('     Email:', result.rows[0].email);
      console.log('     Admin:', result.rows[0].is_admin);
    }
    
    client.release();
    
    console.log('\n' + '='.repeat(80));
    console.log('âœ… SUCCESS! Admin bruger er nu klar!');
    console.log('='.repeat(80));
    console.log('');
    console.log('Login pÃ¥: https://flowfactory-frontend-20zs.onrender.com');
    console.log('');
    console.log('Email:    bjarke.sv@gmail.com');
    console.log('Password: admin123');
    console.log('');
    
  } catch (error) {
    console.error('\nâŒ FEJL:', error.message);
  } finally {
    await pool.end();
  }
}

fixAdmin();
