// email-service.js - Email sync and management service
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './database-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// IMAP configuration builder
function buildImapConfig(account) {
  return {
    imap: {
      user: account.imap_username,
      password: account.imap_password,
      host: account.imap_host,
      port: account.imap_port || 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000
    }
  };
}

// SMTP transporter builder
function buildSmtpTransporter(account) {
  return nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port || 587,
    secure: account.smtp_port === 465,
    auth: {
      user: account.smtp_username,
      pass: account.smtp_password
    }
  });
}

// Sync emails from IMAP server
export async function syncEmails(accountId) {
  try {
    // Get account details
    const account = await db.get('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
    if (!account) throw new Error('Account not found');

    const config = buildImapConfig(account);
    const connection = await imaps.connect(config);

    // Open inbox
    await connection.openBox('INBOX');

    // Fetch emails (last 100 for now)
    const searchCriteria = ['ALL'];
    const fetchOptions = {
      bodies: ['HEADER', 'TEXT', ''],
      markSeen: false
    };

    const messages = await connection.search(searchCriteria, fetchOptions);

    console.log(`📧 Found ${messages.length} emails to sync`);

    let syncedCount = 0;
    let newCount = 0;

    for (const item of messages) {
      try {
        const all = item.parts.find(part => part.which === '');
        const id = item.attributes.uid;
        const idHeader = 'Imap-Id: ' + id + '\r\n';
        
        const mail = await simpleParser(idHeader + all.body);

        // Check if email already exists (check both INBOX and inbox for compatibility)
        const exists = await db.get(
          'SELECT id FROM emails WHERE account_id = ? AND uid = ? AND (folder = ? OR folder = ?)',
          [accountId, id, 'inbox', 'INBOX']
        );

        if (!exists) {
          // Save email to database
          const fromAddr = mail.from?.value?.[0]?.address || '';
          const fromName = mail.from?.value?.[0]?.name || '';
          const toAddr = mail.to?.value?.[0]?.address || '';
          const toName = mail.to?.value?.[0]?.name || '';

          const info = await db.run(`
            INSERT INTO emails (
              account_id, message_id, uid, folder,
              from_address, from_name, to_address, to_name,
              cc, subject, body_text, body_html,
              received_date, has_attachments
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            accountId,
            mail.messageId || '',
            id,
            'inbox',
            fromAddr,
            fromName,
            toAddr,
            toName,
            mail.cc ? JSON.stringify(mail.cc.value) : null,
            mail.subject || '(ingen emne)',
            mail.text || '',
            mail.html || '',
            mail.date ? mail.date.toISOString() : new Date().toISOString(),
            mail.attachments && mail.attachments.length > 0 ? 1 : 0
          ]);

          const emailId = info.lastInsertRowid;

          // Save attachments
          if (mail.attachments && mail.attachments.length > 0) {
            const uploadsDir = path.join(__dirname, 'uploads', 'email-attachments');
            if (!fs.existsSync(uploadsDir)) {
              fs.mkdirSync(uploadsDir, { recursive: true });
            }

            for (const attachment of mail.attachments) {
              const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}-${attachment.filename}`;
              const filePath = path.join(uploadsDir, filename);
              
              fs.writeFileSync(filePath, attachment.content);

              await db.run(`
                INSERT INTO email_attachments (
                  email_id, filename, original_name, file_path, file_size, mime_type
                ) VALUES (?, ?, ?, ?, ?, ?)
              `, [
                emailId,
                filename,
                attachment.filename,
                `/uploads/email-attachments/${filename}`,
                attachment.size,
                attachment.contentType
              ]);
            }
          }

          newCount++;
        }

        syncedCount++;
      } catch (emailError) {
        console.error('Error processing email:', emailError);
      }
    }

    connection.end();

    // Update last sync timestamp
    await db.run(
      'UPDATE email_accounts SET last_sync = ? WHERE id = ?',
      [new Date().toISOString(), accountId]
    );

    console.log(`✅ Synced ${syncedCount} emails (${newCount} new)`);

    return { success: true, synced: syncedCount, new: newCount };
  } catch (error) {
    console.error('Email sync error:', error);
    throw error;
  }
}

// Send email via SMTP
export async function sendEmail(accountId, emailData) {
  try {
    const account = await db.get('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
    if (!account) throw new Error('Account not found');

    const transporter = buildSmtpTransporter(account);

    const mailOptions = {
      from: `"${account.display_name || account.email}" <${account.email}>`,
      to: emailData.to,
      cc: emailData.cc || undefined,
      bcc: emailData.bcc || undefined,
      subject: emailData.subject,
      text: emailData.text,
      html: emailData.html,
      attachments: emailData.attachments || []
    };

    const result = await transporter.sendMail(mailOptions);

    console.log('✅ Email sent:', result.messageId);

    // Save sent email to database
    try {
      await db.run(`
        INSERT INTO emails (
          account_id, message_id, uid, folder,
          from_address, from_name, to_address, to_name,
          cc, subject, body_text, body_html,
          received_date, has_attachments, is_read
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        accountId,
        result.messageId || '',
        0, // uid is 0 for sent emails (not from IMAP)
        'sent',
        account.email,
        account.display_name || account.email,
        emailData.to,
        emailData.to,
        emailData.cc || null,
        emailData.subject || '(Intet emne)',
        emailData.text || '',
        emailData.html || '',
        new Date().toISOString(),
        0, // no attachments for now
        1  // sent emails are always "read"
      ]);

      console.log('✅ Sent email saved to database');
    } catch (dbError) {
      console.error('Error saving sent email to database:', dbError);
      // Don't fail the whole operation if database save fails
    }

    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Send email error:', error);
    throw error;
  }
}

// Test IMAP connection
export async function testImapConnection(imapConfig) {
  try {
    const config = {
      imap: {
        user: imapConfig.username,
        password: imapConfig.password,
        host: imapConfig.host,
        port: imapConfig.port || 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 10000
      }
    };

    const connection = await imaps.connect(config);
    await connection.openBox('INBOX');
    connection.end();

    return { success: true, message: 'IMAP connection successful' };
  } catch (error) {
    console.error('IMAP test failed:', error);
    return { success: false, error: error.message };
  }
}

// Test SMTP connection
export async function testSmtpConnection(smtpConfig) {
  try {
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port || 587,
      secure: smtpConfig.port === 465,
      auth: {
        user: smtpConfig.username,
        pass: smtpConfig.password
      }
    });

    await transporter.verify();

    return { success: true, message: 'SMTP connection successful' };
  } catch (error) {
    console.error('SMTP test failed:', error);
    return { success: false, error: error.message };
  }
}
