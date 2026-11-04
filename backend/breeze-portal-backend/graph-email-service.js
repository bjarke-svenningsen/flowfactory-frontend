// graph-email-service.js - v112: Microsoft Graph (Office 365 / Outlook) email sync + send via OAuth2
import crypto from 'crypto';
import { db } from './database-config.js';

// v112: Konfiguration laeses fra Render environment variables:
//   MS_CLIENT_ID, MS_TENANT_ID, MS_CLIENT_SECRET, MS_REDIRECT_URI (valgfri - afledes af BASE_URL)
const MS_CLIENT_ID = process.env.MS_CLIENT_ID || '';
const MS_TENANT_ID = process.env.MS_TENANT_ID || '';
const MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET || '';
const BASE_URL = process.env.BASE_URL || 'https://flowfactory-frontend-20zs.onrender.com';
const MS_REDIRECT_URI = process.env.MS_REDIRECT_URI || (BASE_URL.replace(/\/$/, '') + '/api/email/oauth/callback');

const SCOPES = 'offline_access Mail.ReadWrite Mail.Send User.Read';
const AUTH_BASE = 'https://login.microsoftonline.com';
const GRAPH = 'https://graph.microsoft.com/v1.0';

export function isGraphConfigured() {
  return !!(MS_CLIENT_ID && MS_TENANT_ID && MS_CLIENT_SECRET);
}

export function getGraphRedirectUri() {
  return MS_REDIRECT_URI;
}

// v112: sikrer at email_accounts har Graph-kolonner (migration, idempotent)
let graphColumnsEnsured = false;
export async function ensureGraphColumns() {
  if (graphColumnsEnsured) return;
  const columns = [
    ['auth_type', "TEXT DEFAULT 'imap'"],
    ['oauth_access_token', 'TEXT'],
    ['oauth_refresh_token', 'TEXT'],
    ['oauth_expires_at', 'TEXT'],
  ];
  for (const [name, def] of columns) {
    try {
      await db.run(`ALTER TABLE email_accounts ADD COLUMN ${name} ${def}`);
      console.log(`✅ Added ${name} column to email_accounts`);
    } catch (error) {
      if (!/duplicate column|already exists/i.test(error.message)) {
        console.error(`⚠️ Could not add ${name}:`, error.message);
      }
    }
  }
  graphColumnsEnsured = true;
}

// v112: Login-URL (authorization code flow). state = base64(JSON) med userId (valideres i callback)
export function getGraphAuthUrl(userId) {
  const state = Buffer.from(JSON.stringify({ uid: userId, n: crypto.randomBytes(8).toString('hex') })).toString('base64url');
  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: MS_REDIRECT_URI,
    response_mode: 'query',
    scope: SCOPES,
    state,
    // v112: prompt=consent sikrer at consent-skaermen altid vises (admin-consent looper ellers i nogle tenants)
    prompt: 'consent',
  });
  return `${AUTH_BASE}/${MS_TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`;
}

// v112: Direkte admin-consent URL - bruges engang af tenant-admin hvis bruger-consent er blokeret
export function getGraphAdminConsentUrl() {
  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    redirect_uri: MS_REDIRECT_URI,
  });
  return `${AUTH_BASE}/${MS_TENANT_ID}/adminconsent?${params.toString()}`;
}

async function tokenRequest(body) {
  const res = await fetch(`${AUTH_BASE}/${MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Microsoft token-fejl');
  return data;
}

export async function exchangeGraphCode(code) {
  return tokenRequest({
    client_id: MS_CLIENT_ID,
    client_secret: MS_CLIENT_SECRET,
    code,
    redirect_uri: MS_REDIRECT_URI,
    grant_type: 'authorization_code',
  });
}

async function refreshGraphToken(refreshToken) {
  return tokenRequest({
    client_id: MS_CLIENT_ID,
    client_secret: MS_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: SCOPES,
  });
}

// v112: Returnerer gyldigt access token - refresher automatisk hvis udoebet
export async function getValidAccessToken(account) {
  const expiresAt = account.oauth_expires_at ? new Date(account.oauth_expires_at).getTime() : 0;
  if (account.oauth_access_token && expiresAt > Date.now() + 60000) {
    return account.oauth_access_token;
  }
  if (!account.oauth_refresh_token) throw new Error('Ingen Microsoft-login - tilfoej kontoen igen');
  const refreshed = await refreshGraphToken(account.oauth_refresh_token);
  const newExpires = new Date(Date.now() + (refreshed.expires_in - 120) * 1000).toISOString();
  await db.run(
    'UPDATE email_accounts SET oauth_access_token = ?, oauth_refresh_token = ?, oauth_expires_at = ? WHERE id = ?',
    [refreshed.access_token, refreshed.refresh_token || account.oauth_refresh_token, newExpires, account.id]
  );
  return refreshed.access_token;
}

async function graphGet(token, path) {
  const res = await fetch(`${GRAPH}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Graph-fejl (${res.status})`);
  }
  return res.json();
}

export async function getGraphProfile(token) {
  const me = await graphGet(token, '/me');
  return { email: me.mail || me.userPrincipalName, name: me.displayName || '' };
}


// v112: Stabil numerisk uid ud fra Graph message-id (emails.uid er INTEGER + UNIQUE(account_id, uid, folder))
function uidFromMessageId(messageId) {
  const hex = crypto.createHash('md5').update(messageId).digest('hex').slice(0, 8);
  return parseInt(hex, 16) % 2147483647;
}

function decodeQuotedPrintable(str) {
  try {
    return decodeURIComponent(escape(str));
  } catch {
    return str;
  }
}

// v112: Sync INBOX via Graph - gemmer i samme emails-tabel som IMAP-syncen, sa frontend ikke merker forskel
export async function syncEmailsGraph(accountId) {
  await ensureGraphColumns();
  const account = await db.get('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
  if (!account) throw new Error('Account not found');

  const token = await getValidAccessToken(account);
  const data = await graphGet(token, '/me/mailFolders/inbox/messages?$top=15&$select=id,subject,body,from,receivedDateTime,hasAttachments&$orderby=receivedDateTime desc');

  let newCount = 0;
  for (const msg of data.value || []) {
    const uid = uidFromMessageId(msg.id);
    const exists = await db.get(
      'SELECT id FROM emails WHERE account_id = ? AND uid = ? AND (folder = ? OR folder = ?)',
      [accountId, uid, 'inbox', 'INBOX']
    );
    if (exists) continue;

    const fromAddr = msg.from?.emailAddress?.address || '';
    const fromName = msg.from?.emailAddress?.name || '';
    let bodyHtml = msg.body?.content && msg.body?.contentType === 'html' ? msg.body.content : '';
    let bodyText = msg.body?.content && msg.body?.contentType !== 'html'
      ? decodeQuotedPrintable(msg.body.content)
      : (bodyHtml ? bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '');

    await db.run(
      `INSERT INTO emails (account_id, message_id, uid, folder, from_address, from_name, to_address, to_name, cc, subject, body_text, body_html, received_date, has_attachments)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        accountId,
        msg.id,
        uid,
        'inbox',
        fromAddr,
        fromName,
        account.email || '',
        account.display_name || '',
        null,
        msg.subject || '(ingen emne)',
        bodyText,
        bodyHtml,
        msg.receivedDateTime || new Date().toISOString(),
        msg.hasAttachments ? 1 : 0,
      ]
    );
    newCount++;
  }

  await db.run('UPDATE email_accounts SET last_sync = ? WHERE id = ?', [new Date().toISOString(), accountId]);
  console.log(`📧 Graph sync konto ${accountId}: ${data.value?.length || 0} hentet, ${newCount} nye`);
  return { success: true, synced: data.value?.length || 0, new: newCount };
}

// v112: Send via Graph /me/sendMail
export async function sendEmailGraph(accountId, emailData) {
  await ensureGraphColumns();
  const account = await db.get('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
  if (!account) throw new Error('Account not found');

  const token = await getValidAccessToken(account);
  const toList = (Array.isArray(emailData.to) ? emailData.to : String(emailData.to || '').split(/[,;]+/))
    .map(s => s.trim()).filter(Boolean).map(a => ({ emailAddress: { address: a } }));
  const ccList = (Array.isArray(emailData.cc) ? emailData.cc : String(emailData.cc || '').split(/[,;]+/))
    .map(s => s.trim()).filter(Boolean).map(a => ({ emailAddress: { address: a } }));
  const bccList = (Array.isArray(emailData.bcc) ? emailData.bcc : String(emailData.bcc || '').split(/[,;]+/))
    .map(s => s.trim()).filter(Boolean).map(a => ({ emailAddress: { address: a } }));

  const message = {
    message: {
      subject: emailData.subject || '',
      body: { contentType: emailData.html ? 'HTML' : 'Text', content: emailData.html || emailData.text || '' },
      toRecipients: toList,
      ...(ccList.length ? { ccRecipients: ccList } : {}),
      ...(bccList.length ? { bccRecipients: bccList } : {}),
    },
    saveToSentItems: true,
  };

  const res = await fetch(`${GRAPH}/me/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Graph send-fejl (${res.status})`);
  }
  return { success: true };
}
