// Download data from PostgreSQL (Railway) to local SQLite
import pg from 'pg';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

// PostgreSQL connection (Railway)
const DATABASE_URL = 'postgresql://postgres:bWBKtSXRuaoeNzdgKRbZGgWYwFUnTDLg@shortline.proxy.rlwy.net:56745/railway';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Local SQLite database
const DB_PATH = path.join(__dirname, 'breeze.db');
const sqliteDb = new Database(DB_PATH);

console.log('\n═══════════════════════════════════════');
console.log('📥 DOWNLOAD DATA FRA RAILWAY → SQLite');
console.log('═══════════════════════════════════════\n');

async function downloadData() {
  try {
    // 1. Get all data from PostgreSQL
    console.log('📊 Henter data fra Railway PostgreSQL...\n');
    
    const usersResult = await pool.query('SELECT * FROM users');
    const postsResult = await pool.query('SELECT * FROM posts ORDER BY id');
    const filesResult = await pool.query('SELECT * FROM files ORDER BY id');
    const ordersResult = await pool.query('SELECT * FROM orders ORDER BY id');
    const customersResult = await pool.query('SELECT * FROM customers ORDER BY id');
    
    console.log(`✓ Users: ${usersResult.rows.length}`);
    console.log(`✓ Posts: ${postsResult.rows.length}`);
    console.log(`✓ Files: ${filesResult.rows.length}`);
    console.log(`✓ Orders: ${ordersResult.rows.length}`);
    console.log(`✓ Customers: ${customersResult.rows.length}`);
    console.log('');
    
    // 2. Clear local SQLite tables (disable foreign keys first)
    console.log('🗑️  Sletter gammelt dummy data fra SQLite...\n');
    
    sqliteDb.exec('PRAGMA foreign_keys = OFF');
    sqliteDb.exec('DELETE FROM users');
    sqliteDb.exec('DELETE FROM posts');
    sqliteDb.exec('DELETE FROM files');
    sqliteDb.exec('DELETE FROM orders');
    sqliteDb.exec('DELETE FROM customers');
    sqliteDb.exec('PRAGMA foreign_keys = ON');
    
    console.log('✓ Gammelt data slettet\n');
    
    // 3. Insert users
    if (usersResult.rows.length > 0) {
      console.log('👤 Indsætter brugere...');
      const insertUser = sqliteDb.prepare(`
        INSERT INTO users (id, name, email, password_hash, position, department, phone, avatar_url, is_admin, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      for (const user of usersResult.rows) {
        insertUser.run(
          user.id,
          user.name,
          user.email,
          user.password,  // PostgreSQL column is "password", SQLite is "password_hash"
          user.role || 'Medarbejder',
          user.department || '',
          user.phone || '',
          user.profile_image || '',
          1,  // is_admin
          user.created_at || new Date().toISOString()
        );
      }
      console.log(`✓ ${usersResult.rows.length} brugere indsat\n`);
    }
    
    // 4. Insert posts
    if (postsResult.rows.length > 0) {
      console.log('📝 Indsætter posts...');
      const insertPost = sqliteDb.prepare(`
        INSERT INTO posts (id, user_id, content, created_at)
        VALUES (?, ?, ?, ?)
      `);
      
      for (const post of postsResult.rows) {
        insertPost.run(
          post.id,
          post.user_id,
          post.content,
          post.created_at || new Date().toISOString()
        );
      }
      console.log(`✓ ${postsResult.rows.length} posts indsat\n`);
    }
    
    // 5. Insert files
    if (filesResult.rows.length > 0) {
      console.log('📁 Indsætter filer...');
      const insertFile = sqliteDb.prepare(`
        INSERT INTO files (id, name, type, url, user_id, uploaded_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      for (const file of filesResult.rows) {
        insertFile.run(
          file.id,
          file.name,
          file.type,
          file.url,
          file.user_id,
          file.uploaded_at || new Date().toISOString()
        );
      }
      console.log(`✓ ${filesResult.rows.length} filer indsat\n`);
    }
    
    // 6. Insert customers
    if (customersResult.rows.length > 0) {
      console.log('👥 Indsætter kunder...');
      const insertCustomer = sqliteDb.prepare(`
        INSERT INTO customers (id, name, email, phone, address, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      for (const customer of customersResult.rows) {
        insertCustomer.run(
          customer.id,
          customer.name,
          customer.email || '',
          customer.phone || '',
          customer.address || '',
          customer.created_at || new Date().toISOString()
        );
      }
      console.log(`✓ ${customersResult.rows.length} kunder indsat\n`);
    }
    
    // 7. Insert orders
    if (ordersResult.rows.length > 0) {
      console.log('📦 Indsætter ordrer...');
      const insertOrder = sqliteDb.prepare(`
        INSERT INTO orders (id, customer_id, customer_name, order_date, status, total_amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      for (const order of ordersResult.rows) {
        insertOrder.run(
          order.id,
          order.customer_id || null,
          order.customer_name || 'Ukendt',
          order.order_date || new Date().toISOString(),
          order.status || 'pending',
          order.total_amount || 0,
          order.created_at || new Date().toISOString()
        );
      }
      console.log(`✓ ${ordersResult.rows.length} ordrer indsat\n`);
    }
    
    console.log('═══════════════════════════════════════');
    console.log('🎉 DATA DOWNLOAD FULDFØRT!');
    console.log('═══════════════════════════════════════\n');
    console.log('✅ Dit production data er nu i lokal SQLite!');
    console.log('✅ Genstart backend (luk og åbn START-PORTAL.bat igen)');
    console.log('✅ Login og se dit rigtige data!\n');
    
  } catch (error) {
    console.error('❌ Fejl:', error.message);
    console.error(error);
  } finally {
    await pool.end();
    sqliteDb.close();
  }
}

downloadData();
