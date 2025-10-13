// CREATE-ALL-TABLES.cjs
// Opret alle tabeller direkte i Railway PostgreSQL
const path = require('path');
const fs = require('fs');

// Load .env explicitly
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

const { Pool } = require('pg');

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function createAllTables() {
  try {
    console.log('\n🔧 OPRETTER ALLE TABELLER I RAILWAY');
    console.log('='.repeat(80));
    
    console.log('\n1️⃣ Forbinder til Railway...');
    const client = await pgPool.connect();
    console.log('   ✓ Forbundet!');
    
    console.log('\n2️⃣ Opretter customers tabel...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        customer_number VARCHAR(50) UNIQUE NOT NULL,
        company_name VARCHAR(255) NOT NULL,
        contact_person VARCHAR(255),
        att_person VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        postal_code VARCHAR(20),
        city VARCHAR(100),
        cvr_number VARCHAR(50),
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ customers');
    
    console.log('\n3️⃣ Opretter quotes tabel...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS quotes (
        id SERIAL PRIMARY KEY,
        quote_number VARCHAR(50) UNIQUE NOT NULL,
        order_number VARCHAR(50),
        parent_order_id INTEGER,
        sub_number INTEGER DEFAULT 0,
        is_extra_work BOOLEAN DEFAULT FALSE,
        customer_id INTEGER,
        contact_person_id INTEGER,
        title VARCHAR(255),
        requisition_number VARCHAR(100),
        date DATE,
        valid_until DATE,
        status VARCHAR(50) DEFAULT 'draft',
        notes TEXT,
        terms TEXT,
        subtotal DECIMAL(15,2) DEFAULT 0,
        vat_rate DECIMAL(5,2) DEFAULT 25,
        vat_amount DECIMAL(15,2) DEFAULT 0,
        total DECIMAL(15,2) DEFAULT 0,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP,
        accepted_at TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      )
    `);
    console.log('   ✓ quotes');
    
    console.log('\n4️⃣ Opretter quote_lines tabel...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_lines (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER NOT NULL,
        description TEXT NOT NULL,
        quantity DECIMAL(10,2) DEFAULT 1,
        unit VARCHAR(50) DEFAULT 'stk',
        unit_price DECIMAL(15,2) DEFAULT 0,
        discount_percent DECIMAL(5,2) DEFAULT 0,
        discount_amount DECIMAL(15,2) DEFAULT 0,
        line_total DECIMAL(15,2) DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE
      )
    `);
    console.log('   ✓ quote_lines');
    
    console.log('\n5️⃣ Opretter invoices tabel...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        invoice_number VARCHAR(50) UNIQUE NOT NULL,
        order_id INTEGER,
        full_order_number VARCHAR(100),
        invoice_date DATE,
        due_date DATE,
        payment_terms VARCHAR(100),
        subtotal DECIMAL(15,2) DEFAULT 0,
        vat_rate DECIMAL(5,2) DEFAULT 25,
        vat_amount DECIMAL(15,2) DEFAULT 0,
        total DECIMAL(15,2) DEFAULT 0,
        notes TEXT,
        status VARCHAR(50) DEFAULT 'draft',
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP,
        paid_at TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES quotes(id) ON DELETE SET NULL
      )
    `);
    console.log('   ✓ invoices');
    
    console.log('\n6️⃣ Opretter invoice_lines tabel...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoice_lines (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER NOT NULL,
        description TEXT NOT NULL,
        quantity DECIMAL(10,2) DEFAULT 1,
        unit VARCHAR(50) DEFAULT 'stk',
        unit_price DECIMAL(15,2) DEFAULT 0,
        discount_percent DECIMAL(5,2) DEFAULT 0,
        discount_amount DECIMAL(15,2) DEFAULT 0,
        line_total DECIMAL(15,2) DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
      )
    `);
    console.log('   ✓ invoice_lines');
    
    console.log('\n7️⃣ Opretter posts tabel...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('   ✓ posts');
    
    console.log('\n8️⃣ Opretter reactions tabel...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS reactions (
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        reaction_type VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(post_id, user_id, reaction_type)
      )
    `);
    console.log('   ✓ reactions');
    
    client.release();
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ ALLE TABELLER OPRETTET!');
    console.log('='.repeat(80));
    console.log('');
    console.log('Nu kan du køre: .\\UPLOAD-DATA-NOW.bat');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ FEJL:', error);
    console.error('\nDetaljer:', error.message);
  } finally {
    await pgPool.end();
  }
}

createAllTables();
