// js/email.js
// Email Client for FlowFactory Portal
// Integrates with backend email service on Render

const API_URL = 'https://flowfactory-frontend.onrender.com';

function getToken() {
  return sessionStorage.getItem('token') || '';
}

async function apiCall(path, options = {}) {
  const response = await fetch(API_URL + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': getToken() ? `Bearer ${getToken()}` : '',
      ...(options.headers || {}),
    },
  });
  
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'En fejl opstod');
  }
  return data;
}

// Main Email Client Object
const emailClient = {
  currentFolder: 'inbox',
  currentEmailId: null,
  contextMenuEmailId: null,
  emailAccounts: [],
  emails: [],
  currentAccountId: null,

  // Initialize the email client
  async init() {
    console.log('Initializing email client...');
    
    // Load email accounts
    await this.loadEmailAccounts();
    
    // Load emails for default folder
    await this.loadEmails();
    
    // Setup event listeners
    this.setupEventListeners();
    
    console.log('Email client initialized');
  },

  // Setup event listeners
  setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('email-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchEmails(e.target.value);
      });
    }

    // Folder items
    const folderItems = document.querySelectorAll('.folder-item');
    folderItems.forEach(item => {
      item.addEventListener('click', () => {
        const folder = item.getAttribute('data-folder');
        this.changeFolder(folder);
      });
    });

    // Close context menu when clicking outside
    document.addEventListener('click', (e) => {
      const contextMenu = document.getElementById('context-menu');
      if (!contextMenu.contains(e.target)) {
        contextMenu.classList.remove('active');
      }
    });

    // Close compose modal when clicking outside
    document.getElementById('compose-modal').addEventListener('click', (e) => {
      if (e.target.id === 'compose-modal') {
        this.closeCompose();
      }
    });
  },

  // Load email accounts
  async loadEmailAccounts() {
    try {
      const response = await apiCall('/api/email/accounts');
      this.emailAccounts = response.accounts || [];
      this.renderEmailAccounts();
      
      // Set current account if available
      if (this.emailAccounts.length > 0 && !this.currentAccountId) {
        this.currentAccountId = this.emailAccounts[0].id;
      }
    } catch (error) {
      console.error('Error loading email accounts:', error);
      this.showNotification('Kunne ikke indlæse email konti: ' + error.message, 'error');
    }
  },

  // Render email accounts in sidebar
  renderEmailAccounts() {
    const container = document.getElementById('email-accounts-list');
    if (!container) return;

    if (this.emailAccounts.length === 0) {
      container.innerHTML = '<div style="padding: 8px; font-size: 12px; color: #999;">Ingen konti tilføjet</div>';
      return;
    }

    container.innerHTML = this.emailAccounts.map(account => `
      <div class="account-item ${account.id === this.currentAccountId ? 'active' : ''}" 
           onclick="emailClient.selectAccount(${account.id})">
        📧 ${account.email}
      </div>
    `).join('');
  },

  // Select an email account
  async selectAccount(accountId) {
    this.currentAccountId = accountId;
    this.renderEmailAccounts();
    await this.loadEmails();
  },

  // Load emails
  async loadEmails() {
    try {
      const params = new URLSearchParams();
      
      if (this.currentFolder === 'starred') {
        params.append('starred', 'true');
      } else if (this.currentFolder === 'sent') {
        params.append('folder', 'sent');
      } else {
        params.append('folder', 'inbox');
      }

      if (this.currentAccountId) {
        params.append('accountId', this.currentAccountId);
      }

      const response = await apiCall('/api/email/emails?' + params.toString());
      this.emails = response.emails || [];
      this.renderEmailList();
      this.updateFolderCounts();
    } catch (error) {
      console.error('Error loading emails:', error);
      this.showNotification('Kunne ikke indlæse emails: ' + error.message, 'error');
    }
  },

  // Render email list
  renderEmailList() {
    const container = document.getElementById('emails-list');
    if (!container) return;

    if (this.emails.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📧</div>
          <div class="empty-text">Ingen emails</div>
        </div>
      `;
      return;
    }

    container.innerHTML = this.emails.map(email => {
      const date = new Date(email.date);
      const dateStr = this.formatDate(date);
      const hasAttachments = email.has_attachments || false;
      const isStarred = email.starred || false;
      const isUnread = email.unread || false;

      return `
        <div class="email-item ${isUnread ? 'unread' : ''} ${email.id === this.currentEmailId ? 'active' : ''}"
             onclick="emailClient.viewEmail(${email.id})"
             oncontextmenu="emailClient.showContextMenu(event, ${email.id})">
          <div class="email-from">${this.escapeHtml(email.from_name || email.from_email)}</div>
          <div class="email-subject">${this.escapeHtml(email.subject || '(Intet emne)')}</div>
          <div class="email-preview">${this.escapeHtml(this.getEmailPreview(email))}</div>
          <div class="email-meta">
            <div class="email-date">${dateStr}</div>
            <div class="email-flags">
              ${isStarred ? '<span class="flag-icon starred">⭐</span>' : ''}
              ${hasAttachments ? '<span class="flag-icon attachment">📎</span>' : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  // Get email preview text
  getEmailPreview(email) {
    const preview = email.body_text || email.body_html || '';
    return preview.substring(0, 100).replace(/<[^>]*>/g, '');
  },

  // Format date for display
  formatDate(date) {
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'I går';
    } else if (days < 7) {
      return date.toLocaleDateString('da-DK', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
    }
  },

  // View a specific email
  async viewEmail(emailId) {
    try {
      this.currentEmailId = emailId;
      
      // Update active state in list
      document.querySelectorAll('.email-item').forEach(item => {
        item.classList.remove('active');
      });
      event.currentTarget.classList.add('active');

      // Fetch full email details
      const response = await apiCall(`/api/email/emails/${emailId}`);
      const email = response.email;
      const attachments = response.attachments || [];

      this.renderEmailViewer(email, attachments);

      // Mark as read
      const emailItem = this.emails.find(e => e.id === emailId);
      if (emailItem) {
        emailItem.unread = false;
        this.updateFolderCounts();
      }
    } catch (error) {
      console.error('Error viewing email:', error);
      this.showNotification('Kunne ikke åbne email: ' + error.message, 'error');
    }
  },

  // Render email viewer
  renderEmailViewer(email, attachments) {
    const viewer = document.getElementById('email-viewer');
    if (!viewer) return;

    const date = new Date(email.date);
    const dateStr = date.toLocaleString('da-DK');

    viewer.innerHTML = `
      <div class="email-viewer-header">
        <div class="email-viewer-subject">${this.escapeHtml(email.subject || '(Intet emne)')}</div>
        <div class="email-viewer-meta">
          <span class="email-viewer-from">Fra: ${this.escapeHtml(email.from_name || email.from_email)}</span>
          <span>•</span>
          <span>${dateStr}</span>
        </div>
        <div class="email-viewer-actions">
          <button class="action-btn" onclick="emailClient.replyToEmail()">↩️ Svar</button>
          <button class="action-btn" onclick="emailClient.forwardEmail()">➡️ Videresend</button>
          <button class="action-btn primary" onclick="emailClient.linkToOrder()">📦 Send til ordre</button>
          <button class="action-btn" onclick="emailClient.toggleStar()">
            ${email.starred ? '⭐ Fjern markering' : '⭐ Marker'}
          </button>
        </div>
      </div>
      <div class="email-viewer-body">
        <div class="email-body-content">
          ${email.body_html || this.textToHtml(email.body_text) || '<p style="color: #999;">Ingen indhold</p>'}
        </div>
        ${attachments.length > 0 ? `
          <div class="email-attachments">
            <div class="attachments-title">📎 Vedhæftede filer (${attachments.length})</div>
            ${attachments.map(att => `
              <div class="attachment-item">
                <div class="attachment-icon">📄</div>
                <div class="attachment-info">
                  <div class="attachment-name">${this.escapeHtml(att.filename)}</div>
                  <div class="attachment-size">${this.formatFileSize(att.size)}</div>
                </div>
                <button class="attachment-download" onclick="emailClient.downloadAttachment(${att.id})">
                  ⬇️ Download
                </button>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  },

  // Convert plain text to HTML
  textToHtml(text) {
    if (!text) return '';
    return text.replace(/\n/g, '<br>');
  },

  // Format file size
  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  // Download attachment
  async downloadAttachment(attachmentId) {
    try {
      window.open(`${API_URL}/api/email/attachments/${attachmentId}`, '_blank');
    } catch (error) {
      console.error('Error downloading attachment:', error);
      this.showNotification('Kunne ikke downloade fil: ' + error.message, 'error');
    }
  },

  // Change folder
  async changeFolder(folder) {
    this.currentFolder = folder;
    this.currentEmailId = null;

    // Update active state
    document.querySelectorAll('.folder-item').forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-folder') === folder) {
        item.classList.add('active');
      }
    });

    // Update title
    const titles = {
      'inbox': 'Indbakke',
      'starred': 'Markerede',
      'sent': 'Sendt'
    };
    document.getElementById('current-folder-title').textContent = titles[folder] || folder;

    // Clear viewer
    document.getElementById('email-viewer').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-text">Vælg en email for at læse den</div>
      </div>
    `;

    // Load emails for this folder
    await this.loadEmails();
  },

  // Update folder counts
  updateFolderCounts() {
    const inboxCount = this.emails.filter(e => !e.read && e.folder === 'inbox').length;
    const starredCount = this.emails.filter(e => e.starred).length;

    const inboxCountEl = document.getElementById('inbox-count');
    const starredCountEl = document.getElementById('starred-count');

    if (inboxCountEl) inboxCountEl.textContent = inboxCount;
    if (starredCountEl) starredCountEl.textContent = starredCount;
  },

  // Search emails
  searchEmails(query) {
    const lowerQuery = query.toLowerCase();
    const items = document.querySelectorAll('.email-item');

    items.forEach(item => {
      const text = item.textContent.toLowerCase();
      if (text.includes(lowerQuery)) {
        item.style.display = 'block';
      } else {
        item.style.display = 'none';
      }
    });
  },

  // Sync emails from IMAP
  async syncEmails() {
    if (!this.currentAccountId) {
      this.showNotification('Vælg en email konto først', 'warning');
      return;
    }

    const spinner = document.getElementById('sync-spinner');
    const syncText = document.getElementById('sync-text');
    
    try {
      spinner.style.display = 'inline-block';
      syncText.textContent = 'Synkroniserer...';

      await apiCall(`/api/email/sync/${this.currentAccountId}`, {
        method: 'POST'
      });

      this.showNotification('Emails synkroniseret!', 'success');
      await this.loadEmails();
    } catch (error) {
      console.error('Error syncing emails:', error);
      this.showNotification('Synkronisering fejlede: ' + error.message, 'error');
    } finally {
      spinner.style.display = 'none';
      syncText.textContent = '🔄 Synkroniser';
    }
  },

  // Open compose modal
  openCompose(replyTo = null, forward = false) {
    const modal = document.getElementById('compose-modal');
    modal.classList.add('active');

    if (replyTo) {
      document.getElementById('compose-to').value = replyTo.from_email;
      document.getElementById('compose-subject').value = 
        (forward ? 'Fwd: ' : 'Re: ') + (replyTo.subject || '');
      
      if (forward) {
        const body = replyTo.body_text || replyTo.body_html || '';
        document.getElementById('compose-body').value = 
          `\n\n---------- Videresendt besked ----------\nFra: ${replyTo.from_email}\nEmne: ${replyTo.subject}\n\n${body}`;
      }
    } else {
      // Clear fields
      document.getElementById('compose-to').value = '';
      document.getElementById('compose-subject').value = '';
      document.getElementById('compose-body').value = '';
    }

    // Focus on first field
    setTimeout(() => {
      document.getElementById('compose-to').focus();
    }, 100);
  },

  // Close compose modal
  closeCompose() {
    const modal = document.getElementById('compose-modal');
    modal.classList.remove('active');
  },

  // Send email
  async sendEmail() {
    if (!this.currentAccountId) {
      this.showNotification('Vælg en email konto først', 'warning');
      return;
    }

    const to = document.getElementById('compose-to').value.trim();
    const subject = document.getElementById('compose-subject').value.trim();
    const body = document.getElementById('compose-body').value;

    if (!to) {
      this.showNotification('Indtast modtager email', 'warning');
      return;
    }

    try {
      await apiCall('/api/email/send', {
        method: 'POST',
        body: JSON.stringify({
          accountId: this.currentAccountId,
          to,
          subject,
          text: body,
          html: body.replace(/\n/g, '<br>')
        })
      });

      this.showNotification('Email sendt!', 'success');
      this.closeCompose();
      
      // Reload sent folder if viewing it
      if (this.currentFolder === 'sent') {
        await this.loadEmails();
      }
    } catch (error) {
      console.error('Error sending email:', error);
      this.showNotification('Kunne ikke sende email: ' + error.message, 'error');
    }
  },

  // Reply to current email
  replyToEmail() {
    if (!this.currentEmailId) return;
    
    const email = this.emails.find(e => e.id === this.currentEmailId);
    if (email) {
      this.openCompose(email, false);
    }
  },

  // Forward current email
  forwardEmail() {
    if (!this.currentEmailId) return;
    
    const email = this.emails.find(e => e.id === this.currentEmailId);
    if (email) {
      this.openCompose(email, true);
    }
  },

  // Show context menu
  showContextMenu(event, emailId) {
    event.preventDefault();
    
    this.contextMenuEmailId = emailId;
    const contextMenu = document.getElementById('context-menu');
    
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
    contextMenu.classList.add('active');
  },

  // Toggle star on email
  async toggleStar() {
    const emailId = this.contextMenuEmailId || this.currentEmailId;
    if (!emailId) return;

    document.getElementById('context-menu').classList.remove('active');

    try {
      await apiCall(`/api/email/emails/${emailId}/star`, {
        method: 'POST'
      });

      // Update local state
      const email = this.emails.find(e => e.id === emailId);
      if (email) {
        email.starred = !email.starred;
        this.renderEmailList();
        this.updateFolderCounts();

        // Update viewer if viewing this email
        if (this.currentEmailId === emailId) {
          this.viewEmail(emailId);
        }
      }

      this.showNotification('Email markering opdateret', 'success');
    } catch (error) {
      console.error('Error toggling star:', error);
      this.showNotification('Kunne ikke opdatere markering: ' + error.message, 'error');
    }
  },

  // Delete email
  async deleteEmail() {
    const emailId = this.contextMenuEmailId || this.currentEmailId;
    if (!emailId) return;

    document.getElementById('context-menu').classList.remove('active');

    if (!confirm('Er du sikker på at du vil slette denne email?')) {
      return;
    }

    try {
      await apiCall(`/api/email/emails/${emailId}`, {
        method: 'DELETE'
      });

      this.showNotification('Email slettet', 'success');
      
      // Remove from list
      this.emails = this.emails.filter(e => e.id !== emailId);
      this.renderEmailList();
      this.updateFolderCounts();

      // Clear viewer if viewing this email
      if (this.currentEmailId === emailId) {
        this.currentEmailId = null;
        document.getElementById('email-viewer').innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📭</div>
            <div class="empty-text">Vælg en email for at læse den</div>
          </div>
        `;
      }
    } catch (error) {
      console.error('Error deleting email:', error);
      this.showNotification('Kunne ikke slette email: ' + error.message, 'error');
    }
  },

  // Link email to order
  async linkToOrder() {
    const emailId = this.contextMenuEmailId || this.currentEmailId;
    if (!emailId) return;

    document.getElementById('context-menu').classList.remove('active');

    const orderId = prompt('Indtast ordre ID:');
    if (!orderId) return;

    try {
      await apiCall('/api/email/link-to-order', {
        method: 'POST',
        body: JSON.stringify({
          emailId: parseInt(emailId),
          orderId: parseInt(orderId)
        })
      });

      this.showNotification('Email linket til ordre!', 'success');
    } catch (error) {
      console.error('Error linking email to order:', error);
      this.showNotification('Kunne ikke linke email til ordre: ' + error.message, 'error');
    }
  },

  // Show add account modal
  showAddAccountModal() {
    const modal = document.getElementById('add-account-modal');
    modal.classList.add('active');

    // Clear fields
    document.getElementById('account-email').value = '';
    document.getElementById('account-password').value = '';
    document.getElementById('account-imap-host').value = '';
    document.getElementById('account-imap-port').value = '993';
    document.getElementById('account-smtp-host').value = '';
    document.getElementById('account-smtp-port').value = '587';

    // Focus on first field
    setTimeout(() => {
      document.getElementById('account-email').focus();
    }, 100);
  },

  // Close add account modal
  closeAddAccountModal() {
    const modal = document.getElementById('add-account-modal');
    modal.classList.remove('active');
  },

  // Add email account from modal
  async addEmailAccountFromModal() {
    const email = document.getElementById('account-email').value.trim();
    const password = document.getElementById('account-password').value;
    const imapHost = document.getElementById('account-imap-host').value.trim();
    const imapPort = parseInt(document.getElementById('account-imap-port').value);
    const smtpHost = document.getElementById('account-smtp-host').value.trim();
    const smtpPort = parseInt(document.getElementById('account-smtp-port').value);

    if (!email || !password || !imapHost || !smtpHost) {
      this.showNotification('Udfyld alle felter', 'warning');
      return;
    }

    this.closeAddAccountModal();

    await this.addEmailAccount({
      email,
      password,
      imapHost,
      imapPort,
      smtpHost,
      smtpPort
    });
  },

  // Add email account
  async addEmailAccount(accountData) {
    try {
      await apiCall('/api/email/accounts', {
        method: 'POST',
        body: JSON.stringify(accountData)
      });

      this.showNotification('Email konto tilføjet!', 'success');
      await this.loadEmailAccounts();
    } catch (error) {
      console.error('Error adding email account:', error);
      this.showNotification('Kunne ikke tilføje email konto: ' + error.message, 'error');
    }
  },

  // Show notification
  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 24px;
      background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  },

  // Escape HTML to prevent XSS
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// Make emailClient globally available
window.emailClient = emailClient;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => emailClient.init());
} else {
  emailClient.init();
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);
