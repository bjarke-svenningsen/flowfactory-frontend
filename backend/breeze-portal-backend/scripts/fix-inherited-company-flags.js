#!/usr/bin/env node
/**
 * fix-inherited-company-flags.js
 *
 * Rydder op i gamle rækker: mapper inde i Fælles filer-træet, som har arvet
 * is_company_folder=1 ved oprettelse, får sat flaget til 0.
 * Kun eksplicitte TOP-firmamapper (parent_id IS NULL) beholder flaget.
 *
 * Efter denne rydning er tilhørsforhold til Fælles filer udelukkende
 * bestemt af parent_id-kæden (som koden allerede bruger via isInCompanyTree).
 *
 * KØR PÅ RENDER SHELL (produktion, SQLite på /data/breeze.db):
 *   cd backend/breeze-portal-backend
 *   node scripts/fix-inherited-company-flags.js            # dry-run (viser kun)
 *   node scripts/fix-inherited-company-flags.js --apply    # udfører (tager backup først)
 *
 * Lokalt: samme kommandoer (finder breeze.db automatisk).
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const apply = process.argv.includes('--apply');

const candidates = [
  process.env.DB_PATH,
  '/data/breeze.db',
  path.join(__dirname, '..', 'breeze.db'),
  path.join(__dirname, '..', 'data', 'breeze.db'),
].filter(Boolean);

const dbPath = candidates.find(p => fs.existsSync(p));
if (!dbPath) {
  console.error('FEJL: breeze.db ikke fundet. Prøvede:', candidates.join(', '));
  process.exit(1);
}
console.log('Database:', dbPath);
console.log('Tilstand:', apply ? 'APPLY (ændrer data!)' : 'DRY-RUN (ingen ændringer)', '\n');

const Database = require('better-sqlite3');
const db = new Database(dbPath);

// Alle mapper der har flaget sat men IKKE er top-mapper = arvede flags
const rows = db.prepare(`
  SELECT id, name, parent_id, created_by
  FROM folders
  WHERE is_company_folder = 1 AND parent_id IS NOT NULL
  ORDER BY id ASC
`).all();

console.log(`Mapper med arvet flag (is_company_folder=1 + parent_id sat): ${rows.length}`);
rows.forEach(r => {
  console.log(`  id=${r.id}  navn="${r.name}"  parent_id=${r.parent_id}  oprettet_af=${r.created_by}`);
});

if (rows.length === 0) {
  console.log('\nIntet at rydde op i - databasen er allerede korrekt.');
  db.close();
  process.exit(0);
}

if (!apply) {
  console.log('\nDRY-RUN: intet ændret. Kør med --apply for at sætte flaget til 0 på ovenstående mapper.');
  db.close();
  process.exit(0);
}

// Backup før ændring (samme mappe som DB'en)
const backupPath = dbPath + '.backup-' + new Date().toISOString().replace(/[:.]/g, '-');
fs.copyFileSync(dbPath, backupPath);
console.log('\nBackup oprettet:', backupPath);

const update = db.prepare('UPDATE folders SET is_company_folder = 0 WHERE id = ?');
const tx = db.transaction(() => {
  for (const r of rows) update.run(r.id);
});
tx();

const remaining = db.prepare('SELECT COUNT(*) AS n FROM folders WHERE is_company_folder = 1 AND parent_id IS NOT NULL').get();
const tops = db.prepare('SELECT id, name FROM folders WHERE is_company_folder = 1 AND parent_id IS NULL').all();

console.log(`\nFærdig. ${rows.length} mapper rettet.`);
console.log(`Resterende arvede flags: ${remaining.n}`);
console.log('Top-firmamapper der beholdt flaget:');
tops.forEach(t => console.log(`  id=${t.id}  navn="${t.name}" (vises som "Fælles filer" hvis laveste id)`));

db.close();
console.log('\nTip: genstart servicen på Render, hvis der er åbne forbindelser, og verificér derefter med scripts/list-company-folders.js');
