// create-admin-final.js - Opretter admin bruger med correct kolonne navne
import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function createAdmin() {
  console.log('🚀 Opretter admin bruger...\n');

  const email = 'bjarke.sv@gmail.com';
  const password = 'Olineersej123';
  const name = 'Bjarke';

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in .env file!');
    process.exit(1);
  }

  try {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    // First, check table structure
    const tableInfo = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);

    console.log('📊 Users table structure:');
    tableInfo.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });
    console.log('');

    // Check if user exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    
    if (existing.rows.length > 0) {
      console.log('⚠️  Bruger findes allerede!');
      console.log('✅ Du kan logge ind nu!');
    } else {
      const password_hash = bcrypt.hashSync(password, 10);
      
      // Insert with minimal columns that should exist
      await pool.query(`
        INSERT INTO users (name, email, password_hash)
        VALUES ($1, $2, $3)
      `, [name, email.toLowerCase(), password_hash]);
      
      console.log('✅ Admin bruger oprettet!');
    }

    await pool.end();

    console.log('\n═══════════════════════════════════════');
    console.log('🎉 ADMIN BRUGER KLAR!');
    console.log('═══════════════════════════════════════\n');
    console.log('📝 Login oplysninger:');
    console.log(`Email:    ${email}`);
    console.log(`Password: ${password}\n`);
    console.log('🌐 Test login nu:');
    console.log('https://flowfactory-denmark.netlify.app\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Fejl:', error.message);
    console.error('\n💡 Debug info:', error);
    process.exit(1);
  }
}

createAdmin();
