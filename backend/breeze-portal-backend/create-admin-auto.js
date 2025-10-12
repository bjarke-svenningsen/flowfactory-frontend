// create-admin-auto.js - Opretter admin bruger automatisk
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

    // Check if user exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    
    if (existing.rows.length > 0) {
      console.log('⚠️  Bruger findes allerede - opdaterer til admin...');
      await pool.query('UPDATE users SET is_admin = 1 WHERE email = $1', [email.toLowerCase()]);
      console.log('✅ Bruger opdateret til admin!');
    } else {
      const password_hash = bcrypt.hashSync(password, 10);
      
      // Try different column names for compatibility
      try {
        await pool.query(`
          INSERT INTO users (name, email, password_hash, is_admin)
          VALUES ($1, $2, $3, 1)
        `, [name, email.toLowerCase(), password_hash]);
      } catch (err) {
        // If password_hash doesn't exist, try password
        if (err.message.includes('password_hash')) {
          await pool.query(`
            INSERT INTO users (name, email, password, is_admin)
            VALUES ($1, $2, $3, 1)
          `, [name, email.toLowerCase(), password_hash]);
        } else {
          throw err;
        }
      }
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
    process.exit(1);
  }
}

createAdmin();
