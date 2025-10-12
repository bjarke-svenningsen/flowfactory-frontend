// quick-setup-railway.js - Setup Railway PostgreSQL fra din computer
// Kør dette script lokalt for at oprette database og admin bruger

import pg from 'pg';
import bcrypt from 'bcryptjs';
import readline from 'readline';

const { Pool } = pg;

// Farver til terminal output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

async function setupDatabase() {
  console.log(`\n${colors.blue}🚀 Railway PostgreSQL Setup${colors.reset}\n`);

  // Prompt for DATABASE_URL
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query) => new Promise((resolve) => rl.question(query, resolve));

  console.log(`${colors.yellow}📝 Først skal vi have din DATABASE_URL fra Railway:${colors.reset}\n`);
  console.log(`1. Gå til railway.app`);
  console.log(`2. Klik på dit backend projekt`);
  console.log(`3. Klik på PostgreSQL servicen (ikke backend)`);
  console.log(`4. Gå til "Variables" tab`);
  console.log(`5. Find DATABASE_URL og kopiér hele værdien\n`);

  const DATABASE_URL = await question(`${colors.blue}DATABASE_URL:${colors.reset} `);

  if (!DATABASE_URL || !DATABASE_URL.trim() || !DATABASE_URL.includes('postgres')) {
    console.log(`\n${colors.red}❌ Ugyldig DATABASE_URL!${colors.reset}`);
    rl.close();
    process.exit(1);
  }

  console.log(`\n${colors.yellow}👤 Nu skal vi oprette din admin bruger:${colors.reset}\n`);

  const email = await question(`Email (default: bjarke.sv@gmail.com): `) || 'bjarke.sv@gmail.com';
  const password = await question(`Password (default: Olineersej123): `) || 'Olineersej123';
  const name = await question(`Navn (default: Bjarke): `) || 'Bjarke';

  rl.close();

  console.log(`\n${colors.blue}🔄 Forbinder til PostgreSQL...${colors.reset}`);

  try {
    const pool = new Pool({
      connectionString: DATABASE_URL.trim(),
      ssl: { rejectUnauthorized: false }
    });

    // Test connection
    await pool.query('SELECT NOW()');
    console.log(`${colors.green}✅ Forbindelse etableret!${colors.reset}\n`);

    // Create tables
    console.log(`${colors.blue}📊 Opretter database tabeller...${colors.reset}`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        position TEXT DEFAULT '',
        department TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        avatar_url TEXT DEFAULT '',
        is_admin INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log(`${colors.green}✅ Users table${colors.reset}`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER REFERENCES users(id),
        recipient_id INTEGER REFERENCES users(id),
        text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log(`${colors.green}✅ Messages table${colors.reset}`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log(`${colors.green}✅ Posts table${colors.reset}`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS reactions (
        id SERIAL PRIMARY KEY,
        post_id INTEGER REFERENCES posts(id),
        user_id INTEGER REFERENCES users(id),
        type TEXT DEFAULT 'like',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(post_id, user_id)
      )
    `);
    console.log(`${colors.green}✅ Reactions table${colors.reset}`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS files (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT,
        folder_id INTEGER DEFAULT NULL,
        uploaded_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log(`${colors.green}✅ Files table${colors.reset}`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS folders (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id INTEGER REFERENCES folders(id),
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log(`${colors.green}✅ Folders table${colors.reset}`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        customer_number TEXT UNIQUE,
        company_name TEXT NOT NULL,
        contact_person TEXT,
        att_person TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        postal_code TEXT,
        city TEXT,
        cvr_number TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log(`${colors.green}✅ Customers table${colors.reset}`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS quotes (
        id SERIAL PRIMARY KEY,
        quote_number TEXT,
        order_number TEXT NOT NULL,
        parent_order_id INTEGER REFERENCES quotes(id),
        sub_number INTEGER DEFAULT NULL,
        is_extra_work INTEGER DEFAULT 0,
        customer_id INTEGER REFERENCES customers(id),
        contact_person_id INTEGER,
        title TEXT NOT NULL,
        requisition_number TEXT,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        valid_until TEXT,
        status TEXT DEFAULT 'draft',
        notes TEXT,
        terms TEXT,
        subtotal REAL DEFAULT 0,
        vat_rate REAL DEFAULT 25,
        vat_amount REAL DEFAULT 0,
        total REAL DEFAULT 0,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP,
        accepted_at TIMESTAMP
      )
    `);
    console.log(`${colors.green}✅ Quotes/Orders table${colors.reset}`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS quote_lines (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER REFERENCES quotes(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT NOT NULL,
        unit_price REAL NOT NULL,
        discount_percent REAL DEFAULT 0,
        discount_amount REAL DEFAULT 0,
        line_total REAL NOT NULL,
        sort_order INTEGER DEFAULT 0
      )
    `);
    console.log(`${colors.green}✅ Quote lines table${colors.reset}`);

    console.log(`\n${colors.green}🎉 Alle tabeller oprettet!${colors.reset}\n`);

    // Create admin user
    console.log(`${colors.blue}👤 Opretter admin bruger...${colors.reset}`);

    // Check if user exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    
    if (existing.rows.length > 0) {
      console.log(`${colors.yellow}⚠️  Bruger findes allerede - opdaterer til admin...${colors.reset}`);
      await pool.query('UPDATE users SET is_admin = 1 WHERE email = $1', [email.toLowerCase()]);
    } else {
      const password_hash = bcrypt.hashSync(password, 10);
      await pool.query(`
        INSERT INTO users (name, email, password_hash, is_admin)
        VALUES ($1, $2, $3, 1)
      `, [name, email.toLowerCase(), password_hash]);
    }

    console.log(`${colors.green}✅ Admin bruger oprettet!${colors.reset}\n`);

    await pool.end();

    console.log(`${colors.green}═══════════════════════════════════════${colors.reset}`);
    console.log(`${colors.green}🎉 SETUP KOMPLET!${colors.reset}`);
    console.log(`${colors.green}═══════════════════════════════════════${colors.reset}\n`);

    console.log(`${colors.blue}📝 Login oplysninger:${colors.reset}`);
    console.log(`Email:    ${colors.yellow}${email}${colors.reset}`);
    console.log(`Password: ${colors.yellow}${password}${colors.reset}\n`);

    console.log(`${colors.blue}🌐 Test login nu:${colors.reset}`);
    console.log(`${colors.yellow}https://flowfactory-denmark.netlify.app${colors.reset}\n`);

    process.exit(0);

  } catch (error) {
    console.error(`\n${colors.red}❌ Fejl:${colors.reset}`, error.message);
    process.exit(1);
  }
}

setupDatabase();
