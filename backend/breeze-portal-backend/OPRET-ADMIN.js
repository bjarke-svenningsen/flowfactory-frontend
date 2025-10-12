// OPRET-ADMIN.js - Smart script der automatisk finder de rigtige kolonner
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

// HARDCODED DATABASE_URL - så det ALTID virker
const DATABASE_URL = 'postgresql://postgres:bWBKtSXRuaoeNzdgKRbZGgWYwFUnTDLg@shortline.proxy.rlwy.net:56745/railway';

async function createAdmin() {
  console.log('═══════════════════════════════════════');
  console.log('🚀 OPRET ADMIN BRUGER - SMART SCRIPT');
  console.log('═══════════════════════════════════════\n');

  const email = 'bjarke.sv@gmail.com';
  const password = 'Olineersej123';
  const name = 'Bjarke';

  try {
    const pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    console.log('✅ Forbundet til Railway PostgreSQL!\n');

    // Tjek tabel struktur
    console.log('📊 Tjekker users tabel struktur...\n');
    
    const tableInfo = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);

    console.log('Kolonner i users tabel:');
    const columns = {};
    tableInfo.rows.forEach(col => {
      columns[col.column_name] = col.data_type;
      console.log(`  ✓ ${col.column_name} (${col.data_type})`);
    });
    console.log('');

    // Tjek om bruger allerede eksisterer
    const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    
    if (existing.rows.length > 0) {
      console.log('⚠️  Bruger findes allerede!');
      console.log('Email:', existing.rows[0].email);
      console.log('\n✅ Du kan logge ind nu!\n');
      await pool.end();
      
      console.log('═══════════════════════════════════════');
      console.log('🌐 TEST LOGIN NU:');
      console.log('═══════════════════════════════════════');
      console.log('URL:      https://flowfactory-denmark.netlify.app');
      console.log('Email:    bjarke.sv@gmail.com');
      console.log('Password: Olineersej123\n');
      
      process.exit(0);
    }

    // Hash password
    const password_hash = bcrypt.hashSync(password, 10);
    console.log('🔐 Password hash genereret...\n');

    // Byg INSERT query dynamisk baseret på eksisterende kolonner
    let insertColumns = ['email'];
    let insertValues = [email.toLowerCase()];
    let paramCount = 1;

    // Tilføj kolonner hvis de eksisterer
    if (columns['name']) {
      insertColumns.push('name');
      insertValues.push(name);
      paramCount++;
    }

    if (columns['password_hash']) {
      insertColumns.push('password_hash');
      insertValues.push(password_hash);
      paramCount++;
    } else if (columns['password']) {
      insertColumns.push('password');
      insertValues.push(password_hash);
      paramCount++;
    }

    if (columns['is_admin']) {
      insertColumns.push('is_admin');
      insertValues.push(1);
      paramCount++;
    }

    if (columns['position']) {
      insertColumns.push('position');
      insertValues.push('CEO');
      paramCount++;
    }

    if (columns['department']) {
      insertColumns.push('department');
      insertValues.push('');
      paramCount++;
    }

    if (columns['phone']) {
      insertColumns.push('phone');
      insertValues.push('');
      paramCount++;
    }

    if (columns['avatar_url']) {
      insertColumns.push('avatar_url');
      insertValues.push('');
      paramCount++;
    }

    // Byg SQL query
    const placeholders = insertValues.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO users (${insertColumns.join(', ')}) VALUES (${placeholders})`;

    console.log('💾 Opretter admin bruger...');
    console.log('   Kolonner:', insertColumns.join(', '));
    console.log('');

    await pool.query(sql, insertValues);

    console.log('✅ Admin bruger oprettet!\n');

    await pool.end();

    console.log('═══════════════════════════════════════');
    console.log('🎉 SUCCESS! ADMIN BRUGER KLAR!');
    console.log('═══════════════════════════════════════\n');
    
    console.log('📝 Login oplysninger:');
    console.log('   Email:    bjarke.sv@gmail.com');
    console.log('   Password: Olineersej123\n');
    
    console.log('🌐 GÅ TIL PORTALEN OG LOG IND:');
    console.log('   https://flowfactory-denmark.netlify.app\n');

    console.log('═══════════════════════════════════════\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ FEJL:', error.message);
    console.error('\n💡 Fuld fejl info:', error);
    process.exit(1);
  }
}

createAdmin();
