// add-entry-type.js - Migrering: entry_type paa time_entries
// KOERES IKKE AUTOMATISK - kør med: node add-entry-type.js
//
// REGEL for eksisterende data:
//   1) har order_id            -> 'order'
//   2) materiale hedder "Sygdom" -> 'sick'
//   3) ellers                  -> 'workshop'
//
// TAG BACKUP foerst!
//   SQLite:  copy breeze.db breeze.db.backup
//   Supabase: pg_dump eller Supabase-dashboard backup

const DB_URL = process.env.DATABASE_URL;
const SICK_NAME = 'sygdom';

async function migratePg() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  try {
    await pool.query("ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS entry_type TEXT DEFAULT 'order'");
    await pool.query(`UPDATE time_entries SET entry_type = 'order' WHERE order_id IS NOT NULL`);
    await pool.query(`UPDATE time_entries SET entry_type = 'sick'
      WHERE order_id IS NULL AND entry_type IS DISTINCT FROM 'sick'
        AND EXISTS (SELECT 1 FROM materials m WHERE m.id = time_entries.material_id AND LOWER(m.name) LIKE '%${SICK_NAME}%')`);
    await pool.query(`UPDATE time_entries SET entry_type = 'workshop'
      WHERE order_id IS NULL AND (entry_type IS NULL OR entry_type = 'order')`);
    const { rows } = await pool.query('SELECT entry_type, COUNT(*) AS n FROM time_entries GROUP BY entry_type');
    console.log('Resultat:', rows);
  } finally {
    await pool.end();
  }
}

async function migrateSqlite() {
  const Database = (await import('better-sqlite3')).default;
  const db = new Database('breeze.db');
  try {
    const cols = db.prepare('PRAGMA table_info(time_entries)').all().map(c => c.name);
    if (!cols.includes('entry_type')) {
      db.prepare("ALTER TABLE time_entries ADD COLUMN entry_type TEXT DEFAULT 'order'").run();
    }
    db.prepare(`UPDATE time_entries SET entry_type = 'order' WHERE order_id IS NOT NULL`).run();
    db.prepare(`UPDATE time_entries SET entry_type = 'sick'
      WHERE order_id IS NULL AND entry_type <> 'sick'
        AND EXISTS (SELECT 1 FROM materials m WHERE m.id = time_entries.material_id AND LOWER(m.name) LIKE '%${SICK_NAME}%')`).run();
    db.prepare(`UPDATE time_entries SET entry_type = 'workshop'
      WHERE order_id IS NULL AND (entry_type IS NULL OR entry_type = 'order')`).run();
    console.log('Resultat:', db.prepare('SELECT entry_type, COUNT(*) AS n FROM time_entries GROUP BY entry_type').all());
  } finally {
    db.close();
  }
}

if (DB_URL) { migratePg().catch(e => { console.error(e); process.exit(1); }); }
else { migrateSqlite().catch(e => { console.error(e); process.exit(1); }); }
