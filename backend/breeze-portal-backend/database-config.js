// database-config.js - Smart database configuration
// Uses SQLite locally, PostgreSQL in production (Railway)
import Database from 'better-sqlite3';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

// Only use PostgreSQL if DATABASE_URL is explicitly set (otherwise SQLite)
const DATABASE_URL = process.env.DATABASE_URL?.trim() || '';
const isProduction = DATABASE_URL && DATABASE_URL.length > 10 && DATABASE_URL.startsWith('postgresql://');

console.log('🔍 DATABASE_URL exists:', !!DATABASE_URL);
console.log('🔍 DATABASE_URL length:', DATABASE_URL?.length);

console.log(`📊 Database Mode: ${isProduction ? 'PostgreSQL (Production)' : 'SQLite (Development)'}`);

// PostgreSQL pool (for production)
let pool = null;
if (isProduction) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
  console.log('✅ PostgreSQL connection pool created');
  console.log('🔗 Connecting to:', DATABASE_URL.substring(0, 30) + '...');
}

// SQLite database (for development / Render with persistent disk)
let sqliteDb = null;
if (!isProduction) {
  // On Render, DATA_DIR points to the persistent disk so data survives deploys
  const DATA_DIR = process.env.DATA_DIR || __dirname;
  if (DATA_DIR !== __dirname && !fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const DB_PATH = path.join(DATA_DIR, 'breeze.db');

  // First run on persistent disk: seed with bundled database (if present)
  if (DATA_DIR !== __dirname && !fs.existsSync(DB_PATH)) {
    const seedDb = path.join(__dirname, 'breeze.db');
    if (fs.existsSync(seedDb)) {
      fs.copyFileSync(seedDb, DB_PATH);
      for (const ext of ['-wal', '-shm']) {
        if (fs.existsSync(seedDb + ext)) fs.copyFileSync(seedDb + ext, DB_PATH + ext);
      }
      console.log('🌱 Seeded persistent disk database from bundled breeze.db');
    }
  }

  sqliteDb = new Database(DB_PATH);
  sqliteDb.pragma('journal_mode = WAL');
  console.log('✅ SQLite database initialized at:', DB_PATH);
}

// Unified database interface
export const db = {
  // Query method - works for both SQLite and PostgreSQL
  query: async (sql, params = []) => {
    if (isProduction) {
      // PostgreSQL query
      const result = await pool.query(sql, params);
      return result.rows;
    } else {
      // SQLite query
      try {
        if (sql.trim().toLowerCase().startsWith('select')) {
          return sqliteDb.prepare(sql).all(...params);
        } else {
          const stmt = sqliteDb.prepare(sql);
          const result = stmt.run(...params);
          return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
        }
      } catch (error) {
        console.error('SQLite query error:', error);
        throw error;
      }
    }
  },

  // Get single row
  get: async (sql, params = []) => {
    if (isProduction) {
      // Convert ? placeholders to $1, $2, $3 for PostgreSQL
      let pgSql = sql;
      let paramIndex = 1;
      pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
      const result = await pool.query(pgSql, params);
      return result.rows[0];
    } else {
      return sqliteDb.prepare(sql).get(...params);
    }
  },

  // Get all rows
  all: async (sql, params = []) => {
    if (isProduction) {
      // Convert ? placeholders to $1, $2, $3 for PostgreSQL
      let pgSql = sql;
      let paramIndex = 1;
      pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
      const result = await pool.query(pgSql, params);
      return result.rows;
    } else {
      return sqliteDb.prepare(sql).all(...params);
    }
  },

  // Run statement (INSERT, UPDATE, DELETE)
  run: async (sql, params = []) => {
    if (isProduction) {
      // Convert ? placeholders to $1, $2, $3 for PostgreSQL
      let pgSql = sql;
      let paramIndex = 1;
      pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
      
      // For INSERT statements, add RETURNING id to get the inserted row's ID
      if (pgSql.trim().toLowerCase().startsWith('insert')) {
        // Check if RETURNING clause already exists
        if (!pgSql.toLowerCase().includes('returning')) {
          pgSql += ' RETURNING id';
        }
      }
      
      const result = await pool.query(pgSql, params);
      return { 
        changes: result.rowCount, 
        lastInsertRowid: result.rows[0]?.id 
      };
    } else {
      const stmt = sqliteDb.prepare(sql);
      return stmt.run(...params);
    }
  },

  // Prepare statement (for SQLite compatibility)
  prepare: (sql) => {
    if (isProduction) {
      // PostgreSQL doesn't use prepare the same way
      // Convert ? placeholders to $1, $2, $3 for PostgreSQL
      let pgSql = sql;
      let paramIndex = 1;
      pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
      
      // Return object with same interface
      return {
        get: async (...params) => {
          const result = await pool.query(pgSql, params);
          return result.rows[0];
        },
        all: async (...params) => {
          const result = await pool.query(pgSql, params);
          return result.rows;
        },
        run: async (...params) => {
          const result = await pool.query(pgSql, params);
          return { 
            changes: result.rowCount,
            lastInsertRowid: result.rows[0]?.id
          };
        }
      };
    } else {
      return sqliteDb.prepare(sql);
    }
  },

  // Transaction support
  transaction: (callback) => {
    if (isProduction) {
      // PostgreSQL transactions
      return async (...args) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await callback(...args);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      };
    } else {
      // SQLite transactions
      return sqliteDb.transaction(callback);
    }
  },

  // Close connection
  close: async () => {
    if (isProduction && pool) {
      await pool.end();
      console.log('PostgreSQL pool closed');
    } else if (sqliteDb) {
      sqliteDb.close();
      console.log('SQLite database closed');
    }
  },

  // Direct access to underlying database (for advanced usage)
  _raw: isProduction ? pool : sqliteDb,
  _isProduction: isProduction
};

export default db;
