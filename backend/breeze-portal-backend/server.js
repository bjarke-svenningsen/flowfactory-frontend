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
import { initializeDatabase } from './init-database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*', methods: ['GET','POST','PUT','DELETE'] }
});

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// CORS configuration - Allow all origins for now
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());

// Determine uploads directory - use persistent disk on Render, local uploads otherwise
const UPLOADS_DIR = process.env.RENDER ? '/opt/render/project/src/persistent/uploads' : path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Serve static files from uploads directory
app.use('/uploads', express.static(UPLOADS_DIR));

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
app.get('/', (req, res) => res.json({ ok: true, message: 'Breeze API kører!' }));

// Auth - Registration with invite code OR pending approval
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, inviteCode, position, department, phone } = req.body;
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
      WHERE code = ? AND used_by IS NULL AND expires_at > NOW()
    `, [inviteCode]);
    
    if (!invite) {
      return res.status(400).json({ error: 'Invalid or expired invite code' });
    }
    
    // Create user directly
    const info = await db.run('INSERT INTO users (name, email, password_hash, position, department, phone) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email.toLowerCase(), password_hash, position || '', department || '', phone || '']);
    
    // Mark invite as used
    await db.run('UPDATE invite_codes SET used_by = ? WHERE id = ?', [info.lastInsertRowid, invite.id]);
    
    const user = await db.get('SELECT id, name, email, position, department, phone, profile_image, is_admin FROM users WHERE id = ?',
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
  const user = await db.get('SELECT id, name, email, position, department, phone, profile_image, is_admin, created_at FROM users WHERE id = ?', [req.user.id]);
  res.json({ user });
});

// Upload profile picture
app.post('/api/users/me/profile-picture', auth, upload.single('profile_picture'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  // Delete old profile picture if exists
  const user = await db.get('SELECT profile_image FROM users WHERE id = ?', [req.user.id]);
  if (user.profile_image && user.profile_image.startsWith('/uploads/')) {
    const oldFilename = user.profile_image.replace('/uploads/', '');
    const oldPath = path.join(UPLOADS_DIR, oldFilename);
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }
  }
  
  // Save new profile picture path
  const profileImagePath = `/uploads/${req.file.filename}`;
  await db.run('UPDATE users SET profile_image = ? WHERE id = ?', [profileImagePath, req.user.id]);
  
  const updatedUser = await db.get('SELECT id, name, email, position, department, phone, profile_image, is_admin FROM users WHERE id = ?', [req.user.id]);
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
    profile_image=COALESCE(?, profile_image)
    WHERE id = ?`, [name, position, department, phone, profile_image, req.user.id]);
  const user = await db.get('SELECT id, name, email, position, department, phone, profile_image FROM users WHERE id = ?', [req.user.id]);
  res.json({ user });
});

// Liste alle brugere (til medarbejder-panelet)
app.get('/api/users', auth, async (req, res) => {
  const rows = await db.all(`
    SELECT id, name, email, position, department, phone, profile_image, created_at
    FROM users
    ORDER BY name ASC
  `);
  res.json(rows);
});

// Feed
app.get('/api/posts', auth, async (req, res) => {
  try {
    const posts = await db.all(`
      SELECT p.id, p.content, p.created_at,
             u.id as user_id, u.name as user_name, u.profile_image
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

app.post('/api/posts', auth, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Missing content' });
  const info = await db.run('INSERT INTO posts (user_id, content) VALUES (?, ?)', [req.user.id, content]);
  const post = await db.get(`
    SELECT p.id, p.content, p.created_at, u.id as user_id, u.name as user_name, u.profile_image
    FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?
  `, [info.lastInsertRowid]);
  res.json(post);
  io.emit('feed:new_post', post);
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
    io.emit('feed:like_updated', { postId, likes });
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
  
  // Check if user owns the post
  if (post.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  
  // Delete post (reactions will be cascade deleted if foreign key constraints are set)
  await db.run('DELETE FROM reactions WHERE post_id = ?', [postId]);
  await db.run('DELETE FROM posts WHERE id = ?', [postId]);
  
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

    const fileInfo = {
      filename: req.file.filename,
      original_name: req.file.originalname,
      file_path: `/uploads/${req.file.filename}`,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      folder_id: folder_id,
      uploaded_by: req.user.id,
      owner_id: req.user.id
    };

    const info = await db.run(`
      INSERT INTO files (filename, original_name, file_path, file_size, mime_type, folder_id, uploaded_by, owner_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      fileInfo.filename,
      fileInfo.original_name,
      fileInfo.file_path,
      fileInfo.file_size,
      fileInfo.mime_type,
      fileInfo.folder_id,
      fileInfo.uploaded_by,
      fileInfo.owner_id
    ]);

    const file = await db.get(`
      SELECT f.*, u.name as uploader_name, o.name as owner_name
      FROM files f
      JOIN users u ON f.uploaded_by = u.id
      LEFT JOIN users o ON f.owner_id = o.id
      WHERE f.id = ?
    `, [info.lastInsertRowid]);

    res.json({ success: true, file });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// --- Folder Management ---

// Create folder
app.post('/api/folders', auth, async (req, res) => {
  const { name, parent_id, is_company_folder } = req.body;
  if (!name) return res.status(400).json({ error: 'Folder name required' });
  
  // Only admins can create company folders
  if (is_company_folder) {
    const user = await db.get('SELECT is_admin FROM users WHERE id = ?', [req.user.id]);
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Only admins can create company folders' });
    }
  }
  
  const info = await db.run(`
    INSERT INTO folders (name, parent_id, created_by, is_company_folder)
    VALUES (?, ?, ?, ?)
  `, [name, parent_id || null, req.user.id, is_company_folder ? 1 : 0]);
  
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
  // Get user's personal folders + company folders
  const folders = await db.all(`
    SELECT f.*, u.name as creator_name
    FROM folders f
    JOIN users u ON f.created_by = u.id
    WHERE f.created_by = ? OR f.is_company_folder = 1
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

// Delete folder
app.delete('/api/folders/:id', auth, async (req, res) => {
  const folderId = Number(req.params.id);
  const folder = await db.get('SELECT * FROM folders WHERE id = ?', [folderId]);
  
  if (!folder) {
    return res.status(404).json({ error: 'Folder not found' });
  }
  
  // Check if user owns folder or is admin
  const user = await db.get('SELECT is_admin FROM users WHERE id = ?', [req.user.id]);
  if (folder.created_by !== req.user.id && !user.is_admin) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  
  // Check if folder has files
  const fileCountResult = await db.get('SELECT COUNT(*) as cnt FROM files WHERE folder_id = ?', [folderId]);
  if (fileCountResult.cnt > 0) {
    return res.status(400).json({ error: 'Folder contains files. Delete files first.' });
  }
  
  // Check if folder has subfolders
  const subfolderCountResult = await db.get('SELECT COUNT(*) as cnt FROM folders WHERE parent_id = ?', [folderId]);
  if (subfolderCountResult.cnt > 0) {
    return res.status(400).json({ error: 'Folder contains subfolders. Delete subfolders first.' });
  }
  
  await db.run('DELETE FROM folders WHERE id = ?', [folderId]);
  res.json({ success: true });
});

// Get all files (user-specific + shared)
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
  
  // Default: Get files owned by this user
  let query = `
    SELECT f.*, u.name as uploader_name, o.name as owner_name
    FROM files f
    JOIN users u ON f.uploaded_by = u.id
    LEFT JOIN users o ON f.owner_id = o.id
    WHERE f.owner_id = ?
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
  
  // Delete physical file
  const filePath = path.join(UPLOADS_DIR, file.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  
  // Delete from database
  await db.run('DELETE FROM files WHERE id = ?', [fileId]);
  
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

// Download file (Server Storage)
app.get('/api/files/download/:id', auth, async (req, res) => {
  const fileId = Number(req.params.id);
  const file = await db.get('SELECT * FROM files WHERE id = ?', [fileId]);
  
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  // BUG FIX: Use UPLOADS_DIR instead of hardcoded path
  const filePath = path.join(UPLOADS_DIR, file.filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }
  
  res.download(filePath, file.original_name);
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
  
  if (file.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only file owner can unshare' });
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
app.get('/api/admin/users', auth, adminAuth, async (req, res) => {
  const users = await db.all(`
    SELECT id, name, email, position, department, phone, is_admin, created_at
    FROM users
    ORDER BY created_at DESC
  `);
  res.json(users);
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
  
  // Delete user's data
  await db.run('DELETE FROM messages WHERE sender_id = ? OR recipient_id = ?', [userId, userId]);
  await db.run('DELETE FROM posts WHERE user_id = ?', [userId]);
  await db.run('DELETE FROM reactions WHERE user_id = ?', [userId]);
  await db.run('DELETE FROM files WHERE uploaded_by = ?', [userId]);
  await db.run('DELETE FROM folders WHERE created_by = ?', [userId]);
  
  // Finally delete the user
  await db.run('DELETE FROM users WHERE id = ?', [userId]);
  
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

  socket.on('chat:send', async ({ toUserId, text }) => {
    if (!socket.user) return;
    const info = await db.run('INSERT INTO messages (sender_id, recipient_id, text) VALUES (?, ?, ?)',
      [socket.user.id, toUserId, String(text).slice(0, 2000)]);
    const msg = await db.get('SELECT * FROM messages WHERE id = ?', [info.lastInsertRowid]);
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
    const expenses_main = mainExpenses?.total || 0;
    
    // Get extra work expenses
    let expenses_extra = 0;
    for (const eo of extraWorkOrders) {
      const extraExpenses = await db.get(`
        SELECT SUM(amount) as total FROM order_expenses WHERE order_id = ?
      `, [eo.id]);
      expenses_extra += (extraExpenses?.total || 0);
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
  
  res.json(enrichedQuotes);
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
  
  quote.lines = lines;
  quote.attachments = attachments;
  
  res.json(quote);
});

app.post('/api/quotes', auth, async (req, res) => {
  try {
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
  
  const info = await db.run(`
    INSERT INTO quote_attachments (quote_id, filename, original_name, file_path, file_size, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [quoteId, req.file.filename, req.file.originalname, `/uploads/${req.file.filename}`, req.file.size, req.user.id]);
  
  const attachment = await db.get(`
    SELECT qa.*, u.name as uploaded_by_name
    FROM quote_attachments qa
    JOIN users u ON qa.uploaded_by = u.id
    WHERE qa.id = ?
  `, [info.lastInsertRowid]);
  
  res.json(attachment);
});

// Delete quote attachment
app.delete('/api/quotes/:quoteId/attachments/:attachmentId', auth, async (req, res) => {
  const attachmentId = Number(req.params.attachmentId);
  
  const attachment = await db.get('SELECT * FROM quote_attachments WHERE id = ?', [attachmentId]);
  if (!attachment) {
    return res.status(404).json({ error: 'Attachment not found' });
  }
  
  // Delete physical file
  const filePath = path.join(UPLOADS_DIR, attachment.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  
  await db.run('DELETE FROM quote_attachments WHERE id = ?', [attachmentId]);
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
        <p>Med venlig hilsen,<br>${quote.created_by_name}<br>FlowFactory ApS</p>
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
  
  const info = await db.run(`
    INSERT INTO order_documents (order_id, filename, original_name, file_path, file_size, document_type, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [orderId, req.file.filename, req.file.originalname, `/uploads/${req.file.filename}`, req.file.size, document_type || 'general', req.user.id]);
  
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
  
  res.json(document);
});

// Delete order document
app.delete('/api/orders/:orderId/documents/:documentId', auth, async (req, res) => {
  const documentId = Number(req.params.documentId);
  
  const document = await db.get('SELECT * FROM order_documents WHERE id = ?', [documentId]);
  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }
  
  // Delete physical file
  const filePath = path.join(UPLOADS_DIR, document.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  
  await db.run('DELETE FROM order_documents WHERE id = ?', [documentId]);
  res.json({ success: true });
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
  
  // Copy file to order documents
  const info = await db.run(`
    INSERT INTO order_documents (order_id, filename, original_name, file_path, file_size, document_type, uploaded_by)
    VALUES (?, ?, ?, ?, ?, 'transferred', ?)
  `, [order.id, file.filename, file.original_name, file.file_path, file.file_size, req.user.id]);
  
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
    SELECT t.*, u.name as user_name, u.profile_image
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
    SELECT t.*, u.name as user_name, u.profile_image
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
    SELECT n.*, u.name as created_by_name, u.profile_image
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
    SELECT n.*, u.name as created_by_name, u.profile_image
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
    SELECT n.*, u.name as created_by_name, u.profile_image
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
  
  // Get expenses for all extra work orders and aggregate
  let extraWorkExpenses = [];
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
    SELECT t.*, u.name as user_name, u.profile_image
    FROM order_timeline t
    JOIN users u ON t.user_id = u.id
    WHERE t.order_id = ?
    ORDER BY t.created_at DESC
    LIMIT 50
  `, [orderId]);
  
  // Get notes
  const notes = await db.all(`
    SELECT n.*, u.name as created_by_name, u.profile_image
    FROM order_notes n
    JOIN users u ON n.created_by = u.id
    WHERE n.order_id = ?
    ORDER BY n.is_pinned DESC, n.updated_at DESC
  `, [orderId]);
  
  // Get lines
  const lines = await db.all('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY sort_order, id', [orderId]);
  
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
  const mainOrderExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const extraWorkExpensesTotal = extraWorkExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  
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
    extra_work_orders: extraWorkOrdersWithNumbers,
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
        profile_image TEXT DEFAULT '',
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

// Initialize database and start server
async function startServer() {
  try {
    await initializeDatabase();
    httpServer.listen(PORT, () => {
      console.log(`🚀 Breeze backend kører på http://localhost:${PORT}`);
      console.log(`📊 Database: ${db._isProduction ? 'PostgreSQL (Supabase)' : 'SQLite (breeze.db)'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
