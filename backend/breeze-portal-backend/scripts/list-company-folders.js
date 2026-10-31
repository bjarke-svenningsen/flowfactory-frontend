#!/usr/bin/env node
/**
 * list-company-folders.js - READ-ONLY liste af alle firmamapper (Fælles filer).
 *
 * Brug på Render Shell (produktion, SQLite på /data/breeze.db):
 *   cd backend/breeze-portal-backend
 *   node scripts/list-company-folders.js
 *
 * Lokalt:
 *   node scripts/list-company-folders.js   (finder automatisk breeze.db ved siden af)
 *
 * Ændrer INGET i databasen - kun SELECT.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

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
console.log('Database:', dbPath, '\n');

const Database = require('better-sqlite3');
const db = new Database(dbPath, { readonly: true });

const rows = db.prepare(`
  SELECT id, name, parent_id, created_by, is_company_folder, created_at
  FROM folders
  ORDER BY is_company_folder DESC, id ASC
`).all();

const users = {};
try {
  db.prepare('SELECT id, name, email FROM users').all().forEach(u => { users[u.id] = u.name || u.email; });
} catch (e) { /* users tabel evt. utilgængelig */ }

const company = rows.filter(r => r.is_company_folder);
console.log(`Firmamapper (is_company_folder=1): ${company.length}`);
company.forEach(r => {
  console.log(`  id=${r.id}  navn="${r.name}"  parent_id=${r.parent_id ?? 'NULL'}  oprettet_af=${r.created_by}${r.created_by && users[r.created_by] ? ' (' + users[r.created_by] + ')' : ''}  oprettet=${r.created_at}`);
});
if (company.length === 0) console.log('  (ingen)');

console.log(`\nAlle mapper (${rows.length} i alt):`);
rows.forEach(r => {
  console.log(`  id=${r.id}  navn="${r.name}"  parent_id=${r.parent_id ?? 'NULL'}  is_company_folder=${r.is_company_folder}  oprettet_af=${r.created_by}${r.created_by && users[r.created_by] ? ' (' + users[r.created_by] + ')' : ''}`);
});

db.close();
