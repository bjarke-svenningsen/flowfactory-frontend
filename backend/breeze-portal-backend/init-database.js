// init-database.js - Initialize database tables (async for PostgreSQL compatibility)
import { db } from './database-config.js';

export async function initializeDatabase() {
  console.log('🔧 Initializing database tables...');
  
  try {
    // Users table
    await db.run(`CREATE TABLE IF NOT EXISTS users (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      position TEXT DEFAULT '',
      department TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      profile_image TEXT DEFAULT '',
      is_admin INTEGER DEFAULT 0,
      created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}
    )`);

    // Invite codes
    await db.run(`CREATE TABLE IF NOT EXISTS invite_codes (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      code TEXT UNIQUE NOT NULL,
      created_by INTEGER NOT NULL,
      used_by INTEGER DEFAULT NULL,
      expires_at TEXT NOT NULL,
      created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(created_by) REFERENCES users(id),\n  FOREIGN KEY(used_by) REFERENCES users(id)'}
    )`);

    // Pending users
    await db.run(`CREATE TABLE IF NOT EXISTS pending_users (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      position TEXT DEFAULT '',
      department TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}
    )`);

    // Posts
    await db.run(`CREATE TABLE IF NOT EXISTS posts (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(user_id) REFERENCES users(id)'}
    )`);

    // Reactions
    await db.run(`CREATE TABLE IF NOT EXISTS reactions (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      type TEXT DEFAULT 'like',
      created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"},
      UNIQUE(post_id, user_id)${db._isProduction ? '' : ',\n  FOREIGN KEY(post_id) REFERENCES posts(id),\n  FOREIGN KEY(user_id) REFERENCES users(id)'}
    )`);

    // Messages
    await db.run(`CREATE TABLE IF NOT EXISTS messages (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      sender_id INTEGER NOT NULL,
      recipient_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(sender_id) REFERENCES users(id),\n  FOREIGN KEY(recipient_id) REFERENCES users(id)'}
    )`);

    // Folders
    await db.run(`CREATE TABLE IF NOT EXISTS folders (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      name TEXT NOT NULL,
      parent_id INTEGER DEFAULT NULL,
      created_by INTEGER NOT NULL,
      created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(parent_id) REFERENCES folders(id),\n  FOREIGN KEY(created_by) REFERENCES users(id)'}
    )`);

    // Files
    await db.run(`CREATE TABLE IF NOT EXISTS files (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT,
      folder_id INTEGER DEFAULT NULL,
      uploaded_by INTEGER NOT NULL,
      created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(folder_id) REFERENCES folders(id),\n  FOREIGN KEY(uploaded_by) REFERENCES users(id)'}
    )`);

    // User activity
    await db.run(`CREATE TABLE IF NOT EXISTS user_activity (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      user_id INTEGER NOT NULL,
      last_login ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"},
      messages_sent INTEGER DEFAULT 0,
      posts_created INTEGER DEFAULT 0,
      files_uploaded INTEGER DEFAULT 0${db._isProduction ? '' : ',\n  FOREIGN KEY(user_id) REFERENCES users(id)'}
    )`);

    // Customers
    await db.run(`CREATE TABLE IF NOT EXISTS customers (
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
    )`);

    // Customer contacts
    await db.run(`CREATE TABLE IF NOT EXISTS customer_contacts (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      customer_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      title TEXT,
      email TEXT,
      phone TEXT,
      is_primary INTEGER DEFAULT 0,
      created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE'}
    )`);

    // Quotes
    await db.run(`CREATE TABLE IF NOT EXISTS quotes (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      quote_number TEXT,
      order_number TEXT NOT NULL,
      parent_order_id INTEGER DEFAULT NULL,
      sub_number INTEGER DEFAULT NULL,
      is_extra_work INTEGER DEFAULT 0,
      customer_id INTEGER NOT NULL,
      contact_person_id INTEGER,
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
    )`);

    // Quote lines
    await db.run(`CREATE TABLE IF NOT EXISTS quote_lines (
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
    )`);

    // Quote attachments
    await db.run(`CREATE TABLE IF NOT EXISTS quote_attachments (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      quote_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      uploaded_by INTEGER NOT NULL,
      created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(quote_id) REFERENCES quotes(id) ON DELETE CASCADE,\n  FOREIGN KEY(uploaded_by) REFERENCES users(id)'}
    )`);

    // Invoices
    await db.run(`CREATE TABLE IF NOT EXISTS invoices (
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
    )`);

    // Invoice lines
    await db.run(`CREATE TABLE IF NOT EXISTS invoice_lines (
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
    )`);

    // Order expenses
    await db.run(`CREATE TABLE IF NOT EXISTS order_expenses (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      order_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      expense_date ${db._isProduction ? 'DATE DEFAULT CURRENT_DATE' : "TEXT DEFAULT (date('now'))"},
      category TEXT,
      receipt_file TEXT,
      created_by INTEGER NOT NULL,
      created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(order_id) REFERENCES quotes(id) ON DELETE CASCADE,\n  FOREIGN KEY(created_by) REFERENCES users(id)'}
    )`);

    // Order documents
    await db.run(`CREATE TABLE IF NOT EXISTS order_documents (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      order_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      document_type TEXT,
      uploaded_by INTEGER NOT NULL,
      created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(order_id) REFERENCES quotes(id) ON DELETE CASCADE,\n  FOREIGN KEY(uploaded_by) REFERENCES users(id)'}
    )`);

    // Order timeline
    await db.run(`CREATE TABLE IF NOT EXISTS order_timeline (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      order_id INTEGER NOT NULL,
      activity_type TEXT NOT NULL,
      description TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(order_id) REFERENCES quotes(id) ON DELETE CASCADE,\n  FOREIGN KEY(user_id) REFERENCES users(id)'}
    )`);

    // Order notes
    await db.run(`CREATE TABLE IF NOT EXISTS order_notes (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      order_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      is_pinned INTEGER DEFAULT 0,
      created_by INTEGER NOT NULL,
      created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"},
      updated_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(order_id) REFERENCES quotes(id) ON DELETE CASCADE,\n  FOREIGN KEY(created_by) REFERENCES users(id)'}
    )`);

    // Email accounts (IMAP/SMTP configurations per user)
    await db.run(`CREATE TABLE IF NOT EXISTS email_accounts (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      user_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      display_name TEXT,
      imap_host TEXT NOT NULL,
      imap_port INTEGER DEFAULT 993,
      imap_username TEXT NOT NULL,
      imap_password TEXT NOT NULL,
      smtp_host TEXT NOT NULL,
      smtp_port INTEGER DEFAULT 587,
      smtp_username TEXT NOT NULL,
      smtp_password TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      last_sync ${db._isProduction ? 'TIMESTAMP' : 'TEXT'},
      created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE'}
    )`);

    // Emails (synced from IMAP)
    await db.run(`CREATE TABLE IF NOT EXISTS emails (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      account_id INTEGER NOT NULL,
      message_id TEXT NOT NULL,
      uid INTEGER NOT NULL,
      folder TEXT DEFAULT 'INBOX',
      folder_id INTEGER,
      from_address TEXT NOT NULL,
      from_name TEXT,
      to_address TEXT NOT NULL,
      to_name TEXT,
      cc TEXT,
      bcc TEXT,
      subject TEXT,
      body_text TEXT,
      body_html TEXT,
      received_date ${db._isProduction ? 'TIMESTAMP' : 'TEXT'},
      is_read INTEGER DEFAULT 0,
      is_starred INTEGER DEFAULT 0,
      has_attachments INTEGER DEFAULT 0,
      created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"},
      UNIQUE(account_id, uid, folder)${db._isProduction ? '' : ',\n  FOREIGN KEY(account_id) REFERENCES email_accounts(id) ON DELETE CASCADE,\n  FOREIGN KEY(folder_id) REFERENCES email_folders(id) ON DELETE SET NULL'}
    )`);
    // Email custom folders (for organizing emails)
    await db.run(`CREATE TABLE IF NOT EXISTS email_folders (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      parent_folder INTEGER,
      sort_order INTEGER DEFAULT 0,
      created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,\n  FOREIGN KEY(parent_folder) REFERENCES email_folders(id) ON DELETE CASCADE'}
    )`);
    
    // Add missing columns if they don't exist (migration for existing databases)
    try {
      // Try to add folder_id to emails table
      await db.run(`ALTER TABLE emails ADD COLUMN folder_id INTEGER`);
      console.log('✅ Added folder_id column to emails table');
    } catch (error) {
      if (error.message.includes('duplicate column') || error.message.includes('already exists')) {
        console.log('ℹ️  folder_id column already exists in emails table');
      }
      // Ignore other errors - column might already exist
    }
    
    try {
      // Try to add sort_order to email_folders table
      await db.run(`ALTER TABLE email_folders ADD COLUMN sort_order INTEGER DEFAULT 0`);
      console.log('✅ Added sort_order column to email_folders table');
    } catch (error) {
      if (error.message.includes('duplicate column') || error.message.includes('already exists')) {
        console.log('ℹ️  sort_order column already exists in email_folders table');
      }
      // Ignore other errors - column might already exist
    }
    
    try {
      // Try to add work_description to quotes table (for rich text editor)
      await db.run(`ALTER TABLE quotes ADD COLUMN work_description TEXT`);
      console.log('✅ Added work_description column to quotes table');
    } catch (error) {
      if (error.message.includes('duplicate column') || error.message.includes('already exists')) {
        console.log('ℹ️  work_description column already exists in quotes table');
      }
      // Ignore other errors - column might already exist
    }

    // Email attachments
    await db.run(`CREATE TABLE IF NOT EXISTS email_attachments (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      email_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT,
      created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(email_id) REFERENCES emails(id) ON DELETE CASCADE'}
    )`);

    // Email labels (custom tags)
    await db.run(`CREATE TABLE IF NOT EXISTS email_labels (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      email_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(email_id) REFERENCES emails(id) ON DELETE CASCADE'}
    )`);

    // Email to order links (for "Send to ordre" feature)
    await db.run(`CREATE TABLE IF NOT EXISTS email_ordre_links (
      id ${db._isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${db._isProduction ? '' : 'AUTOINCREMENT'},
      email_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      pdf_document_id INTEGER,
      linked_by INTEGER NOT NULL,
      created_at ${db._isProduction ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : "TEXT DEFAULT (datetime('now'))"}${db._isProduction ? '' : ',\n  FOREIGN KEY(email_id) REFERENCES emails(id) ON DELETE CASCADE,\n  FOREIGN KEY(order_id) REFERENCES quotes(id) ON DELETE CASCADE,\n  FOREIGN KEY(pdf_document_id) REFERENCES order_documents(id) ON DELETE SET NULL,\n  FOREIGN KEY(linked_by) REFERENCES users(id)'}
    )`);

    console.log('✅ All database tables initialized successfully!');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}
