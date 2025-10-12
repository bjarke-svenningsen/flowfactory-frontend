// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import nodemailer from 'nodemailer';

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
const db = new Database('breeze.db');
db.pragma('journal_mode = WAL');

// users
db.prepare(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  position TEXT DEFAULT '',
  department TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  is_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);`).run();

// invite codes
db.prepare(`CREATE TABLE IF NOT EXISTS invite_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  created_by INTEGER NOT NULL,
  used_by INTEGER DEFAULT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(created_by) REFERENCES users(id),
  FOREIGN KEY(used_by) REFERENCES users(id)
);`).run();

// pending registrations
db.prepare(`CREATE TABLE IF NOT EXISTS pending_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  position TEXT DEFAULT '',
  department TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);`).run();

// posts (feed)
db.prepare(`CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);`).run();

// reactions (like)
db.prepare(`CREATE TABLE IF NOT EXISTS reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  type TEXT DEFAULT 'like',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(post_id, user_id),
  FOREIGN KEY(post_id) REFERENCES posts(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);`).run();

// messages (1:1)
db.prepare(`CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  recipient_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(sender_id) REFERENCES users(id),
  FOREIGN KEY(recipient_id) REFERENCES users(id)
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

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
  const token = signToken(user);
  const safeUser = { id: user.id, name: user.name, email: user.email, position: user.position, department: user.department, phone: user.phone, avatar_url: user.avatar_url, is_admin: user.is_admin };
  res.json({ user: safeUser, token });
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER DEFAULT NULL,
  created_by INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(parent_id) REFERENCES folders(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
);`).run();

// Create files table if not exists
db.prepare(`CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT,
  folder_id INTEGER DEFAULT NULL,
  uploaded_by INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(folder_id) REFERENCES folders(id),
  FOREIGN KEY(uploaded_by) REFERENCES users(id)
);`).run();

// Track user activity
db.prepare(`CREATE TABLE IF NOT EXISTS user_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  last_login TEXT DEFAULT (datetime('now')),
  messages_sent INTEGER DEFAULT 0,
  posts_created INTEGER DEFAULT 0,
  files_uploaded INTEGER DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id)
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
    const registrationUrl = `http://localhost:3000/register.html?code=${code}`;
    
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

// --- Socket.IO: presence + 1:1 chat ---
const onlineUsers = new Map(); // userId -> socketId

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

  socket.on('disconnect', () => {
    if (socket.user) {
      onlineUsers.delete(socket.user.id);
      io.emit('presence:update', Array.from(onlineUsers.keys()));
      console.log('User disconnected:', socket.user.name);
    }
  });
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
