// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import nodemailer from 'nodemailer';
import { db } from './database-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*', methods: ['GET','POST','PUT','DELETE'] }
});

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

app.use(cors());
app.use(express.json());

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
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
// Database is now initialized in database-config.js to ensure consistent path

// users
db.prepare(`CREATE TABLE IF NOT EXISTS users (
  id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  position TEXT DEFAULT '',
  department TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  is_admin INTEGER DEFAULT 0,
  created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}
);`).run();

// invite codes
db.prepare(`CREATE TABLE IF NOT EXISTS invite_codes (
  id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
  code TEXT UNIQUE NOT NULL,
  created_by INTEGER NOT NULL,
  used_by INTEGER DEFAULT NULL,
  expires_at TEXT NOT NULL,
  created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(created_by) REFERENCES users(id),\n  FOREIGN KEY(used_by) REFERENCES users(id)'}
);`).run();

// pending registrations
db.prepare(`CREATE TABLE IF NOT EXISTS pending_users (
  id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  position TEXT DEFAULT '',
  department TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}
);`).run();

// posts (feed)
db.prepare(`CREATE TABLE IF NOT EXISTS posts (
  id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(user_id) REFERENCES users(id)'}
);`).run();

// reactions (like)
db.prepare(`CREATE TABLE IF NOT EXISTS reactions (
  id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  type TEXT DEFAULT 'like',
  created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"},
  UNIQUE(post_id, user_id)${db._isProduction ? '' : ',\n  FOREIGN KEY(post_id) REFERENCES posts(id),\n  FOREIGN KEY(user_id) REFERENCES users(id)'}
);`).run();

// messages (1:1)
db.prepare(`CREATE TABLE IF NOT EXISTS messages (
  id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
  sender_id INTEGER NOT NULL,
  recipient_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(sender_id) REFERENCES users(id),\n  FOREIGN KEY(recipient_id) REFERENCES users(id)'}
);`).run();

// --- Helpers ---
function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
}

function auth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// --- Routes ---
app.get('/', (req, res) => res.json({ ok: true, message: 'Breeze API kører!' }));

// Auth - Registration with invite code OR pending approval
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, inviteCode, position, department, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  
  // Check if email already exists
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  const pendingExists = db.prepare('SELECT id FROM pending_users WHERE email = ?').get(email.toLowerCase());
  if (exists || pendingExists) return res.status(409).json({ error: 'Email already in use' });
  
  const password_hash = bcrypt.hashSync(password, 10);
  
  // If invite code provided, validate and create user directly
  if (inviteCode) {
    const invite = db.prepare(`
      SELECT * FROM invite_codes 
      WHERE code = ? AND used_by IS NULL AND datetime(expires_at) > datetime('now')
    `).get(inviteCode);
    
    if (!invite) {
      return res.status(400).json({ error: 'Invalid or expired invite code' });
    }
    
    // Create user directly
    const info = db.prepare('INSERT INTO users (name, email, password_hash, position, department, phone) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, email.toLowerCase(), password_hash, position || '', department || '', phone || '');
    
    // Mark invite as used
    db.prepare('UPDATE invite_codes SET used_by = ? WHERE id = ?').run(info.lastInsertRowid, invite.id);
    
    const user = db.prepare('SELECT id, name, email, position, department, phone, avatar_url, is_admin FROM users WHERE id = ?')
      .get(info.lastInsertRowid);
    const token = signToken(user);
    return res.json({ user, token, message: 'Account created successfully!' });
  }
  
  // No invite code - create pending user for admin approval
  db.prepare('INSERT INTO pending_users (name, email, password_hash, position, department, phone) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name, email.toLowerCase(), password_hash, position || '', department || '', phone || '');
  
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
    
    const safeUser = { id: user.id, name: user.name, email: user.email, position: user.position, department: user.department, phone: user.phone, avatar_url: user.avatar_url, is_admin };
    res.json({ user: safeUser, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Users
app.get('/api/users/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, name, email, position, department, phone, avatar_url, is_admin, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

// Get user activity stats
app.get('/api/users/activity', auth, (req, res) => {
  const user = db.prepare('SELECT created_at FROM users WHERE id = ?').get(req.user.id);
  const messagesSent = db.prepare('SELECT COUNT(*) as cnt FROM messages WHERE sender_id = ?').get(req.user.id).cnt;
  const postsCreated = db.prepare('SELECT COUNT(*) as cnt FROM posts WHERE user_id = ?').get(req.user.id).cnt;
  
  res.json({
    member_since: user.created_at,
    messages_sent: messagesSent,
    posts_created: postsCreated
  });
});

app.put('/api/users/me', auth, (req, res) => {
  const { name, position, department, phone, avatar_url } = req.body;
  db.prepare(`UPDATE users SET
    name=COALESCE(?, name),
    position=COALESCE(?, position),
    department=COALESCE(?, department),
    phone=COALESCE(?, phone),
    avatar_url=COALESCE(?, avatar_url)
    WHERE id = ?`).run(name, position, department, phone, avatar_url, req.user.id);
  const user = db.prepare('SELECT id, name, email, position, department, phone, avatar_url FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

// Liste alle brugere (til medarbejder-panelet)
app.get('/api/users', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, email, position, department, phone, avatar_url, created_at
    FROM users
    ORDER BY name COLLATE NOCASE ASC
  `).all();
  res.json(rows);
});

// Feed
app.get('/api/posts', auth, (req, res) => {
  const posts = db.prepare(`
    SELECT p.id, p.content, p.created_at,
           u.id as user_id, u.name as user_name, u.avatar_url
    FROM posts p
    JOIN users u ON u.id = p.user_id
    ORDER BY p.id DESC
    LIMIT 100
  `).all();
  const likeCounts = db.prepare('SELECT post_id, COUNT(*) as likes FROM reactions GROUP BY post_id').all();
  const likeMap = Object.fromEntries(likeCounts.map(r => [r.post_id, r.likes]));
  res.json(posts.map(p => ({...p, likes: likeMap[p.id] || 0 })));
});

app.post('/api/posts', auth, (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Missing content' });
  const info = db.prepare('INSERT INTO posts (user_id, content) VALUES (?, ?)').run(req.user.id, content);
  const post = db.prepare(`
    SELECT p.id, p.content, p.created_at, u.id as user_id, u.name as user_name, u.avatar_url
    FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?
  `).get(info.lastInsertRowid);
  res.json(post);
  io.emit('feed:new_post', post);
});

app.post('/api/posts/:id/like', auth, (req, res) => {
  const postId = Number(req.params.id);
  try {
    db.prepare('INSERT OR IGNORE INTO reactions (post_id, user_id, type) VALUES (?, ?, ?)').run(postId, req.user.id, 'like');
    const likes = db.prepare('SELECT COUNT(*) as cnt FROM reactions WHERE post_id = ?').get(postId).cnt;
    io.emit('feed:like_updated', { postId, likes });
    res.json({ postId, likes });
  } catch {
    res.status(400).json({ error: 'Unable to like post' });
  }
});

// Delete post
app.delete('/api/posts/:id', auth, (req, res) => {
  const postId = Number(req.params.id);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
  
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  
  // Check if user owns the post
  if (post.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  
  // Delete post (reactions will be cascade deleted if foreign key constraints are set)
  db.prepare('DELETE FROM reactions WHERE post_id = ?').run(postId);
  db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
  
  res.json({ success: true });
});

// Messages (history)
app.get('/api/messages/:otherUserId', auth, (req, res) => {
  const otherId = Number(req.params.otherUserId);
  const rows = db.prepare(`
    SELECT * FROM messages
    WHERE (sender_id = ? AND recipient_id = ?)
       OR (sender_id = ? AND recipient_id = ?)
    ORDER BY id ASC
    LIMIT 500
  `).all(req.user.id, otherId, otherId, req.user.id);
  res.json(rows);
});

// --- File Upload & Management ---

// Create folders table
db.prepare(`CREATE TABLE IF NOT EXISTS folders (
  id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
  name TEXT NOT NULL,
  parent_id INTEGER DEFAULT NULL,
  created_by INTEGER NOT NULL,
  created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(parent_id) REFERENCES folders(id),\n  FOREIGN KEY(created_by) REFERENCES users(id)'}
);`).run();

// Create files table if not exists
db.prepare(`CREATE TABLE IF NOT EXISTS files (
  id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT,
  folder_id INTEGER DEFAULT NULL,
  uploaded_by INTEGER NOT NULL,
  created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(folder_id) REFERENCES folders(id),\n  FOREIGN KEY(uploaded_by) REFERENCES users(id)'}
);`).run();

// Track user activity
db.prepare(`CREATE TABLE IF NOT EXISTS user_activity (
  id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
  user_id INTEGER NOT NULL,
  last_login ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"},
  messages_sent INTEGER DEFAULT 0,
  posts_created INTEGER DEFAULT 0,
  files_uploaded INTEGER DEFAULT 0${db._isProduction ? '' : ',\n  FOREIGN KEY(user_id) REFERENCES users(id)'}
);`).run();

// Customers table
db.prepare(`CREATE TABLE IF NOT EXISTS customers (
  id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
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
  created_by INTEGER NOT NULL,
  created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(created_by) REFERENCES users(id)'}
);`).run();

// Quotes table (updated for order management with extra work support)
db.prepare(`CREATE TABLE IF NOT EXISTS quotes (
  id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
  order_number TEXT NOT NULL,
  parent_order_id INTEGER DEFAULT NULL,
  sub_number INTEGER DEFAULT NULL,
  is_extra_work INTEGER DEFAULT 0,
  customer_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  requisition_number TEXT,
  date ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"},
  valid_until TEXT,
  status TEXT DEFAULT 'draft',
  notes TEXT,
  terms TEXT,
  subtotal REAL DEFAULT 0,
  vat_rate REAL DEFAULT 25,
  vat_amount REAL DEFAULT 0,
  total REAL DEFAULT 0,
  created_by INTEGER NOT NULL,
  created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"},
  sent_at ${db._isProduction ? 'TIMESTAMP' : 'TEXT'},
  accepted_at ${db._isProduction ? 'TIMESTAMP' : 'TEXT'}${db._isProduction ? '' : ',\n  FOREIGN KEY(customer_id) REFERENCES customers(id),\n  FOREIGN KEY(created_by) REFERENCES users(id),\n  FOREIGN KEY(parent_order_id) REFERENCES quotes(id)'}
);`).run();

// Invoices table
db.prepare(`CREATE TABLE IF NOT EXISTS invoices (
  id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
  invoice_number TEXT UNIQUE NOT NULL,
  order_id INTEGER NOT NULL,
  full_order_number TEXT NOT NULL,
  invoice_date ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"},
  due_date TEXT,
  payment_terms TEXT DEFAULT 'Netto 14 dage',
  subtotal REAL DEFAULT 0,
  vat_rate REAL DEFAULT 25,
  vat_amount REAL DEFAULT 0,
  total REAL DEFAULT 0,
  notes TEXT,
  status TEXT DEFAULT 'draft',
  created_by INTEGER NOT NULL,
  created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"},
  sent_at ${db._isProduction ? 'TIMESTAMP' : 'TEXT'},
  paid_at ${db._isProduction ? 'TIMESTAMP' : 'TEXT'}${db._isProduction ? '' : ',\n  FOREIGN KEY(order_id) REFERENCES quotes(id),\n  FOREIGN KEY(created_by) REFERENCES users(id)'}
);`).run();

// Invoice lines table
db.prepare(`CREATE TABLE IF NOT EXISTS invoice_lines (
  id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
  invoice_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  unit_price REAL NOT NULL,
  discount_percent REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  line_total REAL NOT NULL,
  sort_order INTEGER DEFAULT 0${db._isProduction ? '' : ',\n  FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE'}
);`).run();

// Quote lines table
db.prepare(`CREATE TABLE IF NOT EXISTS quote_lines (
  id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
  quote_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  unit_price REAL NOT NULL,
  discount_percent REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  line_total REAL NOT NULL,
  sort_order INTEGER DEFAULT 0${db._isProduction ? '' : ',\n  FOREIGN KEY(quote_id) REFERENCES quotes(id) ON DELETE CASCADE'}
);`).run();

// Quote attachments table
db.prepare(`CREATE TABLE IF NOT EXISTS quote_attachments (
  id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
  quote_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_by INTEGER NOT NULL,
  created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(quote_id) REFERENCES quotes(id) ON DELETE CASCADE,\n  FOREIGN KEY(uploaded_by) REFERENCES users(id)'}
);`).run();

// Upload file endpoint (Server Storage)
app.post('/api/files/upload', auth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const folder_id = req.body.folder_id ? Number(req.body.folder_id) : null;

    const fileInfo = {
      filename: req.file.filename,
      original_name: req.file.originalname,
      file_path: `/uploads/${req.file.filename}`,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      folder_id: folder_id,
      uploaded_by: req.user.id
    };

    const info = db.prepare(`
      INSERT INTO files (filename, original_name, file_path, file_size, mime_type, folder_id, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      fileInfo.filename,
      fileInfo.original_name,
      fileInfo.file_path,
      fileInfo.file_size,
      fileInfo.mime_type,
      fileInfo.folder_id,
      fileInfo.uploaded_by
    );

    const file = db.prepare(`
      SELECT f.*, u.name as uploader_name
      FROM files f
      JOIN users u ON f.uploaded_by = u.id
      WHERE f.id = ?
    `).get(info.lastInsertRowid);

    res.json({ success: true, file });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// --- Folder Management ---

// Create folder
app.post('/api/folders', auth, (req, res) => {
  const { name, parent_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Folder name required' });
  
  const info = db.prepare(`
    INSERT INTO folders (name, parent_id, created_by)
    VALUES (?, ?, ?)
  `).run(name, parent_id || null, req.user.id);
  
  const folder = db.prepare(`
    SELECT f.*, u.name as creator_name
    FROM folders f
    JOIN users u ON f.created_by = u.id
    WHERE f.id = ?
  `).get(info.lastInsertRowid);
  
  res.json(folder);
});

// Get all folders
app.get('/api/folders', auth, (req, res) => {
  const folders = db.prepare(`
    SELECT f.*, u.name as creator_name
    FROM folders f
    JOIN users u ON f.created_by = u.id
    ORDER BY f.name COLLATE NOCASE ASC
  `).all();
  
  res.json(folders);
});

// Rename folder
app.put('/api/folders/:id', auth, (req, res) => {
  const folderId = Number(req.params.id);
  const { name } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Folder name required' });
  }
  
  const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(folderId);
  
  if (!folder) {
    return res.status(404).json({ error: 'Folder not found' });
  }
  
  // Check if user owns folder or is admin
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user.id);
  if (folder.created_by !== req.user.id && !user.is_admin) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  
  db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name.trim(), folderId);
  
  const updated = db.prepare(`
    SELECT f.*, u.name as creator_name
    FROM folders f
    JOIN users u ON f.created_by = u.id
    WHERE f.id = ?
  `).get(folderId);
  
  res.json(updated);
});

// Delete folder
app.delete('/api/folders/:id', auth, (req, res) => {
  const folderId = Number(req.params.id);
  const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(folderId);
  
  if (!folder) {
    return res.status(404).json({ error: 'Folder not found' });
  }
  
  // Check if user owns folder or is admin
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user.id);
  if (folder.created_by !== req.user.id && !user.is_admin) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  
  // Check if folder has files
  const fileCount = db.prepare('SELECT COUNT(*) as cnt FROM files WHERE folder_id = ?').get(folderId).cnt;
  if (fileCount > 0) {
    return res.status(400).json({ error: 'Folder contains files. Delete files first.' });
  }
  
  // Check if folder has subfolders
  const subfolderCount = db.prepare('SELECT COUNT(*) as cnt FROM folders WHERE parent_id = ?').get(folderId).cnt;
  if (subfolderCount > 0) {
    return res.status(400).json({ error: 'Folder contains subfolders. Delete subfolders first.' });
  }
  
  db.prepare('DELETE FROM folders WHERE id = ?').run(folderId);
  res.json({ success: true });
});

// Get all files (backwards compatible)
app.get('/api/files', auth, (req, res) => {
  const { folder_id } = req.query;
  
  let query = `
    SELECT f.*, u.name as uploader_name
    FROM files f
    JOIN users u ON f.uploaded_by = u.id
  `;
  
  // If folder_id is explicitly provided (including "root" or "all")
  if (folder_id && folder_id !== 'all' && folder_id !== 'root') {
    query += ` WHERE f.folder_id = ?`;
  } else if (folder_id === 'root') {
    query += ` WHERE f.folder_id IS NULL`;
  }
  // Otherwise return all files (backwards compatible)
  
  query += ` ORDER BY f.created_at DESC LIMIT 1000`;
  
  const files = (folder_id && folder_id !== 'all' && folder_id !== 'root')
    ? db.prepare(query).all(Number(folder_id))
    : db.prepare(query).all();
  
  res.json(files);
});

// Delete file (Server Storage)
app.delete('/api/files/:id', auth, (req, res) => {
  const fileId = Number(req.params.id);
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
  
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  // Check if user owns the file or is admin
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user.id);
  if (file.uploaded_by !== req.user.id && !user.is_admin) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  
  // Delete physical file
  const filePath = path.join(__dirname, 'uploads', file.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  
  // Delete from database
  db.prepare('DELETE FROM files WHERE id = ?').run(fileId);
  
  res.json({ success: true });
});

// Rename file
app.put('/api/files/:id/rename', auth, (req, res) => {
  const fileId = Number(req.params.id);
  const { new_name } = req.body;
  
  if (!new_name || !new_name.trim()) {
    return res.status(400).json({ error: 'New name required' });
  }
  
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
  
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  // Check if user owns file or is admin
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user.id);
  if (file.uploaded_by !== req.user.id && !user.is_admin) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  
  // Update file name
  db.prepare('UPDATE files SET original_name = ? WHERE id = ?').run(new_name.trim(), fileId);
  
  const updatedFile = db.prepare(`
    SELECT f.*, u.name as uploader_name
    FROM files f
    JOIN users u ON f.uploaded_by = u.id
    WHERE f.id = ?
  `).get(fileId);
  
  res.json(updatedFile);
});

// Download file (Server Storage)
app.get('/api/files/download/:id', auth, (req, res) => {
  const fileId = Number(req.params.id);
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
  
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  const filePath = path.join(__dirname, 'uploads', file.filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }
  
  res.download(filePath, file.original_name);
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
function adminAuth(req, res, next) {
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user.id);
  if (!user || !user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// --- Admin Routes ---

// Get pending user registrations
app.get('/api/admin/pending-users', auth, adminAuth, (req, res) => {
  const pending = db.prepare(`
    SELECT id, name, email, position, department, phone, created_at, status
    FROM pending_users
    WHERE status = 'pending'
    ORDER BY created_at DESC
  `).all();
  res.json(pending);
});

// Approve pending user
app.post('/api/admin/approve-user/:id', auth, adminAuth, (req, res) => {
  const pendingId = Number(req.params.id);
  const pending = db.prepare('SELECT * FROM pending_users WHERE id = ? AND status = \'pending\'').get(pendingId);
  
  if (!pending) {
    return res.status(404).json({ error: 'Pending user not found' });
  }
  
  // Create actual user
  const info = db.prepare(`
    INSERT INTO users (name, email, password_hash, position, department, phone)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(pending.name, pending.email, pending.password_hash, pending.position, pending.department, pending.phone);
  
  // Update pending status
  db.prepare('UPDATE pending_users SET status = ? WHERE id = ?').run('approved', pendingId);
  
  res.json({ success: true, userId: info.lastInsertRowid });
});

// Reject pending user
app.post('/api/admin/reject-user/:id', auth, adminAuth, (req, res) => {
  const pendingId = Number(req.params.id);
  db.prepare('UPDATE pending_users SET status = ? WHERE id = ?').run('rejected', pendingId);
  res.json({ success: true });
});

// Generate invite code
app.post('/api/admin/generate-invite', auth, adminAuth, (req, res) => {
  const { daysValid = 7 } = req.body;
  
  // Generate random code
  const code = Math.random().toString(36).substring(2, 10).toUpperCase() + 
               Math.random().toString(36).substring(2, 10).toUpperCase();
  
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + daysValid);
  
  const info = db.prepare(`
    INSERT INTO invite_codes (code, created_by, expires_at)
    VALUES (?, ?, datetime(?))
  `).run(code, req.user.id, expiresAt.toISOString());
  
  const invite = db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(info.lastInsertRowid);
  res.json(invite);
});

// List all invite codes
app.get('/api/admin/invite-codes', auth, adminAuth, (req, res) => {
  const codes = db.prepare(`
    SELECT ic.*, 
           u1.name as created_by_name,
           u2.name as used_by_name
    FROM invite_codes ic
    LEFT JOIN users u1 ON ic.created_by = u1.id
    LEFT JOIN users u2 ON ic.used_by = u2.id
    ORDER BY ic.created_at DESC
    LIMIT 100
  `).all();
  res.json(codes);
});

// Delete invite code
app.delete('/api/admin/invite-codes/:id', auth, adminAuth, (req, res) => {
  db.prepare('DELETE FROM invite_codes WHERE id = ?').run(Number(req.params.id));
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
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (exists) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }
    
    // Generate invite code
    const code = Math.random().toString(36).substring(2, 10).toUpperCase() + 
                 Math.random().toString(36).substring(2, 10).toUpperCase();
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days validity
    
    const info = db.prepare(`
      INSERT INTO invite_codes (code, created_by, expires_at)
      VALUES (?, ?, datetime(?))
    `).run(code, req.user.id, expiresAt.toISOString());
    
    // Create registration URL
    const registrationUrl = `https://flowfactory-denmark.netlify.app/register.html?code=${code}`;
    
    // Send email
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: 'Invitation til FlowFactory Portal',
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
              <p>Velkommen til FlowFactory Portal</p>
            </div>
            <div class="content">
              ${name ? `<p>Hej ${name},</p>` : '<p>Hej!</p>'}
              
              <p>Du er blevet inviteret til at oprette en konto på <strong>FlowFactory Portal</strong> - vores nye interne kommunikationsplatform.</p>
              
              <p><strong>Din invitation kode:</strong></p>
              <div class="code-box">${code}</div>
              
              <p>Koden er gyldig i 7 dage.</p>
              
              <center>
                <a href="${registrationUrl}" class="button">📝 Opret Konto Nu</a>
              </center>
              
              <p>Eller kopiér denne kode og brug den når du registrerer dig på portalen.</p>
              
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              
              <h3>💡 Hvad kan du med FlowFactory Portal?</h3>
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
              <p>© ${new Date().getFullYear()} FlowFactory - Alle rettigheder forbeholdes</p>
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
app.get('/api/admin/users', auth, adminAuth, (req, res) => {
  const users = db.prepare(`
    SELECT id, name, email, position, department, phone, is_admin, created_at
    FROM users
    ORDER BY created_at DESC
  `).all();
  res.json(users);
});

// Make user admin
app.post('/api/admin/make-admin/:id', auth, adminAuth, (req, res) => {
  db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

// Remove admin rights
app.post('/api/admin/remove-admin/:id', auth, adminAuth, (req, res) => {
  const userId = Number(req.params.id);
  
  // Don't allow removing own admin rights
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Cannot remove your own admin rights' });
  }
  
  db.prepare('UPDATE users SET is_admin = 0 WHERE id = ?').run(userId);
  res.json({ success: true });
});

// Delete user
app.delete('/api/admin/users/:id', auth, adminAuth, (req, res) => {
  const userId = Number(req.params.id);
  
  // Don't allow deleting yourself
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Delete user's data
  db.prepare('DELETE FROM messages WHERE sender_id = ? OR recipient_id = ?').run(userId, userId);
  db.prepare('DELETE FROM posts WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM reactions WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM files WHERE uploaded_by = ?').run(userId);
  db.prepare('DELETE FROM folders WHERE created_by = ?').run(userId);
  
  // Finally delete the user
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  
  res.json({ success: true, message: `User ${user.name} deleted` });
});

// --- Socket.IO: presence + 1:1 chat + WebRTC signaling ---
const onlineUsers = new Map(); // userId -> socketId
const activeVideoRooms = new Map(); // roomId -> Set of socketIds

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  
  socket.on('auth', (token) => {
    try {
      const u = jwt.verify(token, JWT_SECRET);
      socket.user = u;
      onlineUsers.set(u.id, socket.id);
      io.emit('presence:update', Array.from(onlineUsers.keys()));
      console.log('User authenticated:', u.name);
    } catch {
      socket.emit('error', 'bad token');
    }
  });

  socket.on('chat:send', ({ toUserId, text }) => {
    if (!socket.user) return;
    const info = db.prepare('INSERT INTO messages (sender_id, recipient_id, text) VALUES (?, ?, ?)')
      .run(socket.user.id, toUserId, String(text).slice(0, 2000));
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
    const targetSocketId = onlineUsers.get(toUserId);
    if (targetSocketId) io.to(targetSocketId).emit('chat:message', msg);
    socket.emit('chat:message', msg); // echo
  });

  // --- WebRTC Video Call Signaling ---
  socket.on('video:join-room', (roomId) => {
    console.log(`User ${socket.user?.name} joining video room: ${roomId}`);
    socket.join(roomId);
    
    if (!activeVideoRooms.has(roomId)) {
      activeVideoRooms.set(roomId, new Set());
    }
    activeVideoRooms.get(roomId).add(socket.id);
    
    // Notify other peers in room
    socket.to(roomId).emit('video:user-joined', {
      socketId: socket.id,
      userId: socket.user?.id,
      userName: socket.user?.name
    });
  });

  socket.on('video:offer', ({ roomId, offer, targetSocketId }) => {
    io.to(targetSocketId).emit('video:offer', {
      offer,
      senderSocketId: socket.id
    });
  });

  socket.on('video:answer', ({ answer, targetSocketId }) => {
    io.to(targetSocketId).emit('video:answer', {
      answer,
      senderSocketId: socket.id
    });
  });

  socket.on('video:ice-candidate', ({ candidate, targetSocketId }) => {
    io.to(targetSocketId).emit('video:ice-candidate', {
      candidate,
      senderSocketId: socket.id
    });
  });

  socket.on('video:leave-room', (roomId) => {
    socket.leave(roomId);
    if (activeVideoRooms.has(roomId)) {
      activeVideoRooms.get(roomId).delete(socket.id);
      if (activeVideoRooms.get(roomId).size === 0) {
        activeVideoRooms.delete(roomId);
      }
    }
    socket.to(roomId).emit('video:user-left', socket.id);
  });

  socket.on('disconnect', () => {
    if (socket.user) {
      onlineUsers.delete(socket.user.id);
      io.emit('presence:update', Array.from(onlineUsers.keys()));
      console.log('User disconnected:', socket.user.name);
    }
    
    // Clean up video rooms
    activeVideoRooms.forEach((sockets, roomId) => {
      if (sockets.has(socket.id)) {
        sockets.delete(socket.id);
        socket.to(roomId).emit('video:user-left', socket.id);
        if (sockets.size === 0) {
          activeVideoRooms.delete(roomId);
        }
      }
    });
  });
});

// --- QUOTES & CUSTOMERS API ---

// Helper function to generate order number for main orders
function generateOrderNumber() {
  const lastQuote = db.prepare(`
    SELECT order_number FROM quotes 
    WHERE parent_order_id IS NULL 
    ORDER BY id DESC LIMIT 1
  `).get();
  
  let nextNum = 1;
  if (lastQuote) {
    nextNum = parseInt(lastQuote.order_number) + 1;
  }
  
  return String(nextNum).padStart(4, '0'); // 0001, 0002, 0003...
}

// Helper function to generate extra work number (sub-order)
function generateExtraWorkNumber(parentOrderId) {
  const parent = db.prepare('SELECT order_number FROM quotes WHERE id = ?').get(parentOrderId);
  
  if (!parent) {
    throw new Error('Parent order not found');
  }
  
  const lastSub = db.prepare(`
    SELECT sub_number FROM quotes 
    WHERE parent_order_id = ? 
    ORDER BY sub_number DESC LIMIT 1
  `).get(parentOrderId);
  
  const subNum = lastSub ? lastSub.sub_number + 1 : 1;
  const subStr = String(subNum).padStart(2, '0');
  
  return `${parent.order_number}-${subStr}`; // 0001-01, 0001-02...
}

// Helper function to generate invoice number
function generateInvoiceNumber() {
  const lastInvoice = db.prepare('SELECT invoice_number FROM invoices ORDER BY id DESC LIMIT 1').get();
  
  let nextNum = 5000; // Start from 5000
  if (lastInvoice) {
    nextNum = parseInt(lastInvoice.invoice_number) + 1;
  }
  
  return String(nextNum); // 5000, 5001, 5002...
}

// Helper function to get full order number (for display)
function getFullOrderNumber(quote) {
  if (quote.is_extra_work && quote.parent_order_id) {
    const parent = db.prepare('SELECT order_number FROM quotes WHERE id = ?').get(quote.parent_order_id);
    const subStr = String(quote.sub_number).padStart(2, '0');
    return `${parent.order_number}-${subStr}`;
  }
  return quote.order_number;
}

// Customers endpoints
app.get('/api/customers', auth, (req, res) => {
  const customers = db.prepare(`
    SELECT c.*, u.name as created_by_name
    FROM customers c
    JOIN users u ON c.created_by = u.id
    ORDER BY c.company_name COLLATE NOCASE ASC
  `).all();
  res.json(customers);
});

app.get('/api/customers/:id', auth, (req, res) => {
  const customer = db.prepare(`
    SELECT c.*, u.name as created_by_name
    FROM customers c
    JOIN users u ON c.created_by = u.id
    WHERE c.id = ?
  `).get(Number(req.params.id));
  
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  res.json(customer);
});

app.post('/api/customers', auth, (req, res) => {
  const { customer_number, company_name, contact_person, att_person, email, phone, address, postal_code, city, cvr_number } = req.body;
  
  if (!company_name) {
    return res.status(400).json({ error: 'Company name required' });
  }
  
  // Auto-generate customer number if not provided
  let finalCustomerNumber = customer_number;
  if (!finalCustomerNumber || !finalCustomerNumber.trim()) {
    const lastCustomer = db.prepare('SELECT customer_number FROM customers WHERE customer_number IS NOT NULL ORDER BY id DESC LIMIT 1').get();
    
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
  
  const info = db.prepare(`
    INSERT INTO customers (customer_number, company_name, contact_person, att_person, email, phone, address, postal_code, city, cvr_number, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(finalCustomerNumber, company_name, contact_person || null, att_person || null, email || null, phone || null, address || null, postal_code || null, city || null, cvr_number || null, req.user.id);
  
  const customer = db.prepare(`
    SELECT c.*, u.name as created_by_name
    FROM customers c
    JOIN users u ON c.created_by = u.id
    WHERE c.id = ?
  `).get(info.lastInsertRowid);
  
  res.json(customer);
});

app.put('/api/customers/:id', auth, (req, res) => {
  const customerId = Number(req.params.id);
  const { customer_number, company_name, contact_person, att_person, email, phone, address, postal_code, city, cvr_number } = req.body;
  
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  
  db.prepare(`
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
  `).run(customer_number || customer.customer_number, company_name, contact_person || null, att_person || null, email || null, phone || null, address || null, postal_code || null, city || null, cvr_number || null, customerId);
  
  const updated = db.prepare(`
    SELECT c.*, u.name as created_by_name
    FROM customers c
    JOIN users u ON c.created_by = u.id
    WHERE c.id = ?
  `).get(customerId);
  
  res.json(updated);
});

app.delete('/api/customers/:id', auth, (req, res) => {
  const customerId = Number(req.params.id);
  
  // Check if customer has quotes
  const quoteCount = db.prepare('SELECT COUNT(*) as cnt FROM quotes WHERE customer_id = ?').get(customerId).cnt;
  if (quoteCount > 0) {
    return res.status(400).json({ error: 'Cannot delete customer with existing quotes' });
  }
  
  db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);
  res.json({ success: true });
});

// --- CUSTOMER CONTACTS API ---

// Get all contacts for a customer
app.get('/api/customers/:customerId/contacts', auth, (req, res) => {
  const customerId = Number(req.params.customerId);
  
  const contacts = db.prepare(`
    SELECT * FROM customer_contacts
    WHERE customer_id = ?
    ORDER BY is_primary DESC, name COLLATE NOCASE ASC
  `).all(customerId);
  
  res.json(contacts);
});

// Create a new contact
app.post('/api/customers/:customerId/contacts', auth, (req, res) => {
  const customerId = Number(req.params.customerId);
  const { name, title, email, phone, is_primary } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  
  // If this is marked as primary, unmark other primaries
  if (is_primary) {
    db.prepare('UPDATE customer_contacts SET is_primary = 0 WHERE customer_id = ?').run(customerId);
  }
  
  const info = db.prepare(`
    INSERT INTO customer_contacts (customer_id, name, title, email, phone, is_primary)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(customerId, name.trim(), title || null, email || null, phone || null, is_primary ? 1 : 0);
  
  const contact = db.prepare('SELECT * FROM customer_contacts WHERE id = ?').get(info.lastInsertRowid);
  res.json(contact);
});

// Update a contact
app.put('/api/customers/:customerId/contacts/:contactId', auth, (req, res) => {
  const customerId = Number(req.params.customerId);
  const contactId = Number(req.params.contactId);
  const { name, title, email, phone, is_primary } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  
  // If this is marked as primary, unmark other primaries
  if (is_primary) {
    db.prepare('UPDATE customer_contacts SET is_primary = 0 WHERE customer_id = ? AND id != ?').run(customerId, contactId);
  }
  
  db.prepare(`
    UPDATE customer_contacts SET
      name = ?,
      title = ?,
      email = ?,
      phone = ?,
      is_primary = ?
    WHERE id = ? AND customer_id = ?
  `).run(name.trim(), title || null, email || null, phone || null, is_primary ? 1 : 0, contactId, customerId);
  
  const contact = db.prepare('SELECT * FROM customer_contacts WHERE id = ?').get(contactId);
  res.json(contact);
});

// Delete a contact
app.delete('/api/customers/:customerId/contacts/:contactId', auth, (req, res) => {
  const contactId = Number(req.params.contactId);
  db.prepare('DELETE FROM customer_contacts WHERE id = ?').run(contactId);
  res.json({ success: true });
});

// --- CUSTOMER CONTACTS API ---

// Get all contacts for a customer
app.get('/api/customers/:customerId/contacts', auth, (req, res) => {
  const customerId = Number(req.params.customerId);
  
  const contacts = db.prepare(`
    SELECT * FROM customer_contacts
    WHERE customer_id = ?
    ORDER BY is_primary DESC, name COLLATE NOCASE ASC
  `).all(customerId);
  
  res.json(contacts);
});

// Create a new contact
app.post('/api/customers/:customerId/contacts', auth, (req, res) => {
  const customerId = Number(req.params.customerId);
  const { name, title, email, phone, is_primary } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  
  // If this is marked as primary, unmark other primaries
  if (is_primary) {
    db.prepare('UPDATE customer_contacts SET is_primary = 0 WHERE customer_id = ?').run(customerId);
  }
  
  const info = db.prepare(`
    INSERT INTO customer_contacts (customer_id, name, title, email, phone, is_primary)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(customerId, name.trim(), title || null, email || null, phone || null, is_primary ? 1 : 0);
  
  const contact = db.prepare('SELECT * FROM customer_contacts WHERE id = ?').get(info.lastInsertRowid);
  res.json(contact);
});

// Update a contact
app.put('/api/customers/:customerId/contacts/:contactId', auth, (req, res) => {
  const customerId = Number(req.params.customerId);
  const contactId = Number(req.params.contactId);
  const { name, title, email, phone, is_primary } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  
  // If this is marked as primary, unmark other primaries
  if (is_primary) {
    db.prepare('UPDATE customer_contacts SET is_primary = 0 WHERE customer_id = ? AND id != ?').run(customerId, contactId);
  }
  
  db.prepare(`
    UPDATE customer_contacts SET
      name = ?,
      title = ?,
      email = ?,
      phone = ?,
      is_primary = ?
    WHERE id = ? AND customer_id = ?
  `).run(name.trim(), title || null, email || null, phone || null, is_primary ? 1 : 0, contactId, customerId);
  
  const contact = db.prepare('SELECT * FROM customer_contacts WHERE id = ?').get(contactId);
  res.json(contact);
});

// Delete a contact
app.delete('/api/customers/:customerId/contacts/:contactId', auth, (req, res) => {
  const contactId = Number(req.params.contactId);
  db.prepare('DELETE FROM customer_contacts WHERE id = ?').run(contactId);
  res.json({ success: true });
});

// Quotes endpoints
app.get('/api/quotes', auth, (req, res) => {
  const quotes = db.prepare(`
    SELECT q.*, c.company_name as customer_name, u.name as created_by_name
    FROM quotes q
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON q.created_by = u.id
    ORDER BY q.id DESC
  `).all();
  
  // For each main order (not extra work), calculate aggregated stats
  const enrichedQuotes = quotes.map(quote => {
    // If this is extra work, return as-is (it's already aggregated in its parent)
    if (quote.is_extra_work || quote.parent_order_id) {
      return quote;
    }
    
    // Get all extra work orders for this main order
    const extraWorkOrders = db.prepare(`
      SELECT * FROM quotes WHERE parent_order_id = ?
    `).all(quote.id);
    
    // Calculate main order revenue
    const revenue_main = quote.total || 0;
    
    // Calculate extra work revenue
    const revenue_extra = extraWorkOrders.reduce((sum, eo) => sum + (eo.total || 0), 0);
    
    // Calculate total revenue
    const revenue = revenue_main + revenue_extra;
    
    // Get main order expenses
    const mainExpenses = db.prepare(`
      SELECT SUM(amount) as total FROM order_expenses WHERE order_id = ?
    `).get(quote.id);
    const expenses_main = mainExpenses?.total || 0;
    
    // Get extra work expenses
    let expenses_extra = 0;
    extraWorkOrders.forEach(eo => {
      const extraExpenses = db.prepare(`
        SELECT SUM(amount) as total FROM order_expenses WHERE order_id = ?
      `).get(eo.id);
      expenses_extra += (extraExpenses?.total || 0);
    });
    
    // Calculate total expenses
    const expenses = expenses_main + expenses_extra;
    
    // Calculate profit
    const profit_main = revenue_main - expenses_main;
    const profit_extra = revenue_extra - expenses_extra;
    const profit = revenue - expenses;
    
    // Return quote with aggregated stats
    return {
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
    };
  });
  
  res.json(enrichedQuotes);
});

app.get('/api/quotes/:id', auth, (req, res) => {
  const quoteId = Number(req.params.id);
  
  const quote = db.prepare(`
    SELECT q.*, c.*, u.name as created_by_name,
           c.company_name, c.contact_person, c.email as customer_email, 
           c.phone as customer_phone, c.address, c.postal_code, c.city, c.cvr_number
    FROM quotes q
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON q.created_by = u.id
    WHERE q.id = ?
  `).get(quoteId);
  
  if (!quote) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  
  // If contact_person_id is set, get contact person details
  if (quote.contact_person_id) {
    const contactPerson = db.prepare('SELECT * FROM customer_contacts WHERE id = ?').get(quote.contact_person_id);
    if (contactPerson) {
      quote.selected_contact = contactPerson;
      // Override default contact person with selected one
      quote.contact_person_name = contactPerson.name;
      quote.contact_person_title = contactPerson.title;
      quote.contact_person_email = contactPerson.email;
      quote.contact_person_phone = contactPerson.phone;
    }
  }
  
  const lines = db.prepare('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY sort_order, id').all(quoteId);
  const attachments = db.prepare(`
    SELECT qa.*, u.name as uploaded_by_name
    FROM quote_attachments qa
    JOIN users u ON qa.uploaded_by = u.id
    WHERE qa.quote_id = ?
  `).all(quoteId);
  
  quote.lines = lines;
  quote.attachments = attachments;
  
  res.json(quote);
});

app.post('/api/quotes', auth, (req, res) => {
  try {
    const { customer_id, title, valid_until, notes, terms, lines, requisition_number, contact_person_id } = req.body;
    
    if (!customer_id || !title || !lines || lines.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const order_number = generateOrderNumber(); // 0001, 0002...
  
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
  const quoteInfo = db.prepare(`
    INSERT INTO quotes (quote_number, order_number, parent_order_id, sub_number, is_extra_work, customer_id, contact_person_id, title, requisition_number, valid_until, notes, terms, subtotal, vat_rate, vat_amount, total, created_by)
    VALUES (?, ?, NULL, NULL, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(order_number, order_number, customer_id, contact_person_id || null, title, requisition_number || null, valid_until || null, notes || null, terms || null, subtotal, vat_rate, vat_amount, total, req.user.id);
  
  const quoteId = quoteInfo.lastInsertRowid;
  
  // Create lines
  lines.forEach((line, index) => {
    const discount_amount = (line.unit_price * line.quantity * (line.discount_percent || 0)) / 100;
    const line_total = (line.unit_price * line.quantity) - discount_amount;
    
    db.prepare(`
      INSERT INTO quote_lines (quote_id, description, quantity, unit, unit_price, discount_percent, discount_amount, line_total, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(quoteId, line.description, line.quantity, line.unit, line.unit_price, line.discount_percent || 0, discount_amount, line_total, index);
  });
  
  const quote = db.prepare(`
    SELECT q.*, c.company_name as customer_name, u.name as created_by_name
    FROM quotes q
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON q.created_by = u.id
    WHERE q.id = ?
  `).get(quoteId);
  
    // Add full_order_number for display
    quote.full_order_number = getFullOrderNumber(quote);
    
    res.json(quote);
  } catch (error) {
    console.error('Create quote error:', error);
    res.status(500).json({ error: 'Failed to create quote: ' + error.message });
  }
});

app.put('/api/quotes/:id', auth, (req, res) => {
  const quoteId = Number(req.params.id);
  const { customer_id, title, valid_until, notes, terms, lines, status, contact_person_id } = req.body;
  
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId);
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
  db.prepare(`
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
  `).run(customer_id, contact_person_id !== undefined ? contact_person_id : quote.contact_person_id, title, valid_until || null, notes || null, terms || null, subtotal, vat_amount, total, status || quote.status, quoteId);
  
  // Update lines if provided
  if (lines) {
    // Delete old lines
    db.prepare('DELETE FROM quote_lines WHERE quote_id = ?').run(quoteId);
    
    // Create new lines
    lines.forEach((line, index) => {
      const discount_amount = (line.unit_price * line.quantity * (line.discount_percent || 0)) / 100;
      const line_total = (line.unit_price * line.quantity) - discount_amount;
      
      db.prepare(`
        INSERT INTO quote_lines (quote_id, description, quantity, unit, unit_price, discount_percent, discount_amount, line_total, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(quoteId, line.description, line.quantity, line.unit, line.unit_price, line.discount_percent || 0, discount_amount, line_total, index);
    });
  }
  
  const updated = db.prepare(`
    SELECT q.*, c.company_name as customer_name, u.name as created_by_name
    FROM quotes q
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON q.created_by = u.id
    WHERE q.id = ?
  `).get(quoteId);
  
  res.json(updated);
});

app.delete('/api/quotes/:id', auth, (req, res) => {
  const quoteId = Number(req.params.id);
  
  // Delete quote (cascades to lines and attachments)
  db.prepare('DELETE FROM quotes WHERE id = ?').run(quoteId);
  
  res.json({ success: true });
});

// Quote attachment upload
app.post('/api/quotes/:id/attachments', auth, upload.single('file'), (req, res) => {
  const quoteId = Number(req.params.id);
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const info = db.prepare(`
    INSERT INTO quote_attachments (quote_id, filename, original_name, file_path, file_size, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(quoteId, req.file.filename, req.file.originalname, `/uploads/${req.file.filename}`, req.file.size, req.user.id);
  
  const attachment = db.prepare(`
    SELECT qa.*, u.name as uploaded_by_name
    FROM quote_attachments qa
    JOIN users u ON qa.uploaded_by = u.id
    WHERE qa.id = ?
  `).get(info.lastInsertRowid);
  
  res.json(attachment);
});

// Delete quote attachment
app.delete('/api/quotes/:quoteId/attachments/:attachmentId', auth, (req, res) => {
  const attachmentId = Number(req.params.attachmentId);
  
  const attachment = db.prepare('SELECT * FROM quote_attachments WHERE id = ?').get(attachmentId);
  if (!attachment) {
    return res.status(404).json({ error: 'Attachment not found' });
  }
  
  // Delete physical file
  const filePath = path.join(__dirname, 'uploads', attachment.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  
  db.prepare('DELETE FROM quote_attachments WHERE id = ?').run(attachmentId);
  res.json({ success: true });
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
    db.prepare('UPDATE quotes SET status = ?, sent_at = datetime(\'now\') WHERE id = ?').run('sent', quoteId);
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: quote.customer_email,
      subject: `Tilbud ${quote.order_number} - ${quote.title}`,
      html: `
        <p>Kære ${quote.contact_person || quote.company_name},</p>
        <p>Vedhæftet finder du vores tilbud på <strong>${quote.title}</strong>.</p>
        <p>Tilbuddet er gyldigt til ${quote.valid_until ? new Date(quote.valid_until).toLocaleDateString('da-DK') : 'videre varsel'}.</p>
        <p>Hvis du har spørgsmål, er du velkommen til at kontakte os.</p>
        <p>Med venlig hilsen,<br>${quote.created_by_name}<br>FlowFactory ApS</p>
      `
    };
    
    await emailTransporter.sendMail(mailOptions);
    
    res.json({ success: true, message: 'Quote sent successfully' });
  } catch (error) {
    console.error('Email send error:', error);
    res.status(500).json({ error: 'Failed to send quote: ' + error.message });
  }
});

// Accept quote (convert to order)
app.post('/api/quotes/:id/accept', auth, (req, res) => {
  const quoteId = Number(req.params.id);
  
  // Set status to 'accepted' and set accepted_at timestamp
  // This allows the order to appear in Orders tab
  // Status should ONLY be 'sent' if email was actually sent via /send endpoint
  db.prepare('UPDATE quotes SET status = ?, accepted_at = datetime(\'now\') WHERE id = ?').run('accepted', quoteId);
  
  const quote = db.prepare(`
    SELECT q.*, c.company_name as customer_name, u.name as created_by_name
    FROM quotes q
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON q.created_by = u.id
    WHERE q.id = ?
  `).get(quoteId);
  
  quote.full_order_number = getFullOrderNumber(quote);
  
  res.json(quote);
});

// Reject quote
app.post('/api/quotes/:id/reject', auth, (req, res) => {
  const quoteId = Number(req.params.id);
  
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId);
  if (!quote) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  
  db.prepare('UPDATE quotes SET status = ? WHERE id = ?').run('rejected', quoteId);
  
  const updated = db.prepare(`
    SELECT q.*, c.company_name as customer_name, u.name as created_by_name
    FROM quotes q
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON q.created_by = u.id
    WHERE q.id = ?
  `).get(quoteId);
  
  res.json(updated);
});

// Revert order/rejected quote back to quote status
app.post('/api/quotes/:id/revert', auth, (req, res) => {
  const quoteId = Number(req.params.id);
  
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId);
  if (!quote) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  
  // Allow reverting both 'accepted' orders and 'rejected' quotes
  if (quote.status !== 'accepted' && quote.status !== 'rejected') {
    return res.status(400).json({ error: 'Can only revert accepted orders or rejected quotes' });
  }
  
  // Only check for invoices if it's an accepted order
  if (quote.status === 'accepted') {
    const hasInvoice = db.prepare('SELECT COUNT(*) as cnt FROM invoices WHERE order_id = ?').get(quoteId).cnt;
    if (hasInvoice > 0) {
      return res.status(400).json({ error: 'Cannot revert order that has been invoiced. Delete invoice first.' });
    }
  }
  
  // Revert to 'draft' status (clear both sent_at and accepted_at timestamps)
  db.prepare('UPDATE quotes SET status = ?, sent_at = NULL, accepted_at = NULL WHERE id = ?').run('draft', quoteId);
  
  const updated = db.prepare(`
    SELECT q.*, c.company_name as customer_name, u.name as created_by_name
    FROM quotes q
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON q.created_by = u.id
    WHERE q.id = ?
  `).get(quoteId);
  
  res.json(updated);
});

// Create extra work on existing order
app.post('/api/quotes/:id/extra-work', auth, (req, res) => {
  const parentOrderId = Number(req.params.id);
  const { title, notes, terms, lines } = req.body;
  
  if (!title || !lines || lines.length === 0) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const parentOrder = db.prepare('SELECT * FROM quotes WHERE id = ?').get(parentOrderId);
  if (!parentOrder) {
    return res.status(404).json({ error: 'Parent order not found' });
  }
  
  // Generate extra work number
  const lastSub = db.prepare(`
    SELECT sub_number FROM quotes 
    WHERE parent_order_id = ? 
    ORDER BY sub_number DESC LIMIT 1
  `).get(parentOrderId);
  
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
  
  const info = db.prepare(`
    INSERT INTO quotes (quote_number, order_number, parent_order_id, sub_number, is_extra_work, customer_id, title, notes, terms, subtotal, vat_rate, vat_amount, total, status, created_by)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?)
  `).run(fullOrderNumber, parentOrder.order_number, parentOrderId, subNum, parentOrder.customer_id, title, notes || null, terms || parentOrder.terms, subtotal, vat_rate, vat_amount, total, req.user.id);
  
  const extraWorkId = info.lastInsertRowid;
  
  // Create lines
  lines.forEach((line, index) => {
    const discount_amount = (line.unit_price * line.quantity * (line.discount_percent || 0)) / 100;
    const line_total = (line.unit_price * line.quantity) - discount_amount;
    
    db.prepare(`
      INSERT INTO quote_lines (quote_id, description, quantity, unit, unit_price, discount_percent, discount_amount, line_total, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(extraWorkId, line.description, line.quantity, line.unit, line.unit_price, line.discount_percent || 0, discount_amount, line_total, index);
  });
  
  const extraWork = db.prepare(`
    SELECT q.*, c.company_name as customer_name, u.name as created_by_name
    FROM quotes q
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON q.created_by = u.id
    WHERE q.id = ?
  `).get(extraWorkId);
  
  extraWork.full_order_number = getFullOrderNumber(extraWork);
  
  res.json(extraWork);
});

// --- INVOICES API ---

// Get all invoices
app.get('/api/invoices', auth, (req, res) => {
  const invoices = db.prepare(`
    SELECT i.*, q.order_number, q.title as order_title, 
           c.company_name as customer_name, u.name as created_by_name
    FROM invoices i
    JOIN quotes q ON i.order_id = q.id
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON i.created_by = u.id
    ORDER BY i.id DESC
  `).all();
  res.json(invoices);
});

// Get single invoice with details
app.get('/api/invoices/:id', auth, (req, res) => {
  const invoiceId = Number(req.params.id);
  
  const invoice = db.prepare(`
    SELECT i.*, q.*, c.*, u.name as created_by_name,
           c.company_name, c.contact_person, c.email as customer_email, 
           c.phone as customer_phone, c.address, c.postal_code, c.city, c.cvr_number,
           q.title as order_title
    FROM invoices i
    JOIN quotes q ON i.order_id = q.id
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON i.created_by = u.id
    WHERE i.id = ?
  `).get(invoiceId);
  
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found' });
  }
  
  const lines = db.prepare('SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY sort_order, id').all(invoiceId);
  invoice.lines = lines;
  
  res.json(invoice);
});

// Create invoice from order
app.post('/api/invoices/from-order/:orderId', auth, (req, res) => {
  const orderId = Number(req.params.orderId);
  const { due_date, payment_terms, notes } = req.body;
  
  const order = db.prepare('SELECT * FROM quotes WHERE id = ?').get(orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  
  if (order.status !== 'accepted') {
    return res.status(400).json({ error: 'Order must be accepted before creating invoice' });
  }
  
  // Check if order already has an invoice (prevent duplicates)
  const existingInvoice = db.prepare('SELECT invoice_number FROM invoices WHERE order_id = ?').get(orderId);
  if (existingInvoice) {
    return res.status(400).json({ 
      error: `Order already has invoice ${existingInvoice.invoice_number}. Delete the existing invoice first if you need to create a new one.` 
    });
  }
  
  const invoice_number = generateInvoiceNumber();
  const full_order_number = getFullOrderNumber(order);
  
  // Calculate due date (14 days from now if not provided)
  let finalDueDate = due_date;
  if (!finalDueDate) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);
    finalDueDate = dueDate.toISOString().split('T')[0];
  }
  
  // Create invoice
  const info = db.prepare(`
    INSERT INTO invoices (invoice_number, order_id, full_order_number, due_date, payment_terms, subtotal, vat_rate, vat_amount, total, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(invoice_number, orderId, full_order_number, finalDueDate, payment_terms || 'Netto 14 dage', order.subtotal, order.vat_rate, order.vat_amount, order.total, notes || null, req.user.id);
  
  const invoiceId = info.lastInsertRowid;
  
  // Copy lines from order
  const orderLines = db.prepare('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY sort_order, id').all(orderId);
  orderLines.forEach(line => {
    db.prepare(`
      INSERT INTO invoice_lines (invoice_id, description, quantity, unit, unit_price, discount_percent, discount_amount, line_total, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(invoiceId, line.description, line.quantity, line.unit, line.unit_price, line.discount_percent, line.discount_amount, line.line_total, line.sort_order);
  });
  
  const invoice = db.prepare(`
    SELECT i.*, q.order_number, q.title as order_title, 
           c.company_name as customer_name, u.name as created_by_name
    FROM invoices i
    JOIN quotes q ON i.order_id = q.id
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON i.created_by = u.id
    WHERE i.id = ?
  `).get(invoiceId);
  
  res.json(invoice);
});

// Update invoice
app.put('/api/invoices/:id', auth, (req, res) => {
  const invoiceId = Number(req.params.id);
  const { due_date, payment_terms, notes, status, lines } = req.body;
  
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
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
  db.prepare(`
    UPDATE invoices SET
      due_date = ?,
      payment_terms = ?,
      notes = ?,
      status = ?,
      subtotal = ?,
      vat_amount = ?,
      total = ?
    WHERE id = ?
  `).run(due_date || invoice.due_date, payment_terms || invoice.payment_terms, notes !== undefined ? notes : invoice.notes, status || invoice.status, subtotal, vat_amount, total, invoiceId);
  
  // Update lines if provided
  if (lines) {
    db.prepare('DELETE FROM invoice_lines WHERE invoice_id = ?').run(invoiceId);
    
    lines.forEach((line, index) => {
      const discount_amount = (line.unit_price * line.quantity * (line.discount_percent || 0)) / 100;
      const line_total = (line.unit_price * line.quantity) - discount_amount;
      
      db.prepare(`
        INSERT INTO invoice_lines (invoice_id, description, quantity, unit, unit_price, discount_percent, discount_amount, line_total, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(invoiceId, line.description, line.quantity, line.unit, line.unit_price, line.discount_percent || 0, discount_amount, line_total, index);
    });
  }
  
  const updated = db.prepare(`
    SELECT i.*, q.order_number, q.title as order_title, 
           c.company_name as customer_name, u.name as created_by_name
    FROM invoices i
    JOIN quotes q ON i.order_id = q.id
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON i.created_by = u.id
    WHERE i.id = ?
  `).get(invoiceId);
  
  res.json(updated);
});

// Delete invoice
app.delete('/api/invoices/:id', auth, (req, res) => {
  const invoiceId = Number(req.params.id);
  db.prepare('DELETE FROM invoices WHERE id = ?').run(invoiceId);
  res.json({ success: true });
});

// Send invoice via email
app.post('/api/invoices/:id/send', auth, async (req, res) => {
  const invoiceId = Number(req.params.id);
  
  const invoice = db.prepare(`
    SELECT i.*, q.*, c.*, u.name as created_by_name,
           c.company_name, c.contact_person, c.email as customer_email,
           q.title as order_title
    FROM invoices i
    JOIN quotes q ON i.order_id = q.id
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON i.created_by = u.id
    WHERE i.id = ?
  `).get(invoiceId);
  
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
    db.prepare('UPDATE invoices SET status = ?, sent_at = datetime(\'now\') WHERE id = ?').run('sent', invoiceId);
    
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
        <p>Med venlig hilsen,<br>${invoice.created_by_name}<br>FlowFactory ApS</p>
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

// Create expenses table
db.prepare(`CREATE TABLE IF NOT EXISTS order_expenses (
  id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
  order_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  expense_date ${db._isProduction ? 'DATE DEFAULT CURRENT_DATE' : "TEXT DEFAULT (date('now'))"},
  category TEXT,
  receipt_file TEXT,
  created_by INTEGER NOT NULL,
  created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(order_id) REFERENCES quotes(id) ON DELETE CASCADE,\n  FOREIGN KEY(created_by) REFERENCES users(id)'}
);`).run();

// Create order documents table (separate from quote_attachments for workspace)
db.prepare(`CREATE TABLE IF NOT EXISTS order_documents (
  id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
  order_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  document_type TEXT,
  uploaded_by INTEGER NOT NULL,
  created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(order_id) REFERENCES quotes(id) ON DELETE CASCADE,\n  FOREIGN KEY(uploaded_by) REFERENCES users(id)'}
);`).run();

// Create order timeline/activity log
db.prepare(`CREATE TABLE IF NOT EXISTS order_timeline (
  id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
  order_id INTEGER NOT NULL,
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(order_id) REFERENCES quotes(id) ON DELETE CASCADE,\n  FOREIGN KEY(user_id) REFERENCES users(id)'}
);`).run();

// Create order notes
db.prepare(`CREATE TABLE IF NOT EXISTS order_notes (
  id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
  order_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  is_pinned INTEGER DEFAULT 0,
  created_by INTEGER NOT NULL,
  created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"},
  updated_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(order_id) REFERENCES quotes(id) ON DELETE CASCADE,\n  FOREIGN KEY(created_by) REFERENCES users(id)'}
);`).run();

// --- EXPENSES ENDPOINTS ---

// Get all expenses for an order
app.get('/api/orders/:orderId/expenses', auth, (req, res) => {
  const orderId = Number(req.params.orderId);
  
  const expenses = db.prepare(`
    SELECT e.*, u.name as created_by_name
    FROM order_expenses e
    JOIN users u ON e.created_by = u.id
    WHERE e.order_id = ?
    ORDER BY e.expense_date DESC, e.id DESC
  `).all(orderId);
  
  const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  
  res.json({ expenses, total });
});

// Add expense to order
app.post('/api/orders/:orderId/expenses', auth, (req, res) => {
  const orderId = Number(req.params.orderId);
  const { description, amount, expense_date, category, receipt_file } = req.body;
  
  if (!description || amount === undefined) {
    return res.status(400).json({ error: 'Description and amount required' });
  }
  
  const info = db.prepare(`
    INSERT INTO order_expenses (order_id, description, amount, expense_date, category, receipt_file, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(orderId, description, Number(amount), expense_date || new Date().toISOString().split('T')[0], category || null, receipt_file || null, req.user.id);
  
  // Log activity
  db.prepare(`
    INSERT INTO order_timeline (order_id, activity_type, description, user_id)
    VALUES (?, 'expense_added', ?, ?)
  `).run(orderId, `Udgift tilføjet: ${description} (${amount} kr)`, req.user.id);
  
  const expense = db.prepare(`
    SELECT e.*, u.name as created_by_name
    FROM order_expenses e
    JOIN users u ON e.created_by = u.id
    WHERE e.id = ?
  `).get(info.lastInsertRowid);
  
  res.json(expense);
});

// Update expense
app.put('/api/orders/:orderId/expenses/:expenseId', auth, (req, res) => {
  const expenseId = Number(req.params.expenseId);
  const { description, amount, expense_date, category } = req.body;
  
  db.prepare(`
    UPDATE order_expenses SET
      description = ?,
      amount = ?,
      expense_date = ?,
      category = ?
    WHERE id = ?
  `).run(description, amount, expense_date, category || null, expenseId);
  
  const expense = db.prepare(`
    SELECT e.*, u.name as created_by_name
    FROM order_expenses e
    JOIN users u ON e.created_by = u.id
    WHERE e.id = ?
  `).get(expenseId);
  
  res.json(expense);
});

// Delete expense
app.delete('/api/orders/:orderId/expenses/:expenseId', auth, (req, res) => {
  const expenseId = Number(req.params.expenseId);
  db.prepare('DELETE FROM order_expenses WHERE id = ?').run(expenseId);
  res.json({ success: true });
});

// --- ORDER DOCUMENTS ENDPOINTS ---

// Get all documents for an order
app.get('/api/orders/:orderId/documents', auth, (req, res) => {
  const orderId = Number(req.params.orderId);
  
  const documents = db.prepare(`
    SELECT d.*, u.name as uploaded_by_name
    FROM order_documents d
    JOIN users u ON d.uploaded_by = u.id
    WHERE d.order_id = ?
    ORDER BY d.created_at DESC
  `).all(orderId);
  
  res.json(documents);
});

// Upload document to order
app.post('/api/orders/:orderId/documents', auth, upload.single('file'), (req, res) => {
  const orderId = Number(req.params.orderId);
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const { document_type } = req.body;
  
  const info = db.prepare(`
    INSERT INTO order_documents (order_id, filename, original_name, file_path, file_size, document_type, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(orderId, req.file.filename, req.file.originalname, `/uploads/${req.file.filename}`, req.file.size, document_type || 'general', req.user.id);
  
  // Log activity
  db.prepare(`
    INSERT INTO order_timeline (order_id, activity_type, description, user_id)
    VALUES (?, 'document_added', ?, ?)
  `).run(orderId, `Dokument uploadet: ${req.file.originalname}`, req.user.id);
  
  const document = db.prepare(`
    SELECT d.*, u.name as uploaded_by_name
    FROM order_documents d
    JOIN users u ON d.uploaded_by = u.id
    WHERE d.id = ?
  `).get(info.lastInsertRowid);
  
  res.json(document);
});

// Delete order document
app.delete('/api/orders/:orderId/documents/:documentId', auth, (req, res) => {
  const documentId = Number(req.params.documentId);
  
  const document = db.prepare('SELECT * FROM order_documents WHERE id = ?').get(documentId);
  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }
  
  // Delete physical file
  const filePath = path.join(__dirname, 'uploads', document.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  
  db.prepare('DELETE FROM order_documents WHERE id = ?').run(documentId);
  res.json({ success: true });
});

// Transfer file from files system to order documents
app.post('/api/files/:fileId/transfer-to-order', auth, (req, res) => {
  const fileId = Number(req.params.fileId);
  const { order_number } = req.body;
  
  if (!order_number || !order_number.trim()) {
    return res.status(400).json({ error: 'Order number required' });
  }
  
  // Find the file
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  // Find the order by order_number (could be main order or extra work)
  const order = db.prepare(`
    SELECT id, order_number, title, customer_id 
    FROM quotes 
    WHERE order_number = ? OR quote_number = ?
  `).get(order_number.trim(), order_number.trim());
  
  if (!order) {
    return res.status(404).json({ error: `Ordre ${order_number} findes ikke` });
  }
  
  // Check if file is already in order documents
  const existing = db.prepare(`
    SELECT id FROM order_documents 
    WHERE order_id = ? AND filename = ?
  `).get(order.id, file.filename);
  
  if (existing) {
    return res.status(400).json({ error: 'Denne fil findes allerede i ordren' });
  }
  
  // Copy file to order documents
  const info = db.prepare(`
    INSERT INTO order_documents (order_id, filename, original_name, file_path, file_size, document_type, uploaded_by)
    VALUES (?, ?, ?, ?, ?, 'transferred', ?)
  `).run(order.id, file.filename, file.original_name, file.file_path, file.file_size, req.user.id);
  
  // Log activity
  db.prepare(`
    INSERT INTO order_timeline (order_id, activity_type, description, user_id)
    VALUES (?, 'document_transferred', ?, ?)
  `).run(order.id, `Fil overført fra filhåndtering: ${file.original_name}`, req.user.id);
  
  const document = db.prepare(`
    SELECT d.*, u.name as uploaded_by_name
    FROM order_documents d
    JOIN users u ON d.uploaded_by = u.id
    WHERE d.id = ?
  `).get(info.lastInsertRowid);
  
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
app.get('/api/orders/:orderId/timeline', auth, (req, res) => {
  const orderId = Number(req.params.orderId);
  
  const timeline = db.prepare(`
    SELECT t.*, u.name as user_name, u.avatar_url
    FROM order_timeline t
    JOIN users u ON t.user_id = u.id
    WHERE t.order_id = ?
    ORDER BY t.created_at DESC
    LIMIT 100
  `).all(orderId);
  
  res.json(timeline);
});

// Manually add timeline entry
app.post('/api/orders/:orderId/timeline', auth, (req, res) => {
  const orderId = Number(req.params.orderId);
  const { activity_type, description } = req.body;
  
  if (!activity_type || !description) {
    return res.status(400).json({ error: 'Activity type and description required' });
  }
  
  const info = db.prepare(`
    INSERT INTO order_timeline (order_id, activity_type, description, user_id)
    VALUES (?, ?, ?, ?)
  `).run(orderId, activity_type, description, req.user.id);
  
  const entry = db.prepare(`
    SELECT t.*, u.name as user_name, u.avatar_url
    FROM order_timeline t
    JOIN users u ON t.user_id = u.id
    WHERE t.id = ?
  `).get(info.lastInsertRowid);
  
  res.json(entry);
});

// --- NOTES ENDPOINTS ---

// Get all notes for an order
app.get('/api/orders/:orderId/notes', auth, (req, res) => {
  const orderId = Number(req.params.orderId);
  
  const notes = db.prepare(`
    SELECT n.*, u.name as created_by_name, u.avatar_url
    FROM order_notes n
    JOIN users u ON n.created_by = u.id
    WHERE n.order_id = ?
    ORDER BY n.is_pinned DESC, n.updated_at DESC
  `).all(orderId);
  
  res.json(notes);
});

// Add note to order
app.post('/api/orders/:orderId/notes', auth, (req, res) => {
  const orderId = Number(req.params.orderId);
  const { content, is_pinned } = req.body;
  
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Content required' });
  }
  
  const info = db.prepare(`
    INSERT INTO order_notes (order_id, content, is_pinned, created_by)
    VALUES (?, ?, ?, ?)
  `).run(orderId, content.trim(), is_pinned ? 1 : 0, req.user.id);
  
  // Log activity
  db.prepare(`
    INSERT INTO order_timeline (order_id, activity_type, description, user_id)
    VALUES (?, 'note_added', ?, ?)
  `).run(orderId, 'Note tilføjet', req.user.id);
  
  const note = db.prepare(`
    SELECT n.*, u.name as created_by_name, u.avatar_url
    FROM order_notes n
    JOIN users u ON n.created_by = u.id
    WHERE n.id = ?
  `).get(info.lastInsertRowid);
  
  res.json(note);
});

// Update note
app.put('/api/orders/:orderId/notes/:noteId', auth, (req, res) => {
  const noteId = Number(req.params.noteId);
  const { content, is_pinned } = req.body;
  
  db.prepare(`
    UPDATE order_notes SET
      content = ?,
      is_pinned = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(content, is_pinned ? 1 : 0, noteId);
  
  const note = db.prepare(`
    SELECT n.*, u.name as created_by_name, u.avatar_url
    FROM order_notes n
    JOIN users u ON n.created_by = u.id
    WHERE n.id = ?
  `).get(noteId);
  
  res.json(note);
});

// Delete note
app.delete('/api/orders/:orderId/notes/:noteId', auth, (req, res) => {
  const noteId = Number(req.params.noteId);
  db.prepare('DELETE FROM order_notes WHERE id = ?').run(noteId);
  res.json({ success: true });
});

// --- ORDER WORKSPACE SUMMARY ENDPOINT ---

// Get complete order workspace data
app.get('/api/orders/:orderId/workspace', auth, (req, res) => {
  const orderId = Number(req.params.orderId);
  
  // Get order details
  const order = db.prepare(`
    SELECT q.id, q.quote_number, q.order_number, q.parent_order_id, q.sub_number, q.is_extra_work,
           q.customer_id, q.title, q.requisition_number, q.date, q.valid_until, q.status,
           q.notes, q.terms, q.subtotal, q.vat_rate, q.vat_amount, q.total,
           q.created_by, q.created_at, q.sent_at, q.accepted_at, q.contact_person_id,
           c.company_name, c.contact_person, c.email as customer_email,
           c.phone as customer_phone, c.address, c.postal_code, c.city, c.cvr_number,
           u.name as created_by_name
    FROM quotes q
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON q.created_by = u.id
    WHERE q.id = ?
  `).get(orderId);
  
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  
  // Get all extra work orders for this main order
  const extraWorkOrders = db.prepare(`
    SELECT q.*, u.name as created_by_name
    FROM quotes q
    JOIN users u ON q.created_by = u.id
    WHERE q.parent_order_id = ?
    ORDER BY q.sub_number ASC
  `).all(orderId);
  
  // Get expenses for main order
  const expenses = db.prepare(`
    SELECT e.*, u.name as created_by_name
    FROM order_expenses e
    JOIN users u ON e.created_by = u.id
    WHERE e.order_id = ?
    ORDER BY e.expense_date DESC
  `).all(orderId);
  
  let totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  
  // Get expenses for all extra work orders and aggregate
  let extraWorkExpenses = [];
  extraWorkOrders.forEach(extraOrder => {
    const extraExpenses = db.prepare(`
      SELECT e.*, u.name as created_by_name
      FROM order_expenses e
      JOIN users u ON e.created_by = u.id
      WHERE e.order_id = ?
      ORDER BY e.expense_date DESC
    `).all(extraOrder.id);
    
    extraWorkExpenses = [...extraWorkExpenses, ...extraExpenses];
    totalExpenses += extraExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  });
  
  // Get documents
  const documents = db.prepare(`
    SELECT d.*, u.name as uploaded_by_name
    FROM order_documents d
    JOIN users u ON d.uploaded_by = u.id
    WHERE d.order_id = ?
    ORDER BY d.created_at DESC
  `).all(orderId);
  
  // Get timeline
  const timeline = db.prepare(`
    SELECT t.*, u.name as user_name, u.avatar_url
    FROM order_timeline t
    JOIN users u ON t.user_id = u.id
    WHERE t.order_id = ?
    ORDER BY t.created_at DESC
    LIMIT 50
  `).all(orderId);
  
  // Get notes
  const notes = db.prepare(`
    SELECT n.*, u.name as created_by_name, u.avatar_url
    FROM order_notes n
    JOIN users u ON n.created_by = u.id
    WHERE n.order_id = ?
    ORDER BY n.is_pinned DESC, n.updated_at DESC
  `).all(orderId);
  
  // Get lines
  const lines = db.prepare('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY sort_order, id').all(orderId);
  
  // Check if order has an invoice
  const invoice = db.prepare(`
    SELECT i.*, u.name as created_by_name
    FROM invoices i
    JOIN users u ON i.created_by = u.id
    WHERE i.order_id = ?
    ORDER BY i.id DESC
    LIMIT 1
  `).get(orderId);
  
  // Calculate aggregated revenue (main order + extra work)
  let totalRevenue = order.total || 0;
  extraWorkOrders.forEach(extraOrder => {
    totalRevenue += (extraOrder.total || 0);
  });
  
  // Calculate profit with aggregated data
  const profit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(2) : 0;
  
  // Calculate split expenses
  const mainOrderExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const extraWorkExpensesTotal = extraWorkExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  
  // Calculate split profit
  const mainOrderRevenue = order.total || 0;
  const extraWorkRevenue = totalRevenue - mainOrderRevenue;
  const profitMain = mainOrderRevenue - mainOrderExpenses;
  const profitExtra = extraWorkRevenue - extraWorkExpensesTotal;
  
  res.json({
    order,
    lines,
    extra_work_orders: extraWorkOrders.map(eo => ({
      ...eo,
      full_order_number: getFullOrderNumber(eo)
    })),
    invoice: invoice || null,
    expenses: {
      items: expenses,
      extra_work_expenses: extraWorkExpenses,
      total: totalExpenses
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
        next_step: 'Go to https://flowfactory-denmark.netlify.app and login!'
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
  const pending = db.prepare('SELECT * FROM pending_users WHERE email = ? AND status = \'pending\'').get(email.toLowerCase());
  
  if (pending) {
    // Create actual user from pending
    const info = db.prepare(`
      INSERT INTO users (name, email, password_hash, position, department, phone, is_admin)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(pending.name, pending.email, pending.password_hash, pending.position, pending.department, pending.phone);
    
    // Update pending status
    db.prepare('UPDATE pending_users SET status = ? WHERE id = ?').run('approved', pending.id);
    
    return res.json({ success: true, message: 'User approved and made admin!' });
  }
  
  // Or just approve existing user and make admin
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (user) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
    return res.json({ success: true, message: 'User made admin!' });
  }
  
  res.status(404).json({ error: 'User not found' });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 Breeze backend kører på http://localhost:${PORT}`);
  console.log(`📊 Database: breeze.db`);
});
