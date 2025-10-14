// js/email.js
// Windows 95 Style Email Client for FlowFactory Portal
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
    console.log('Initializing Windows 95 email client...');
    
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
    // Close context menu when clicking outside
    document.addEventListener('click', (e) => {
      const contextMenu = document.getElementById('context-menu');
      if (contextMenu && !contextMenu.contains(e.target)) {
        contextMenu.classList.remove('active');
      }
    });

    // Make dialogs draggable
    this.makeDraggable('compose-dialog');
    this.makeDraggable('account-dialog');
  },

  // Make dialog draggable
  makeDraggable(dialogId) {
    const dialog = document.getElementById(dialogId);
    if (!dialog) return;

    const titleBar = dialog.querySelector('.win95-dialog-title');
    if (!titleBar) return;

    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;

    titleBar.addEventListener('mousedown', (e) => {
      // Don't drag if clicking close button
      if (e.target.classList.contains('win95-dialog-close')) return;

      isDragging = true;
      
      const rect = dialog.getBoundingClientRect();
      initialX = e.clientX - rect.left;
      initialY = e.clientY - rect.top;

      dialog.style.transform = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      e.preventDefault();

      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      // Keep dialog within viewport
      const maxX = window.innerWidth - dialog.offsetWidth;
      const maxY = window.innerHeight - dialog.offsetHeight;
      
      currentX = Math.max(0, Math.min(currentX, maxX));
      currentY = Math.max(0, Math.min(currentY, maxY));

      dialog.style.left = currentX + 'px';
      dialog.style.top = currentY + 'px';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  },

  // Load email accounts
  async loadEmailAccounts() {
    try {
      const accounts = await apiCall('/api/email/accounts');
      this.emailAccounts = Array.isArray(accounts) ? accounts : [];
      this.renderEmailAccounts();
      
      // Set current account if available
      if (this.emailAccounts.length > 0 && !this.currentAccountId) {
        this.currentAccountId = this.emailAccounts[0].id;
        this.updateStatusBar();
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
      container.innerHTML = '<div style="padding: 5px 10px; font-size: 11px; color: #999;">Ingen konti</div>';
      return;
    }

    container.innerHTML = this.emailAccounts.map(account => `
      <div class="folder-tree-item ${account.id === this.currentAccountId ? 'selected' : ''}" 
           onclick="emailClient.selectAccount(${account.id})">
        📧 ${this.escapeHtml(account.email)}
      </div>
    `).join('');
  },

  // Select an email account
  async selectAccount(accountId) {
    this.currentAccountId = accountId;
    this.renderEmailAccounts();
    this.updateStatusBar();
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

      const emails = await apiCall('/api/email/emails?' + params.toString());
      this.emails = Array.isArray(emails) ? emails : [];
      this.renderEmailList();
      this.updateFolderCounts();
      this.updateStatusBar();
    } catch (error) {
      console.error('Error loading emails:', error);
      this.showNotification('Kunne ikke indlæse emails: ' + error.message, 'error');
    }
  },

  // Render email list in table
  renderEmailList() {
    const tbody = document.getElementById('emails-list-body');
    if (!tbody) return;

    if (this.emails.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 20px; color: #999;">Ingen emails</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.emails.map(email => {
      const date = new Date(email.date);
      const dateStr = this.formatDate(date);
      const isStarred = email.starred || false;
      const isUnread = email.unread || false;

      return `
        <tr class="${isUnread ? 'unread' : ''} ${email.id === this.currentEmailId ? 'selected' : ''}"
            onclick="emailClient.viewEmail(${email.id})"
            oncontextmenu="emailClient.showContextMenu(event, ${email.id})">
          <td>${isStarred ? '⭐' : ''}</td>
          <td>${this.escapeHtml(email.from_name || email.from_email)}</td>
          <td>${this.escapeHtml(email.subject || '(Intet emne)')}</td>
          <td>${dateStr}</td>
        </tr>
      `;
    }).join('');
  },

  // Format date for display
  formatDate(date) {
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
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
      const tbody = document.getElementById('emails-list-body');
      if (tbody) {
        tbody.querySelectorAll('tr').forEach(row => row.classList.remove('selected'));
        event.currentTarget.classList.add('selected');
      }

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
    const viewer = document.getElementById('email-preview');
    if (!viewer) return;

    const date = new Date(email.date);
    const dateStr = date.toLocaleString('da-DK');

    viewer.innerHTML = `
      <div class="email-preview-header">
        <div><strong>Fra:</strong> ${this.escapeHtml(email.from_name || email.from_email)}</div>
        <div><strong>Til:</strong> ${this.escapeHtml(email.to_email || 'Dig')}</div>
        <div><strong>Emne:</strong> ${this.escapeHtml(email.subject || '(Intet emne)')}</div>
        <div><strong>Dato:</strong> ${dateStr}</div>
      </div>
      <div class="email-preview-content">
        ${email.body_html || this.textToHtml(email.body_text) || '<p style="color: #999;">Ingen indhold</p>'}
        ${attachments.length > 0 ? `
          <hr style="margin: 15px 0;">
          <strong>📎 Vedhæftede filer (${attachments.length}):</strong><br><br>
          ${attachments.map(att => `
            <div style="padding: 5px; margin: 3px 0; background: #f0f0f0;">
              📄 ${this.escapeHtml(att.filename)} (${this.formatFileSize(att.size)})
              <button onclick="emailClient.downloadAttachment(${att.id})" style="margin-left: 10px; padding: 2px 8px;">Download</button>
            </div>
          `).join('')}
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
    document.querySelectorAll('.folder-tree-item[data-folder]').forEach(item => {
      item.classList.remove('selected');
      if (item.getAttribute('data-folder') === folder) {
        item.classList.add('selected');
      }
    });

    // Clear viewer
    const viewer = document.getElementById('email-preview');
    if (viewer) {
      viewer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999;">Vælg en email for at læse den</div>';
    }

    // Load emails for this folder
    await this.loadEmails();
  },

  // Update folder counts
  updateFolderCounts() {
    const inboxCount = this.emails.filter(e => !e.read && e.folder === 'inbox').length;
    const starredCount = this.emails.filter(e => e.starred).length;

    const inboxCountEl = document.getElementById('inbox-count');
    const starredCountEl = document.getElementById('starred-count');

    if (inboxCountEl) inboxCountEl.textContent = `(${inboxCount})`;
    if (starredCountEl) starredCountEl.textContent = `(${starredCount})`;
  },

  // Update status bar
  updateStatusBar() {
    const statusEmails = document.getElementById('status-emails');
    const statusAccount = document.getElementById('status-account');

    if (statusEmails) {
      statusEmails.textContent = `${this.emails.length} email${this.emails.length !== 1 ? 's' : ''}`;
    }

    if (statusAccount) {
      if (this.currentAccountId) {
        const account = this.emailAccounts.find(a => a.id === this.currentAccountId);
        statusAccount.textContent = account ? account.email : 'Ingen konto valgt';
      } else {
        statusAccount.textContent = 'Ingen konto valgt';
      }
    }
  },

  // Sync emails from IMAP
  async syncEmails() {
    if (!this.currentAccountId) {
      this.showNotification('Vælg en email konto først', 'warning');
      return;
    }

    try {
      this.showNotification('Synkroniserer emails...', 'info');

      await apiCall(`/api/email/sync/${this.currentAccountId}`, {
        method: 'POST'
      });

      this.showNotification('Emails synkroniseret!', 'success');
      await this.loadEmails();
    } catch (error) {
      console.error('Error syncing emails:', error);
      this.showNotification('Synkronisering fejlede: ' + error.message, 'error');
    }
  },

  // Open compose modal
  openCompose(replyTo = null, forward = false) {
    const dialog = document.getElementById('compose-dialog');
    const overlay = document.getElementById('compose-overlay');
    
    if (!dialog || !overlay) return;

    dialog.classList.add('active', 'compose');
    overlay.classList.add('active');

    // Center dialog
    dialog.style.left = '50%';
    dialog.style.top = '50%';
    dialog.style.transform = 'translate(-50%, -50%)';

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
    const dialog = document.getElementById('compose-dialog');
    const overlay = document.getElementById('compose-overlay');
    
    if (dialog) dialog.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
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
          account_id: this.currentAccountId,
          to,
          subject: subject || '(Intet emne)',
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
    
    if (contextMenu) {
      contextMenu.style.left = event.pageX + 'px';
      contextMenu.style.top = event.pageY + 'px';
      contextMenu.classList.add('active');
    }
  },

  // Toggle star on email
  async toggleStar() {
    const emailId = this.contextMenuEmailId || this.currentEmailId;
    if (!emailId) return;

    const contextMenu = document.getElementById('context-menu');
    if (contextMenu) contextMenu.classList.remove('active');

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

    const contextMenu = document.getElementById('context-menu');
    if (contextMenu) contextMenu.classList.remove('active');

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
        const viewer = document.getElementById('email-preview');
        if (viewer) {
          viewer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999;">Vælg en email for at læse den</div>';
        }
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

    const contextMenu = document.getElementById('context-menu');
    if (contextMenu) contextMenu.classList.remove('active');

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
    const dialog = document.getElementById('account-dialog');
    const overlay = document.getElementById('account-overlay');
    
    if (!dialog || !overlay) return;

    dialog.classList.add('active', 'account');
    overlay.classList.add('active');

    // Center dialog
    dialog.style.left = '50%';
    dialog.style.top = '50%';
    dialog.style.transform = 'translate(-50%, -50%)';

    // Clear/pre-fill fields
    document.getElementById('account-email').value = '';
    document.getElementById('account-password').value = '';
    document.getElementById('account-imap-host').value = 'imap.gmail.com';
    document.getElementById('account-imap-port').value = '993';
    document.getElementById('account-smtp-host').value = 'smtp.gmail.com';
    document.getElementById('account-smtp-port').value = '587';

    // Focus on first field
    setTimeout(() => {
      document.getElementById('account-email').focus();
    }, 100);
  },

  // Close add account modal
  closeAddAccountModal() {
    const dialog = document.getElementById('account-dialog');
    const overlay = document.getElementById('account-overlay');
    
    if (dialog) dialog.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
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
      display_name: email,
      imap_host: imapHost,
      imap_port: imapPort,
      imap_username: email,
      imap_password: password,
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      smtp_username: email,
      smtp_password: password
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
      font-size: 13px;
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
