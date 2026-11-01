// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createServer } from 'http';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import ogs from 'open-graph-scraper';
import { db } from './database-config.js';
import { initializeDatabase } from './init-database.js';
import { r2Enabled, r2Put, r2PutStream, r2GetStream, pipeR2ToRes, r2Delete } from './r2-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Globalt sikkerhedsnet: en ukontrolleret async-fejl maal ALDRIG nedtage hele portalen.
// Logges tydeligt saa fejlen kan rettes, men processen overlever (tidligere: crash -> 502 paa alt).
process.on('unhandledRejection', function (reason) {
  console.error('[FATAL-RECOVERY] Uhandteret promise-fejl (serveren fortsaetter):', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', function (err) {
  console.error('[FATAL-RECOVERY] Uhaandteret undtagelse (serveren fortsaetter):', err && err.stack ? err.stack : err);
});

// CORS configuration - Allow specific origins
const allowedOrigins = [
  'https://flowfactory-frontend-20zs.onrender.com',
  'https://bjarke-svenningsen.github.io',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin matches any allowed origin (including GitHub Pages)
    const isAllowed = allowedOrigins.some(allowed => {
      // Exact match
      if (origin === allowed) return true;
      // Check if origin starts with GitHub Pages domain
      if (origin.startsWith('https://bjarke-svenningsen.github.io')) return true;
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn('CORS blocked origin:', origin);
      callback(null, true); // Still allow for now, just log
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());

// Determine uploads directory - use persistent disk on Render, local uploads otherwise
const DATA_DIR = process.env.DATA_DIR || '';
const UPLOADS_DIR = DATA_DIR ? path.join(DATA_DIR, 'uploads') : path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Serve uploads directory MED login-krav:
// Offentlig adgang (uden login) KUN for filer der bruges som profilbillede (users.avatar_url)
// eller opslagsbillede (posts.image_url), fordi <img>-tags ikke kan sende login-headers.
// Alt andet under /uploads kræver gyldig login-token i Authorization-headeren.
// Ingen mappelister, ingen path-traversal.
app.use('/uploads', async (req, res, next) => {
  try {
    let rel;
    try { rel = decodeURIComponent(req.path.replace(/^\/+/, '')); } catch { return res.status(400).end(); }
    if (!rel || rel.includes('..') || rel.includes('\\')) return res.status(400).end();

    const filePath = path.join(UPLOADS_DIR, rel);
    if (!filePath.startsWith(UPLOADS_DIR)) return res.status(400).end();
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return res.status(404).end();

    const publicPath = `/uploads/${rel}`;
    const isPublic = !!(await db.get('SELECT id FROM users WHERE avatar_url = ? LIMIT 1', [publicPath])) ||
                     !!(await db.get('SELECT id FROM posts WHERE image_url = ? LIMIT 1', [publicPath]));

    if (!isPublic) {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!token) return res.status(401).json({ error: 'Login påkrævet' });
      try { jwt.verify(token, JWT_SECRET); } catch { return res.status(401).json({ error: 'Ugyldigt login' }); }
    }

    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

// ===== R2-lagerhjælpere (Trin A) =====
// Nye kolonner storage_provider ('disk'|'r2') og storage_key tilføjes somALTER TABLE ADD COLUMN.
// Ingen gamle værdier røres: eksisterende filer forbliver 'disk' og virker som i dag.
async function ensureStorageColumns() {
  const tables = ['files', 'order_documents', 'email_attachments', 'quote_attachments'];
  for (const table of tables) {
    let hasProvider = true;
    try { await db.get(`SELECT storage_provider FROM ${table} LIMIT 1`); } catch { hasProvider = false; }
    if (!hasProvider) {
      await db.run(`ALTER TABLE ${table} ADD COLUMN storage_provider TEXT DEFAULT 'disk'`);
      console.log(`🗂  Kolonne storage_provider tilføjet til ${table}`);
    }
    let hasKey = true;
    try { await db.get(`SELECT storage_key FROM ${table} LIMIT 1`); } catch { hasKey = false; }
    if (!hasKey) {
      await db.run(`ALTER TABLE ${table} ADD COLUMN storage_key TEXT`);
      console.log(`🗂  Kolonne storage_key tilføjet til ${table}`);
    }
  }
}
ensureStorageColumns().catch(err => console.error('Fejl ved tilføjelse af storage-kolonner:', err));

// MIME-fallback: kendte filtyper browsers ellers fejlfortolker
const MIME_FALLBACKS = { jfif: 'image/jpeg', pjpeg: 'image/jpeg', pjp: 'image/jpeg' };
// JPEG-varianter der ofte gemmes med en forkert/generisk mime_type - endelsen vinder altid
const JPEG_EXT_OVERRIDES = new Set(['jfif', 'pjpeg', 'pjp']);
function resolveContentType(file) {
  const ext = (file.original_name || file.filename || '').split('.').pop().toLowerCase();
  if (JPEG_EXT_OVERRIDES.has(ext)) return 'image/jpeg';
  if (file.mime_type && file.mime_type !== 'application/octet-stream') return file.mime_type;
  return MIME_FALLBACKS[ext] || 'application/octet-stream';
}

// ASCII-fallback + UTF-8 filnavn i Content-Disposition
function setContentDisposition(res, filename, disposition) {
  const asciiName = (filename || 'fil').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");
  res.setHeader('Content-Disposition',
    `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename || 'fil')}`);
}
// Multer 1.x læser filnavnet som latin1 - dekod til UTF-8 (æ, ø, å, emoji m.m.)
function decodeUploadName(name) {
  try { return Buffer.from(String(name || ""), "latin1").toString("utf8"); }
  catch (e) { return String(name || ""); }
}

// Sender en fil (fra R2 hvis rækkens storage_provider='r2', ellers fra disk som i dag).
// Læsningen styres AF RÆKKENS storage_provider - ikke af USE_R2-flaget. USE_R2 styrer kun,
// hvor NYE uploads gemmes, så R2-filer kan altid åbnes selvom USE_R2 slås fra.
async function sendFileContent(file, res, disposition = 'inline') {
  const contentType = resolveContentType(file);

  if (file.storage_provider === 'r2' && file.storage_key) {
    try {
      const body = await r2GetStream(file.storage_key);
      res.setHeader('Content-Type', contentType);
      setContentDisposition(res, file.original_name || file.filename, disposition);
      await pipeR2ToRes(body, res);
      return;
    } catch (err) {
      console.error('R2-læsning fejlede, forsøger disk i stedet:', err.message);
    }
  }

  // Find filens relative placering under UPLOADS_DIR (understøtter undermapper fx email-attachments/)
  let rel = file.filename;
  if (file.file_path && typeof file.file_path === 'string' && file.file_path.startsWith('/uploads/')) {
    rel = file.file_path.slice('/uploads/'.length);
  }
  if (rel.includes('..')) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  const filePath = path.join(UPLOADS_DIR, rel);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }
  if (disposition === 'attachment') {
    setContentDisposition(res, file.original_name || file.filename, "attachment");
    res.sendFile(filePath);
  } else {
    res.setHeader('Content-Type', contentType);
    setContentDisposition(res, file.original_name || file.filename, 'inline');
    res.sendFile(filePath);
  }
}

// Upload req.file til R2 hvis aktiveret (USE_R2=true). USE_R2 styrer KUN nye uploads.
// Ved vellykket R2-upload slettes disk-kopien (den er nu overflødig).
// Ved fejl beholdes disk-kopien som nødløsning, og der returneres en dansk advarsel.
async function maybeStoreInR2(file, folder = 'files') {
  if (!r2Enabled()) return { storage_provider: 'disk', storage_key: null, warning: null };
  const key = `${folder}/${file.filename}`;
  try {
    // Stream filen fra disk i stedet for readFileSync (512 MB RAM-grænse på Render)
    const stream = fs.createReadStream(file.path);
    await r2PutStream(stream, key, file.mimetype, file.size);
    try {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch (delErr) {
      console.error('Kunne ikke slette disk-kopien efter R2-upload:', delErr.message);
    }
    console.log(`☁️  R2 upload OK: ${key} (${file.size} bytes)`);
    return { storage_provider: 'r2', storage_key: key, warning: null };
  } catch (err) {
    console.error('R2 upload FEJLEDE - filen gemmes på disk i stedet:', err.message);
    return {
      storage_provider: 'disk',
      storage_key: null,
      warning: 'Upload til skyen fejlede - filen blev gemt på serverens disk som nødløsning.'
    };
  }
}

// Sletter et R2-objekt KUN hvis ingen anden række (fx efter "Overfør til ordre")
// stadig bruger samme storage_key. Fejl logges - objektet efterlades i så fald.
const R2_KEY_TABLES = ['files', 'order_documents', 'quote_attachments', 'email_attachments'];
// Fælles filer: samlet adgangstjek for firma-mapper.
// I dag: alle indloggede brugere har adgang. Skal adgangen senere styres af
// stilling/rolle, ændres KUN denne funktion.
function canAccessCompanyFolder(user) {
  return !!user;
}

// SQL-fragment: alle mapper i Fælles filer-træet (top-firmamapper + alle efterkommere).
// Virker uanset om børn har arvet is_company_folder-flaget eller ej.
const COMPANY_TREE_SQL = `
  WITH RECURSIVE company_tree AS (
    SELECT id FROM folders WHERE is_company_folder = 1
    UNION
    SELECT f.id FROM folders f JOIN company_tree ct ON f.parent_id = ct.id
  )`;

// Sandt hvis mappen ligger i Fælles filer-træet (top-firmamappe ELLER efterkommer)
async function isInCompanyTree(folder) {
  if (!folder) return false;
  let cur = folder;
  const guard = new Set();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    if (cur.is_company_folder) return true;
    if (!cur.parent_id) return false;
    cur = await db.get('SELECT id, parent_id, is_company_folder FROM folders WHERE id = ?', [cur.parent_id]);
  }
  return false;
}

async function deleteR2ObjectIfUnused(storageKey, excludeTable, excludeId) {
  if (!storageKey) return;
  for (const table of R2_KEY_TABLES) {
    let sql = `SELECT id FROM ${table} WHERE storage_key = ?`;
    const params = [storageKey];
    if (table === excludeTable) { sql += ' AND id != ?'; params.push(excludeId); }
    sql += ' LIMIT 1';
    if (await db.get(sql, params)) return; // bruges et andet sted - slet ikke
  }
  try {
    await r2Delete(storageKey);
    console.log(`☁️  R2 objekt slettet: ${storageKey}`);
  } catch (err) {
    console.error('R2-sletning fejlede (objekt efterlades i bucketten):', err.message);
  }
}


// Serve the frontend (portal) directly from this server - one service for everything
const FRONTEND_DIR = path.join(__dirname, '..', '..');
app.use(express.static(FRONTEND_DIR, { index: 'index.html' }));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (req, file, cb) => {
    // Allow all file types
    cb(null, true);
  }
});

// --- DB Setup ---
// Database tables are now initialized in init-database.js
// This runs async before server starts to ensure PostgreSQL compatibility

// --- Helpers ---
function signToken(user) {
  // is_admin skal vaere i tokenet (montor-routes bruger det til rolletjek)
  return jwt.sign({ id: user.id, email: user.email, name: user.name, is_admin: !!user.is_admin }, JWT_SECRET, { expiresIn: '7d' });
}

function auth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    // v88: is_admin slaas ALTID op i DB (ikke kun gamle tokens), saa rolleaendringer
    // fra Ledelsen slaar igennem med det samme - uden at brugeren skal logge ind igen.
    db.get('SELECT is_admin FROM users WHERE id = ?', [req.user.id])
      .then(function (u) {
        req.user.is_admin = u ? !!u.is_admin : false;
        next();
      })
      .catch(function () {
        req.user.is_admin = false;
        next();
      });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Event logging helper function
async function logOrderEvent(orderId, activityType, description, userId) {
  try {
    await db.run(`
      INSERT INTO order_timeline (order_id, activity_type, description, user_id)
      VALUES (?, ?, ?, ?)
    `, [orderId, activityType, description, userId]);
  } catch (error) {
    console.error('Failed to log event:', error);
    // Don't throw - logging should not break the main operation
  }
}

// --- Routes ---
app.get('/', (req, res) => res.json({ ok: true, message: 'SG Seest Gulvteknik API kører!' }));

// Link Preview - Fetch Open Graph metadata for URLs
app.post('/api/link-preview', auth, async (req, res) => {
  const { url } = req.body;
  
  if (!url || !url.trim()) {
    return res.status(400).json({ error: 'URL required' });
  }
  
  try {
    const { result } = await ogs({ url: url.trim() });
    
    // Extract relevant metadata
    const preview = {
      title: result.ogTitle || result.twitterTitle || result.dcTitle || '',
      description: result.ogDescription || result.twitterDescription || result.dcDescription || '',
      image: result.ogImage?.[0]?.url || result.twitterImage?.[0]?.url || '',
      siteName: result.ogSiteName || '',
      url: result.ogUrl || url,
      favicon: result.favicon || ''
    };
    
    res.json(preview);
  } catch (error) {
    console.error('Link preview error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch link preview',
      details: error.message 
    });
  }
});

// Auth - Registration with invite code OR pending approval
// Faelles validering af brugerdata (register + admin opret/rediger)
function validateUserData({ name, email, password, requirePassword }) {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
  if (!name || String(name).trim().length < 5 || !String(name).trim().includes(' ')) {
    return 'Fornavn og efternavn skal udfyldes (mindst 2 tegn hver).';
  }
  const parts = String(name).trim().split(/\s+/);
  if (parts[0].length < 2 || parts[parts.length - 1].length < 2) {
    return 'Fornavn og efternavn skal hver være mindst 2 tegn.';
  }
  if (!email || !EMAIL_RE.test(String(email).trim())) {
    return 'Indtast en gyldig e-mailadresse (fx mail@firma.dk).';
  }
  if (requirePassword && (!password || String(password).length < 6)) {
    return 'Adgangskoden skal være mindst 6 tegn.';
  }
  return null;
}

// ===== Rolle-hjaelpere: Ledelsen = is_admin, alle andre = Montoer =====
const ECON_FIELDS = ['subtotal', 'vat_rate', 'vat_amount', 'total', 'revenue', 'revenue_main', 'revenue_extra', 'expenses', 'expenses_main', 'expenses_extra', 'profit', 'profit_main', 'profit_extra', 'profit_margin'];
const ECON_LINE_FIELDS = ['unit_price', 'discount_percent', 'discount_amount', 'line_total'];

function isMontor(req) {
  return !req.user || !req.user.is_admin;
}

// Er ordren "igangvaerende"? (status accepted + order_stage in_progress, hovedordre)
function isInProgressOrder(q) {
  return q && q.status === 'accepted' && q.order_stage === 'in_progress' && !q.is_extra_work && !q.parent_order_id;
}

// Fjern alle oekonomifelter fra et quote-objekt (rekursivt for lines)
function stripEconomy(quote) {
  if (!quote) return quote;
  ECON_FIELDS.forEach(function (f) { delete quote[f]; });
  if (Array.isArray(quote.lines)) {
    quote.lines.forEach(function (l) { ECON_LINE_FIELDS.forEach(function (f) { delete l[f]; }); });
  }
  return quote;
}

// Blokerade for montorer: filer, email, materialer, fakturaer, kunder m.m.
function montorGuard(req, res, next) {
  // Dekod JWT selv (koerer foer route-auth)
  try {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token) return res.status(403).json({ error: 'Adgang nægtet' });
    req.user = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(403).json({ error: 'Adgang nægtet' });
  }
  // v88: is_admin slaas altid op i DB (tidligere kun for gamle tokens), saa
  // rolleaendringer virker uden ny login.
  (async function () {
    try {
      const u = await db.get('SELECT is_admin FROM users WHERE id = ?', [req.user.id]);
      req.user.is_admin = u ? !!u.is_admin : false;
    } catch (e) {
      req.user.is_admin = false;
    }
    if (isMontor(req)) return res.status(403).json({ error: 'Adgang nægtet - din afdeling har ikke adgang til denne funktion' });
    next();
  })();
}

app.use('/api/files', montorGuard);
app.use('/api/folders', montorGuard);
app.use('/api/email', montorGuard);
// BEMAEK (v83): /api/materials er IKKE blokeret laengere - montorer skal kunne
// vaælge materialer (inkl. "Koersel/kilometer") naar de registrerer forbrug paa en sag.
// GET returnerer uden priser til montor (se route nedenfor); skrive-endpoints har adminAuth.
app.use('/api/invoices', montorGuard);
app.use('/api/customers', montorGuard);

app.post('/api/auth/register', async (req, res) => {
  const { firstName, lastName, name, email, password, inviteCode, position, department, phone } = req.body;
  const fullName = (firstName && lastName) ? (String(firstName).trim() + ' ' + String(lastName).trim()) : name;
  const validationError = validateUserData({ name: fullName, email: email, password: password, requirePassword: true });
  if (validationError) return res.status(400).json({ error: validationError });
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  
  try {
    // Check if email already exists in users table
    const exists = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (exists && exists.id) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    
    // Check if email already exists in pending_users table
    const pendingExists = await db.get('SELECT id FROM pending_users WHERE email = ?', [email.toLowerCase()]);
    if (pendingExists && pendingExists.id) {
      return res.status(409).json({ error: 'Email already in use' });
    }
  } catch (error) {
    console.error('Email check error:', error);
    return res.status(500).json({ error: 'Database error during email validation' });
  }
  
  const password_hash = bcrypt.hashSync(password, 10);
  
  // If invite code provided, validate and create user directly
  if (inviteCode) {
    const invite = await db.get(`
      SELECT * FROM invite_codes 
      WHERE code = ? AND used_by IS NULL AND expires_at::timestamp > NOW()
    `, [inviteCode]);
    
    if (!invite) {
      return res.status(400).json({ error: 'Invalid or expired invite code' });
    }
    
    // Create user directly
    const info = await db.run('INSERT INTO users (name, email, password_hash, position, department, phone) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email.toLowerCase(), password_hash, position || '', department || '', phone || '']);
    
    // Mark invite as used
    await db.run('UPDATE invite_codes SET used_by = ? WHERE id = ?', [info.lastInsertRowid, invite.id]);
    
    const user = await db.get('SELECT id, name, email, position, department, phone, avatar_url AS profile_image, is_admin FROM users WHERE id = ?',
      [info.lastInsertRowid]);
    const token = signToken(user);
    return res.json({ user, token, message: 'Account created successfully!' });
  }
  
  // No invite code - create pending user for admin approval
  await db.run('INSERT INTO pending_users (name, email, password_hash, position, department, phone) VALUES (?, ?, ?, ?, ?, ?)',
    [name, email.toLowerCase(), password_hash, position || '', department || '', phone || '']);
  
  res.json({ 
    pending: true, 
    message: 'Your registration request has been submitted. An administrator will review it shortly.' 
  });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    
    // Railway uses 'password', SQLite uses 'password_hash'
    const passwordField = user.password_hash !== undefined ? user.password_hash : user.password;
    const ok = bcrypt.compareSync(password, passwordField);
    
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
    const token = signToken(user);
    
    // Railway uses 'role', SQLite uses 'is_admin'
    const is_admin = user.is_admin !== undefined ? user.is_admin : (user.role === 'admin' ? 1 : 0);
    
    const safeUser = { id: user.id, name: user.name, email: user.email, position: user.position, department: user.department, phone: user.phone, profile_image: user.profile_image, is_admin };
    res.json({ user: safeUser, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Users
app.get('/api/users/me', auth, async (req, res) => {
  const user = await db.get('SELECT id, name, email, position, department, phone, avatar_url AS profile_image, is_admin, created_at FROM users WHERE id = ?', [req.user.id]);
  res.json({ user });
});

// Upload profile picture
app.post('/api/users/me/profile-picture', auth, upload.single('profile_picture'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  // Delete old profile picture if exists
  const user = await db.get('SELECT avatar_url AS profile_image FROM users WHERE id = ?', [req.user.id]);
  if (user.profile_image && user.profile_image.startsWith('/uploads/')) {
    const oldFilename = user.profile_image.replace('/uploads/', '');
    const oldPath = path.join(UPLOADS_DIR, oldFilename);
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }
  }
  
  // Save new profile picture path
  const profileImagePath = `/uploads/${req.file.filename}`;
  await db.run('UPDATE users SET avatar_url = ? WHERE id = ?', [profileImagePath, req.user.id]);
  
  const updatedUser = await db.get('SELECT id, name, email, position, department, phone, avatar_url AS profile_image, is_admin FROM users WHERE id = ?', [req.user.id]);
  res.json({ user: updatedUser });
});

// Get user activity stats
app.get('/api/users/activity', auth, async (req, res) => {
  const user = await db.get('SELECT created_at FROM users WHERE id = ?', [req.user.id]);
  const messagesSent = await db.get('SELECT COUNT(*) as cnt FROM messages WHERE sender_id = ?', [req.user.id]);
  const postsCreated = await db.get('SELECT COUNT(*) as cnt FROM posts WHERE user_id = ?', [req.user.id]);
  
  res.json({
    member_since: user.created_at,
    messages_sent: messagesSent.cnt,
    posts_created: postsCreated.cnt
  });
});

app.put('/api/users/me', auth, async (req, res) => {
  const { name, position, department, phone, profile_image } = req.body;
  await db.run(`UPDATE users SET
    name=COALESCE(?, name),
    position=COALESCE(?, position),
    department=COALESCE(?, department),
    phone=COALESCE(?, phone),
    avatar_url=COALESCE(?, avatar_url)
    WHERE id = ?`, [name, position, department, phone, profile_image, req.user.id]);
  const user = await db.get('SELECT id, name, email, position, department, phone, avatar_url AS profile_image FROM users WHERE id = ?', [req.user.id]);
  res.json({ user });
});

// Liste alle brugere (til medarbejder-panelet)
app.get('/api/users', auth, async (req, res) => {
  const rows = await db.all(`
    SELECT id, name, email, position, department, phone, avatar_url AS profile_image, created_at
    FROM users
    ORDER BY name ASC
  `);
  res.json(rows);
});

// Feed
app.get('/api/posts', auth, async (req, res) => {
  try {
    const posts = await db.all(`
      SELECT p.id, p.content, p.created_at, p.image_url,
             u.id as user_id, u.name as user_name, u.avatar_url
      FROM posts p
      JOIN users u ON u.id = p.user_id
      ORDER BY p.id DESC
      LIMIT 100
    `);
    const likeCounts = await db.all('SELECT post_id, COUNT(*) as likes FROM reactions GROUP BY post_id');
    
    // Build like map safely
    const likeMap = {};
    if (likeCounts && Array.isArray(likeCounts)) {
      likeCounts.forEach(r => {
        likeMap[r.post_id] = r.likes;
      });
    }
    
    res.json(posts.map(p => ({...p, likes: likeMap[p.id] || 0 })));
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

app.post('/api/posts', auth, upload.single('image'), async (req, res) => {
  try {
    const content = (req.body?.content || '').trim();
    if (!content && !req.file) return res.status(400).json({ error: 'Missing content' });

    // Sikr at kolonnen findes
    try {
      await db.run('ALTER TABLE posts ADD COLUMN image_url TEXT');
    } catch (e) { /* kolonnen findes allerede */ }

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const info = await db.run('INSERT INTO posts (user_id, content, image_url) VALUES (?, ?, ?)', [req.user.id, content, imageUrl]);
    const post = await db.get(`
      SELECT p.id, p.content, p.created_at, p.image_url, u.id as user_id, u.name as user_name, u.avatar_url
      FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?
    `, [info.lastInsertRowid]);
    res.json(post);
    // Socket.IO realtid fjernet - klienter henter feed via almindelige kald
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Upload billede til et opslag (gemmes permanent i uploads/ og DB)
app.post('/api/posts/:id/image', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const postId = Number(req.params.id);
    const post = await db.get('SELECT * FROM posts WHERE id = ?', [postId]);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.user_id !== req.user.id) return res.status(403).json({ error: 'Not allowed' });

    // Sikr at kolonnen findes (Postgres og SQLite)
    try {
      await db.run('ALTER TABLE posts ADD COLUMN image_url TEXT');
    } catch (e) { /* kolonnen findes allerede */ }

    const imageUrl = `/uploads/${req.file.filename}`;
    await db.run('UPDATE posts SET image_url = ? WHERE id = ?', [imageUrl, postId]);
    res.json({ image_url: imageUrl });
  } catch (error) {
    console.error('Post image upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

app.post('/api/posts/:id/like', auth, async (req, res) => {
  const postId = Number(req.params.id);
  try {
    // PostgreSQL-compatible: Use INSERT ... ON CONFLICT DO NOTHING instead of INSERT OR IGNORE
    if (db._isProduction) {
      await db.run('INSERT INTO reactions (post_id, user_id, type) VALUES (?, ?, ?) ON CONFLICT (post_id, user_id) DO NOTHING', [postId, req.user.id, 'like']);
    } else {
      await db.run('INSERT OR IGNORE INTO reactions (post_id, user_id, type) VALUES (?, ?, ?)', [postId, req.user.id, 'like']);
    }
    const result = await db.get('SELECT COUNT(*) as cnt FROM reactions WHERE post_id = ?', [postId]);
    const likes = result.cnt;
    // Socket.IO realtid fjernet - klienter henter feed via almindelige kald
    res.json({ postId, likes });
  } catch {
    res.status(400).json({ error: 'Unable to like post' });
  }
});

// Delete post
app.delete('/api/posts/:id', auth, async (req, res) => {
  const postId = Number(req.params.id);
  const post = await db.get('SELECT * FROM posts WHERE id = ?', [postId]);
  
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  
  // Check if user owns the post (admins må slette alle)
  if (post.user_id !== req.user.id) {
    const me = await db.get('SELECT is_admin FROM users WHERE id = ?', [req.user.id]);
    if (!me || !me.is_admin) {
      return res.status(403).json({ error: 'Permission denied' });
    }
  }
  
  // Delete post (reactions and comments will be cascade deleted if foreign key constraints are set)
  await db.run('DELETE FROM reactions WHERE post_id = ?', [postId]);
  await db.run('DELETE FROM comments WHERE post_id = ?', [postId]);
  await db.run('DELETE FROM posts WHERE id = ?', [postId]);
  
  res.json({ success: true });
});

// --- COMMENTS ENDPOINTS ---

// Get comments for a post
app.get('/api/posts/:id/comments', auth, async (req, res) => {
  const postId = Number(req.params.id);
  
  const comments = await db.all(`
    SELECT c.id, c.content, c.created_at, c.user_id,
           u.name as author, u.avatar_url
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `, [postId]);
  
  res.json(comments);
});

// Add comment to post
app.post('/api/posts/:id/comments', auth, async (req, res) => {
  const postId = Number(req.params.id);
  const { content } = req.body;
  
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Comment content required' });
  }
  
  const info = await db.run(`
    INSERT INTO comments (post_id, user_id, content)
    VALUES (?, ?, ?)
  `, [postId, req.user.id, content.trim()]);
  
  const comment = await db.get(`
    SELECT c.id, c.content, c.created_at, c.user_id,
           u.name as author, u.avatar_url
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `, [info.lastInsertRowid]);
  
  res.json(comment);
});

// Edit comment
app.put('/api/posts/:postId/comments/:commentId', auth, async (req, res) => {
  const commentId = Number(req.params.commentId);
  const { content } = req.body;
  
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Comment content required' });
  }
  
  const comment = await db.get('SELECT * FROM comments WHERE id = ?', [commentId]);
  if (!comment) {
    return res.status(404).json({ error: 'Comment not found' });
  }
  
  if (comment.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  
  await db.run('UPDATE comments SET content = ? WHERE id = ?', [content.trim(), commentId]);
  
  const updated = await db.get(`
    SELECT c.id, c.content, c.created_at, c.user_id,
           u.name as author, u.avatar_url
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `, [commentId]);
  
  res.json(updated);
});

// Delete comment
app.delete('/api/posts/:postId/comments/:commentId', auth, async (req, res) => {
  const commentId = Number(req.params.commentId);
  
  const comment = await db.get('SELECT * FROM comments WHERE id = ?', [commentId]);
  if (!comment) {
    return res.status(404).json({ error: 'Comment not found' });
  }
  
  if (comment.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  
  await db.run('DELETE FROM comments WHERE id = ?', [commentId]);
  res.json({ success: true });
});

// Messages (history)
app.get('/api/messages/:otherUserId', auth, async (req, res) => {
  const otherId = Number(req.params.otherUserId);
  const rows = await db.all(`
    SELECT * FROM messages
    WHERE (sender_id = ? AND recipient_id = ?)
       OR (sender_id = ? AND recipient_id = ?)
    ORDER BY id ASC
    LIMIT 500
  `, [req.user.id, otherId, otherId, req.user.id]);
  res.json(rows);
});

// --- File Upload & Management ---
// All database tables are now created in init-database.js before server starts

// Upload file endpoint (Server Storage)
app.post('/api/files/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const folder_id = req.body.folder_id ? Number(req.body.folder_id) : null;

    // Tjek adgang til mål-mappe (egen mappe, firmamappe eller admin)
    if (folder_id) {
      const targetFolder = await db.get('SELECT * FROM folders WHERE id = ?', [folder_id]);
      if (!targetFolder) {
        return res.status(404).json({ error: 'Folder not found' });
      }
      const actorUser = await db.get('SELECT is_admin FROM users WHERE id = ?', [req.user.id]);
      if (targetFolder.created_by !== req.user.id && !((await isInCompanyTree(targetFolder)) && canAccessCompanyFolder(req.user)) && !actorUser.is_admin) {
        return res.status(403).json({ error: 'Permission denied - folder access' });
      }
    }

    // Upload til R2 hvis aktiveret (USE_R2=true) - ellers disk som hidtil
    const storage = await maybeStoreInR2(req.file, 'files');

    const fileInfo = {
      filename: req.file.filename,
      original_name: decodeUploadName(req.file.originalname),
      file_path: `/uploads/${req.file.filename}`,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      folder_id: folder_id,
      uploaded_by: req.user.id,
      owner_id: req.user.id
    };

    const info = await db.run(`
      INSERT INTO files (filename, original_name, file_path, file_size, mime_type, folder_id, uploaded_by, owner_id, storage_provider, storage_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      fileInfo.filename,
      fileInfo.original_name,
      fileInfo.file_path,
      fileInfo.file_size,
      fileInfo.mime_type,
      fileInfo.folder_id,
      fileInfo.uploaded_by,
      fileInfo.owner_id,
      storage.storage_provider,
      storage.storage_key
    ]);

    const file = await db.get(`
      SELECT f.*, u.name as uploader_name, o.name as owner_name
      FROM files f
      JOIN users u ON f.uploaded_by = u.id
      LEFT JOIN users o ON f.owner_id = o.id
      WHERE f.id = ?
    `, [info.lastInsertRowid]);

    res.json({ success: true, file, warning: storage.warning });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// --- Folder Management ---

// Create folder
app.post('/api/folders', auth, async (req, res) => {
  const { name, parent_id, is_company_folder, reuse_existing } = req.body;
  if (!name) return res.status(400).json({ error: 'Folder name required' });

  // Dublet-tjek: samme navn i samme mappe.
  // - reuse_existing=true (upload af mapper): genbrug eksisterende mappe i stille ro
  // - almindelig "Ny mappe": dansk fejl, så brugeren ikke får to ens mapper
  const dupParams = parent_id ? [name, parent_id] : [name, null];
  const existingFolder = await db.get(
    'SELECT * FROM folders WHERE name = ? AND ' + (parent_id ? 'parent_id = ?' : 'parent_id IS NULL') + ' LIMIT 1',
    dupParams
  );
  if (existingFolder) {
    if (reuse_existing) {
      return res.json(existingFolder);
    }
    return res.status(409).json({ error: 'Der findes allerede en mappe med det navn her.' });
  }
  
  const actor = await db.get('SELECT is_admin FROM users WHERE id = ?', [req.user.id]);

  // Kun eksplicitte top-firmamapper får flaget - børn nedarver IKKE.
  // Tilhørsforhold til Fælles filer bestemmes af parent_id-kæden (isInCompanyTree).
  let finalIsCompanyFolder = is_company_folder ? 1 : 0;

  if (parent_id) {
    const parentFolder = await db.get('SELECT * FROM folders WHERE id = ?', [parent_id]);
    if (!parentFolder) {
      return res.status(404).json({ error: 'Parent folder not found' });
    }
    // Skriveadgang til parent: ejer, Fælles filer-træet (via canAccessCompanyFolder) eller admin
    if (!(parentFolder.created_by === req.user.id || ((await isInCompanyTree(parentFolder)) && canAccessCompanyFolder(req.user)) || actor.is_admin)) {
      return res.status(403).json({ error: 'Permission denied - folder access' });
    }
  }

  // Only admins can create top-level company folders
  if (is_company_folder && !parent_id) {
    if (!actor.is_admin) {
      return res.status(403).json({ error: 'Only admins can create company folders' });
    }
  }
  
  const info = await db.run(`
    INSERT INTO folders (name, parent_id, created_by, is_company_folder)
    VALUES (?, ?, ?, ?)
  `, [name, parent_id || null, req.user.id, finalIsCompanyFolder]);
  
  const folder = await db.get(`
    SELECT f.*, u.name as creator_name
    FROM folders f
    JOIN users u ON f.created_by = u.id
    WHERE f.id = ?
  `, [info.lastInsertRowid]);
  
  res.json(folder);
});

// Get all folders (user-specific + company folders)
app.get('/api/folders', auth, async (req, res) => {
  // Get user's personal folders + everything in the Fælles filer tree
  const folders = await db.all(`
    ${COMPANY_TREE_SQL}
    SELECT f.*, u.name as creator_name
    FROM folders f
    JOIN users u ON f.created_by = u.id
    WHERE f.created_by = ? OR f.id IN (SELECT id FROM company_tree)
    ORDER BY f.is_company_folder DESC, f.name ASC
  `, [req.user.id]);
  
  res.json(folders);
});

// Rename folder
app.put('/api/folders/:id', auth, async (req, res) => {
  const folderId = Number(req.params.id);
  const { name } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Folder name required' });
  }
  
  const folder = await db.get('SELECT * FROM folders WHERE id = ?', [folderId]);
  
  if (!folder) {
    return res.status(404).json({ error: 'Folder not found' });
  }
  
  // Check if user owns folder or is admin
  const user = await db.get('SELECT is_admin FROM users WHERE id = ?', [req.user.id]);
  // Top-"Fælles filer" kan kun omdøbes af admins
  if (folder.is_company_folder && !folder.parent_id && !user.is_admin) {
    return res.status(403).json({ error: 'Fælles filer kan ikke omdøbes' });
  }
  if (folder.created_by !== req.user.id && !user.is_admin) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  
  await db.run('UPDATE folders SET name = ? WHERE id = ?', [name.trim(), folderId]);
  
  const updated = await db.get(`
    SELECT f.*, u.name as creator_name
    FROM folders f
    JOIN users u ON f.created_by = u.id
    WHERE f.id = ?
  `, [folderId]);

  res.json(updated);
});

// Move/reorder folder position (drag & drop in folder tree)
// body: { before_id: <folderId|null> } - placeres før before_id (eller til sidst) blandt søskende
app.put('/api/folders/:id/position', auth, async (req, res) => {
  const folderId = Number(req.params.id);
  const beforeId = req.body.before_id ? Number(req.body.before_id) : null;
  try {
    const folder = await db.get('SELECT * FROM folders WHERE id = ?', [folderId]);
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    const user = await db.get('SELECT is_admin FROM users WHERE id = ?', [req.user.id]);
    if (folder.created_by !== req.user.id && !user.is_admin) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    if (folder.is_company_folder && !folder.parent_id) {
      return res.status(400).json({ error: 'Fælles filer kan ikke flyttes' });
    }

    // Valgfri flytning til ny parent: { parent_id: <id|null> }
    let currentParent = folder.parent_id;
    if (Object.prototype.hasOwnProperty.call(req.body, 'parent_id')) {
      const newParentId = req.body.parent_id === null || req.body.parent_id === '' ? null : Number(req.body.parent_id);
      if (newParentId !== folder.parent_id) {
        if (newParentId !== null) {
          const target = await db.get('SELECT * FROM folders WHERE id = ?', [newParentId]);
          if (!target) return res.status(404).json({ error: 'Destination folder not found' });
          // Løkke-vagt: destination må ikke være folder selv eller en efterkommer
          let cur = target;
          const guard = new Set();
          while (cur && !guard.has(cur.id)) {
            guard.add(cur.id);
            if (cur.id === folderId) return res.status(400).json({ error: 'Kan ikke flytte en mappe ind i sig selv eller en undermappe' });
            if (!cur.parent_id) break;
            cur = await db.get('SELECT id, parent_id FROM folders WHERE id = ?', [cur.parent_id]);
          }
          // Skriveadgang til destination: ejer, Fælles filer-træet eller admin
          if (!(target.created_by === req.user.id || ((await isInCompanyTree(target)) && canAccessCompanyFolder(req.user)) || user.is_admin)) {
            return res.status(403).json({ error: 'Permission denied - destination folder' });
          }
        }
        await db.run('UPDATE folders SET parent_id = ? WHERE id = ?', [newParentId, folderId]);
        currentParent = newParentId;
      }
    }

    // Søskende i samme parent (sorteres om samlet)
    const siblings = await db.all(
      'SELECT * FROM folders WHERE parent_id IS ? AND id != ? ORDER BY COALESCE(sort_order, 2147483647), name ASC',
      [currentParent, folderId]
    );

    let list = siblings.slice();
    if (beforeId) {
      const idx = list.findIndex(f => f.id === beforeId);
      const insertAt = idx === -1 ? list.length : idx;
      list.splice(insertAt, 0, folder);
    } else {
      list.push(folder);
    }

    let i = 0;
    for (const f of list) {
      await db.run('UPDATE folders SET sort_order = ? WHERE id = ?', [i * 10, f.id]);
      i++;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Folder position error:', error);
    res.status(500).json({ error: 'Kunne ikke flytte mappen' });
  }
});

// Delete folder
app.delete('/api/folders/:id', auth, async (req, res) => {
  const folderId = Number(req.params.id);
  const folder = await db.get('SELECT * FROM folders WHERE id = ?', [folderId]);
  
  if (!folder) {
    return res.status(404).json({ error: 'Folder not found' });
  }
  
  // Check if user owns folder or is admin
  const user = await db.get('SELECT is_admin FROM users WHERE id = ?', [req.user.id]);
  // Top-"Fælles filer" kan kun slettes af admins
  if (folder.is_company_folder && !folder.parent_id && !user.is_admin) {
    return res.status(403).json({ error: 'Fælles filer kan ikke slettes' });
  }
  if (folder.created_by !== req.user.id && !user.is_admin) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  
  const recursive = req.query.recursive === 'true';

  // Saml hele mappe-traet (mappen + alle undermapper, alle niveauer)
  const folderIds = [];
  const stack = [folderId];
  while (stack.length) {
    const id = stack.pop();
    folderIds.push(id);
    const kids = await db.all('SELECT id FROM folders WHERE parent_id = ?', [id]);
    kids.forEach(k => stack.push(k.id));
  }

  const placeholders = folderIds.map(() => '?').join(',');
  const filesInTree = await db.all(`SELECT * FROM files WHERE folder_id IN (${placeholders})`, folderIds);

  if (!recursive) {
    if (filesInTree.length > 0) {
      return res.status(400).json({ error: 'Folder contains files. Delete files first.' });
    }
    if (folderIds.length > 1) {
      return res.status(400).json({ error: 'Folder contains subfolders. Delete subfolders first.' });
    }
  }

  // Slet filer i traet (disk + R2-oprydning, som ved enkeltvis sletning)
  for (const f of filesInTree) {
    const otherDiskUser = await db.get(
      "SELECT id FROM files WHERE filename = ? AND id != ? AND (storage_provider IS NULL OR storage_provider != ?) LIMIT 1",
      [f.filename, f.id, "r2"]
    );
    if (!otherDiskUser) {
      try {
        const filePath = path.join(UPLOADS_DIR, f.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) {
        console.error('Folder delete - disk cleanup error:', e);
      }
    }
    await db.run('DELETE FROM file_shares WHERE file_id = ?', [f.id]);
    await db.run('DELETE FROM files WHERE id = ?', [f.id]);
    await deleteR2ObjectIfUnused(f.storage_key, 'files', f.id);
  }

  // Slet mapperne boern foerst
  for (const id of folderIds.slice().reverse()) {
    await db.run('DELETE FROM folders WHERE id = ?', [id]);
  }
  res.json({ success: true, deletedFolders: folderIds.length, deletedFiles: filesInTree.length });
});

// Get all files (user-specific + shared + company folders)
app.get('/api/files', auth, async (req, res) => {
  const { folder_id, view = 'my' } = req.query; // view: 'my' or 'shared'
  
  if (view === 'shared') {
    // Get files shared WITH this user
    let query = `
      SELECT f.*, u.name as uploader_name, o.name as owner_name, fs.permission, fs.shared_by, sharer.name as shared_by_name
      FROM file_shares fs
      JOIN files f ON fs.file_id = f.id
      JOIN users u ON f.uploaded_by = u.id
      LEFT JOIN users o ON f.owner_id = o.id
      LEFT JOIN users sharer ON fs.shared_by = sharer.id
      WHERE fs.shared_with_user_id = ?
    `;
    
    const params = [req.user.id];
    
    if (folder_id && folder_id !== 'all' && folder_id !== 'root') {
      query += ` AND f.folder_id = ?`;
      params.push(Number(folder_id));
    } else if (folder_id === 'root') {
      query += ` AND f.folder_id IS NULL`;
    }
    
    query += ` ORDER BY f.created_at DESC LIMIT 1000`;
    
    const files = await db.all(query, params);
    return res.json(files);
  }
  
  // Default: Get files owned by this user OR in the Fælles filer tree
  let query = `
    ${COMPANY_TREE_SQL}
    SELECT f.*, u.name as uploader_name, o.name as owner_name
    FROM files f
    JOIN users u ON f.uploaded_by = u.id
    LEFT JOIN users o ON f.owner_id = o.id
    LEFT JOIN folders folder ON f.folder_id = folder.id
    WHERE (f.owner_id = ? OR folder.id IN (SELECT id FROM company_tree))
  `;
  
  const params = [req.user.id];
  
  if (folder_id && folder_id !== 'all' && folder_id !== 'root') {
    query += ` AND f.folder_id = ?`;
    params.push(Number(folder_id));
  } else if (folder_id === 'root') {
    query += ` AND f.folder_id IS NULL`;
  }
  
  query += ` ORDER BY f.created_at DESC LIMIT 1000`;
  
  const files = await db.all(query, params);
  res.json(files);
});

// Delete file (Server Storage)
app.delete('/api/files/:id', auth, async (req, res) => {
  const fileId = Number(req.params.id);
  const file = await db.get('SELECT * FROM files WHERE id = ?', [fileId]);
  
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  // Check if user owns the file or is admin
  const user = await db.get('SELECT is_admin FROM users WHERE id = ?', [req.user.id]);
  if (file.uploaded_by !== req.user.id && !user.is_admin) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  
  // Slet kun den fysiske fil, hvis ingen anden række (fx en kopi) bruger samme disk-fil
  const filePath = path.join(UPLOADS_DIR, file.filename);
  const otherDiskUser = await db.get(
    "SELECT id FROM files WHERE filename = ? AND id != ? AND (storage_provider IS NULL OR storage_provider != ?) LIMIT 1",
    [file.filename, fileId, "r2"]
  );
  if (!otherDiskUser && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  
  // Delete from database
  await db.run('DELETE FROM files WHERE id = ?', [fileId]);
  
  // Delete from R2 (kun hvis ingen anden række bruger samme storage_key)
  await deleteR2ObjectIfUnused(file.storage_key, 'files', fileId);
  
  res.json({ success: true });
});

// Rename file
app.put('/api/files/:id/rename', auth, async (req, res) => {
  const fileId = Number(req.params.id);
  const { new_name } = req.body;
  
  if (!new_name || !new_name.trim()) {
    return res.status(400).json({ error: 'New name required' });
  }
  
  const file = await db.get('SELECT * FROM files WHERE id = ?', [fileId]);
  
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  // Check if user owns file or is admin
  const user = await db.get('SELECT is_admin FROM users WHERE id = ?', [req.user.id]);
  if (file.uploaded_by !== req.user.id && !user.is_admin) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  
  // Update file name
  await db.run('UPDATE files SET original_name = ? WHERE id = ?', [new_name.trim(), fileId]);
  
  const updatedFile = await db.get(`
    SELECT f.*, u.name as uploader_name
    FROM files f
    JOIN users u ON f.uploaded_by = u.id
    WHERE f.id = ?
  `, [fileId]);
  
  res.json(updatedFile);
});

// Move file to folder
app.put('/api/files/:id/move', auth, async (req, res) => {
  const fileId = Number(req.params.id);
  const { folder_id } = req.body;
  
  const file = await db.get('SELECT * FROM files WHERE id = ?', [fileId]);
  
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  // Check if user owns file or is admin
  const user = await db.get('SELECT is_admin FROM users WHERE id = ?', [req.user.id]);
  if (file.uploaded_by !== req.user.id && !user.is_admin) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  
  // If folder_id provided, verify it exists and user has access
  if (folder_id) {
    const folder = await db.get('SELECT * FROM folders WHERE id = ?', [folder_id]);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    // Check if user has access to folder (owner, company folder via canAccessCompanyFolder, or admin)
    if (folder.created_by !== req.user.id && !((await isInCompanyTree(folder)) && canAccessCompanyFolder(user)) && !user.is_admin) {
      return res.status(403).json({ error: 'Permission denied - folder access' });
    }
  }
  
  // Move file
  await db.run('UPDATE files SET folder_id = ? WHERE id = ?', [folder_id || null, fileId]);
  
  const updatedFile = await db.get(`
    SELECT f.*, u.name as uploader_name
    FROM files f
    JOIN users u ON f.uploaded_by = u.id
    WHERE f.id = ?
  `, [fileId]);
  
  res.json(updatedFile);
});

// --- FILE COPY (trin a3) ---
// Kopiér fil: ny selvstændig række (ejer = den, der kopierer, dato nu).
// R2-filer deler samme storage_key (slet fjerner kun objektet, når ingen række bruger det);
// disk-filer får en fysisk kopi, så sletning af den ene ikke rammer den anden.
app.post("/api/files/:id/copy", auth, async (req, res) => {
  const fileId = Number(req.params.id);
  const targetFolderId = req.body.folder_id || null;
  const me = req.user.id;
  try {
    const user = await db.get("SELECT is_admin FROM users WHERE id = ?", [me]);
    const file = await db.get("SELECT * FROM files WHERE id = ?", [fileId]);
    if (!file) return res.status(404).json({ error: "File not found" });

    // Læseadgang: egen fil, delt med mig, fil i firmamappen eller admin
    const sharedWithMe = await db.get("SELECT id FROM file_shares WHERE file_id = ? AND shared_with_user_id = ?", [fileId, me]);
    const srcFolder = file.folder_id ? await db.get("SELECT * FROM folders WHERE id = ?", [file.folder_id]) : null;
    const fromCompany = !!(srcFolder && (await isInCompanyTree(srcFolder)));
    const canRead = file.uploaded_by === me || file.owner_id === me || user.is_admin || !!sharedWithMe || (fromCompany && canAccessCompanyFolder(user));
    if (!canRead) return res.status(403).json({ error: "Permission denied" });

    // Skriveadgang til målmappen: egen mappe, Mine filer (ingen mappe) eller firmamappen
    if (targetFolderId) {
      const targetFolder = await db.get("SELECT * FROM folders WHERE id = ?", [targetFolderId]);
      if (!targetFolder) return res.status(404).json({ error: "Folder not found" });
      const canWrite = targetFolder.created_by === me || ((await isInCompanyTree(targetFolder)) && canAccessCompanyFolder(user)) || user.is_admin;
      if (!canWrite) return res.status(403).json({ error: "Permission denied - folder access" });
    }

    // Unikt navn i målmappen: navn (2).ext som i Windows
    const baseName = file.original_name || file.filename;
    const dot = baseName.lastIndexOf(".");
    const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
    const extPart = dot > 0 ? baseName.slice(dot) : "";
    let finalName = baseName;
    let n = 2;
    for (;;) {
      const clash = await db.get("SELECT id FROM files WHERE original_name = ? AND ((? IS NULL AND folder_id IS NULL) OR folder_id = ?) LIMIT 1", [finalName, targetFolderId, targetFolderId]);
      if (!clash) break;
      finalName = stem + " (" + n + ")" + extPart;
      n++;
    }

    let storageProvider = file.storage_provider || "disk";
    let storageKey = file.storage_key || null;
    let diskName = file.filename;
    let filePathValue = file.file_path;
    if (storageProvider !== "r2") {
      // Disk-fil: lav en fysisk kopi med nyt tilfældigt navn
      const src = path.join(UPLOADS_DIR, file.filename);
      if (!fs.existsSync(src)) return res.status(500).json({ error: "Kildefilen findes ikke længere på serveren" });
      diskName = Date.now() + "-" + Math.round(Math.random() * 1e9) + path.extname(file.filename || baseName);
      fs.copyFileSync(src, path.join(UPLOADS_DIR, diskName));
      filePathValue = "/uploads/" + diskName;
      storageProvider = "disk";
      storageKey = null;
    }

    const info = await db.run("INSERT INTO files (filename, original_name, file_path, file_size, mime_type, folder_id, uploaded_by, owner_id, storage_provider, storage_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [diskName, finalName, filePathValue, file.file_size, file.mime_type, targetFolderId, me, me, storageProvider, storageKey]);

    const newFile = await db.get("SELECT f.*, u.name as uploader_name, o.name as owner_name FROM files f JOIN users u ON f.uploaded_by = u.id LEFT JOIN users o ON f.owner_id = o.id WHERE f.id = ?", [info.lastInsertRowid]);
    console.log("Fil kopieret: " + finalName + " (bruger " + me + ")");
    res.json({ success: true, file: newFile, final_name: finalName });
  } catch (error) {
    console.error("Copy error:", error);
    res.status(500).json({ error: "Kunne ikke kopiere filen" });
  }
});

// Download file (Server Storage) - fungerer for både disk- og R2-filer
app.get('/api/files/download/:id', auth, async (req, res) => {
  const fileId = Number(req.params.id);
  const file = await db.get('SELECT * FROM files WHERE id = ?', [fileId]);

  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  await sendFileContent(file, res, 'attachment');
});

// Filindhold med valgfri disposition (inline til preview, attachment til download).
// Samme login-krav som resten af API'et - ingen offentlig adgang.
app.get('/api/files/:id/content', auth, async (req, res) => {
  const fileId = Number(req.params.id);
  const file = await db.get('SELECT * FROM files WHERE id = ?', [fileId]);

  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  const disposition = req.query.disposition === 'attachment' ? 'attachment' : 'inline';
  await sendFileContent(file, res, disposition);
});

// --- FILE SHARING ENDPOINTS ---

// Share file with user
app.post('/api/files/:id/share', auth, async (req, res) => {
  const fileId = Number(req.params.id);
  const { user_id, permission = 'view' } = req.body;
  
  if (!user_id) {
    return res.status(400).json({ error: 'User ID required' });
  }
  
  // Verify file exists and user owns it
  const file = await db.get('SELECT * FROM files WHERE id = ?', [fileId]);
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  if (file.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only file owner can share' });
  }
  
  // Verify target user exists
  const targetUser = await db.get('SELECT id, name, email FROM users WHERE id = ?', [user_id]);
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Check if already shared
  const existing = await db.get('SELECT id FROM file_shares WHERE file_id = ? AND shared_with_user_id = ?', [fileId, user_id]);
  if (existing) {
    return res.status(400).json({ error: 'File already shared with this user' });
  }
  
  // Create share
  const info = await db.run(`
    INSERT INTO file_shares (file_id, shared_with_user_id, permission, shared_by)
    VALUES (?, ?, ?, ?)
  `, [fileId, user_id, permission, req.user.id]);
  
  const share = await db.get(`
    SELECT fs.*, u.name as shared_with_name, u.email as shared_with_email
    FROM file_shares fs
    JOIN users u ON fs.shared_with_user_id = u.id
    WHERE fs.id = ?
  `, [info.lastInsertRowid]);
  
  res.json(share);
});

// Get users file is shared with
app.get('/api/files/:id/shares', auth, async (req, res) => {
  const fileId = Number(req.params.id);
  
  // Verify file exists and user owns it
  const file = await db.get('SELECT * FROM files WHERE id = ?', [fileId]);
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  if (file.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only file owner can view shares' });
  }
  
  const shares = await db.all(`
    SELECT fs.*, u.name as shared_with_name, u.email as shared_with_email,
           sharer.name as shared_by_name
    FROM file_shares fs
    JOIN users u ON fs.shared_with_user_id = u.id
    LEFT JOIN users sharer ON fs.shared_by = sharer.id
    WHERE fs.file_id = ?
    ORDER BY fs.created_at DESC
  `, [fileId]);
  
  res.json(shares);
});

// Unshare file (remove share)
app.delete('/api/files/:id/share/:userId', auth, async (req, res) => {
  const fileId = Number(req.params.id);
  const userId = Number(req.params.userId);
  
  // Verify file exists and user owns it
  const file = await db.get('SELECT * FROM files WHERE id = ?', [fileId]);
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  // Ejeren må stoppe enhver deling; modtageren må fjerne sin egen adgang; admins må alt
  const actor = await db.get('SELECT is_admin FROM users WHERE id = ?', [req.user.id]);
  const isRecipient = !!(await db.get('SELECT id FROM file_shares WHERE file_id = ? AND shared_with_user_id = ?', [fileId, userId]));
  if (file.owner_id !== req.user.id && !isRecipient && !actor.is_admin) {
    return res.status(403).json({ error: 'Only owner or recipient can remove share' });
  }
  
  await db.run('DELETE FROM file_shares WHERE file_id = ? AND shared_with_user_id = ?', [fileId, userId]);
  res.json({ success: true });
});

// --- Email Setup ---
let emailTransporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  emailTransporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

// --- Admin middleware ---
async function adminAuth(req, res, next) {
  const user = await db.get('SELECT is_admin FROM users WHERE id = ?', [req.user.id]);
  if (!user || !user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// --- Admin Routes ---

// Get pending user registrations
app.get('/api/admin/pending-users', auth, adminAuth, async (req, res) => {
  const pending = await db.all(`
    SELECT id, name, email, position, department, phone, created_at, status
    FROM pending_users
    WHERE status = 'pending'
    ORDER BY created_at DESC
  `);
  res.json(pending);
});

// Approve pending user
app.post('/api/admin/approve-user/:id', auth, adminAuth, async (req, res) => {
  const pendingId = Number(req.params.id);
  const pending = await db.get('SELECT * FROM pending_users WHERE id = ? AND status = \'pending\'', [pendingId]);
  
  if (!pending) {
    return res.status(404).json({ error: 'Pending user not found' });
  }
  
  // Create actual user
  const info = await db.run(`
    INSERT INTO users (name, email, password_hash, position, department, phone)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [pending.name, pending.email, pending.password_hash, pending.position, pending.department, pending.phone]);
  
  // Update pending status
  await db.run('UPDATE pending_users SET status = ? WHERE id = ?', ['approved', pendingId]);
  
  res.json({ success: true, userId: info.lastInsertRowid });
});

// Reject pending user
app.post('/api/admin/reject-user/:id', auth, adminAuth, async (req, res) => {
  const pendingId = Number(req.params.id);
  await db.run('UPDATE pending_users SET status = ? WHERE id = ?', ['rejected', pendingId]);
  res.json({ success: true });
});

// Generate invite code
app.post('/api/admin/generate-invite', auth, adminAuth, async (req, res) => {
  const { daysValid = 7 } = req.body;
  
  // Generate random code
  const code = Math.random().toString(36).substring(2, 10).toUpperCase() + 
               Math.random().toString(36).substring(2, 10).toUpperCase();
  
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + daysValid);
  
  const info = await db.run(`
    INSERT INTO invite_codes (code, created_by, expires_at)
    VALUES (?, ?, ?)
  `, [code, req.user.id, expiresAt.toISOString()]);
  
  const invite = await db.get('SELECT * FROM invite_codes WHERE id = ?', [info.lastInsertRowid]);
  res.json(invite);
});

// List all invite codes
app.get('/api/admin/invite-codes', auth, adminAuth, async (req, res) => {
  const codes = await db.all(`
    SELECT ic.*, 
           u1.name as created_by_name,
           u2.name as used_by_name
    FROM invite_codes ic
    LEFT JOIN users u1 ON ic.created_by = u1.id
    LEFT JOIN users u2 ON ic.used_by = u2.id
    ORDER BY ic.created_at DESC
    LIMIT 100
  `);
  res.json(codes);
});

// Delete invite code
app.delete('/api/admin/invite-codes/:id', auth, adminAuth, async (req, res) => {
  await db.run('DELETE FROM invite_codes WHERE id = ?', [Number(req.params.id)]);
  res.json({ success: true });
});

// Send email invitation
app.post('/api/admin/send-invitation', auth, adminAuth, async (req, res) => {
  const { email, name } = req.body;
  
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'Email required' });
  }
  
  if (!emailTransporter) {
    return res.status(500).json({ error: 'Email not configured. Please set EMAIL_USER and EMAIL_PASS in .env' });
  }
  
  try {
    // Check if email already exists
    const exists = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (exists) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }
    
    // Generate invite code
    const code = Math.random().toString(36).substring(2, 10).toUpperCase() + 
                 Math.random().toString(36).substring(2, 10).toUpperCase();
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days validity
    
    const info = await db.run(`
      INSERT INTO invite_codes (code, created_by, expires_at)
      VALUES (?, ?, ?)
    `, [code, req.user.id, expiresAt.toISOString()]);
    
    // Create registration URL (same origin as this server)
    const registrationUrl = `${req.protocol}://${req.get('host')}/register.html?code=${code}`;
    
    // Send email
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: 'Invitation til SG Seest Gulvteknik Portal',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 15px 30px; background: #667eea; color: white !important; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .code-box { background: white; border: 2px dashed #667eea; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 3px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #999; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Du er inviteret!</h1>
              <p>Velkommen til SG Seest Gulvteknik Portal</p>
            </div>
            <div class="content">
              ${name ? `<p>Hej ${name},</p>` : '<p>Hej!</p>'}
              
              <p>Du er blevet inviteret til at oprette en konto på <strong>SG Seest Gulvteknik Portal</strong> - vores nye interne kommunikationsplatform.</p>
              
              <p><strong>Din invitation kode:</strong></p>
              <div class="code-box">${code}</div>
              
              <p>Koden er gyldig i 7 dage.</p>
              
              <center>
                <a href="${registrationUrl}" class="button">📝 Opret Konto Nu</a>
              </center>
              
              <p>Eller kopiér denne kode og brug den når du registrerer dig på portalen.</p>
              
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              
              <h3>💡 Hvad kan du med SG Seest Gulvteknik Portal?</h3>
              <ul>
                <li>📰 Del og se opslag fra kolleger</li>
                <li>💬 Chat direkte med teamet</li>
                <li>📁 Upload og del filer</li>
                <li>👥 Se kollega oplysninger</li>
                <li>📞 Videoopkald (demo mode)</li>
              </ul>
            </div>
            <div class="footer">
              <p>Denne invitation blev sendt af ${req.user.name}</p>
              <p>© ${new Date().getFullYear()} SG Seest Gulvteknik ApS - Alle rettigheder forbeholdes</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
    
    await emailTransporter.sendMail(mailOptions);
    
    res.json({ 
      success: true, 
      message: `Invitation sendt til ${email}`,
      code: code,
      expires_at: expiresAt.toISOString()
    });
    
  } catch (error) {
    console.error('Email send error:', error);
    res.status(500).json({ error: 'Failed to send invitation: ' + error.message });
  }
});

// List all users (admin view with more details)
app.get('/api/admin/users', auth, adminAuth, async (req, res) => {
  const users = await db.all(`
    SELECT id, name, email, position, department, phone, is_admin, created_at
    FROM users
    ORDER BY created_at DESC
  `);
  res.json(users);
});

// Update user (admin: ret navn, email, stilling, afdeling; evt. nyt kodeord)
app.post('/api/admin/users/:id', auth, adminAuth, async (req, res) => {
  const userId = Number(req.params.id);
  const { name, email, position, department, phone, password } = req.body;

  if (!userId) return res.status(400).json({ error: 'Ugyldigt bruger-id' });
  const validationError = validateUserData({ name: name, email: email, requirePassword: false });
  if (validationError) return res.status(400).json({ error: validationError });
  if (password && String(password).length > 0 && String(password).length < 6) {
    return res.status(400).json({ error: 'Adgangskoden skal være mindst 6 tegn.' });
  }

  try {
    const user = await db.get('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const dup = await db.get('SELECT id FROM users WHERE email = ? AND id != ?', [String(email).trim().toLowerCase(), userId]);
    if (dup && dup.id) return res.status(409).json({ error: 'Email already in use' });

    await db.run('UPDATE users SET name = ?, email = ?, position = ?, department = ?, phone = ? WHERE id = ?', [
      String(name).trim(),
      String(email).trim().toLowerCase(),
      position || '',
      department || '',
      phone || '',
      userId
    ]);

    if (password && String(password).length >= 6) {
      await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(String(password), 10), userId]);
    }

    console.log('[admin] Bruger ' + userId + ' opdateret af ' + req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[admin] Opdatering af bruger ' + userId + ' fejlede:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Kunne ikke opdatere brugeren (databasefejl - se serverlog)' });
  }
});

// Make user admin
app.post('/api/admin/make-admin/:id', auth, adminAuth, async (req, res) => {
  await db.run('UPDATE users SET is_admin = 1 WHERE id = ?', [Number(req.params.id)]);
  res.json({ success: true });
});

// Remove admin rights
app.post('/api/admin/remove-admin/:id', auth, adminAuth, async (req, res) => {
  const userId = Number(req.params.id);
  
  // Don't allow removing own admin rights
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Cannot remove your own admin rights' });
  }
  
  await db.run('UPDATE users SET is_admin = 0 WHERE id = ?', [userId]);
  res.json({ success: true });
});

// Delete user
app.delete('/api/admin/users/:id', auth, adminAuth, async (req, res) => {
  const userId = Number(req.params.id);
  
  // Don't allow deleting yourself
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  
  const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // FK-sikker rækkefølge i transaktion: først rødder, derefter indhold, til sidst brugeren.
  // Chat-tabellerne og customers/quotes refererer til users(id) - de SKAL væk eller nulstilles,
  // ellers fejler sletningen (tidligere: ukontrolleret fejl -> server-crash -> 502 på alt).
  try {
    // Chat: læsekvitteringer -> deltagere -> beskeder -> tomøre-samtaler
    await db.run('DELETE FROM chat_reads WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM chat_participants WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM chat_messages WHERE sender_id = ?', [userId]);
    await db.run('DELETE FROM chat_conversations WHERE id NOT IN (SELECT DISTINCT conversation_id FROM chat_participants)');
    // Feed: reaktioner/kommentarer på brugerens opslag, derefter brugerens egne
    await db.run('DELETE FROM reactions WHERE post_id IN (SELECT id FROM posts WHERE user_id = ?)', [userId]);
    await db.run('DELETE FROM comments WHERE post_id IN (SELECT id FROM posts WHERE user_id = ?)', [userId]);
    await db.run('DELETE FROM reactions WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM comments WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM posts WHERE user_id = ?', [userId]);
    // Intern mail (beskeder)
    await db.run('DELETE FROM messages WHERE sender_id = ? OR recipient_id = ?', [userId, userId]);
    // Filer/mapper ejes af brugeren
    await db.run('DELETE FROM files WHERE uploaded_by = ?', [userId]);
    await db.run('DELETE FROM folders WHERE created_by = ?', [userId]);
    // Kunder/tilbud: bevar forretningsdata, nulstil blot ejerskabet (kolonner er nullable)
    await db.run('UPDATE customers SET created_by = NULL WHERE created_by = ?', [userId]);
    await db.run('UPDATE quotes SET created_by = NULL WHERE created_by = ?', [userId]);
    // Til sidst brugeren selv
    await db.run('DELETE FROM users WHERE id = ?', [userId]);
  } catch (err) {
    console.error('[admin] Sletning af bruger ' + userId + ' fejlede:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Kunne ikke slette brugeren (databasefejl - se serverlog)' });
  }
  
  console.log('[admin] Bruger ' + userId + ' (' + user.name + ') slettet af ' + req.user.id);
  res.json({ success: true, message: `User ${user.name} deleted` });
});

// ============================================================
// CHAT & VIDEO - Trin 1: database-migration, SSE-realtid, API
// ============================================================

// --- Migration med automatisk backup foer foerste koersel ---
// Backup: VACUUM INTO til backup-foer-chat.db (kun hvis filen ikke findes).
// Fejler backuppen, koerer migrationen IKKE (tydelig fejl i loggen).
async function initChatDatabase() {
  if (db._isProduction) {
    console.warn('[chat] PostgreSQL-mode: chat-migration ikke implementeret her (portalen koerer SQLite paa Render)');
    return;
  }
  const raw = db._raw;
  const dataDir = process.env.DATA_DIR || '';
  const backupPath = dataDir ? path.join(dataDir, 'backup-foer-chat.db') : path.join(__dirname, 'backup-foer-chat.db');
  try {
    if (fs.existsSync(backupPath)) {
      console.log('[chat] Backup findes allerede, springes over: ' + backupPath);
    } else {
      raw.exec("VACUUM INTO '" + backupPath.replace(/'/g, "''") + "'");
      console.log('[chat] BACKUP OK: ' + backupPath);
    }
  } catch (err) {
    console.error('[chat] FEJL: Backup af databasen mislykkedes - CHAT-MIGRATION KOERER IKKE! Browseren besoeg ikke chatten foer backup er undersoegt:', err);
    return;
  }
  raw.exec(
    'CREATE TABLE IF NOT EXISTS chat_conversations (' +
    ' id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    ' is_group INTEGER NOT NULL DEFAULT 0,' +
    " name TEXT DEFAULT ''," +
    ' created_by INTEGER REFERENCES users(id),' +
    " created_at TEXT NOT NULL DEFAULT (datetime('now'))" +
    ');' +
    'CREATE TABLE IF NOT EXISTS chat_participants (' +
    ' conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id),' +
    ' user_id INTEGER NOT NULL REFERENCES users(id),' +
    " joined_at TEXT NOT NULL DEFAULT (datetime('now'))," +
    ' PRIMARY KEY (conversation_id, user_id)' +
    ');' +
    'CREATE TABLE IF NOT EXISTS chat_messages (' +
    ' id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    ' conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id),' +
    ' sender_id INTEGER NOT NULL REFERENCES users(id),' +
    " body TEXT DEFAULT ''," +
    ' file_id INTEGER,' +
    " created_at TEXT NOT NULL DEFAULT (datetime('now'))" +
    ');' +
    'CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id, id);' +
    'CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id, created_at);' +
    'CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON chat_participants(user_id);' +
    'CREATE TABLE IF NOT EXISTS chat_reads (' +
    ' conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id),' +
    ' user_id INTEGER NOT NULL REFERENCES users(id),' +
    ' last_read_message_id INTEGER NOT NULL DEFAULT 0,' +
    ' PRIMARY KEY (conversation_id, user_id)' +
    ');'
  );
  const cols = raw.prepare('PRAGMA table_info(users)').all();
  if (!cols.some(function (c) { return c.name === 'last_seen_at'; })) {
    raw.exec("ALTER TABLE users ADD COLUMN last_seen_at TEXT DEFAULT ''");
    console.log('[chat] Kolonne users.last_seen_at tilfoejet');
  }
  const mcols = raw.prepare('PRAGMA table_info(chat_messages)').all();
  if (!mcols.some(function (c) { return c.name === 'is_system'; })) {
    raw.exec('ALTER TABLE chat_messages ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0');
    console.log('[chat] Kolonne chat_messages.is_system tilfoejet');
  }
  console.log('[chat] Chat-database klar');
}
await initChatDatabase();

// --- SSE-forbindelser (flere faner/enheder pr. bruger er tilladt) ---
const chatSseClients = new Map();   // userId -> Set(res)
const chatTickets = new Map();      // ticket -> { userId, expiresAt }
const chatRate = new Map();         // userId -> [timestamps]

function chatSseSend(userId, eventName, data) {
  const set = chatSseClients.get(userId);
  if (!set) return 0;
  const payload = 'event: ' + eventName + '\n' + 'data: ' + JSON.stringify(data) + '\n\n';
  let deliveredCount = 0;
  const dead = [];
  for (const res of set) {
    if (res.writableEnded || res.destroyed) { dead.push(res); continue; }
    try {
      const ok = res.write(payload);
      if (ok) deliveredCount++;
      else dead.push(res); // buffer-problem = typisk doed socket bag proxy
    } catch (e) { dead.push(res); /* forbindelsen er ved at lukke */ }
  }
  if (dead.length) {
    for (const d of dead) set.delete(d);
    if (set.size === 0) chatSseClients.delete(userId);
    console.log('[chat] signal ' + eventName + ': fjernede ' + dead.length + ' doed(e) SSE-forbindelse(r) for bruger ' + userId);
  }
  return deliveredCount;
}

function chatBroadcast(eventName, data) {
  for (const uid of Array.from(chatSseClients.keys())) chatSseSend(uid, eventName, data);
}

function chatOnline(userId) { return chatSseClients.has(userId); }

// Presence-snapshot broadcast hvert 60. sekund, saa alle kunder holder status frisk
setInterval(function () {
  if (chatSseClients.size > 0) chatBroadcast('chat_presence', Array.from(chatSseClients.keys()));
}, 60000);

// --- Engangs-ticket til SSE (saetter ALDRIG hele JWT i URL'en) ---
app.post('/api/chat/events-ticket', auth, async (req, res) => {
  const now = Date.now();
  for (const [t, v] of chatTickets) { if (v.expiresAt < now) chatTickets.delete(t); }
  const ticket = crypto.randomBytes(24).toString('hex');
  chatTickets.set(ticket, { userId: req.user.id, expiresAt: now + 30000 }); // 30 sek., bruges 1 gang
  res.json({ ticket });
});

// --- SSE-kanalen ---
app.get('/api/chat/events', async (req, res) => {
  const ticket = String(req.query.ticket || '');
  const now = Date.now();
  const entry = chatTickets.get(ticket);
  chatTickets.delete(ticket); // engangsbrug
  if (!entry || entry.expiresAt < now) {
    return res.status(401).json({ error: 'Ugyldig eller udoebet chat-ticket' });
  }
  const userId = entry.userId;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  res.write('event: connected\ndata: ' + JSON.stringify({ userId: userId }) + '\n\n');
  if (!chatSseClients.has(userId)) chatSseClients.set(userId, new Set());
  chatSseClients.get(userId).add(res);
  db.run("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?", [userId]).catch(function () {});
  chatBroadcast('chat_presence', Array.from(chatSseClients.keys()));
  const ping = setInterval(function () {
    // Synligt heartbeat-event: klienten kan bevise at server->browser retningen virker
    try { res.write('event: chat_ping\ndata: {}\n\n'); } catch (e) {
      // Doed forbindelse: fjern den med det samme, saa delivered-taellet bliver aerligt
      clearInterval(ping);
      const s2 = chatSseClients.get(userId);
      if (s2) { s2.delete(res); if (s2.size === 0) chatSseClients.delete(userId); }
      try { res.end(); } catch (e2) { /* ignoreret */ }
    }
  }, 25000);
  req.on('close', function () {
    clearInterval(ping);
    const set = chatSseClients.get(userId);
    if (set) {
      set.delete(res);
      if (set.size === 0) {
        chatSseClients.delete(userId);
        db.run("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?", [userId]).catch(function () {});
      }
    }
    chatBroadcast('chat_presence', Array.from(chatSseClients.keys()));
  });
});

// --- Hjaelpere ---
async function chatIsParticipant(conversationId, userId) {
  const row = await db.get('SELECT 1 AS ok FROM chat_participants WHERE conversation_id = ? AND user_id = ?', [conversationId, userId]);
  return !!row;
}

async function chatOtherParticipants(conversationId, userId) {
  return await db.all('SELECT user_id FROM chat_participants WHERE conversation_id = ? AND user_id != ?', [conversationId, userId]);
}

async function chatGetOrCreateConversation(userId, peerId) {
  const existing = await db.get(
    'SELECT c.id FROM chat_conversations c ' +
    'WHERE c.is_group = 0 ' +
    'AND (SELECT COUNT(*) FROM chat_participants pc WHERE pc.conversation_id = c.id) = 2 ' +
    'AND EXISTS (SELECT 1 FROM chat_participants p1 WHERE p1.conversation_id = c.id AND p1.user_id = ?) ' +
    'AND EXISTS (SELECT 1 FROM chat_participants p2 WHERE p2.conversation_id = c.id AND p2.user_id = ?)',
    [userId, peerId]
  );
  if (existing) return { id: existing.id, created: false };
  const info = await db.run('INSERT INTO chat_conversations (is_group, created_by) VALUES (0, ?)', [userId]);
  const convId = Number(info.lastInsertRowid);
  await db.run('INSERT INTO chat_participants (conversation_id, user_id) VALUES (?, ?)', [convId, userId]);
  await db.run('INSERT INTO chat_participants (conversation_id, user_id) VALUES (?, ?)', [convId, peerId]);
  return { id: convId, created: true };
}

// --- Samtaleliste (seneste besked, ulaeste tal, online-status) ---
app.get('/api/chat/conversations', auth, async (req, res) => {
  try {
    const convs = await db.all(
      'SELECT c.id, c.is_group, c.name, c.created_at FROM chat_conversations c ' +
      'JOIN chat_participants p ON p.conversation_id = c.id WHERE p.user_id = ?',
      [req.user.id]
    );
    const out = [];
    for (const c of convs) {
      const peer = await db.get(
        'SELECT u.id, u.name, u.position, u.last_seen_at, u.avatar_url FROM chat_participants p JOIN users u ON u.id = p.user_id ' +
        'WHERE p.conversation_id = ? AND p.user_id != ?',
        [c.id, req.user.id]
      );
      const last = await db.get(
        'SELECT m.id, m.sender_id, m.body, m.created_at, u.name AS sender_name FROM chat_messages m JOIN users u ON u.id = m.sender_id ' +
        'WHERE m.conversation_id = ? ORDER BY m.id DESC LIMIT 1',
        [c.id]
      );
      const unread = await db.get(
        'SELECT COUNT(*) AS n FROM chat_messages m WHERE m.conversation_id = ? AND m.sender_id != ? AND m.is_system = 0 ' +
        'AND m.id > COALESCE((SELECT last_read_message_id FROM chat_reads WHERE conversation_id = ? AND user_id = ?), 0)',
        [c.id, req.user.id, c.id, req.user.id]
      );
      const peerReadRow = await db.get(
        'SELECT last_read_message_id AS v FROM chat_reads WHERE conversation_id = ? AND user_id = ?',
        [c.id, peer ? peer.id : 0]
      );
      out.push({
        id: c.id,
        is_group: c.is_group,
        name: c.name,
        peer: peer || null,
        peer_online: peer ? chatOnline(peer.id) : false,
        peer_last_read: peerReadRow ? peerReadRow.v : 0,
        last_message: last || null,
        unread: unread ? unread.n : 0
      });
    }
    out.sort(function (a, b) {
      const ta = a.last_message ? a.last_message.id : 0;
      const tb = b.last_message ? b.last_message.id : 0;
      return tb - ta;
    });
    res.json(out);
  } catch (err) {
    console.error('[chat] conversations error:', err);
    res.status(500).json({ error: 'Kunne ikke hente samtaler' });
  }
});

// --- Faa eller opret 1-til-1-samtale ---
app.post('/api/chat/conversations', auth, async (req, res) => {
  try {
    const peerId = Number(req.body && req.body.peerId);
    if (!peerId || peerId === req.user.id) return res.status(400).json({ error: 'Ugyldig modtager' });
    const peer = await db.get('SELECT id FROM users WHERE id = ?', [peerId]);
    if (!peer) return res.status(404).json({ error: 'Bruger findes ikke' });
    const conv = await chatGetOrCreateConversation(req.user.id, peerId);
    res.json({ conversationId: conv.id, created: conv.created });
  } catch (err) {
    console.error('[chat] create conversation error:', err);
    res.status(500).json({ error: 'Kunne ikke oprette samtale' });
  }
});

// --- Historik + "det man missede" (after = sidst sete besked-id) ---
app.get('/api/chat/conversations/:id/messages', auth, async (req, res) => {
  try {
    const convId = Number(req.params.id);
    if (!(await chatIsParticipant(convId, req.user.id))) return res.status(403).json({ error: 'Adgang naegtet' });
    const after = Number(req.query.after || 0);
    const rows = await db.all(
      'SELECT m.id, m.conversation_id, m.sender_id, m.body, m.file_id, m.is_system, m.created_at, u.name AS sender_name ' +
      'FROM chat_messages m JOIN users u ON u.id = m.sender_id ' +
      'WHERE m.conversation_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT 200',
      [convId, after]
    );
    res.json(rows);
  } catch (err) {
    console.error('[chat] messages error:', err);
    res.status(500).json({ error: 'Kunne ikke hente beskeder' });
  }
});

// --- Send besked (maks 2000 tegn, rate-limit 30/min pr. bruger) ---
app.post('/api/chat/messages', auth, async (req, res) => {
  try {
    const convId = Number(req.body && req.body.conversationId);
    const body = String((req.body && req.body.body) || '').trim();
    if (!convId || !(await chatIsParticipant(convId, req.user.id))) return res.status(403).json({ error: 'Adgang naegtet' });
    if (!body) return res.status(400).json({ error: 'Beskeden er tom' });
    if (body.length > 2000) return res.status(400).json({ error: 'Beskeden er for lang (maks 2000 tegn)' });
    const now = Date.now();
    const arr = (chatRate.get(req.user.id) || []).filter(function (t) { return t > now - 60000; });
    if (arr.length >= 30) return res.status(429).json({ error: 'Du sender for hurtigt - vent et oejeblik' });
    arr.push(now);
    chatRate.set(req.user.id, arr);
    const info = await db.run('INSERT INTO chat_messages (conversation_id, sender_id, body) VALUES (?, ?, ?)', [convId, req.user.id, body]);
    const msg = await db.get(
      'SELECT m.id, m.conversation_id, m.sender_id, m.body, m.file_id, m.is_system, m.created_at, u.name AS sender_name ' +
      'FROM chat_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?',
      [Number(info.lastInsertRowid)]
    );
    const others = await chatOtherParticipants(convId, req.user.id);
    for (const o of others) chatSseSend(o.user_id, 'chat_message', msg);
    res.json(msg);
  } catch (err) {
    console.error('[chat] send error:', err);
    res.status(500).json({ error: 'Kunne ikke sende besked' });
  }
});

// --- Markoer som laest (ulaeste tal + "Set" paa modtagers beskeder) ---
app.post('/api/chat/read', auth, async (req, res) => {
  try {
    const convId = Number(req.body && req.body.conversationId);
    if (!convId || !(await chatIsParticipant(convId, req.user.id))) return res.status(403).json({ error: 'Adgang naegtet' });
    const last = await db.get('SELECT MAX(id) AS maxId FROM chat_messages WHERE conversation_id = ?', [convId]);
    const maxId = last && last.maxId ? Number(last.maxId) : 0;
    await db.run(
      'INSERT INTO chat_reads (conversation_id, user_id, last_read_message_id) VALUES (?, ?, ?) ' +
      'ON CONFLICT(conversation_id, user_id) DO UPDATE SET last_read_message_id = excluded.last_read_message_id',
      [convId, req.user.id, maxId]
    );
    const others = await chatOtherParticipants(convId, req.user.id);
    for (const o of others) chatSseSend(o.user_id, 'chat_read', { conversationId: convId, userId: req.user.id, lastReadMessageId: maxId });
    res.json({ ok: true, lastReadMessageId: maxId });
  } catch (err) {
    console.error('[chat] read error:', err);
    res.status(500).json({ error: 'Kunne ikke markere laest' });
  }
});

// --- "Skriver..."-indikator ---
app.post('/api/chat/typing', auth, async (req, res) => {
  try {
    const convId = Number(req.body && req.body.conversationId);
    const typing = !!(req.body && req.body.typing);
    if (!convId || !(await chatIsParticipant(convId, req.user.id))) return res.status(403).json({ error: 'Adgang naegtet' });
    const others = await chatOtherParticipants(convId, req.user.id);
    for (const o of others) chatSseSend(o.user_id, 'chat_typing', { conversationId: convId, userId: req.user.id, typing: typing });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Kunne ikke sende skriver-status' });
  }
});

// --- WebRTC-signalering: validerer og videresender til modparten over SSE ---
app.post('/api/chat/signal', auth, async (req, res) => {
  try {
    const convId = Number(req.body && req.body.conversationId);
    const type = String((req.body && req.body.type) || '');
    const callId = String((req.body && req.body.callId) || '');
    const payload = (req.body && req.body.payload) || null;
    if (!convId || !type || !callId) return res.status(400).json({ error: 'Ugyldigt signal' });
    if (!(await chatIsParticipant(convId, req.user.id))) return res.status(403).json({ error: 'Adgang naegtet' });
    const others = await chatOtherParticipants(convId, req.user.id);
    let delivered = 0;
    for (const o of others) {
    const set = chatSseClients.get(o.user_id);
    console.log('[chat] signal ' + type + ': modtager ' + o.user_id + ' - ' + (set ? set.size + ' forbindelse(r)' : 'INGEN SSE-forbindelse'));
    delivered += chatSseSend(o.user_id, 'chat_signal', {
        conversationId: convId,
        callId: callId,
        type: type,
        payload: payload,
        fromUserId: req.user.id,
        fromName: req.user.name
      });
    };
    res.json({ ok: true, delivered: delivered, recipients: others.length });
  } catch (err) {
    console.error('[chat] signal error:', err);
    res.status(500).json({ error: 'Kunne ikke sende signal' });
  }
});

// --- Opkalds-log: lille systembesked i samtalen (taelles IKKE som ulaest) ---
app.post('/api/chat/call-log', auth, async (req, res) => {
  try {
    const convId = Number(req.body && req.body.conversationId);
    const status = String((req.body && req.body.status) || '');
    const seconds = Math.max(0, Number((req.body && req.body.seconds) || 0));
    if (!convId || !(await chatIsParticipant(convId, req.user.id))) return res.status(403).json({ error: 'Adgang naegtet' });
    let text;
    if (status === 'ended') {
      const mm = Math.floor(seconds / 60);
      const ss = String(seconds % 60).padStart(2, '0');
      text = 'Videoopkald, ' + mm + ':' + ss;
    } else if (status === 'missed') text = 'Ubesvaret opkald';
    else if (status === 'rejected') text = 'Afvist opkald';
    else text = 'Videoopkald fejlede';
    const info = await db.run(
      'INSERT INTO chat_messages (conversation_id, sender_id, body, is_system) VALUES (?, ?, ?, 1)',
      [convId, req.user.id, text]
    );
    const msg = await db.get(
      'SELECT m.id, m.conversation_id, m.sender_id, m.body, m.file_id, m.is_system, m.created_at, u.name AS sender_name ' +
      'FROM chat_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?',
      [Number(info.lastInsertRowid)]
    );
    const others = await chatOtherParticipants(convId, req.user.id);
    for (const o of others) chatSseSend(o.user_id, 'chat_message', msg);
    res.json(msg);
  } catch (err) {
    console.error('[chat] call-log error:', err);
    res.status(500).json({ error: 'Kunne ikke logge opkald' });
  }
});

// --- ICE-servere: STUN altid; TURN KUN hvis miljo-variabler er sat (ingen hemmeligheder i koden) ---
app.get('/api/chat/ice', auth, (req, res) => {
  const servers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];
  const turnUrl = process.env.TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_CREDENTIAL || ''
    });
  }
  res.json({ iceServers: servers });
});

// --- Presence: kolleger med online-status og "sidst set" ---
app.get('/api/chat/presence', auth, async (req, res) => {
  try {
    const users = await db.all('SELECT id, name, position, last_seen_at, avatar_url FROM users');
    res.json(users.map(function (u) {
      return { id: u.id, name: u.name, position: u.position, last_seen_at: u.last_seen_at || '', online: chatOnline(u.id), avatar_url: u.avatar_url || '' };
    }));
  } catch (err) {
    res.status(500).json({ error: 'Kunne ikke hente presence' });
  }
});

// --- QUOTES & CUSTOMERS API ---

// Helper function to generate order number for main orders
async function generateOrderNumber() {
  const lastQuote = await db.get(`
    SELECT order_number FROM quotes 
    WHERE parent_order_id IS NULL 
    ORDER BY id DESC LIMIT 1
  `);
  
  let nextNum = 1;
  if (lastQuote) {
    nextNum = parseInt(lastQuote.order_number) + 1;
  }
  
  return String(nextNum).padStart(4, '0'); // 0001, 0002, 0003...
}

// Helper function to generate extra work number (sub-order)
async function generateExtraWorkNumber(parentOrderId) {
  const parent = await db.get('SELECT order_number FROM quotes WHERE id = ?', [parentOrderId]);
  
  if (!parent) {
    throw new Error('Parent order not found');
  }
  
  const lastSub = await db.get(`
    SELECT sub_number FROM quotes 
    WHERE parent_order_id = ? 
    ORDER BY sub_number DESC LIMIT 1
  `, [parentOrderId]);
  
  const subNum = lastSub ? lastSub.sub_number + 1 : 1;
  const subStr = String(subNum).padStart(2, '0');
  
  return `${parent.order_number}-${subStr}`; // 0001-01, 0001-02...
}

// Helper function to generate invoice number
async function generateInvoiceNumber() {
  const lastInvoice = await db.get('SELECT invoice_number FROM invoices ORDER BY id DESC LIMIT 1');
  
  let nextNum = 5000; // Start from 5000
  if (lastInvoice) {
    nextNum = parseInt(lastInvoice.invoice_number) + 1;
  }
  
  return String(nextNum); // 5000, 5001, 5002...
}

// Helper function to get full order number (for display)
async function getFullOrderNumber(quote) {
  if (quote.is_extra_work && quote.parent_order_id) {
    const parent = await db.get('SELECT order_number FROM quotes WHERE id = ?', [quote.parent_order_id]);
    const subStr = String(quote.sub_number).padStart(2, '0');
    return `${parent.order_number}-${subStr}`;
  }
  return quote.order_number;
}

// Customers endpoints
app.get('/api/customers', auth, async (req, res) => {
  const customers = await db.all(`
    SELECT c.*, u.name as created_by_name
    FROM customers c
    JOIN users u ON c.created_by = u.id
    ORDER BY c.company_name ASC
  `);
  res.json(customers);
});

app.get('/api/customers/:id', auth, async (req, res) => {
  const customer = await db.get(`
    SELECT c.*, u.name as created_by_name
    FROM customers c
    JOIN users u ON c.created_by = u.id
    WHERE c.id = ?
  `, [Number(req.params.id)]);
  
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  res.json(customer);
});

app.post('/api/customers', auth, async (req, res) => {
  const { customer_number, company_name, contact_person, att_person, email, phone, address, postal_code, city, cvr_number } = req.body;
  
  if (!company_name) {
    return res.status(400).json({ error: 'Company name required' });
  }
  
  // Auto-generate customer number if not provided
  let finalCustomerNumber = customer_number;
  if (!finalCustomerNumber || !finalCustomerNumber.trim()) {
    const lastCustomer = await db.get('SELECT customer_number FROM customers WHERE customer_number IS NOT NULL ORDER BY id DESC LIMIT 1');
    
    if (lastCustomer && lastCustomer.customer_number) {
      const lastNum = parseInt(lastCustomer.customer_number);
      if (!isNaN(lastNum)) {
        finalCustomerNumber = String(lastNum + 1);
      } else {
        finalCustomerNumber = '1';
      }
    } else {
      finalCustomerNumber = '1';
    }
  }
  
  const info = await db.run(`
    INSERT INTO customers (customer_number, company_name, contact_person, att_person, email, phone, address, postal_code, city, cvr_number, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [finalCustomerNumber, company_name, contact_person || null, att_person || null, email || null, phone || null, address || null, postal_code || null, city || null, cvr_number || null, req.user.id]);
  
  const customer = await db.get(`
    SELECT c.*, u.name as created_by_name
    FROM customers c
    JOIN users u ON c.created_by = u.id
    WHERE c.id = ?
  `, [info.lastInsertRowid]);
  
  res.json(customer);
});

app.put('/api/customers/:id', auth, async (req, res) => {
  const customerId = Number(req.params.id);
  const { customer_number, company_name, contact_person, att_person, email, phone, address, postal_code, city, cvr_number } = req.body;
  
  const customer = await db.get('SELECT * FROM customers WHERE id = ?', [customerId]);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  
  await db.run(`
    UPDATE customers SET
      customer_number = ?,
      company_name = ?,
      contact_person = ?,
      att_person = ?,
      email = ?,
      phone = ?,
      address = ?,
      postal_code = ?,
      city = ?,
      cvr_number = ?
    WHERE id = ?
  `, [customer_number || customer.customer_number, company_name, contact_person || null, att_person || null, email || null, phone || null, address || null, postal_code || null, city || null, cvr_number || null, customerId]);
  
  const updated = await db.get(`
    SELECT c.*, u.name as created_by_name
    FROM customers c
    JOIN users u ON c.created_by = u.id
    WHERE c.id = ?
  `, [customerId]);
  
  res.json(updated);
});

app.delete('/api/customers/:id', auth, async (req, res) => {
  const customerId = Number(req.params.id);
  
  // Check if customer has quotes
  const quoteCount = await db.get('SELECT COUNT(*) as cnt FROM quotes WHERE customer_id = ?', [customerId]);
  if (quoteCount.cnt > 0) {
    return res.status(400).json({ error: 'Cannot delete customer with existing quotes' });
  }
  
  await db.run('DELETE FROM customers WHERE id = ?', [customerId]);
  res.json({ success: true });
});

// --- CUSTOMER CONTACTS API ---

// Get all contacts for a customer
app.get('/api/customers/:customerId/contacts', auth, async (req, res) => {
  const customerId = Number(req.params.customerId);
  
  const contacts = await db.all(`
    SELECT * FROM customer_contacts
    WHERE customer_id = ?
    ORDER BY is_primary DESC, name ASC
  `, [customerId]);
  
  res.json(contacts);
});

// Create a new contact
app.post('/api/customers/:customerId/contacts', auth, async (req, res) => {
  const customerId = Number(req.params.customerId);
  const { name, title, email, phone, is_primary } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  
  // If this is marked as primary, unmark other primaries
  if (is_primary) {
    await db.run('UPDATE customer_contacts SET is_primary = 0 WHERE customer_id = ?', [customerId]);
  }
  
  const info = await db.run(`
    INSERT INTO customer_contacts (customer_id, name, title, email, phone, is_primary)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [customerId, name.trim(), title || null, email || null, phone || null, is_primary ? 1 : 0]);
  
  const contact = await db.get('SELECT * FROM customer_contacts WHERE id = ?', [info.lastInsertRowid]);
  res.json(contact);
});

// Update a contact
app.put('/api/customers/:customerId/contacts/:contactId', auth, async (req, res) => {
  const customerId = Number(req.params.customerId);
  const contactId = Number(req.params.contactId);
  const { name, title, email, phone, is_primary } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  
  // If this is marked as primary, unmark other primaries
  if (is_primary) {
    await db.run('UPDATE customer_contacts SET is_primary = 0 WHERE customer_id = ? AND id != ?', [customerId, contactId]);
  }
  
  await db.run(`
    UPDATE customer_contacts SET
      name = ?,
      title = ?,
      email = ?,
      phone = ?,
      is_primary = ?
    WHERE id = ? AND customer_id = ?
  `, [name.trim(), title || null, email || null, phone || null, is_primary ? 1 : 0, contactId, customerId]);
  
  const contact = await db.get('SELECT * FROM customer_contacts WHERE id = ?', [contactId]);
  res.json(contact);
});

// Delete a contact
app.delete('/api/customers/:customerId/contacts/:contactId', auth, async (req, res) => {
  const contactId = Number(req.params.contactId);
  await db.run('DELETE FROM customer_contacts WHERE id = ?', [contactId]);
  res.json({ success: true });
});

// --- CUSTOMER CONTACTS API (duplicate section removed) ---
// All customer contacts endpoints have been deduplicated above

// Quotes endpoints
app.get('/api/quotes', auth, async (req, res) => {
  const quotes = await db.all(`
    SELECT q.*, c.company_name as customer_name, u.name as created_by_name
    FROM quotes q
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON q.created_by = u.id
    ORDER BY q.id DESC
  `);
  
  // For each main order (not extra work), calculate aggregated stats
  const enrichedQuotes = [];
  for (const quote of quotes) {
    // If this is extra work, return as-is (it's already aggregated in its parent)
    if (quote.is_extra_work || quote.parent_order_id) {
      enrichedQuotes.push(quote);
      continue;
    }
    
    // Get all extra work orders for this main order
    const extraWorkOrders = await db.all(`
      SELECT * FROM quotes WHERE parent_order_id = ?
    `, [quote.id]);
    
    // Calculate main order revenue
    const revenue_main = quote.total || 0;
    
    // Calculate extra work revenue
    const revenue_extra = extraWorkOrders.reduce((sum, eo) => sum + (eo.total || 0), 0);
    
    // Calculate total revenue
    const revenue = revenue_main + revenue_extra;
    
    // Get main order expenses
    const mainExpenses = await db.get(`
      SELECT SUM(amount) as total FROM order_expenses WHERE order_id = ?
    `, [quote.id]);
    let expenses_main = mainExpenses?.total || 0;
    
    // Add labor/material costs (order_materials) as expenses - excludes sick time (material_number '1')
    const mainMaterialCost = await db.get(`
      SELECT SUM(om.total_cost) as total
      FROM order_materials om
      LEFT JOIN materials m ON om.material_id = m.id
      WHERE om.order_id = ? AND (m.material_number IS NULL OR m.material_number != '1')
    `, [quote.id]);
    const mainLaborCost = mainMaterialCost?.total || 0;
    expenses_main += mainLaborCost;
    
    // Get extra work expenses
    let expenses_extra = 0;
    let extraLaborCost = 0;
    for (const eo of extraWorkOrders) {
      const extraExpenses = await db.get(`
        SELECT SUM(amount) as total FROM order_expenses WHERE order_id = ?
      `, [eo.id]);
      expenses_extra += (extraExpenses?.total || 0);
      
      const extraMaterialCost = await db.get(`
        SELECT SUM(om.total_cost) as total
        FROM order_materials om
        LEFT JOIN materials m ON om.material_id = m.id
        WHERE om.order_id = ? AND (m.material_number IS NULL OR m.material_number != '1')
      `, [eo.id]);
      extraLaborCost += (extraMaterialCost?.total || 0);
      expenses_extra += (extraMaterialCost?.total || 0);
    }
    
    // Calculate total expenses
    const expenses = expenses_main + expenses_extra;
    
    // Calculate profit
    const profit_main = revenue_main - expenses_main;
    const profit_extra = revenue_extra - expenses_extra;
    const profit = revenue - expenses;
    
    // Return quote with aggregated stats
    enrichedQuotes.push({
      ...quote,
      revenue,
      revenue_main,
      revenue_extra,
      expenses,
      expenses_main,
      expenses_extra,
      profit,
      profit_main,
      profit_extra,
      profit_margin: revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0,
      extra_work_count: extraWorkOrders.length
    });
  }
  
  // Montoer: kun igangvaerende hovedordrer, uden oekonomi
  if (isMontor(req)) {
    res.json(enrichedQuotes.filter(isInProgressOrder).map(stripEconomy));
  } else {
    res.json(enrichedQuotes);
  }
});

app.get('/api/quotes/:id', auth, async (req, res) => {
  const quoteId = Number(req.params.id);
  
  const quote = await db.get(`
    SELECT q.*, c.*, u.name as created_by_name,
           c.company_name, c.contact_person, c.email as customer_email, 
           c.phone as customer_phone, c.address, c.postal_code, c.city, c.cvr_number
    FROM quotes q
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON q.created_by = u.id
    WHERE q.id = ?
  `, [quoteId]);
  
  if (!quote) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  
  // Montoer: kun igangvaerende ordrer, laesetilstand uden oekonomi
  if (isMontor(req)) {
    if (!isInProgressOrder(quote)) return res.status(403).json({ error: 'Adgang nægtet' });
  }
  
  // If contact_person_id is set, get contact person details
  if (quote.contact_person_id) {
    const contactPerson = await db.get('SELECT * FROM customer_contacts WHERE id = ?', [quote.contact_person_id]);
    if (contactPerson) {
      quote.selected_contact = contactPerson;
      // Override default contact person with selected one
      quote.contact_person_name = contactPerson.name;
      quote.contact_person_title = contactPerson.title;
      quote.contact_person_email = contactPerson.email;
      quote.contact_person_phone = contactPerson.phone;
    }
  }
  
  const lines = await db.all('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY sort_order, id', [quoteId]);
  const attachments = await db.all(`
    SELECT qa.*, u.name as uploaded_by_name
    FROM quote_attachments qa
    JOIN users u ON qa.uploaded_by = u.id
    WHERE qa.quote_id = ?
  `, [quoteId]);

  // Flag: har ordren en godkendt (ikke-kladde) faktura? (bruges af stepper/badges)
  const approvedInvoice = await db.get("SELECT id, status FROM invoices WHERE order_id = ? AND status != 'draft' LIMIT 1", [quoteId]);
  quote.has_approved_invoice = !!approvedInvoice;
  if (approvedInvoice) quote.approved_invoice_status = approvedInvoice.status;

  quote.lines = lines;
  quote.attachments = attachments;
  
  // Montoer: fjern alle oekonomifelter inden svaret sendes
  if (isMontor(req)) stripEconomy(quote);
  
  res.json(quote);
});

app.post('/api/quotes', auth, async (req, res) => {
  try {
    // Montoer kan ikke oprette tilbud/ordrer
    if (isMontor(req)) return res.status(403).json({ error: 'Adgang nægtet - kun Ledelsen kan oprette ordrer' });
    const { customer_id, title, valid_until, notes, terms, lines, requisition_number, contact_person_id } = req.body;
    
    if (!customer_id || !title || !lines || lines.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const order_number = await generateOrderNumber(); // 0001, 0002...
  
  // Calculate totals
  let subtotal = 0;
  lines.forEach(line => {
    const discount_amount = (line.unit_price * line.quantity * (line.discount_percent || 0)) / 100;
    const line_total = (line.unit_price * line.quantity) - discount_amount;
    subtotal += line_total;
  });
  
  const vat_rate = 25;
  const vat_amount = subtotal * (vat_rate / 100);
  const total = subtotal + vat_amount;
  
  // Create main quote/order (is_extra_work = 0, parent_order_id = NULL)
  // Use order_number as quote_number for backwards compatibility
  const quoteInfo = await db.run(`
    INSERT INTO quotes (quote_number, order_number, parent_order_id, sub_number, is_extra_work, customer_id, contact_person_id, title, requisition_number, valid_until, notes, terms, subtotal, vat_rate, vat_amount, total, created_by)
    VALUES (?, ?, NULL, NULL, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [order_number, order_number, customer_id, contact_person_id || null, title, requisition_number || null, valid_until || null, notes || null, terms || null, subtotal, vat_rate, vat_amount, total, req.user.id]);
  
  const quoteId = quoteInfo.lastInsertRowid;
  
  // Create lines
  for (const [index, line] of lines.entries()) {
    const discount_amount = (line.unit_price * line.quantity * (line.discount_percent || 0)) / 100;
    const line_total = (line.unit_price * line.quantity) - discount_amount;
    
    await db.run(`
      INSERT INTO quote_lines (quote_id, description, quantity, unit, unit_price, discount_percent, discount_amount, line_total, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [quoteId, line.description, line.quantity, line.unit, line.unit_price, line.discount_percent || 0, discount_amount, line_total, index]);
  }
  
  // Log quote creation event
  await logOrderEvent(quoteId, 'quote_created', `Tilbud ${order_number} oprettet: ${title}`, req.user.id);
  
  const quote = await db.get(`
    SELECT q.*, c.company_name as customer_name, u.name as created_by_name
    FROM quotes q
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON q.created_by = u.id
    WHERE q.id = ?
  `, [quoteId]);
  
    // Add full_order_number for display
    quote.full_order_number = await getFullOrderNumber(quote);
    
    res.json(quote);
  } catch (error) {
    console.error('Create quote error:', error);
    res.status(500).json({ error: 'Failed to create quote: ' + error.message });
  }
});

app.put('/api/quotes/:id', auth, async (req, res) => {
  // Montoer kan ikke redigere ordrer (laesetilstand)
  if (isMontor(req)) return res.status(403).json({ error: 'Adgang nægtet - kun Ledelsen kan redigere ordrer' });
  const quoteId = Number(req.params.id);
  const { customer_id, title, valid_until, notes, terms, lines, status, contact_person_id } = req.body;
  
  const quote = await db.get('SELECT * FROM quotes WHERE id = ?', [quoteId]);
  if (!quote) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  
  // Calculate totals
  let subtotal = 0;
  if (lines) {
    lines.forEach(line => {
      const discount_amount = (line.unit_price * line.quantity * (line.discount_percent || 0)) / 100;
      const line_total = (line.unit_price * line.quantity) - discount_amount;
      subtotal += line_total;
    });
  }
  
  const vat_rate = 25;
  const vat_amount = subtotal * (vat_rate / 100);
  const total = subtotal + vat_amount;
  
  // Update quote
  await db.run(`
    UPDATE quotes SET
      customer_id = ?,
      contact_person_id = ?,
      title = ?,
      valid_until = ?,
      notes = ?,
      terms = ?,
      subtotal = ?,
      vat_amount = ?,
      total = ?,
      status = ?
    WHERE id = ?
  `, [customer_id, contact_person_id !== undefined ? contact_person_id : quote.contact_person_id, title, valid_until || null, notes || null, terms || null, subtotal, vat_amount, total, status || quote.status, quoteId]);
  
  // Update lines if provided
  if (lines) {
    // Delete old lines
    await db.run('DELETE FROM quote_lines WHERE quote_id = ?', [quoteId]);
    
    // Create new lines
    for (const [index, line] of lines.entries()) {
      const discount_amount = (line.unit_price * line.quantity * (line.discount_percent || 0)) / 100;
      const line_total = (line.unit_price * line.quantity) - discount_amount;
      
      await db.run(`
        INSERT INTO quote_lines (quote_id, description, quantity, unit, unit_price, discount_percent, discount_amount, line_total, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [quoteId, line.description, line.quantity, line.unit, line.unit_price, line.discount_percent || 0, discount_amount, line_total, index]);
    }
  }
  
  const updated = await db.get(`
    SELECT q.*, c.company_name as customer_name, u.name as created_by_name
    FROM quotes q
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON q.created_by = u.id
    WHERE q.id = ?
  `, [quoteId]);
  
  res.json(updated);
});

app.delete('/api/quotes/:id', auth, async (req, res) => {
  const quoteId = Number(req.params.id);
  
  // Delete quote (cascades to lines and attachments)
  await db.run('DELETE FROM quotes WHERE id = ?', [quoteId]);
  
  res.json({ success: true });
});

// Quote attachment upload
app.post('/api/quotes/:id/attachments', auth, upload.single('file'), async (req, res) => {
  const quoteId = Number(req.params.id);
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const quoteStorage = await maybeStoreInR2(req.file, 'quotes');

  const info = await db.run(`
    INSERT INTO quote_attachments (quote_id, filename, original_name, file_path, file_size, uploaded_by, storage_provider, storage_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [quoteId, req.file.filename, req.file.originalname, `/uploads/${req.file.filename}`, req.file.size, req.user.id, quoteStorage.storage_provider, quoteStorage.storage_key]);
  
  const attachment = await db.get(`
    SELECT qa.*, u.name as uploaded_by_name
    FROM quote_attachments qa
    JOIN users u ON qa.uploaded_by = u.id
    WHERE qa.id = ?
  `, [info.lastInsertRowid]);
  
  res.json({ ...attachment, warning: quoteStorage.warning });
});

// Delete quote attachment
app.delete('/api/quotes/:quoteId/attachments/:attachmentId', auth, async (req, res) => {
  const attachmentId = Number(req.params.attachmentId);
  
  const attachment = await db.get('SELECT * FROM quote_attachments WHERE id = ?', [attachmentId]);
  if (!attachment) {
    return res.status(404).json({ error: 'Attachment not found' });
  }
  
  // Delete physical file (R2-filer har ingen disk-kopi - findes ikke, ignoreres)
  const filePath = path.join(UPLOADS_DIR, attachment.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  
  await db.run('DELETE FROM quote_attachments WHERE id = ?', [attachmentId]);
  
  // Delete from R2 (kun hvis ingen anden række bruger samme storage_key)
  await deleteR2ObjectIfUnused(attachment.storage_key, 'quote_attachments', attachmentId);
  
  res.json({ success: true });
});

// Email-vedhæftning: download via API med login-header (ingen offentlig /uploads-adgang)
app.get('/api/email/attachments/:id', auth, async (req, res) => {
  const attachmentId = Number(req.params.id);
  const attachment = await db.get('SELECT * FROM email_attachments WHERE id = ?', [attachmentId]);
  if (!attachment) {
    return res.status(404).json({ error: 'Vedhæftning ikke fundet' });
  }
  await sendFileContent(attachment, res, 'attachment');
});

// Send quote via email
app.post('/api/quotes/:id/send', auth, async (req, res) => {
  const quoteId = Number(req.params.id);
  
  const quote = await new Promise((resolve, reject) => {
    try {
      const q = db.prepare(`
        SELECT q.*, c.*, u.name as created_by_name,
               c.company_name, c.contact_person, c.email as customer_email
        FROM quotes q
        JOIN customers c ON q.customer_id = c.id
        JOIN users u ON q.created_by = u.id
        WHERE q.id = ?
      `).get(quoteId);
      
      if (!q) {
        return reject(new Error('Quote not found'));
      }
      
      q.lines = db.prepare('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY sort_order, id').all(quoteId);
      resolve(q);
    } catch (error) {
      reject(error);
    }
  });
  
  if (!quote.customer_email) {
    return res.status(400).json({ error: 'Customer has no email address' });
  }
  
  if (!emailTransporter) {
    return res.status(500).json({ error: 'Email not configured' });
  }
  
  try {
    // Update quote status and sent_at
    // PostgreSQL-compatible: Use CURRENT_TIMESTAMP instead of datetime('now')
    if (db._isProduction) {
      db.prepare('UPDATE quotes SET status = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?').run('sent', quoteId);
    } else {
      db.prepare('UPDATE quotes SET status = ?, sent_at = datetime(\'now\') WHERE id = ?').run('sent', quoteId);
    }
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: quote.customer_email,
      subject: `Tilbud ${quote.order_number} - ${quote.title}`,
      html: `
        <p>Kære ${quote.contact_person || quote.company_name},</p>
        <p>Vedhæftet finder du vores tilbud på <strong>${quote.title}</strong>.</p>
        <p>Tilbuddet er gyldigt til ${quote.valid_until ? new Date(quote.valid_until).toLocaleDateString('da-DK') : 'videre varsel'}.</p>
        <p>Hvis du har spørgsmål, er du velkommen til at kontakte os.</p>
        <p>Med venlig hilsen,<br>${quote.created_by_name}<br>SG Seest Gulvteknik ApS</p>
      `
    };
    
    await emailTransporter.sendMail(mailOptions);
    
    // Log quote sent event
    await logOrderEvent(quoteId, 'quote_sent', `Tilbud ${quote.order_number} sendt til ${quote.customer_email}`, req.user.id);
    
    res.json({ success: true, message: 'Quote sent successfully' });
  } catch (error) {
    console.error('Email send error:', error);
    res.status(500).json({ error: 'Failed to send quote: ' + error.message });
  }
});

// Accept quote (convert to order)
app.post('/api/quotes/:id/accept', auth, async (req, res) => {
  const quoteId = Number(req.params.id);
  
  // Set status to 'accepted' and set accepted_at timestamp
  // This allows the order to appear in Orders tab
  // Status should ONLY be 'sent' if email was actually sent via /send endpoint
  // PostgreSQL-compatible: Use CURRENT_TIMESTAMP instead of datetime('now')
  if (db._isProduction) {
    await db.run('UPDATE quotes SET status = ?, accepted_at = CURRENT_TIMESTAMP WHERE id = ?', ['accepted', quoteId]);
  } else {
    await db.run('UPDATE quotes SET status = ?, accepted_at = datetime(\'now\') WHERE id = ?', ['accepted', quoteId]);
  }
  
  const quote = await db.get(`
    SELECT q.*, c.company_name as customer_name, u.name as created_by_name
    FROM quotes q
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON q.created_by = u.id
    WHERE q.id = ?
  `, [quoteId]);
  
  quote.full_order_number = await getFullOrderNumber(quote);
  
  // Log quote accepted event
  await logOrderEvent(quoteId, 'quote_accepted', `Ordre ${quote.full_order_number} accepteret`, req.user.id);
  
  res.json(quote);
});

// Reject quote
app.post('/api/quotes/:id/reject', auth, async (req, res) => {
  const quoteId = Number(req.params.id);
  
  const quote = await db.get('SELECT * FROM quotes WHERE id = ?', [quoteId]);
  if (!quote) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  
  await db.run('UPDATE quotes SET status = ? WHERE id = ?', ['rejected', quoteId]);
  
  const updated = await db.get(`
    SELECT q.*, c.company_name as customer_name, u.name as created_by_name
    FROM quotes q
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON q.created_by = u.id
    WHERE q.id = ?
  `, [quoteId]);
  
  // Log quote rejected event
  await logOrderEvent(quoteId, 'quote_rejected', `Tilbud ${updated.quote_number} afvist`, req.user.id);
  
  res.json(updated);
});

// Revert order/rejected quote back to quote status
app.post('/api/quotes/:id/revert', auth, async (req, res) => {
  const quoteId = Number(req.params.id);
  
  const quote = await db.get('SELECT * FROM quotes WHERE id = ?', [quoteId]);
  if (!quote) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  
  // Allow reverting both 'accepted' orders and 'rejected' quotes
  if (quote.status !== 'accepted' && quote.status !== 'rejected') {
    return res.status(400).json({ error: 'Can only revert accepted orders or rejected quotes' });
  }
  
  // Only check for invoices if it's an accepted order
  if (quote.status === 'accepted') {
    const hasInvoice = await db.get('SELECT COUNT(*) as cnt FROM invoices WHERE order_id = ?', [quoteId]);
    if (hasInvoice.cnt > 0) {
      return res.status(400).json({ error: 'Cannot revert order that has been invoiced. Delete invoice first.' });
    }
  }
  
  // Revert to 'draft' status (clear both sent_at and accepted_at timestamps)
  await db.run('UPDATE quotes SET status = ?, sent_at = NULL, accepted_at = NULL WHERE id = ?', ['draft', quoteId]);
  
  const updated = await db.get(`
    SELECT q.*, c.company_name as customer_name, u.name as created_by_name
    FROM quotes q
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON q.created_by = u.id
    WHERE q.id = ?
  `, [quoteId]);
  
  // Log quote reverted event
  const eventDesc = updated.status === 'draft' ? `Ordre/tilbud ${updated.order_number} flyttet tilbage til udkast` : `Status ændret`;
  await logOrderEvent(quoteId, 'quote_reverted', eventDesc, req.user.id);
  
  res.json(updated);
});

// Start order (approved -> in_progress). MANUEL handling — ordren bliver
// aldrig igangværende af sig selv (tidsregistrering, udgift, upload mv.
// aendrer ALDRIG status — kun dette endpoint goer).
app.post('/api/quotes/:id/start', auth, async (req, res) => {
  const quoteId = Number(req.params.id);
  const { start_date, responsible_user_id } = req.body || {};

  const quote = await db.get('SELECT * FROM quotes WHERE id = ?', [quoteId]);
  if (!quote) {
    return res.status(404).json({ error: 'Ordre findes ikke' });
  }
  if (quote.status !== 'accepted') {
    return res.status(400).json({ error: 'Ordren er ikke godkendt og kan derfor ikke startes' });
  }
  if (quote.order_stage === 'in_progress') {
    return res.status(400).json({ error: 'Ordren er allerede igangværende' });
  }

  const startedBy = Number(responsible_user_id) || req.user.id;
  const startedAt = start_date || null;

  if (startedAt) {
    await db.run('UPDATE quotes SET order_stage = ?, started_at = ?, started_by = ? WHERE id = ?', ['in_progress', startedAt, startedBy, quoteId]);
  } else if (db._isProduction) {
    await db.run('UPDATE quotes SET order_stage = ?, started_at = CURRENT_TIMESTAMP, started_by = ? WHERE id = ?', ['in_progress', startedBy, quoteId]);
  } else {
    await db.run("UPDATE quotes SET order_stage = ?, started_at = datetime('now'), started_by = ? WHERE id = ?", ['in_progress', startedBy, quoteId]);
  }

  let responsibleName = null;
  if (Number(responsible_user_id)) {
    const u = await db.get('SELECT name FROM users WHERE id = ?', [Number(responsible_user_id)]);
    responsibleName = u ? u.name : null;
  }

  const desc = responsibleName
    ? `Ordre startet (ansvarlig: ${responsibleName})`
    : 'Ordre startet';
  await logOrderEvent(quoteId, 'order_started', desc, req.user.id);

  const updated = await db.get(`
    SELECT q.*, c.company_name as customer_name, u.name as created_by_name
    FROM quotes q
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON q.created_by = u.id
    WHERE q.id = ?
  `, [quoteId]);
  updated.full_order_number = await getFullOrderNumber(updated);
  res.json(updated);
});

// Set order back to approved (in_progress -> approved)
app.post('/api/quotes/:id/pause', auth, async (req, res) => {
  const quoteId = Number(req.params.id);

  const quote = await db.get('SELECT * FROM quotes WHERE id = ?', [quoteId]);
  if (!quote) {
    return res.status(404).json({ error: 'Ordre findes ikke' });
  }
  if (quote.order_stage !== 'in_progress') {
    return res.status(400).json({ error: 'Kun igangværende ordrer kan sættes tilbage til godkendt' });
  }

  // Bloker hvis ordren har en godkendt (ikke-kladde) faktura
  const approvedInvoice = await db.get("SELECT id FROM invoices WHERE order_id = ? AND status != 'draft'", [quoteId]);
  if (approvedInvoice) {
    return res.status(400).json({ error: 'Ordren har en godkendt faktura og kan ikke sættes tilbage til godkendt' });
  }

  await db.run("UPDATE quotes SET order_stage = 'approved' WHERE id = ?", [quoteId]);
  await logOrderEvent(quoteId, 'order_paused', 'Ordre sat tilbage til godkendt', req.user.id);

  const updated = await db.get(`
    SELECT q.*, c.company_name as customer_name, u.name as created_by_name
    FROM quotes q
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON q.created_by = u.id
    WHERE q.id = ?
  `, [quoteId]);
  updated.full_order_number = await getFullOrderNumber(updated);
  res.json(updated);
});

// Create extra work on existing order
app.post('/api/quotes/:id/extra-work', auth, async (req, res) => {
  const parentOrderId = Number(req.params.id);
  const { title, notes, terms, lines } = req.body;
  
  if (!title || !lines || lines.length === 0) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const parentOrder = await db.get('SELECT * FROM quotes WHERE id = ?', [parentOrderId]);
  if (!parentOrder) {
    return res.status(404).json({ error: 'Parent order not found' });
  }
  
  // Generate extra work number
  const lastSub = await db.get(`
    SELECT sub_number FROM quotes 
    WHERE parent_order_id = ? 
    ORDER BY sub_number DESC LIMIT 1
  `, [parentOrderId]);
  
  const subNum = lastSub ? lastSub.sub_number + 1 : 1;
  
  // Calculate totals
  let subtotal = 0;
  lines.forEach(line => {
    const discount_amount = (line.unit_price * line.quantity * (line.discount_percent || 0)) / 100;
    const line_total = (line.unit_price * line.quantity) - discount_amount;
    subtotal += line_total;
  });
  
  const vat_rate = 25;
  const vat_amount = subtotal * (vat_rate / 100);
  const total = subtotal + vat_amount;
  
  // Create extra work order
  // Note: For extra work, we use the full order number (e.g., "0001-01") as quote_number for backwards compatibility
  const fullOrderNumber = `${parentOrder.order_number}-${String(subNum).padStart(2, '0')}`;
  
  const info = await db.run(`
    INSERT INTO quotes (quote_number, order_number, parent_order_id, sub_number, is_extra_work, customer_id, title, notes, terms, subtotal, vat_rate, vat_amount, total, status, created_by)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?)
  `, [fullOrderNumber, parentOrder.order_number, parentOrderId, subNum, parentOrder.customer_id, title, notes || null, terms || parentOrder.terms, subtotal, vat_rate, vat_amount, total, req.user.id]);
  
  const extraWorkId = info.lastInsertRowid;
  
  // Create lines
  for (const [index, line] of lines.entries()) {
    const discount_amount = (line.unit_price * line.quantity * (line.discount_percent || 0)) / 100;
    const line_total = (line.unit_price * line.quantity) - discount_amount;
    
    await db.run(`
      INSERT INTO quote_lines (quote_id, description, quantity, unit, unit_price, discount_percent, discount_amount, line_total, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [extraWorkId, line.description, line.quantity, line.unit, line.unit_price, line.discount_percent || 0, discount_amount, line_total, index]);
  }
  
  const extraWork = await db.get(`
    SELECT q.*, c.company_name as customer_name, u.name as created_by_name
    FROM quotes q
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON q.created_by = u.id
    WHERE q.id = ?
  `, [extraWorkId]);
  
  extraWork.full_order_number = await getFullOrderNumber(extraWork);
  
  res.json(extraWork);
});

// --- INVOICES API ---

// Get all invoices
app.get('/api/invoices', auth, async (req, res) => {
  const invoices = await db.all(`
    SELECT i.*, q.order_number, q.title as order_title, 
           c.company_name as customer_name, u.name as created_by_name
    FROM invoices i
    JOIN quotes q ON i.order_id = q.id
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON i.created_by = u.id
    ORDER BY i.id DESC
  `);
  res.json(invoices);
});

// Get single invoice with details
app.get('/api/invoices/:id', auth, async (req, res) => {
  const invoiceId = Number(req.params.id);
  
  const invoice = await db.get(`
    SELECT i.*, q.*, c.*, u.name as created_by_name,
           c.company_name, c.contact_person, c.email as customer_email, 
           c.phone as customer_phone, c.address, c.postal_code, c.city, c.cvr_number,
           q.title as order_title
    FROM invoices i
    JOIN quotes q ON i.order_id = q.id
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON i.created_by = u.id
    WHERE i.id = ?
  `, [invoiceId]);
  
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found' });
  }
  
  const lines = await db.all('SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY sort_order, id', [invoiceId]);
  invoice.lines = lines;
  
  res.json(invoice);
});

// Create invoice from order
app.post('/api/invoices/from-order/:orderId', auth, async (req, res) => {
  const orderId = Number(req.params.orderId);
  const { due_date, payment_terms, notes } = req.body;
  
  const order = await db.get('SELECT * FROM quotes WHERE id = ?', [orderId]);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  
  if (order.status !== 'accepted') {
    return res.status(400).json({ error: 'Order must be accepted before creating invoice' });
  }
  if (order.order_stage !== 'in_progress') {
    return res.status(400).json({ error: 'Ordren skal være startet (igangværende), før der kan oprettes faktura' });
  }
  
  // Check if order already has an invoice (prevent duplicates)
  const existingInvoice = await db.get('SELECT invoice_number FROM invoices WHERE order_id = ?', [orderId]);
  if (existingInvoice) {
    return res.status(400).json({ 
      error: `Order already has invoice ${existingInvoice.invoice_number}. Delete the existing invoice first if you need to create a new one.` 
    });
  }
  
  const invoice_number = await generateInvoiceNumber();
  const full_order_number = await getFullOrderNumber(order);
  
  // Calculate due date (14 days from now if not provided)
  let finalDueDate = due_date;
  if (!finalDueDate) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);
    finalDueDate = dueDate.toISOString().split('T')[0];
  }
  
  // Create invoice
  const info = await db.run(`
    INSERT INTO invoices (invoice_number, order_id, full_order_number, due_date, payment_terms, subtotal, vat_rate, vat_amount, total, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [invoice_number, orderId, full_order_number, finalDueDate, payment_terms || 'Netto 14 dage', order.subtotal, order.vat_rate, order.vat_amount, order.total, notes || null, req.user.id]);
  
  const invoiceId = info.lastInsertRowid;
  
  // Copy lines from order
  const orderLines = await db.all('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY sort_order, id', [orderId]);
  for (const line of orderLines) {
    await db.run(`
      INSERT INTO invoice_lines (invoice_id, description, quantity, unit, unit_price, discount_percent, discount_amount, line_total, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [invoiceId, line.description, line.quantity, line.unit, line.unit_price, line.discount_percent, line.discount_amount, line.line_total, line.sort_order]);
  }
  
  const invoice = await db.get(`
    SELECT i.*, q.order_number, q.title as order_title, 
           c.company_name as customer_name, u.name as created_by_name
    FROM invoices i
    JOIN quotes q ON i.order_id = q.id
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON i.created_by = u.id
    WHERE i.id = ?
  `, [invoiceId]);
  
  res.json(invoice);
});

// Update invoice
app.put('/api/invoices/:id', auth, async (req, res) => {
  const invoiceId = Number(req.params.id);
  const { due_date, payment_terms, notes, status, lines } = req.body;
  
  const invoice = await db.get('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found' });
  }
  
  // Calculate totals if lines provided
  let subtotal = invoice.subtotal;
  let vat_amount = invoice.vat_amount;
  let total = invoice.total;
  
  if (lines) {
    subtotal = 0;
    lines.forEach(line => {
      const discount_amount = (line.unit_price * line.quantity * (line.discount_percent || 0)) / 100;
      const line_total = (line.unit_price * line.quantity) - discount_amount;
      subtotal += line_total;
    });
    vat_amount = subtotal * 0.25;
    total = subtotal + vat_amount;
  }
  
  // Update invoice
  await db.run(`
    UPDATE invoices SET
      due_date = ?,
      payment_terms = ?,
      notes = ?,
      status = ?,
      subtotal = ?,
      vat_amount = ?,
      total = ?
    WHERE id = ?
  `, [due_date || invoice.due_date, payment_terms || invoice.payment_terms, notes !== undefined ? notes : invoice.notes, status || invoice.status, subtotal, vat_amount, total, invoiceId]);
  
  // Update lines if provided
  if (lines) {
    await db.run('DELETE FROM invoice_lines WHERE invoice_id = ?', [invoiceId]);
    
    for (const [index, line] of lines.entries()) {
      const discount_amount = (line.unit_price * line.quantity * (line.discount_percent || 0)) / 100;
      const line_total = (line.unit_price * line.quantity) - discount_amount;
      
      await db.run(`
        INSERT INTO invoice_lines (invoice_id, description, quantity, unit, unit_price, discount_percent, discount_amount, line_total, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [invoiceId, line.description, line.quantity, line.unit, line.unit_price, line.discount_percent || 0, discount_amount, line_total, index]);
    }
  }
  
  const updated = await db.get(`
    SELECT i.*, q.order_number, q.title as order_title, 
           c.company_name as customer_name, u.name as created_by_name
    FROM invoices i
    JOIN quotes q ON i.order_id = q.id
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON i.created_by = u.id
    WHERE i.id = ?
  `, [invoiceId]);
  
  res.json(updated);
});

// Delete invoice
app.delete('/api/invoices/:id', auth, async (req, res) => {
  const invoiceId = Number(req.params.id);
  await db.run('DELETE FROM invoices WHERE id = ?', [invoiceId]);
  res.json({ success: true });
});

// Send invoice via email
app.post('/api/invoices/:id/send', auth, async (req, res) => {
  const invoiceId = Number(req.params.id);
  
  const invoice = await db.get(`
    SELECT i.*, q.*, c.*, u.name as created_by_name,
           c.company_name, c.contact_person, c.email as customer_email,
           q.title as order_title
    FROM invoices i
    JOIN quotes q ON i.order_id = q.id
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON i.created_by = u.id
    WHERE i.id = ?
  `, [invoiceId]);
  
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found' });
  }
  
  if (!invoice.customer_email) {
    return res.status(400).json({ error: 'Customer has no email address' });
  }
  
  if (!emailTransporter) {
    return res.status(500).json({ error: 'Email not configured' });
  }
  
  try {
    // PostgreSQL-compatible: Use CURRENT_TIMESTAMP instead of datetime('now')
    if (db._isProduction) {
      await db.run('UPDATE invoices SET status = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?', ['sent', invoiceId]);
    } else {
      await db.run('UPDATE invoices SET status = ?, sent_at = datetime(\'now\') WHERE id = ?', ['sent', invoiceId]);
    }
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: invoice.customer_email,
      subject: `Faktura ${invoice.invoice_number} - Ordre ${invoice.full_order_number}`,
      html: `
        <p>Kære ${invoice.contact_person || invoice.company_name},</p>
        <p>Vedhæftet finder du faktura for ordre <strong>${invoice.full_order_number}</strong>.</p>
        <p>Forfaldsdato: ${new Date(invoice.due_date).toLocaleDateString('da-DK')}</p>
        <p>Betalingsbetingelser: ${invoice.payment_terms}</p>
        <p>Hvis du har spørgsmål, er du velkommen til at kontakte os.</p>
        <p>Med venlig hilsen,<br>${invoice.created_by_name}<br>SG Seest Gulvteknik ApS</p>
      `
    };
    
    await emailTransporter.sendMail(mailOptions);
    
    res.json({ success: true, message: 'Invoice sent successfully' });
  } catch (error) {
    console.error('Email send error:', error);
    res.status(500).json({ error: 'Failed to send invoice: ' + error.message });
  }
});

// --- ORDER WORKSPACE: EXPENSES, DOCUMENTS, TIMELINE, NOTES ---

// --- EXPENSES ENDPOINTS ---
// All database tables are now created in init-database.js before server starts

// Get all expenses for an order
app.get('/api/orders/:orderId/expenses', auth, async (req, res) => {
  const orderId = Number(req.params.orderId);
  
  const expenses = await db.all(`
    SELECT e.*, u.name as created_by_name
    FROM order_expenses e
    JOIN users u ON e.created_by = u.id
    WHERE e.order_id = ?
    ORDER BY e.expense_date DESC, e.id DESC
  `, [orderId]);
  
  const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  
  res.json({ expenses, total });
});

// Add expense to order
app.post('/api/orders/:orderId/expenses', auth, async (req, res) => {
  const orderId = Number(req.params.orderId);
  const { description, amount, expense_date, category, receipt_file } = req.body;
  
  if (!description || amount === undefined) {
    return res.status(400).json({ error: 'Description and amount required' });
  }
  
  const info = await db.run(`
    INSERT INTO order_expenses (order_id, description, amount, expense_date, category, receipt_file, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [orderId, description, Number(amount), expense_date || new Date().toISOString().split('T')[0], category || null, receipt_file || null, req.user.id]);
  
  // Log activity
  await db.run(`
    INSERT INTO order_timeline (order_id, activity_type, description, user_id)
    VALUES (?, 'expense_added', ?, ?)
  `, [orderId, `Udgift tilføjet: ${description} (${amount} kr)`, req.user.id]);
  
  const expense = await db.get(`
    SELECT e.*, u.name as created_by_name
    FROM order_expenses e
    JOIN users u ON e.created_by = u.id
    WHERE e.id = ?
  `, [info.lastInsertRowid]);
  
  res.json(expense);
});

// Update expense
app.put('/api/orders/:orderId/expenses/:expenseId', auth, async (req, res) => {
  const expenseId = Number(req.params.expenseId);
  const { description, amount, expense_date, category } = req.body;
  
  await db.run(`
    UPDATE order_expenses SET
      description = ?,
      amount = ?,
      expense_date = ?,
      category = ?
    WHERE id = ?
  `, [description, amount, expense_date, category || null, expenseId]);
  
  const expense = await db.get(`
    SELECT e.*, u.name as created_by_name
    FROM order_expenses e
    JOIN users u ON e.created_by = u.id
    WHERE e.id = ?
  `, [expenseId]);
  
  res.json(expense);
});

// Delete expense
app.delete('/api/orders/:orderId/expenses/:expenseId', auth, async (req, res) => {
  const expenseId = Number(req.params.expenseId);
  await db.run('DELETE FROM order_expenses WHERE id = ?', [expenseId]);
  res.json({ success: true });
});

// --- ORDER DOCUMENTS ENDPOINTS ---

// Get all documents for an order
app.get('/api/orders/:orderId/documents', auth, async (req, res) => {
  const orderId = Number(req.params.orderId);
  
  const documents = await db.all(`
    SELECT d.*, u.name as uploaded_by_name
    FROM order_documents d
    JOIN users u ON d.uploaded_by = u.id
    WHERE d.order_id = ?
    ORDER BY d.created_at DESC
  `, [orderId]);
  
  res.json(documents);
});

// Upload document to order
app.post('/api/orders/:orderId/documents', auth, upload.single('file'), async (req, res) => {
  const orderId = Number(req.params.orderId);
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const { document_type } = req.body;

  // Upload til R2 hvis aktiveret - ellers disk som hidtil
  const storage = await maybeStoreInR2(req.file, 'orders');

  const info = await db.run(`
    INSERT INTO order_documents (order_id, filename, original_name, file_path, file_size, document_type, uploaded_by, storage_provider, storage_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [orderId, req.file.filename, req.file.originalname, `/uploads/${req.file.filename}`, req.file.size, document_type || 'general', req.user.id, storage.storage_provider, storage.storage_key]);
  
  // Log activity
  await db.run(`
    INSERT INTO order_timeline (order_id, activity_type, description, user_id)
    VALUES (?, 'document_added', ?, ?)
  `, [orderId, `Dokument uploadet: ${req.file.originalname}`, req.user.id]);
  
  const document = await db.get(`
    SELECT d.*, u.name as uploaded_by_name
    FROM order_documents d
    JOIN users u ON d.uploaded_by = u.id
    WHERE d.id = ?
  `, [info.lastInsertRowid]);
  
  res.json({ ...document, warning: storage.warning });
});

// Delete order document
app.delete('/api/orders/:orderId/documents/:documentId', auth, async (req, res) => {
  const documentId = Number(req.params.documentId);
  
  const document = await db.get('SELECT * FROM order_documents WHERE id = ?', [documentId]);
  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }
  
  // Delete physical file (R2-filer har ingen disk-kopi - findes ikke, ignoreres)
  const filePath = path.join(UPLOADS_DIR, document.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  
  await db.run('DELETE FROM order_documents WHERE id = ?', [documentId]);
  
  // Delete from R2 (kun hvis ingen anden række bruger samme storage_key)
  await deleteR2ObjectIfUnused(document.storage_key, 'order_documents', documentId);
  
  res.json({ success: true });
});

// Ordre-dokumentindhold (inline til preview, attachment til download) - disk eller R2
app.get('/api/orders/:orderId/documents/:documentId/content', auth, async (req, res) => {
  const documentId = Number(req.params.documentId);
  const document = await db.get('SELECT * FROM order_documents WHERE id = ?', [documentId]);

  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }

  const disposition = req.query.disposition === 'attachment' ? 'attachment' : 'inline';
  await sendFileContent(document, res, disposition);
});

// Transfer file from files system to order documents
app.post('/api/files/:fileId/transfer-to-order', auth, async (req, res) => {
  const fileId = Number(req.params.fileId);
  const { order_number } = req.body;
  
  if (!order_number || !order_number.trim()) {
    return res.status(400).json({ error: 'Order number required' });
  }
  
  // Find the file
  const file = await db.get('SELECT * FROM files WHERE id = ?', [fileId]);
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  // Find the order by order_number
  // IMPORTANT: Prioritize main orders (parent_order_id IS NULL) to avoid matching extra work
  // If order_number has hyphen (0001-01), it's extra work - search by quote_number
  // Otherwise, search for main order by order_number
  let order;
  if (order_number.includes('-')) {
    // Extra work format: 0001-01
    order = await db.get(`
      SELECT id, order_number, title, customer_id 
      FROM quotes 
      WHERE quote_number = ?
    `, [order_number.trim()]);
  } else {
    // Main order format: 0001
    order = await db.get(`
      SELECT id, order_number, title, customer_id 
      FROM quotes 
      WHERE order_number = ? AND parent_order_id IS NULL
    `, [order_number.trim()]);
  }
  
  if (!order) {
    return res.status(404).json({ error: `Ordre ${order_number} findes ikke` });
  }
  
  // Check if file is already in order documents
  const existing = await db.get(`
    SELECT id FROM order_documents 
    WHERE order_id = ? AND filename = ?
  `, [order.id, file.filename]);
  
  if (existing) {
    return res.status(400).json({ error: 'Denne fil findes allerede i ordren' });
  }
  
  // Copy file to order documents (genbruger samme lagerplacering - R2-filer kopieres ikke fysisk)
  const info = await db.run(`
    INSERT INTO order_documents (order_id, filename, original_name, file_path, file_size, document_type, uploaded_by, storage_provider, storage_key)
    VALUES (?, ?, ?, ?, ?, 'transferred', ?, ?, ?)
  `, [order.id, file.filename, file.original_name, file.file_path, file.file_size, req.user.id, file.storage_provider || 'disk', file.storage_key || null]);
  
  // Log activity
  await db.run(`
    INSERT INTO order_timeline (order_id, activity_type, description, user_id)
    VALUES (?, 'document_transferred', ?, ?)
  `, [order.id, `Fil overført fra filhåndtering: ${file.original_name}`, req.user.id]);
  
  const document = await db.get(`
    SELECT d.*, u.name as uploaded_by_name
    FROM order_documents d
    JOIN users u ON d.uploaded_by = u.id
    WHERE d.id = ?
  `, [info.lastInsertRowid]);
  
  res.json({ 
    success: true, 
    document,
    order: {
      id: order.id,
      order_number: order.order_number,
      title: order.title
    },
    message: `Fil kopieret til ordre ${order_number}`
  });
});

// --- TIMELINE ENDPOINTS ---

// Get timeline for an order
app.get('/api/orders/:orderId/timeline', auth, async (req, res) => {
  const orderId = Number(req.params.orderId);
  
  const timeline = await db.all(`
    SELECT t.*, u.name as user_name, u.avatar_url AS profile_image
    FROM order_timeline t
    JOIN users u ON t.user_id = u.id
    WHERE t.order_id = ?
    ORDER BY t.created_at DESC
    LIMIT 100
  `, [orderId]);
  
  res.json(timeline);
});

// Manually add timeline entry
app.post('/api/orders/:orderId/timeline', auth, async (req, res) => {
  const orderId = Number(req.params.orderId);
  const { activity_type, description } = req.body;
  
  if (!activity_type || !description) {
    return res.status(400).json({ error: 'Activity type and description required' });
  }
  
  const info = await db.run(`
    INSERT INTO order_timeline (order_id, activity_type, description, user_id)
    VALUES (?, ?, ?, ?)
  `, [orderId, activity_type, description, req.user.id]);
  
  const entry = await db.get(`
    SELECT t.*, u.name as user_name, u.avatar_url AS profile_image
    FROM order_timeline t
    JOIN users u ON t.user_id = u.id
    WHERE t.id = ?
  `, [info.lastInsertRowid]);
  
  res.json(entry);
});

// --- NOTES ENDPOINTS ---

// Get all notes for an order
app.get('/api/orders/:orderId/notes', auth, async (req, res) => {
  const orderId = Number(req.params.orderId);
  
  const notes = await db.all(`
    SELECT n.*, u.name as created_by_name, u.avatar_url AS profile_image
    FROM order_notes n
    JOIN users u ON n.created_by = u.id
    WHERE n.order_id = ?
    ORDER BY n.is_pinned DESC, n.updated_at DESC
  `, [orderId]);
  
  res.json(notes);
});

// Add note to order
app.post('/api/orders/:orderId/notes', auth, async (req, res) => {
  const orderId = Number(req.params.orderId);
  const { content, is_pinned } = req.body;
  
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Content required' });
  }
  
  const info = await db.run(`
    INSERT INTO order_notes (order_id, content, is_pinned, created_by)
    VALUES (?, ?, ?, ?)
  `, [orderId, content.trim(), is_pinned ? 1 : 0, req.user.id]);
  
  // Log activity
  await db.run(`
    INSERT INTO order_timeline (order_id, activity_type, description, user_id)
    VALUES (?, 'note_added', ?, ?)
  `, [orderId, 'Note tilføjet', req.user.id]);
  
  const note = await db.get(`
    SELECT n.*, u.name as created_by_name, u.avatar_url AS profile_image
    FROM order_notes n
    JOIN users u ON n.created_by = u.id
    WHERE n.id = ?
  `, [info.lastInsertRowid]);
  
  res.json(note);
});

// Update note
app.put('/api/orders/:orderId/notes/:noteId', auth, async (req, res) => {
  const noteId = Number(req.params.noteId);
  const { content, is_pinned } = req.body;
  
  // Use CURRENT_TIMESTAMP for PostgreSQL compatibility
  await db.run(`
    UPDATE order_notes SET
      content = ?,
      is_pinned = ?,
      updated_at = ${db._isProduction ? 'CURRENT_TIMESTAMP' : "datetime('now')"}
    WHERE id = ?
  `, [content, is_pinned ? 1 : 0, noteId]);
  
  const note = await db.get(`
    SELECT n.*, u.name as created_by_name, u.avatar_url AS profile_image
    FROM order_notes n
    JOIN users u ON n.created_by = u.id
    WHERE n.id = ?
  `, [noteId]);
  
  res.json(note);
});

// Delete note
app.delete('/api/orders/:orderId/notes/:noteId', auth, async (req, res) => {
  const noteId = Number(req.params.noteId);
  await db.run('DELETE FROM order_notes WHERE id = ?', [noteId]);
  res.json({ success: true });
});

// --- ORDER WORKSPACE SUMMARY ENDPOINT ---

// Update order work description
app.put('/api/orders/:orderId/work-description', auth, async (req, res) => {
  const orderId = Number(req.params.orderId);
  const { work_description } = req.body;
  
  try {
    // Verify order exists
    const order = await db.get('SELECT id FROM quotes WHERE id = ?', [orderId]);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Update work description
    await db.run('UPDATE quotes SET work_description = ? WHERE id = ?', [work_description || null, orderId]);
    
    res.json({ success: true, work_description });
  } catch (error) {
    console.error('Update work description error:', error);
    res.status(500).json({ error: 'Failed to update work description' });
  }
});

// Update order details (contact person, address)
app.put('/api/orders/:orderId/details', auth, async (req, res) => {
  const orderId = Number(req.params.orderId);
  const { contact_person_id, order_address, order_postal_code, order_city } = req.body;
  
  try {
    // Verify order exists and get current values
    const order = await db.get('SELECT id, contact_person_id, order_address, order_postal_code, order_city FROM quotes WHERE id = ?', [orderId]);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Update order details (use current values as fallback)
    await db.run(`
      UPDATE quotes SET
        contact_person_id = ?,
        order_address = ?,
        order_postal_code = ?,
        order_city = ?
      WHERE id = ?
    `, [
      contact_person_id !== undefined ? contact_person_id : order.contact_person_id,
      order_address !== undefined ? order_address : order.order_address,
      order_postal_code !== undefined ? order_postal_code : order.order_postal_code,
      order_city !== undefined ? order_city : order.order_city,
      orderId
    ]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update order details error:', error);
    res.status(500).json({ error: 'Failed to update order details' });
  }
});

// ==================== MATERIALS SYSTEM ====================

// Get all materials
app.get('/api/materials', auth, async (req, res) => {
  try {
    const materials = await db.all(`
      SELECT m.*, u.name as created_by_name
      FROM materials m
      LEFT JOIN users u ON m.created_by = u.id
      WHERE m.is_active = 1
      ORDER BY m.category, m.material_number
    `);
    // v83: Montorer maa se materialekataloget (for at registrere forbrug),
    // men uden prisoplysninger - det er oeconomi og kun for Ledelsen.
    if (isMontor(req)) {
      return res.json(materials.map(m => {
        const { cost_price, sales_price, ...rest } = m;
        return rest;
      }));
    }
    res.json(materials);
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.status(500).json({ error: 'Failed to fetch materials' });
  }
});

// Create new material (admin only)
app.post('/api/materials', auth, adminAuth, async (req, res) => {
  try {
    const { material_number, name, description, category, unit, cost_price, sales_price } = req.body;
    
    if (!material_number || !name || cost_price == null || sales_price == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await db.run(`
      INSERT INTO materials (material_number, name, description, category, unit, cost_price, sales_price, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [material_number, name, description || null, category || null, unit || 'stk', cost_price, sales_price, req.user.id]);

    // v84 fix: result.lastID fandtes ikke (db.run returnerer lastInsertRowid)
    const material = await db.get('SELECT * FROM materials WHERE id = ?', [result.lastInsertRowid || result.lastID || result.id]);
    res.json(material);
  } catch (error) {
    console.error('Error creating material:', error);
    if (error.message.includes('UNIQUE')) {
      res.status(400).json({ error: 'Material number already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create material' });
    }
  }
});

// Update material (admin only)
app.put('/api/materials/:id', auth, adminAuth, async (req, res) => {
  try {
    const materialId = Number(req.params.id);
    const { material_number, name, description, category, unit, cost_price, sales_price, is_active } = req.body;

    await db.run(`
      UPDATE materials 
      SET material_number = ?, name = ?, description = ?, category = ?, unit = ?, 
          cost_price = ?, sales_price = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [material_number, name, description, category, unit, cost_price, sales_price, is_active ?? 1, materialId]);

    const material = await db.get('SELECT * FROM materials WHERE id = ?', [materialId]);

    // Propagate price changes to time-entry-sourced order_materials lines
    // (hours on orders use live prices, so e.g. a corrected hourly cost updates existing time lines)
    const propagate = await db.run(`
      UPDATE order_materials
      SET unit_cost = ?, unit_sale = ?,
          total_cost = ROUND(quantity * ?, 2),
          total_sale = ROUND(quantity * ?, 2)
      WHERE material_id = ? AND source = 'time_entry'
    `, [material.cost_price, material.sales_price, material.cost_price, material.sales_price, materialId]);

    if (propagate.changes > 0) {
      console.log(`Material ${materialId} price change propagated to ${propagate.changes} time-entry line(s)`);
    }

    res.json({ ...material, updated_lines: propagate.changes });
  } catch (error) {
    console.error('Error updating material:', error);
    res.status(500).json({ error: 'Failed to update material' });
  }
});

// Delete material (admin only) - only if not used
app.delete('/api/materials/:id', auth, adminAuth, async (req, res) => {
  try {
    const materialId = Number(req.params.id);

    // Check if material is used in time_entries or order_materials
    const timeEntryCount = await db.get('SELECT COUNT(*) as count FROM time_entries WHERE material_id = ?', [materialId]);
    const orderMaterialCount = await db.get('SELECT COUNT(*) as count FROM order_materials WHERE material_id = ?', [materialId]);

    if (timeEntryCount.count > 0 || orderMaterialCount.count > 0) {
      return res.status(400).json({ error: 'Cannot delete material that has been used in time entries or orders' });
    }

    await db.run('DELETE FROM materials WHERE id = ?', [materialId]);
    res.json({ message: 'Material deleted successfully' });
  } catch (error) {
    console.error('Error deleting material:', error);
    res.status(500).json({ error: 'Failed to delete material' });
  }
});

// ==================== TIME ENTRIES ====================

// Get time entries (own for employees, all for admins)
app.get('/api/time-entries', auth, async (req, res) => {
  try {
    const { start_date, end_date, user_id, order_id } = req.query;
    
    let query = `
      SELECT te.*, 
        u.name as user_name,
        m.name as material_name, m.material_number,
        q.quote_number, q.order_number, c.company_name as customer_name
      FROM time_entries te
      LEFT JOIN users u ON te.user_id = u.id
      LEFT JOIN materials m ON te.material_id = m.id
      LEFT JOIN quotes q ON te.order_id = q.id
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];

    // Non-admins can only see their own time entries
    if (!req.user.is_admin) {
      query += ` AND te.user_id = ?`;
      params.push(req.user.id);
    } else if (user_id) {
      query += ` AND te.user_id = ?`;
      params.push(user_id);
    }

    if (order_id) {
      query += ` AND te.order_id = ?`;
      params.push(order_id);
    }

    if (start_date) {
      query += ` AND te.date >= ?`;
      params.push(start_date);
    }

    if (end_date) {
      query += ` AND te.date <= ?`;
      params.push(end_date);
    }

    query += ` ORDER BY te.date DESC, te.start_time DESC`;

    const timeEntries = await db.all(query, params);
    res.json(timeEntries);
  } catch (error) {
    console.error('Error fetching time entries:', error);
    res.status(500).json({ error: 'Failed to fetch time entries' });
  }
});

// Create time entry
app.post('/api/time-entries', auth, async (req, res) => {
  try {
    const { order_id, material_id, date, start_time, end_time, notes, entry_type } = req.body;

    if (!material_id || !date || !start_time || !end_time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Server-side validering af entry_type: 'order' | 'workshop' | 'sick'
    const VALID_ENTRY_TYPES = ['order', 'workshop', 'sick'];
    if (entry_type && !VALID_ENTRY_TYPES.includes(entry_type)) {
      return res.status(400).json({ error: 'Ugyldig registreringstype' });
    }
    const entryType = VALID_ENTRY_TYPES.includes(entry_type) ? entry_type : 'order';
    if (entryType === 'order' && !order_id) {
      return res.status(400).json({ error: 'Ordre-registrering kræver en valgt ordre' });
    }
    // Kun ordre-registreringer må pege på en ordre
    const finalOrderId = entryType === 'order' ? order_id : null;

    // Hård regel: der må KUN registreres timer på igangværende ordrer.
    // En godkendt-men-ikke-startet ordre (order_stage='approved') afvises.
    if (finalOrderId) {
      const targetOrder = await db.get('SELECT status, order_stage FROM quotes WHERE id = ?', [finalOrderId]);
      if (!targetOrder) {
        return res.status(400).json({ error: 'Valgt ordre findes ikke' });
      }
      if (targetOrder.status !== 'accepted' || targetOrder.order_stage !== 'in_progress') {
        return res.status(400).json({ error: 'Ordren er ikke startet endnu. Start ordren i Ordrestyring („Start ordre“), før du kan registrere timer på den.' });
      }
    }

    // Sikr at kolonnen findes (Postgres og SQLite) - som posts.image_url-mønsteret
    try {
      await db.run("ALTER TABLE time_entries ADD COLUMN entry_type TEXT DEFAULT 'order'");
    } catch (e) { /* kolonnen findes allerede */ }

    // Calculate duration in hours (NO automatic lunch deduction)
    const startHours = parseInt(start_time.split(':')[0]);
    const startMinutes = parseInt(start_time.split(':')[1]);
    const endHours = parseInt(end_time.split(':')[0]);
    const endMinutes = parseInt(end_time.split(':')[1]);
    
    const totalMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
    const durationMinutes = totalMinutes; // NO lunch deduction - user handles breaks manually
    const durationHours = (durationMinutes / 60).toFixed(2);

    if (durationHours <= 0) {
      return res.status(400).json({ error: 'Invalid time range' });
    }

    // Get material info
    const material = await db.get('SELECT * FROM materials WHERE id = ?', [material_id]);
    if (!material) {
      return res.status(400).json({ error: 'Material not found' });
    }

    // Create time entry
    console.log('Creating time entry with params:', { user_id: req.user.id, order_id, material_id, date, start_time, end_time, durationHours, notes });
    
    let result;
    try {
      result = await db.run(`
        INSERT INTO time_entries (user_id, order_id, material_id, date, start_time, end_time, duration_hours, notes, entry_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [req.user.id, finalOrderId, material_id, date, start_time, end_time, durationHours, notes || null, entryType]);
      
      console.log('INSERT result:', JSON.stringify(result));
    } catch (insertError) {
      console.error('INSERT failed:', insertError);
      return res.status(500).json({ error: 'Failed to insert time entry: ' + insertError.message });
    }

    // Get the inserted ID - compatible with both SQLite and PostgreSQL
    const timeEntryId = result.lastInsertRowid || result.lastID || result.id;
    
    if (!timeEntryId) {
      console.error('Failed to get time entry ID from result:', JSON.stringify(result));
      return res.status(500).json({ error: 'Failed to create time entry - no ID returned', result });
    }
    
    console.log('Time entry created with ID:', timeEntryId);

    // If linked to an order, create order_materials entry
    if (order_id) {
      const order = await db.get('SELECT * FROM quotes WHERE id = ?', [order_id]);
      if (!order) {
        return res.status(400).json({ error: 'Order not found' });
      }

      const totalCost = parseFloat(durationHours) * parseFloat(material.cost_price);
      const totalSale = parseFloat(durationHours) * parseFloat(material.sales_price);

      await db.run(`
        INSERT INTO order_materials (order_id, material_id, quantity, unit_cost, unit_sale, total_cost, total_sale, added_by, source, time_entry_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'time_entry', ?)
      `, [order_id, material_id, durationHours, material.cost_price, material.sales_price, totalCost, totalSale, req.user.id, timeEntryId]);

      // Add to order timeline
      const user = await db.get('SELECT name FROM users WHERE id = ?', [req.user.id]);
      await db.run(`
        INSERT INTO order_timeline (order_id, activity_type, description, user_id)
        VALUES (?, 'time_registered', ?, ?)
      `, [order_id, `${user.name} registrerede ${durationHours} timer (${material.name})`, req.user.id]);
    }

    const timeEntry = await db.get(`
      SELECT te.*, u.name as user_name, m.name as material_name, m.material_number
      FROM time_entries te
      LEFT JOIN users u ON te.user_id = u.id
      LEFT JOIN materials m ON te.material_id = m.id
      WHERE te.id = ?
    `, [timeEntryId]);

    res.json(timeEntry);
  } catch (error) {
    console.error('Error creating time entry:', error);
    res.status(500).json({ error: 'Failed to create time entry' });
  }
});

// Update time entry (only if not locked)
app.put('/api/time-entries/:id', auth, async (req, res) => {
  try {
    const timeEntryId = Number(req.params.id);
    const { order_id, material_id, date, start_time, end_time, notes, entry_type } = req.body;

    // Get existing time entry
    const existing = await db.get('SELECT * FROM time_entries WHERE id = ?', [timeEntryId]);
    if (!existing) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    // Server-side validering af entry_type: 'order' | 'workshop' | 'sick'
    const VALID_ENTRY_TYPES = ['order', 'workshop', 'sick'];
    if (entry_type && !VALID_ENTRY_TYPES.includes(entry_type)) {
      return res.status(400).json({ error: 'Ugyldig registreringstype' });
    }
    const entryType = VALID_ENTRY_TYPES.includes(entry_type) ? entry_type : (existing.entry_type || 'order');
    if (entryType === 'order' && !order_id) {
      return res.status(400).json({ error: 'Ordre-registrering kræver en valgt ordre' });
    }
    const finalOrderId = entryType === 'order' ? order_id : null;

    // Sikr at kolonnen findes (Postgres og SQLite)
    try {
      await db.run("ALTER TABLE time_entries ADD COLUMN entry_type TEXT DEFAULT 'order'");
    } catch (e) { /* kolonnen findes allerede */ }

    // Check ownership (non-admins can only edit their own)
    if (!req.user.is_admin && existing.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Check if locked
    if (existing.is_locked && !req.user.is_admin) {
      return res.status(400).json({ error: 'Cannot edit locked time entry' });
    }

    // Recalculate duration (NO automatic lunch deduction)
    const startHours = parseInt(start_time.split(':')[0]);
    const startMinutes = parseInt(start_time.split(':')[1]);
    const endHours = parseInt(end_time.split(':')[0]);
    const endMinutes = parseInt(end_time.split(':')[1]);
    
    const totalMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
    const durationMinutes = totalMinutes; // NO lunch deduction
    const durationHours = (durationMinutes / 60).toFixed(2);

    // Update time entry
    await db.run(`
      UPDATE time_entries
      SET order_id = ?, material_id = ?, date = ?, start_time = ?, end_time = ?, duration_hours = ?, notes = ?, entry_type = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [finalOrderId, material_id, date, start_time, end_time, durationHours, notes || null, entryType, timeEntryId]);

    // Update corresponding order_materials if exists
    const orderMaterial = await db.get('SELECT * FROM order_materials WHERE time_entry_id = ?', [timeEntryId]);
    if (orderMaterial) {
      const material = await db.get('SELECT * FROM materials WHERE id = ?', [material_id]);
      const totalCost = parseFloat(durationHours) * parseFloat(material.cost_price);
      const totalSale = parseFloat(durationHours) * parseFloat(material.sales_price);

      await db.run(`
        UPDATE order_materials
        SET material_id = ?, quantity = ?, unit_cost = ?, unit_sale = ?, total_cost = ?, total_sale = ?
        WHERE time_entry_id = ?
      `, [material_id, durationHours, material.cost_price, material.sales_price, totalCost, totalSale, timeEntryId]);
    }

    const timeEntry = await db.get(`
      SELECT te.*, u.name as user_name, m.name as material_name
      FROM time_entries te
      LEFT JOIN users u ON te.user_id = u.id
      LEFT JOIN materials m ON te.material_id = m.id
      WHERE te.id = ?
    `, [timeEntryId]);

    res.json(timeEntry);
  } catch (error) {
    console.error('Error updating time entry:', error);
    res.status(500).json({ error: 'Failed to update time entry' });
  }
});

// Delete time entry (only if not locked)
app.delete('/api/time-entries/:id', auth, async (req, res) => {
  try {
    const timeEntryId = Number(req.params.id);

    const existing = await db.get('SELECT * FROM time_entries WHERE id = ?', [timeEntryId]);
    if (!existing) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    // Check ownership
    if (!req.user.is_admin && existing.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Check if locked
    if (existing.is_locked && !req.user.is_admin) {
      return res.status(400).json({ error: 'Cannot delete locked time entry' });
    }

    // Delete associated order_materials (will cascade due to ON DELETE CASCADE)
    await db.run('DELETE FROM time_entries WHERE id = ?', [timeEntryId]);

    res.json({ message: 'Time entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting time entry:', error);
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
});

// Lock/unlock time entry (admin only)
app.post('/api/time-entries/:id/lock', auth, adminAuth, async (req, res) => {
  try {
    const timeEntryId = Number(req.params.id);
    const { is_locked } = req.body;

    await db.run('UPDATE time_entries SET is_locked = ? WHERE id = ?', [is_locked ? 1 : 0, timeEntryId]);

    const timeEntry = await db.get('SELECT * FROM time_entries WHERE id = ?', [timeEntryId]);
    res.json(timeEntry);
  } catch (error) {
    console.error('Error locking/unlocking time entry:', error);
    res.status(500).json({ error: 'Failed to lock/unlock time entry' });
  }
});

// ==================== ORDER MATERIALS ====================

// Get all materials for an order
app.get('/api/orders/:orderId/materials', auth, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);

    const materials = await db.all(`
      SELECT om.*, 
        m.name as material_name, m.material_number, m.category,
        u.name as added_by_name,
        te.date as time_entry_date
      FROM order_materials om
      LEFT JOIN materials m ON om.material_id = m.id
      LEFT JOIN users u ON om.added_by = u.id
      LEFT JOIN time_entries te ON om.time_entry_id = te.id
      WHERE om.order_id = ?
      ORDER BY om.added_at DESC
    `, [orderId]);

    // v83: Montorer ser linjerne uden oeconomi (kostpris/salg udgik)
    if (isMontor(req)) {
      return res.json(materials.map(om => {
        const { unit_cost, unit_sale, total_cost, total_sale, ...rest } = om;
        return rest;
      }));
    }

    res.json(materials);
  } catch (error) {
    console.error('Error fetching order materials:', error);
    res.status(500).json({ error: 'Failed to fetch order materials' });
  }
});

// Add material to order (manual)
// v84: Accepterer enten material_id (katalog) ELLER description (fri tekst,
// fx "epoxy primer" - gemmes paa en fast "Uspecificeret materiale"-post i
// notes-feltet, saa Ledelsen senere kan ombooge til det korrekte materiale).
const UNSPECIFIED_MATERIAL_NAME = 'Uspecificeret materiale';

// v84: Soerg for at notes-kolonnen findes (aeldre produktions-databaser kan mangle den)
let orderMaterialsNotesReady = false;
async function ensureOrderMaterialsNotesColumn() {
  if (orderMaterialsNotesReady) return;
  try {
    await db.run('ALTER TABLE order_materials ADD COLUMN notes TEXT');
  } catch (e) {
    // Kolonnen findes allerede - ignorer
  }
  orderMaterialsNotesReady = true;
}

async function getOrCreateUnspecifiedMaterial(userId) {
  let m = await db.get('SELECT * FROM materials WHERE name = ?', [UNSPECIFIED_MATERIAL_NAME]);
  if (!m) {
    await db.run(`INSERT INTO materials (material_number, name, description, category, unit, cost_price, sales_price, created_by)
      VALUES ('USPEC', ?, ?, 'Øvrigt', 'stk', 0, 0, ?)`, [UNSPECIFIED_MATERIAL_NAME, 'Autogenereret post til fri-tekst registreringer fra montorer', userId || 0]);
    m = await db.get('SELECT * FROM materials WHERE name = ?', [UNSPECIFIED_MATERIAL_NAME]);
  }
  return m;
}

app.post('/api/orders/:orderId/materials', auth, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const { material_id, quantity, description } = req.body;
    const hasCatalogMaterial = material_id && Number(material_id) > 0;
    const hasFreeText = description && String(description).trim().length > 0;

    if (!quantity || quantity <= 0 || (!hasCatalogMaterial && !hasFreeText)) {
      return res.status(400).json({ error: 'Angiv materiale (eller fritekst) og et gyldigt antal' });
    }

    const order = await db.get('SELECT * FROM quotes WHERE id = ?', [orderId]);
    if (!order) {
      return res.status(400).json({ error: 'Order not found' });
    }

    // v83: Montorer maa kun registrere materialer paa IGANGVAERENDE ordrer
    if (isMontor(req) && order.order_stage !== 'in_progress') {
      return res.status(403).json({ error: 'Materialer kan kun registreres på igangværende ordrer' });
    }

    let material, notes = null;
    if (hasCatalogMaterial) {
      material = await db.get('SELECT * FROM materials WHERE id = ?', [material_id]);
      if (!material) {
        return res.status(400).json({ error: 'Material not found' });
      }
    } else {
      material = await getOrCreateUnspecifiedMaterial(req.user.id);
      notes = String(description).trim();
    }

    const totalCost = parseFloat(quantity) * parseFloat(material.cost_price);
    const totalSale = parseFloat(quantity) * parseFloat(material.sales_price);

    await ensureOrderMaterialsNotesColumn();

    let insertResult, insertedId;
    try {
      insertResult = await db.run(`
        INSERT INTO order_materials (order_id, material_id, quantity, unit_cost, unit_sale, total_cost, total_sale, added_by, source, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)
      `, [orderId, material.id, quantity, material.cost_price, material.sales_price, totalCost, totalSale, req.user.id, notes]);
    } catch (insertError) {
      // Fallback: aeldre DB uden notes-kolonne - gem uden notes
      console.warn('[materials] Insert med notes fejlede, proever uden:', insertError.message);
      insertResult = await db.run(`
        INSERT INTO order_materials (order_id, material_id, quantity, unit_cost, unit_sale, total_cost, total_sale, added_by, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual')
      `, [orderId, material.id, quantity, material.cost_price, material.sales_price, totalCost, totalSale, req.user.id]);
      notes = null;
    }

    // Kompatibelt med bade SQLite og PostgreSQL (v84 fix: result.lastID fandtes ikke)
    insertedId = insertResult.lastInsertRowid || insertResult.lastID || insertResult.id;

    if (!insertedId) {
      // Sidste fallback (Postgres uden RETURNING): find seneste linje for ordren
      const latest = await db.get('SELECT id FROM order_materials WHERE order_id = ? ORDER BY id DESC LIMIT 1', [orderId]);
      insertedId = latest ? latest.id : null;
    }

    // Add to timeline
    const user = await db.get('SELECT name FROM users WHERE id = ?', [req.user.id]);
    const displayName = hasCatalogMaterial ? material.name : `"${notes}"`;
    await db.run(`
      INSERT INTO order_timeline (order_id, activity_type, description, user_id)
      VALUES (?, 'material_added', ?, ?)
    `, [orderId, `${user.name} tilføjede ${quantity} ${material.unit || ''} ${displayName}`.trim(), req.user.id]);

    const orderMaterial = insertedId ? await db.get(`
      SELECT om.*, m.name as material_name, m.material_number
      FROM order_materials om
      LEFT JOIN materials m ON om.material_id = m.id
      WHERE om.id = ?
    `, [insertedId]) : null;

    if (!orderMaterial) {
      // Linjen er gemt, men kunne ikke laeses tilbage - succes uden detaljer
      return res.json({ success: true });
    }
    // v83: Montor maa ikke se priser i svaret
    if (isMontor(req)) {
      const { unit_cost, unit_sale, total_cost, total_sale, ...rest } = orderMaterial;
      return res.json(rest);
    }

    res.json(orderMaterial);
  } catch (error) {
    console.error('Error adding material to order:', error);
    res.status(500).json({ error: 'Failed to add material to order', details: error.message });
  }
});

// v87: Rediger manuel materialelinje (Ledelsen) - beskrivelse (notes), antal og priser.
// Regnskabet (sagens udgifter/overskud) beregnes ud fra total_cost/total_sale, saa
// aendringer her slaar direkte igennem i oekonomien.
app.put('/api/orders/:orderId/materials/:materialId', auth, async (req, res) => {
  try {
    if (isMontor(req)) {
      return res.status(403).json({ error: 'Kun Ledelsen kan redigere materialelinjer' });
    }

    const orderId = Number(req.params.orderId);
    const materialId = Number(req.params.materialId);
    const { notes, quantity, unit_cost, unit_sale } = req.body;

    const orderMaterial = await db.get('SELECT * FROM order_materials WHERE id = ? AND order_id = ?', [materialId, orderId]);
    if (!orderMaterial) {
      return res.status(404).json({ error: 'Material not found' });
    }
    if (orderMaterial.source === 'time_entry') {
      return res.status(400).json({ error: 'Timer-linjer redigeres via materiale-kataloget (priserne følger kataloget)' });
    }

    const qty = quantity !== undefined ? parseFloat(quantity) : parseFloat(orderMaterial.quantity);
    const cost = unit_cost !== undefined ? parseFloat(unit_cost) : parseFloat(orderMaterial.unit_cost);
    const sale = unit_sale !== undefined ? parseFloat(unit_sale) : parseFloat(orderMaterial.unit_sale);
    if (!qty || qty <= 0 || isNaN(cost) || isNaN(sale)) {
      return res.status(400).json({ error: 'Angiv gyldigt antal og priser' });
    }

    const newNotes = notes !== undefined ? (notes && String(notes).trim() ? String(notes).trim() : null) : orderMaterial.notes;

    await db.run(`
      UPDATE order_materials
      SET quantity = ?, unit_cost = ?, unit_sale = ?, total_cost = ROUND(? * ?, 2), total_sale = ROUND(? * ?, 2), notes = ?
      WHERE id = ?
    `, [qty, cost, sale, qty, cost, qty, sale, newNotes, materialId]);

    await db.run(`
      INSERT INTO order_timeline (order_id, activity_type, description, user_id)
      VALUES (?, 'material_updated', ?, ?)
    `, [orderId, 'Materialelinje rettet af Ledelsen', req.user.id]);

    const updated = await db.get(`
      SELECT om.*, m.name as material_name, m.material_number, m.unit
      FROM order_materials om
      LEFT JOIN materials m ON om.material_id = m.id
      WHERE om.id = ?
    `, [materialId]);

    res.json(updated);
  } catch (error) {
    console.error('Error updating order material:', error);
    res.status(500).json({ error: 'Failed to update material line', details: error.message });
  }
});

// Remove material from order (only manual entries, not time_entry sourced)
app.delete('/api/orders/:orderId/materials/:materialId', auth, async (req, res) => {
  try {
    const materialId = Number(req.params.materialId);

    const orderMaterial = await db.get('SELECT * FROM order_materials WHERE id = ?', [materialId]);
    if (!orderMaterial) {
      return res.status(404).json({ error: 'Material not found' });
    }

    if (orderMaterial.source === 'time_entry') {
      return res.status(400).json({ error: 'Cannot delete material from time entry. Delete the time entry instead.' });
    }

    await db.run('DELETE FROM order_materials WHERE id = ?', [materialId]);
    res.json({ message: 'Material removed from order' });
  } catch (error) {
    console.error('Error removing material from order:', error);
    res.status(500).json({ error: 'Failed to remove material from order' });
  }
});

// Get complete order workspace data
app.get('/api/orders/:orderId/workspace', auth, async (req, res) => {
  const orderId = Number(req.params.orderId);
  
  // Get order details
  const order = await db.get(`
    SELECT q.id, q.quote_number, q.order_number, q.parent_order_id, q.sub_number, q.is_extra_work,
           q.customer_id, q.title, q.requisition_number, q.date, q.valid_until, q.status,
           q.notes, q.terms, q.work_description, q.subtotal, q.vat_rate, q.vat_amount, q.total,
           q.created_by, q.created_at, q.sent_at, q.accepted_at, q.contact_person_id,
           q.order_address, q.order_postal_code, q.order_city,
           c.company_name, c.contact_person, c.email as customer_email,
           c.phone as customer_phone, c.address, c.postal_code, c.city, c.cvr_number,
           u.name as created_by_name
    FROM quotes q
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON q.created_by = u.id
    WHERE q.id = ?
  `, [orderId]);
  
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  
  // If contact_person_id is set, get contact person details
  if (order.contact_person_id) {
    const contactPerson = await db.get('SELECT * FROM customer_contacts WHERE id = ?', [order.contact_person_id]);
    if (contactPerson) {
      // Add contact person details to order object
      order.contact_person_name = contactPerson.name;
      order.contact_person_title = contactPerson.title;
      order.contact_person_email = contactPerson.email;
      order.contact_person_phone = contactPerson.phone;
    }
  }
  
  // Get all extra work orders for this main order
  const extraWorkOrders = await db.all(`
    SELECT q.*, u.name as created_by_name
    FROM quotes q
    JOIN users u ON q.created_by = u.id
    WHERE q.parent_order_id = ?
    ORDER BY q.sub_number ASC
  `, [orderId]);
  
  // Get expenses for main order
  const expenses = await db.all(`
    SELECT e.*, u.name as created_by_name
    FROM order_expenses e
    JOIN users u ON e.created_by = u.id
    WHERE e.order_id = ?
    ORDER BY e.expense_date DESC
  `, [orderId]);
  
  let totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  
  // Labor/material costs (order_materials) count as expenses - excludes sick time (material_number '1')
  const laborCostForOrder = async (orderId) => {
    const res = await db.get(`
      SELECT SUM(om.total_cost) as total
      FROM order_materials om
      LEFT JOIN materials m ON om.material_id = m.id
      WHERE om.order_id = ? AND (m.material_number IS NULL OR m.material_number != '1')
    `, [orderId]);
    return res?.total || 0;
  };
  const mainLaborCost = await laborCostForOrder(orderId);
  totalExpenses += mainLaborCost;
  
  // Get expenses for all extra work orders and aggregate
  let extraWorkExpenses = [];
  let extraLaborCost = 0;
  for (const extraOrder of extraWorkOrders) {
    const extraExpenses = await db.all(`
      SELECT e.*, u.name as created_by_name
      FROM order_expenses e
      JOIN users u ON e.created_by = u.id
      WHERE e.order_id = ?
      ORDER BY e.expense_date DESC
    `, [extraOrder.id]);
    
    extraWorkExpenses = [...extraWorkExpenses, ...extraExpenses];
    totalExpenses += extraExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    
    const extraOrderLaborCost = await laborCostForOrder(extraOrder.id);
    extraLaborCost += extraOrderLaborCost;
    totalExpenses += extraOrderLaborCost;
  }
  
  // Get documents
  const documents = await db.all(`
    SELECT d.*, u.name as uploaded_by_name
    FROM order_documents d
    JOIN users u ON d.uploaded_by = u.id
    WHERE d.order_id = ?
    ORDER BY d.created_at DESC
  `, [orderId]);
  
  // Get timeline
  const timeline = await db.all(`
    SELECT t.*, u.name as user_name, u.avatar_url AS profile_image
    FROM order_timeline t
    JOIN users u ON t.user_id = u.id
    WHERE t.order_id = ?
    ORDER BY t.created_at DESC
    LIMIT 50
  `, [orderId]);
  
  // Get notes
  const notes = await db.all(`
    SELECT n.*, u.name as created_by_name, u.avatar_url AS profile_image
    FROM order_notes n
    JOIN users u ON n.created_by = u.id
    WHERE n.order_id = ?
    ORDER BY n.is_pinned DESC, n.updated_at DESC
  `, [orderId]);
  
  // Get lines
  const lines = await db.all('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY sort_order, id', [orderId]);
  
  // Get material/labor lines (time entries + manual additions) shown in "Timer & Materialer" tab
  const materials = await db.all(`
    SELECT om.*, 
      m.name as material_name, m.material_number, m.category,
      u.name as added_by_name,
      te.date as time_entry_date
    FROM order_materials om
    LEFT JOIN materials m ON om.material_id = m.id
    LEFT JOIN users u ON om.added_by = u.id
    LEFT JOIN time_entries te ON om.time_entry_id = te.id
    WHERE om.order_id = ?
    ORDER BY om.added_at DESC
  `, [orderId]);
  
  // Check if order has an invoice
  const invoice = await db.get(`
    SELECT i.*, u.name as created_by_name
    FROM invoices i
    JOIN users u ON i.created_by = u.id
    WHERE i.order_id = ?
    ORDER BY i.id DESC
    LIMIT 1
  `, [orderId]);
  
  // Calculate aggregated revenue (main order + extra work)
  let totalRevenue = order.total || 0;
  extraWorkOrders.forEach(extraOrder => {
    totalRevenue += (extraOrder.total || 0);
  });
  
  // Calculate profit with aggregated data
  const profit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(2) : 0;
  
  // Calculate split expenses
  const mainOrderExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0) + mainLaborCost;
  const extraWorkExpensesTotal = extraWorkExpenses.reduce((sum, exp) => sum + exp.amount, 0) + extraLaborCost;
  
  // Calculate split profit
  const mainOrderRevenue = order.total || 0;
  const extraWorkRevenue = totalRevenue - mainOrderRevenue;
  const profitMain = mainOrderRevenue - mainOrderExpenses;
  const profitExtra = extraWorkRevenue - extraWorkExpensesTotal;
  
  // Get full order numbers for extra work orders
  const extraWorkOrdersWithNumbers = [];
  for (const eo of extraWorkOrders) {
    extraWorkOrdersWithNumbers.push({
      ...eo,
      full_order_number: await getFullOrderNumber(eo)
    });
  }
  
  res.json({
    order,
    lines,
    materials,
    extra_work_orders: extraWorkOrdersWithNumbers,
    invoice: invoice || null,
    expenses: {
      items: expenses,
      extra_work_expenses: extraWorkExpenses,
      total: totalExpenses,
      labor_cost: mainLaborCost + extraLaborCost
    },
    documents,
    timeline,
    notes,
    financials: {
      revenue_main: mainOrderRevenue,
      revenue_extra: extraWorkRevenue,
      revenue: totalRevenue,
      expenses_main: mainOrderExpenses,
      expenses_extra: extraWorkExpensesTotal,
      expenses: totalExpenses,
      profit_main: profitMain,
      profit_extra: profitExtra,
      profit,
      profit_margin: profitMargin
    }
  });
});

// --- EMAIL INTEGRATION API ---
// LIGHTWEIGHT PAGINATION SYSTEM - Memory-safe email sync
import { syncEmailsPaginated, syncNewEmails, sendEmail, testImapConnection, testSmtpConnection } from './email-service.js';

// --- EMAIL ROUTES - LIGHTWEIGHT PAGINATION SYSTEM ---
// Memory-safe email sync with pagination

// Get user's email accounts
app.get('/api/email/accounts', auth, async (req, res) => {
  const accounts = await db.all('SELECT id, email, display_name, imap_host, smtp_host, is_active, last_sync FROM email_accounts WHERE user_id = ?', [req.user.id]);
  res.json(accounts);
});

// Add email account
app.post('/api/email/accounts', auth, async (req, res) => {
  const { email, display_name, imap_host, imap_port, imap_username, imap_password, smtp_host, smtp_port, smtp_username, smtp_password } = req.body;
  
  if (!email || !imap_host || !imap_username || !imap_password || !smtp_host || !smtp_username || !smtp_password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const info = await db.run(`
    INSERT INTO email_accounts (
      user_id, email, display_name, imap_host, imap_port, imap_username, imap_password,
      smtp_host, smtp_port, smtp_username, smtp_password
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [req.user.id, email, display_name || null, imap_host, imap_port || 993, imap_username, imap_password, smtp_host, smtp_port || 587, smtp_username, smtp_password]);
  
  const account = await db.get('SELECT id, email, display_name, imap_host, smtp_host, is_active FROM email_accounts WHERE id = ?', [info.lastInsertRowid]);
  res.json(account);
});

// Delete email account
app.delete('/api/email/accounts/:id', auth, async (req, res) => {
  const accountId = Number(req.params.id);
  const account = await db.get('SELECT * FROM email_accounts WHERE id = ? AND user_id = ?', [accountId, req.user.id]);
  
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }
  
  await db.run('DELETE FROM email_accounts WHERE id = ?', [accountId]);
  res.json({ success: true });
});

// AUTO-SYNC: Sync NEW (UNSEEN) emails only - for 10-min auto-sync
app.post('/api/email/sync-new/:accountId', auth, async (req, res) => {
  const accountId = Number(req.params.accountId);
  
  // Verify account belongs to user
  const account = await db.get('SELECT * FROM email_accounts WHERE id = ? AND user_id = ?', [accountId, req.user.id]);
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }
  
  try {
    const result = await syncNewEmails(accountId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// LIGHTWEIGHT PAGINATION: Sync emails with offset/limit
app.post('/api/email/sync-paginated/:accountId', auth, async (req, res) => {
  const accountId = Number(req.params.accountId);
  const { offset = 0, limit = 10 } = req.body;
  
  // Verify account belongs to user
  const account = await db.get('SELECT * FROM email_accounts WHERE id = ? AND user_id = ?', [accountId, req.user.id]);
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }
  
  try {
    const result = await syncEmailsPaginated(accountId, Number(offset), Number(limit));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get emails for user (from database, with pagination)
app.get('/api/email/emails', auth, async (req, res) => {
  const { folder, folder_id, search, limit = 50, offset = 0, accountId } = req.query;
  
  // Get user's accounts
  let accountIds = [];
  if (accountId) {
    // Verify this account belongs to user
    const account = await db.get('SELECT id FROM email_accounts WHERE id = ? AND user_id = ?', [Number(accountId), req.user.id]);
    if (account) {
      accountIds = [account.id];
    }
  } else {
    const accounts = await db.all('SELECT id FROM email_accounts WHERE user_id = ?', [req.user.id]);
    accountIds = accounts.map(a => a.id);
  }
  
  if (accountIds.length === 0) {
    return res.json([]);
  }
  
  let query = `
    SELECT e.*, ea.email as account_email
    FROM emails e
    JOIN email_accounts ea ON e.account_id = ea.id
    WHERE e.account_id IN (${accountIds.map(() => '?').join(',')})
  `;
  
  const params = [...accountIds];
  
  // Filter by custom folder_id (for custom folders)
  if (folder_id) {
    query += ' AND e.folder_id = ?';
    params.push(Number(folder_id));
  } else if (folder) {
    // Filter by IMAP folder (inbox, sent, etc)
    query += ' AND LOWER(e.folder) = LOWER(?)';
    params.push(folder);
  }
  
  if (search) {
    query += ' AND (e.subject LIKE ? OR e.from_address LIKE ? OR e.body_text LIKE ?)';
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam);
  }
  
  query += ' ORDER BY e.received_date DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));
  
  const emails = await db.all(query, params);
  res.json(emails);
});

// Get single email with attachments
app.get('/api/email/emails/:id', auth, async (req, res) => {
  const emailId = Number(req.params.id);
  
  // Get email and verify user owns the account
  const email = await db.get(`
    SELECT e.*, ea.email as account_email
    FROM emails e
    JOIN email_accounts ea ON e.account_id = ea.id
    WHERE e.id = ? AND ea.user_id = ?
  `, [emailId, req.user.id]);
  
  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }
  
  // Get attachments
  const attachments = await db.all('SELECT * FROM email_attachments WHERE email_id = ?', [emailId]);
  email.attachments = attachments;
  
  // Mark as read
  await db.run('UPDATE emails SET is_read = 1 WHERE id = ?', [emailId]);
  
  res.json(email);
});

// Send email
app.post('/api/email/send', auth, async (req, res) => {
  const { account_id, to, cc, bcc, subject, text, html } = req.body;
  
  if (!account_id || !to || !subject) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Verify account belongs to user
  const account = await db.get('SELECT * FROM email_accounts WHERE id = ? AND user_id = ?', [account_id, req.user.id]);
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }
  
  try {
    const result = await sendEmail(account_id, { to, cc, bcc, subject, text, html });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle email starred
app.post('/api/email/emails/:id/star', auth, async (req, res) => {
  const emailId = Number(req.params.id);
  
  const email = await db.get(`
    SELECT e.*, ea.user_id
    FROM emails e
    JOIN email_accounts ea ON e.account_id = ea.id
    WHERE e.id = ?
  `, [emailId]);
  
  if (!email || email.user_id !== req.user.id) {
    return res.status(404).json({ error: 'Email not found' });
  }
  
  const newStarred = email.is_starred ? 0 : 1;
  await db.run('UPDATE emails SET is_starred = ? WHERE id = ?', [newStarred, emailId]);
  
  res.json({ success: true, is_starred: newStarred });
});

// --- EMAIL FOLDER MANAGEMENT ENDPOINTS ---

// Get custom email folders for user
app.get('/api/email/folders', auth, async (req, res) => {
  try {
    const folders = await db.all(`
      SELECT * FROM email_folders 
      WHERE user_id = ? 
      ORDER BY name ASC
    `, [req.user.id]);
    res.json(folders);
  } catch (error) {
    console.error('Get folders error:', error);
    res.status(500).json({ error: 'Failed to get folders' });
  }
});

// Create custom email folder
app.post('/api/email/folders', auth, async (req, res) => {
  const { name, parent_folder } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Folder name required' });
  }
  
  try {
    // PostgreSQL-compatible: Use RETURNING to get the inserted row
    const result = await db.run(`
      INSERT INTO email_folders (user_id, name, parent_folder)
      VALUES (?, ?, ?)
      RETURNING *
    `, [req.user.id, name.trim(), parent_folder || null]);
    
    // For PostgreSQL (Supabase), the row is in result.rows[0]
    // For SQLite, we need to query separately
    let folder;
    if (result.rows && result.rows.length > 0) {
      // PostgreSQL/Supabase
      folder = result.rows[0];
    } else {
      // SQLite fallback
      folder = await db.get(`
        SELECT * FROM email_folders WHERE id = ?
      `, [result.lastInsertRowid]);
    }
    
    console.log('Created folder:', folder); // DEBUG
    res.json(folder);
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Rename email folder
app.put('/api/email/folders/:id', auth, async (req, res) => {
  const folderId = Number(req.params.id);
  const { name } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Folder name required' });
  }
  
  try {
    const folder = await db.get('SELECT * FROM email_folders WHERE id = ? AND user_id = ?', [folderId, req.user.id]);
    
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    await db.run('UPDATE email_folders SET name = ? WHERE id = ?', [name.trim(), folderId]);
    
    const updated = await db.get('SELECT * FROM email_folders WHERE id = ?', [folderId]);
    res.json(updated);
  } catch (error) {
    console.error('Rename folder error:', error);
    res.status(500).json({ error: 'Failed to rename folder' });
  }
});

// Delete email folder
app.delete('/api/email/folders/:id', auth, async (req, res) => {
  const folderId = Number(req.params.id);
  
  try {
    const folder = await db.get('SELECT * FROM email_folders WHERE id = ? AND user_id = ?', [folderId, req.user.id]);
    
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    // Move emails in this folder back to inbox
    await db.run('UPDATE emails SET folder_id = NULL WHERE folder_id = ?', [folderId]);
    
    await db.run('DELETE FROM email_folders WHERE id = ?', [folderId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete folder error:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// Move email to folder
app.put('/api/email/emails/:id/move', auth, async (req, res) => {
  const emailId = Number(req.params.id);
  const { folder_id } = req.body;
  
  try {
    // Verify email belongs to user's account
    const email = await db.get(`
      SELECT e.* FROM emails e
      JOIN email_accounts ea ON e.account_id = ea.id
      WHERE e.id = ? AND ea.user_id = ?
    `, [emailId, req.user.id]);
    
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }
    
    // If folder_id is provided, verify it belongs to user
    if (folder_id) {
      const folder = await db.get('SELECT * FROM email_folders WHERE id = ? AND user_id = ?', [folder_id, req.user.id]);
      if (!folder) {
        return res.status(404).json({ error: 'Folder not found' });
      }
    }
    
    // Update email's folder_id
    await db.run('UPDATE emails SET folder_id = ? WHERE id = ?', [folder_id || null, emailId]);
    
    // Get updated email
    const updated = await db.get('SELECT * FROM emails WHERE id = ?', [emailId]);
    res.json(updated);
  } catch (error) {
    console.error('Move email error:', error);
    res.status(500).json({ error: 'Failed to move email' });
  }
});

// Reorder folder (for drag-and-drop)
app.put('/api/email/folders/:id/reorder', auth, async (req, res) => {
  const folderId = Number(req.params.id);
  const { sort_order, parent_folder } = req.body;
  
  try {
    const folder = await db.get('SELECT * FROM email_folders WHERE id = ? AND user_id = ?', [folderId, req.user.id]);
    
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    // Prevent circular references
    if (parent_folder === folderId) {
      return res.status(400).json({ error: 'Cannot make folder its own parent' });
    }
    
    // If parent_folder is set, verify it exists and belongs to user
    if (parent_folder) {
      const parentFolder = await db.get('SELECT * FROM email_folders WHERE id = ? AND user_id = ?', [parent_folder, req.user.id]);
      if (!parentFolder) {
        return res.status(404).json({ error: 'Parent folder not found' });
      }
    }
    
    // Update folder
    await db.run('UPDATE email_folders SET sort_order = ?, parent_folder = ? WHERE id = ?', 
      [sort_order !== undefined ? sort_order : folder.sort_order, 
       parent_folder !== undefined ? parent_folder : folder.parent_folder, 
       folderId]);
    
    const updated = await db.get('SELECT * FROM email_folders WHERE id = ?', [folderId]);
    res.json(updated);
  } catch (error) {
    console.error('Reorder folder error:', error);
    res.status(500).json({ error: 'Failed to reorder folder' });
  }
});

// Test IMAP connection
app.post('/api/email/test-imap', auth, async (req, res) => {
  const { host, port, username, password } = req.body;
  const result = await testImapConnection({ host, port, username, password });
  res.json(result);
});

// Test SMTP connection
app.post('/api/email/test-smtp', auth, async (req, res) => {
  const { host, port, username, password } = req.body;
  const result = await testSmtpConnection({ host, port, username, password });
  res.json(result);
});

// Link email to order (Send to ordre)
app.post('/api/email/link-to-order', auth, async (req, res) => {
  const { email_id, order_number } = req.body;
  
  if (!email_id || !order_number) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Verify email belongs to user's account
  const email = await db.get(`
    SELECT e.* FROM emails e
    JOIN email_accounts ea ON e.account_id = ea.id
    WHERE e.id = ? AND ea.user_id = ?
  `, [email_id, req.user.id]);
  
  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }
  
  // Find order
  const order = await db.get('SELECT id FROM quotes WHERE order_number = ? OR quote_number = ?', [order_number, order_number]);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  
  // Check if already linked
  const existing = await db.get('SELECT id FROM email_ordre_links WHERE email_id = ? AND order_id = ?', [email_id, order.id]);
  if (existing) {
    return res.status(400).json({ error: 'Email already linked to this order' });
  }
  
  // Create link
  const info = await db.run(`
    INSERT INTO email_ordre_links (email_id, order_id, linked_by)
    VALUES (?, ?, ?)
  `, [email_id, order.id, req.user.id]);
  
  // Log to order timeline
  await db.run(`
    INSERT INTO order_timeline (order_id, activity_type, description, user_id)
    VALUES (?, 'email_linked', ?, ?)
  `, [order.id, `Email linked: ${email.subject}`, req.user.id]);
  
  res.json({ success: true, link_id: info.lastInsertRowid });
});

// Get emails linked to an order
app.get('/api/orders/:orderId/emails', auth, async (req, res) => {
  const orderId = Number(req.params.orderId);
  
  const emails = await db.all(`
    SELECT e.*, eol.created_at as linked_at, u.name as linked_by_name
    FROM email_ordre_links eol
    JOIN emails e ON eol.email_id = e.id
    JOIN users u ON eol.linked_by = u.id
    WHERE eol.order_id = ?
    ORDER BY eol.created_at DESC
  `, [orderId]);
  
  res.json(emails);
});

// --- OLD DISABLED ROUTES (kept for reference) ---
/*
// ADMIN: Migrate old emails to lowercase folder names (ONE TIME)
app.post('/api/admin/migrate-email-folders', auth, adminAuth, async (req, res) => {
  try {
    // Update all emails with uppercase folder names to lowercase
    const inboxResult = await db.run("UPDATE emails SET folder = 'inbox' WHERE folder = 'INBOX'");
    const sentResult = await db.run("UPDATE emails SET folder = 'sent' WHERE folder = 'SENT'");
    
    res.json({ 
      success: true, 
      migrated: {
        inbox: inboxResult.changes || 0,
        sent: sentResult.changes || 0,
        total: (inboxResult.changes || 0) + (sentResult.changes || 0)
      },
      message: 'Email folders migrated successfully!'
    });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: 'Migration failed: ' + error.message });
  }
});

// Get user's email accounts
app.get('/api/email/accounts', auth, async (req, res) => {
  const accounts = await db.all('SELECT id, email, display_name, imap_host, smtp_host, is_active, last_sync FROM email_accounts WHERE user_id = ?', [req.user.id]);
  res.json(accounts);
});

// Add email account
app.post('/api/email/accounts', auth, async (req, res) => {
  const { email, display_name, imap_host, imap_port, imap_username, imap_password, smtp_host, smtp_port, smtp_username, smtp_password } = req.body;
  
  if (!email || !imap_host || !imap_username || !imap_password || !smtp_host || !smtp_username || !smtp_password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const info = await db.run(`
    INSERT INTO email_accounts (
      user_id, email, display_name, imap_host, imap_port, imap_username, imap_password,
      smtp_host, smtp_port, smtp_username, smtp_password
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [req.user.id, email, display_name || null, imap_host, imap_port || 993, imap_username, imap_password, smtp_host, smtp_port || 587, smtp_username, smtp_password]);
  
  const account = await db.get('SELECT id, email, display_name, imap_host, smtp_host, is_active FROM email_accounts WHERE id = ?', [info.lastInsertRowid]);
  res.json(account);
});

// Delete email account
app.delete('/api/email/accounts/:id', auth, async (req, res) => {
  const accountId = Number(req.params.id);
  const account = await db.get('SELECT * FROM email_accounts WHERE id = ? AND user_id = ?', [accountId, req.user.id]);
  
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }
  
  await db.run('DELETE FROM email_accounts WHERE id = ?', [accountId]);
  res.json({ success: true });
});

// Test IMAP connection
app.post('/api/email/test-imap', auth, async (req, res) => {
  const { host, port, username, password } = req.body;
  const result = await testImapConnection({ host, port, username, password });
  res.json(result);
});

// Test SMTP connection
app.post('/api/email/test-smtp', auth, async (req, res) => {
  const { host, port, username, password } = req.body;
  const result = await testSmtpConnection({ host, port, username, password });
  res.json(result);
});

// Sync emails from IMAP
app.post('/api/email/sync/:accountId', auth, async (req, res) => {
  const accountId = Number(req.params.accountId);
  
  // Verify account belongs to user
  const account = await db.get('SELECT * FROM email_accounts WHERE id = ? AND user_id = ?', [accountId, req.user.id]);
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }
  
  try {
    const result = await syncEmails(accountId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get emails for user
app.get('/api/email/emails', auth, async (req, res) => {
  const { folder, search, limit = 50, offset = 0 } = req.query;
  
  // Get user's accounts
  const accounts = await db.all('SELECT id FROM email_accounts WHERE user_id = ?', [req.user.id]);
  const accountIds = accounts.map(a => a.id);
  
  if (accountIds.length === 0) {
    return res.json([]);
  }
  
  let query = `
    SELECT e.*, ea.email as account_email
    FROM emails e
    JOIN email_accounts ea ON e.account_id = ea.id
    WHERE e.account_id IN (${accountIds.map(() => '?').join(',')})
  `;
  
  const params = [...accountIds];
  
  if (folder) {
    query += ' AND (LOWER(e.folder) = LOWER(?) OR e.folder = ?)';
    params.push(folder, folder);
  }
  
  if (search) {
    query += ' AND (e.subject LIKE ? OR e.from_address LIKE ? OR e.body_text LIKE ?)';
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam);
  }
  
  query += ' ORDER BY e.received_date DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));
  
  const emails = await db.all(query, params);
  res.json(emails);
});

// Get single email with attachments
app.get('/api/email/emails/:id', auth, async (req, res) => {
  const emailId = Number(req.params.id);
  
  // Get email and verify user owns the account
  const email = await db.get(`
    SELECT e.*, ea.email as account_email
    FROM emails e
    JOIN email_accounts ea ON e.account_id = ea.id
    WHERE e.id = ? AND ea.user_id = ?
  `, [emailId, req.user.id]);
  
  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }
  
  // Get attachments
  const attachments = await db.all('SELECT * FROM email_attachments WHERE email_id = ?', [emailId]);
  email.attachments = attachments;
  
  // Mark as read
  await db.run('UPDATE emails SET is_read = 1 WHERE id = ?', [emailId]);
  
  res.json(email);
});

// Send email
app.post('/api/email/send', auth, async (req, res) => {
  const { account_id, to, cc, bcc, subject, text, html } = req.body;
  
  if (!account_id || !to || !subject) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Verify account belongs to user
  const account = await db.get('SELECT * FROM email_accounts WHERE id = ? AND user_id = ?', [account_id, req.user.id]);
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }
  
  try {
    const result = await sendEmail(account_id, { to, cc, bcc, subject, text, html });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Link email to order (Send to ordre)
app.post('/api/email/link-to-order', auth, async (req, res) => {
  const { email_id, order_number } = req.body;
  
  if (!email_id || !order_number) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Verify email belongs to user's account
  const email = await db.get(`
    SELECT e.* FROM emails e
    JOIN email_accounts ea ON e.account_id = ea.id
    WHERE e.id = ? AND ea.user_id = ?
  `, [email_id, req.user.id]);
  
  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }
  
  // Find order
  const order = await db.get('SELECT id FROM quotes WHERE order_number = ? OR quote_number = ?', [order_number, order_number]);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  
  // Check if already linked
  const existing = await db.get('SELECT id FROM email_ordre_links WHERE email_id = ? AND order_id = ?', [email_id, order.id]);
  if (existing) {
    return res.status(400).json({ error: 'Email already linked to this order' });
  }
  
  // Create link
  const info = await db.run(`
    INSERT INTO email_ordre_links (email_id, order_id, linked_by)
    VALUES (?, ?, ?)
  `, [email_id, order.id, req.user.id]);
  
  // Log to order timeline
  await db.run(`
    INSERT INTO order_timeline (order_id, activity_type, description, user_id)
    VALUES (?, 'email_linked', ?, ?)
  `, [order.id, `Email linked: ${email.subject}`, req.user.id]);
  
  res.json({ success: true, link_id: info.lastInsertRowid });
});

// Get emails linked to an order
app.get('/api/orders/:orderId/emails', auth, async (req, res) => {
  const orderId = Number(req.params.orderId);
  
  const emails = await db.all(`
    SELECT e.*, eol.created_at as linked_at, u.name as linked_by_name
    FROM email_ordre_links eol
    JOIN emails e ON eol.email_id = e.id
    JOIN users u ON eol.linked_by = u.id
    WHERE eol.order_id = ?
    ORDER BY eol.created_at DESC
  `, [orderId]);
  
  res.json(emails);
});

// Toggle email starred
app.post('/api/email/emails/:id/star', auth, async (req, res) => {
  const emailId = Number(req.params.id);
  
  const email = await db.get(`
    SELECT e.*, ea.user_id
    FROM emails e
    JOIN email_accounts ea ON e.account_id = ea.id
    WHERE e.id = ?
  `, [emailId]);
  
  if (!email || email.user_id !== req.user.id) {
    return res.status(404).json({ error: 'Email not found' });
  }
  
  const newStarred = email.is_starred ? 0 : 1;
  await db.run('UPDATE emails SET is_starred = ? WHERE id = ?', [newStarred, emailId]);
  
  res.json({ success: true, is_starred: newStarred });
});
*/

// --- END OF DISABLED EMAIL ROUTES ---

// --- POSTGRESQL SETUP ENDPOINTS (Browser-friendly, no auth needed for initial setup) ---

// Setup PostgreSQL database tables (browser accessible)
app.get('/api/setup-database', async (req, res) => {
  // Only allow if DATABASE_URL is set (PostgreSQL mode)
  if (!process.env.DATABASE_URL) {
    return res.status(400).json({ 
      error: 'PostgreSQL not configured',
      message: 'DATABASE_URL environment variable not found. Add PostgreSQL to Railway first.'
    });
  }

  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    // Create all tables
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER REFERENCES users(id),
        recipient_id INTEGER REFERENCES users(id),
        text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS folders (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id INTEGER REFERENCES folders(id),
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    await pool.end();

    res.json({ 
      success: true, 
      message: '🎉 PostgreSQL database tables created successfully!',
      next_step: 'Now open: /api/create-first-admin?email=bjarke.sv@gmail.com&password=Olineersej123&name=Bjarke'
    });
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({ error: 'Setup failed: ' + error.message });
  }
});

// Create first admin user (browser accessible)
app.get('/api/create-first-admin', async (req, res) => {
  const { email, password, name } = req.query;
  
  if (!email || !password || !name) {
    return res.status(400).json({ 
      error: 'Missing parameters',
      usage: '/api/create-first-admin?email=your@email.com&password=yourpassword&name=YourName'
    });
  }

  try {
    // Check if using PostgreSQL
    if (process.env.DATABASE_URL) {
      const { Pool } = await import('pg');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      });

      // Check if user already exists
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
      if (existing.rows.length > 0) {
        await pool.end();
        return res.status(409).json({ error: 'User already exists' });
      }

      const password_hash = bcrypt.hashSync(password, 10);
      
      await pool.query(`
        INSERT INTO users (name, email, password_hash, is_admin)
        VALUES ($1, $2, $3, 1)
      `, [name, email.toLowerCase(), password_hash]);

      await pool.end();

      res.json({ 
        success: true, 
        message: '🎉 Admin user created successfully!',
        email: email,
        next_step: 'Go to https://flowfactory-frontend-20zs.onrender.com and login!'
      });
    } else {
      // SQLite mode (local development)
      const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
      if (exists) {
        return res.status(409).json({ error: 'User already exists' });
      }

      const password_hash = bcrypt.hashSync(password, 10);
      
      db.prepare('INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, 1)')
        .run(name, email.toLowerCase(), password_hash);

      res.json({ 
        success: true, 
        message: '🎉 Admin user created successfully!',
        email: email
      });
    }
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ error: 'Failed to create admin: ' + error.message });
  }
});

// Special endpoint: Approve first user without auth (for initial setup)
app.post('/api/admin/approve-first', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  
  // Find user in pending_users
  const pending = await db.get("SELECT * FROM pending_users WHERE email = ? AND status = 'pending'", [email.toLowerCase()]);
  
  if (pending) {
    // Create actual user from pending
    const info = await db.run(`
      INSERT INTO users (name, email, password_hash, position, department, phone, is_admin)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `, [pending.name, pending.email, pending.password_hash, pending.position, pending.department, pending.phone]);
    
    // Update pending status
    await db.run('UPDATE pending_users SET status = ? WHERE id = ?', ['approved', pending.id]);
    
    return res.json({ success: true, message: 'User approved and made admin!' });
  }
  
  // Or just approve existing user and make admin
  const user = await db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
  if (user) {
    await db.run('UPDATE users SET is_admin = 1 WHERE id = ?', [user.id]);
    return res.json({ success: true, message: 'User made admin!' });
  }
  
  res.status(404).json({ error: 'User not found' });
});

// DEBUG ENDPOINT: Check order_documents table
app.get('/api/debug/documents', async (req, res) => {
  try {
    const allDocs = await db.all('SELECT * FROM order_documents ORDER BY created_at DESC LIMIT 20');
    const count = await db.get('SELECT COUNT(*) as cnt FROM order_documents');
    
    res.json({
      total_documents: count.cnt,
      latest_20_documents: allDocs,
      message: 'This shows all documents in order_documents table'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fallback: serve index.html for any non-API route (so /dashboard etc. works)
app.get(/^\/(?!api|uploads|socket\.io).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// Initialize database and start server
async function startServer() {
  try {
    await initializeDatabase();
    httpServer.listen(PORT, () => {
      console.log(`🚀 SG Seest Gulvteknik backend kører på http://localhost:${PORT}`);
      console.log(`📊 Database: ${db._isProduction ? 'PostgreSQL (Supabase)' : 'SQLite (breeze.db)'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
