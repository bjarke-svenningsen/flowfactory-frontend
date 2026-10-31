// add-order-stage.js — Tilfoejer arbejdsstatus til ordrer (fase 2: Igangvaerende)
//
// BRUG: node add-order-stage.js            -> lokal SQLite (breeze.db)
//       node add-order-stage.js --prod     -> produktion (DATABASE_URL fra .env)
//
// TAG BACKUP foerst!
//   SQLite:  copy breeze.db breeze.db.backup
//   Supabase/Railway: pg_dump eller dashboard-backup
//
// MIGRERINGSREGEL (godkendt af bruger 31-10-2026):
//   1) Alle eksisterende godkendte ordrer (status='accepted') -> order_stage='approved'
//   2) Undtagelse: ordrer med tidsregistreringer, udgifter, materialer
//      eller en godkendt faktura (status != 'draft') -> order_stage='in_progress'
//      (started_at = accepted_at hvis sat, ellers nu)
// Tilbud (draft/sent/rejected) beroreges IKKE (order_stage forbliver NULL).

import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runProd = process.argv.includes('--prod');
const DB_URL = runProd ? (process.env.DATABASE_URL || '') : '';

async function migrateSqlite() {
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(path.join(__dirname, 'breeze.db'));
  try {
    const cols = db.prepare('PRAGMA table_info(quotes)').all().map(c => c.name);

    if (!cols.includes('order_stage')) { db.prepare("ALTER TABLE quotes ADD COLUMN order_stage TEXT DEFAULT NULL").run(); console.log('OK Tilfoejet quotes.order_stage'); }
    if (!cols.includes('started_at')) { db.prepare("ALTER TABLE quotes ADD COLUMN started_at TIMESTAMP DEFAULT NULL").run(); console.log('OK Tilfoejet quotes.started_at'); }
    if (!cols.includes('started_by')) { db.prepare("ALTER TABLE quotes ADD COLUMN started_by INTEGER DEFAULT NULL").run(); console.log('OK Tilfoejet quotes.started_by'); }

    db.prepare("UPDATE quotes SET order_stage = 'approved' WHERE status = 'accepted' AND order_stage IS NULL").run();

    db.prepare(`
      UPDATE quotes SET order_stage = 'in_progress',
        started_at = COALESCE(accepted_at, datetime('now'))
      WHERE status = 'accepted' AND order_stage = 'approved'
        AND (
          EXISTS (SELECT 1 FROM time_entries te WHERE te.order_id = quotes.id)
          OR EXISTS (SELECT 1 FROM order_expenses oe WHERE oe.order_id = quotes.id)
          OR EXISTS (SELECT 1 FROM order_materials om WHERE om.order_id = quotes.id)
          OR EXISTS (SELECT 1 FROM invoices i WHERE i.order_id = quotes.id AND i.status != 'draft')
        )
    `).run();

    const counts = db.prepare("SELECT order_stage, COUNT(*) as n FROM quotes WHERE status = 'accepted' GROUP BY order_stage").all();
    console.log('Resultat (godkendte ordrer):', JSON.stringify(counts));
  } finally { db.close(); }
}

async function migratePostgres() {
  if (!DB_URL) { console.error('FEJL: --prod kræver DATABASE_URL i .env'); process.exit(1); }
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  try {
    const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'quotes'");
    const names = cols.rows.map(r => r.column_name);

    if (!names.includes('order_stage')) { await pool.query("ALTER TABLE quotes ADD COLUMN order_stage TEXT DEFAULT NULL"); console.log('OK Tilfoejet quotes.order_stage'); }
    if (!names.includes('started_at')) { await pool.query("ALTER TABLE quotes ADD COLUMN started_at TIMESTAMP DEFAULT NULL"); console.log('OK Tilfoejet quotes.started_at'); }
    if (!names.includes('started_by')) { await pool.query("ALTER TABLE quotes ADD COLUMN started_by INTEGER DEFAULT NULL"); console.log('OK Tilfoejet quotes.started_by'); }

    await pool.query("UPDATE quotes SET order_stage = 'approved' WHERE status = 'accepted' AND order_stage IS NULL");

    await pool.query(`
      UPDATE quotes SET order_stage = 'in_progress',
        started_at = COALESCE(accepted_at, CURRENT_TIMESTAMP)
      WHERE status = 'accepted' AND order_stage = 'approved'
        AND (
          EXISTS (SELECT 1 FROM time_entries te WHERE te.order_id = quotes.id)
          OR EXISTS (SELECT 1 FROM order_expenses oe WHERE oe.order_id = quotes.id)
          OR EXISTS (SELECT 1 FROM order_materials om WHERE om.order_id = quotes.id)
          OR EXISTS (SELECT 1 FROM invoices i WHERE i.order_id = quotes.id AND i.status != 'draft')
        )
    `);

    const counts = await pool.query("SELECT order_stage, COUNT(*) as n FROM quotes WHERE status = 'accepted' GROUP BY order_stage");
    console.log('Resultat (godkendte ordrer):', JSON.stringify(counts.rows));
  } finally { await pool.end(); }
}

if (runProd) { await migratePostgres(); } else { await migrateSqlite(); }
console.log('Faerdig.');
