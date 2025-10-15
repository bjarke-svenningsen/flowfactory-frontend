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
  
  // Pagination state
  currentOffset: 0,
  hasMoreEmails: false,
  totalEmailsInbox: 0,
  isSyncing: false,
  
  // Bulk selection state
  selectedEmails: new Set(),
  
  // Phase 1: Folder picker and email drag state
  selectedFolderForMove: null,
  draggedEmailId: null,
  
  // Phase 2: Nested folder tree state
  folderTreeExpanded: {}, // Track expanded state: { folderId: true/false }
  
  // Phase 3: Folder drag state
  draggedFolderId: null,
  isDraggingFolder: false,

  // Initialize the email client
  async init() {
    console.log('Initializing Windows 95 email client...');
    
    // Load email accounts
    await this.loadEmailAccounts();
    
    // Load custom folders
    await this.loadCustomFolders();
    
    // Update draft count
    this.updateDraftCount();
    
    // Load emails for default folder
    await this.loadEmails();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Initialize resizable panels
    this.makeResizable();
    
    // Load saved layout preferences
    this.loadLayoutPreferences();
    
    // Start auto-sync (every 10 minutes)
    this.startAutoSync();
    
    console.log('Email client initialized');
  },

  // Start auto-sync timer - Enabled with lightweight UNSEEN-only sync
  startAutoSync() {
    console.log('Auto-sync enabled - checking for new emails every 10 minutes');
    
    // Clear any existing timer
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    // Sync every 10 minutes (600,000 ms)
    this.syncTimer = setInterval(async () => {
      if (this.currentAccountId) {
        console.log('Auto-syncing new emails...');
        await this.syncNewEmails(true); // true = silent sync
      }
    }, 600000); // 10 minutes
  },
  
  // Auto-sync: Sync ONLY new (UNSEEN) emails - called by timer
  async syncNewEmails(silent = true) {
    if (!this.currentAccountId) {
      return;
    }

    if (this.isSyncing) {
      console.log('Already syncing, skipping auto-sync...');
      return;
    }

    this.isSyncing = true;

    try {
      // Use NEW auto-sync endpoint (UNSEEN only)
      const result = await apiCall(`/api/email/sync-new/${this.currentAccountId}`, {
        method: 'POST'
      });

      console.log('Auto-sync result:', result);

      // Only show notification if NEW emails were found
      if (result.new > 0 && !silent) {
        this.showNotification(`${result.new} nye email(s) modtaget!`, 'success');
      }

      // Reload emails from database if new emails found
      if (result.new > 0) {
        await this.loadEmails();
      }
      
    } catch (error) {
      console.error('Error auto-syncing new emails:', error);
      // Silent failure for auto-sync
    } finally {
      this.isSyncing = false;
    }
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
    
    // Setup rich text editor features when compose dialog opens
    this.setupRichTextEditor();
  },
  
  // Setup rich text editor with auto-linkify and dropdown updates
  setupRichTextEditor() {
    // Wait for DOM to be ready
    setTimeout(() => {
      const editor = document.getElementById('compose-body');
      if (!editor) return;
      
      // Auto-linkify URLs when user finishes typing (like Outlook/Word)
      editor.addEventListener('keydown', (e) => {
        // Only linkify on space or enter
        if (e.key === ' ' || e.key === 'Enter') {
          setTimeout(() => this.smartLinkifyUrls(editor), 0);
        }
      });
      
      // Also linkify when user leaves the editor
      editor.addEventListener('blur', () => {
        this.smartLinkifyUrls(editor);
      });
      
      // Update formatting dropdowns on input
      editor.addEventListener('input', (e) => {
        this.updateFormattingDropdowns();
      });
      
      // Update dropdowns on selection change
      editor.addEventListener('mouseup', () => this.updateFormattingDropdowns());
      editor.addEventListener('keyup', () => this.updateFormattingDropdowns());
      
      // Drag and drop inline images
      editor.addEventListener('dragover', (e) => {
        e.preventDefault();
        editor.style.background = '#f0f0ff';
      });
      
      editor.addEventListener('dragleave', () => {
        editor.style.background = 'white';
      });
      
      editor.addEventListener('drop', (e) => {
        e.preventDefault();
        editor.style.background = 'white';
        this.handleImageDrop(e, editor);
      });
    }, 500);
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

      // BUGFIX: Only remove transform if dialog is centered
      // Check if dialog is centered (has translate transform)
      const transform = window.getComputedStyle(dialog).transform;
      if (transform && transform !== 'none') {
        // Dialog is centered, convert to absolute positioning
        dialog.style.left = rect.left + 'px';
        dialog.style.top = rect.top + 'px';
        dialog.style.transform = 'none';
      }
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
      // Special handling for drafts folder
      if (this.currentFolder === 'drafts') {
        const drafts = this.loadDrafts();
        // Convert drafts to email format for rendering
        this.emails = drafts.map(draft => ({
          id: `draft_${draft.id}`,
          isDraft: true,
          draftId: draft.id,
          from_name: 'Kladde',
          from_address: '',
          to_address: draft.to,
          subject: draft.subject || '(Intet emne)',
          body_text: draft.body,
          received_date: draft.timestamp,
          is_read: true,
          is_starred: false
        }));
        this.renderEmailList();
        this.updateStatusBar();
        return;
      }
      
      const params = new URLSearchParams();
      
      if (this.currentFolder === 'starred') {
        params.append('starred', 'true');
      } else if (this.currentFolder === 'sent') {
        params.append('folder', 'sent');
      } else if (this.currentFolder.startsWith('custom_')) {
        // Custom folder - extract folder ID and filter by folder_id
        const folderId = parseInt(this.currentFolder.replace('custom_', ''));
        params.append('folder_id', folderId);
      } else {
        // Inbox (default)
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

  // Render email list - NEW: Compact Outlook-style list with checkboxes
  renderEmailList() {
    const listContainer = document.getElementById('emails-list');
    if (!listContainer) return;

    if (this.emails.length === 0) {
      listContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">Ingen emails</div>';
      return;
    }

    listContainer.innerHTML = this.emails.map(email => {
      // Backend uses received_date, handle both for compatibility
      const dateValue = email.received_date || email.date;
      const date = dateValue ? new Date(dateValue) : new Date();
      const dateStr = this.formatDate(date);
      const isStarred = email.is_starred || email.starred || false;
      const isUnread = !email.is_read && email.is_read !== undefined ? true : (email.unread || false);
      const isSelected = this.selectedEmails.has(email.id);
      const isCurrent = email.id === this.currentEmailId;
      
      // Create preview snippet (first 60 chars of body)
      const bodyText = email.body_text || '';
      const preview = bodyText.substring(0, 60) + (bodyText.length > 60 ? '...' : '');

      return `
        <div class="email-item ${isUnread ? 'unread' : ''} ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}" 
             data-email-id="${email.id}"
             draggable="true"
             ondragstart="emailClient.handleEmailDragStart(event, '${email.id}')">
          <input type="checkbox" 
                 class="email-checkbox" 
                 ${isSelected ? 'checked' : ''}
                 onclick="event.stopPropagation(); emailClient.toggleEmailSelection('${email.id}')" />
          <span class="email-star" onclick="event.stopPropagation(); emailClient.toggleStarDirect('${email.id}')">
            ${isStarred ? '⭐' : '☆'}
          </span>
          <div class="email-content" onclick="emailClient.viewEmail('${email.id}')" oncontextmenu="emailClient.showContextMenu(event, '${email.id}')">
            <div class="email-header-row">
              <span class="email-sender">${this.escapeHtml(email.from_name || email.from_address || 'Unknown')}</span>
              <span class="email-date">${dateStr}</span>
            </div>
            <div class="email-subject">${this.escapeHtml(email.subject || '(Intet emne)')}</div>
            <div class="email-preview">${this.escapeHtml(preview)}</div>
          </div>
        </div>
      `;
    }).join('');
    
    // Update select all checkbox
    this.updateSelectAllCheckbox();
  },

  // Format date for display
  formatDate(date) {
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    // Always show date, optionally with time
    const dateStr = date.toLocaleDateString('da-DK', { 
      day: '2-digit', 
      month: '2-digit',
      year: '2-digit'
    });

    if (days === 0) {
      // Today: Show date + time
      const timeStr = date.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
      return `${dateStr} ${timeStr}`;
    } else {
      // Other days: Just show date
      return dateStr;
    }
  },

  // View a specific email
  async viewEmail(emailId) {
    try {
      this.currentEmailId = emailId;
      
      // Update active state in list - Remove 'current' from all emails
      const emailsList = document.getElementById('emails-list');
      if (emailsList) {
        emailsList.querySelectorAll('.email-item').forEach(item => {
          item.classList.remove('current');
        });
        
        // Add 'current' to clicked email
        const currentEmailItem = emailsList.querySelector(`.email-item[data-email-id="${emailId}"]`);
        if (currentEmailItem) {
          currentEmailItem.classList.add('current');
        }
      }

      // Check if this is a draft
      if (String(emailId).startsWith('draft_')) {
        const draftId = parseInt(String(emailId).replace('draft_', ''));
        this.openDraft(draftId);
        return;
      }

      // Fetch full email details - Backend returns email directly, not wrapped
      const email = await apiCall(`/api/email/emails/${emailId}`);
      
      if (!email) {
        throw new Error('Email ikke fundet');
      }

      // Attachments are included in email object
      const attachments = email.attachments || [];

      this.renderEmailViewer(email, attachments);

      // Mark as read
      const emailItem = this.emails.find(e => e.id === emailId);
      if (emailItem) {
        emailItem.is_read = true;
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

    // Backend uses received_date, handle both for compatibility
    const dateValue = email.received_date || email.date;
    const date = dateValue ? new Date(dateValue) : new Date();
    const dateStr = date.toLocaleString('da-DK');

    viewer.innerHTML = `
      <div class="email-preview-header">
        <div><strong>Fra:</strong> ${this.escapeHtml(email.from_name || email.from_address || 'Unknown')}</div>
        <div><strong>Til:</strong> ${this.escapeHtml(email.to_name || email.to_address || 'Dig')}</div>
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
  async changeFolder(folder, customFolderId = null) {
    this.currentFolder = folder;
    this.currentEmailId = null;
    this.customFolderId = customFolderId; // Store custom folder ID if provided

    console.log('Changing folder to:', folder, 'customFolderId:', customFolderId); // DEBUG

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

  // LIGHTWEIGHT PAGINATION: Sync emails with offset/limit
  async syncEmails(silent = false) {
    if (!this.currentAccountId) {
      if (!silent) {
        this.showNotification('Vælg en email konto først', 'warning');
      }
      return;
    }

    if (this.isSyncing) {
      console.log('Already syncing, skipping...');
      return;
    }

    this.isSyncing = true;

    try {
      if (!silent) {
        this.showNotification('Synkroniserer emails...', 'info');
        this.showSyncingState(true);
      }

      // Use paginated sync endpoint
      const result = await apiCall(`/api/email/sync-paginated/${this.currentAccountId}`, {
        method: 'POST',
        body: JSON.stringify({
          offset: this.currentOffset,
          limit: 10
        })
      });

      console.log('Sync result:', result);

      // Update pagination state
      this.hasMoreEmails = result.hasMore;
      this.totalEmailsInbox = result.totalEmails;
      
      if (result.synced > 0) {
        this.currentOffset = result.nextOffset;
      }

      if (!silent) {
        // Always show synced count (not just new count)
        const message = `${result.synced} email(s) indlæst`;
        this.showNotification(message, 'success');
      } else if (result.new > 0) {
        this.showNotification(`${result.new} nye email(s) modtaget!`, 'success');
      }

      // Reload emails from database
      await this.loadEmails();
      
      // Update Load More button
      this.updateLoadMoreButton();
      
    } catch (error) {
      console.error('Error syncing emails:', error);
      if (!silent) {
        this.showNotification('Synkronisering fejlede: ' + error.message, 'error');
      }
    } finally {
      this.isSyncing = false;
      if (!silent) {
        this.showSyncingState(false);
      }
    }
  },
  
  // Show syncing state
  showSyncingState(syncing) {
    const syncButton = document.querySelector('[onclick="emailClient.syncEmails()"]');
    if (syncButton) {
      if (syncing) {
        syncButton.disabled = true;
        syncButton.textContent = '⏳ Synkroniserer...';
      } else {
        syncButton.disabled = false;
        syncButton.textContent = '🔄 Synkroniser';
      }
    }
  },
  
  // Update Load More button
  updateLoadMoreButton() {
    const loadMoreContainer = document.getElementById('load-more-container');
    if (!loadMoreContainer) return;
    
    if (this.hasMoreEmails) {
      const emailsLoaded = this.currentOffset;
      const totalEmails = this.totalEmailsInbox;
      
      loadMoreContainer.innerHTML = `
        <button class="email-toolbar-btn" onclick="emailClient.loadMoreEmails()" style="width: 100%; justify-content: center;">
          📥 Indlæs 10 mere (${emailsLoaded} af ${totalEmails})
        </button>
      `;
      loadMoreContainer.style.display = 'block';
    } else {
      loadMoreContainer.innerHTML = `
        <div style="text-align: center; padding: 10px; color: #666; font-size: 12px;">
          ✅ Alle emails indlæst (${this.totalEmailsInbox} total)
        </div>
      `;
    }
  },
  
  // Load more emails (next batch)
  async loadMoreEmails() {
    if (this.isSyncing) {
      console.log('Already syncing, please wait...');
      return;
    }
    await this.syncEmails(false);
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
      // BUG FIX: Use from_address instead of from_email
      const fromAddress = replyTo.from_address || replyTo.from_email || '';
      
      // Reply: Set recipient to sender
      document.getElementById('compose-to').value = forward ? '' : fromAddress;
      document.getElementById('compose-subject').value = 
        (forward ? 'Fwd: ' : 'Re: ') + (replyTo.subject || '');
      
      // Get body text (strip HTML if needed)
      let bodyText = replyTo.body_text || this.stripHtml(replyTo.body_html) || '';
      
      if (forward) {
        document.getElementById('compose-body').value = 
          `\n\n---------- Videresendt besked ----------\nFra: ${fromAddress}\nEmne: ${replyTo.subject}\n\n${bodyText}`;
      } else {
        // Reply: Include original message
        document.getElementById('compose-body').value = 
          `\n\n---------- Original besked ----------\nFra: ${fromAddress}\nDato: ${new Date(replyTo.received_date || replyTo.date).toLocaleString('da-DK')}\nEmne: ${replyTo.subject}\n\n${bodyText}`;
      }
      
      // Add signature
      this.updateSignaturePreview();
    } else {
      // NEW MAIL - Always start empty (NO auto-load of drafts)
      // Drafts only open when clicked from "Kladder" folder via openDraft()
      document.getElementById('compose-to').value = '';
      document.getElementById('compose-cc').value = '';
      document.getElementById('compose-bcc').value = '';
      document.getElementById('compose-subject').value = '';
      
      // Clear rich text editor (use innerHTML for contenteditable div)
      const bodyEditor = document.getElementById('compose-body');
      if (bodyEditor) {
        bodyEditor.innerHTML = '';
      }
      
      document.getElementById('cc-bcc-fields').style.display = 'none';
      
      // Add signature to new emails
      this.updateSignaturePreview();
    }
    
    // Reset file attachments
    this.selectedFiles = [];
    this.updateAttachmentList();
    
    // Update character count
    this.updateCharCount();

    // Focus on first field
    setTimeout(() => {
      const toField = document.getElementById('compose-to');
      if (toField && !toField.value) {
        toField.focus();
      } else {
        document.getElementById('compose-subject').focus();
      }
    }, 100);
  },

  // Close compose modal
  closeCompose() {
    // Only save if there's actual content (not just signature)
    const to = document.getElementById('compose-to').value.trim();
    const subject = document.getElementById('compose-subject').value.trim();
    const bodyEditor = document.getElementById('compose-body');
    let body = (bodyEditor.textContent || bodyEditor.innerText || '').trim();
    
    // Remove signature from body to check if there's actual content
    const signature = localStorage.getItem('emailSignature') || '';
    if (signature) {
      const signatureMarker = '-- ';
      const markerIndex = body.indexOf(signatureMarker);
      if (markerIndex !== -1) {
        body = body.substring(0, markerIndex).trim();
      }
    }
    
    // Only save if there's real content (not empty or just signature)
    if (to || subject || body) {
      this.saveDraft();
    }
    
    const dialog = document.getElementById('compose-dialog');
    const overlay = document.getElementById('compose-overlay');
    
    if (dialog) dialog.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    
    // Clear current draft ID
    this.currentDraftId = null;
  },

  // Send email
  async sendEmail() {
    if (!this.currentAccountId) {
      this.showNotification('Vælg en email konto først', 'warning');
      return;
    }

    const to = document.getElementById('compose-to').value.trim();
    const subject = document.getElementById('compose-subject').value.trim();
    const bodyEl = document.getElementById('compose-body');
    const bodyHtml = bodyEl.innerHTML;
    const bodyText = bodyEl.textContent || bodyEl.innerText || '';

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
          text: bodyText,
          html: bodyHtml
        })
      });

      this.showNotification('Email sendt!', 'success');
      this.closeCompose();
      
      // Delete draft if this was from a draft
      if (this.currentDraftId) {
        const drafts = this.loadDrafts();
        const filtered = drafts.filter(d => d.id !== this.currentDraftId);
        localStorage.setItem('emailDrafts', JSON.stringify(filtered));
        this.updateDraftCount();
        this.currentDraftId = null;
      }
      
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
      // Check if this is a draft (stored in localStorage only)
      if (String(emailId).startsWith('draft_')) {
        const draftId = parseInt(String(emailId).replace('draft_', ''));
        this.deleteDraft(draftId);
        return;
      }

      // Regular email - delete from API
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
          viewer.innerHTML = '<div style=\"display: flex; align-items: center; justify-content: center; height: 100%; color: #999;\">Vælg en email for at læse den</div>';
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
  },
  
  // ===== BULK SELECTION METHODS =====
  
  // Toggle single email selection
  toggleEmailSelection(emailId) {
    if (this.selectedEmails.has(emailId)) {
      this.selectedEmails.delete(emailId);
    } else {
      this.selectedEmails.add(emailId);
    }
    this.updateBulkActionsToolbar();
    this.updateSelectAllCheckbox();
    this.renderEmailList();
  },
  
  // Toggle select all
  toggleSelectAll() {
    const checkbox = document.getElementById('select-all-checkbox');
    if (checkbox.checked) {
      // Select all visible emails
      this.emails.forEach(email => this.selectedEmails.add(email.id));
    } else {
      // Deselect all
      this.selectedEmails.clear();
    }
    this.updateBulkActionsToolbar();
    this.renderEmailList();
  },
  
  // Update select all checkbox state
  updateSelectAllCheckbox() {
    const checkbox = document.getElementById('select-all-checkbox');
    if (!checkbox) return;
    
    if (this.selectedEmails.size === 0) {
      checkbox.checked = false;
      checkbox.indeterminate = false;
    } else if (this.selectedEmails.size === this.emails.length) {
      checkbox.checked = true;
      checkbox.indeterminate = false;
    } else {
      checkbox.checked = false;
      checkbox.indeterminate = true;
    }
  },
  
  // Update bulk actions toolbar visibility and count
  updateBulkActionsToolbar() {
    const toolbar = document.getElementById('bulk-actions-toolbar');
    const countSpan = document.getElementById('bulk-selected-count');
    
    if (this.selectedEmails.size > 0) {
      toolbar.classList.add('active');
      countSpan.textContent = `${this.selectedEmails.size} valgt`;
    } else {
      toolbar.classList.remove('active');
    }
  },
  
  // Clear selection
  clearSelection() {
    this.selectedEmails.clear();
    this.updateBulkActionsToolbar();
    this.updateSelectAllCheckbox();
    this.renderEmailList();
  },
  
  // Bulk delete emails
  async deleteBulkEmails() {
    if (this.selectedEmails.size === 0) return;
    
    if (!confirm(`Er du sikker på at du vil slette ${this.selectedEmails.size} email(s)?`)) {
      return;
    }
    
    const emailIds = Array.from(this.selectedEmails);
    let deletedCount = 0;
    
    for (const emailId of emailIds) {
      try {
        // Check if this is a draft
        if (String(emailId).startsWith('draft_')) {
          const draftId = parseInt(String(emailId).replace('draft_', ''));
          const drafts = this.loadDrafts();
          const filtered = drafts.filter(d => d.id !== draftId);
          localStorage.setItem('emailDrafts', JSON.stringify(filtered));
          this.updateDraftCount();
          deletedCount++;
        } else {
          // Regular email - delete from API
          await apiCall(`/api/email/emails/${emailId}`, {
            method: 'DELETE'
          });
          deletedCount++;
        }
      } catch (error) {
        console.error(`Error deleting email ${emailId}:`, error);
      }
    }
    
    this.showNotification(`${deletedCount} email(s) slettet`, 'success');
    
    // Remove deleted emails from list
    this.emails = this.emails.filter(e => !emailIds.includes(e.id));
    
    // Clear selection
    this.selectedEmails.clear();
    
    // Re-render
    this.renderEmailList();
    this.updateFolderCounts();
    this.updateBulkActionsToolbar();
    
    // Clear viewer if current email was deleted
    if (emailIds.includes(this.currentEmailId)) {
      this.currentEmailId = null;
      const viewer = document.getElementById('email-preview');
      if (viewer) {
        viewer.innerHTML = '<div style=\"display: flex; align-items: center; justify-content: center; height: 100%; color: #999;\">Vælg en email for at læse den</div>';
      }
    }
  },
  
  // Bulk star emails
  async starBulkEmails() {
    if (this.selectedEmails.size === 0) return;
    
    const emailIds = Array.from(this.selectedEmails);
    let starredCount = 0;
    
    for (const emailId of emailIds) {
      try {
        await apiCall(`/api/email/emails/${emailId}/star`, {
          method: 'POST'
        });
        
        // Update local state
        const email = this.emails.find(e => e.id === emailId);
        if (email) {
          email.starred = true;
          email.is_starred = true;
        }
        
        starredCount++;
      } catch (error) {
        console.error(`Error starring email ${emailId}:`, error);
      }
    }
    
    this.showNotification(`${starredCount} email(s) markeret`, 'success');
    
    // Clear selection
    this.selectedEmails.clear();
    
    // Re-render
    this.renderEmailList();
    this.updateFolderCounts();
    this.updateBulkActionsToolbar();
  },
  
  // Toggle star directly (from star icon click)
  async toggleStarDirect(emailId) {
    try {
      await apiCall(`/api/email/emails/${emailId}/star`, {
        method: 'POST'
      });

      // Update local state
      const email = this.emails.find(e => e.id === emailId);
      if (email) {
        email.starred = !email.starred;
        email.is_starred = !email.is_starred;
        this.renderEmailList();
        this.updateFolderCounts();
      }
    } catch (error) {
      console.error('Error toggling star:', error);
      this.showNotification('Kunne ikke opdatere markering: ' + error.message, 'error');
    }
  },
  
  // ===== RESIZABLE PANELS FUNCTIONALITY =====
  
  resizing: {
    isResizing: false,
    currentHandle: null,
    startX: 0,
    startWidth: 0
  },
  
  makeResizable() {
    const handles = document.querySelectorAll('.resize-handle');
    
    handles.forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        this.resizing.isResizing = true;
        this.resizing.currentHandle = handle.dataset.resize;
        this.resizing.startX = e.clientX;
        
        if (handle.dataset.resize === 'folders') {
          const panel = document.querySelector('.email-folders-tree');
          this.resizing.startWidth = panel.offsetWidth;
        } else if (handle.dataset.resize === 'list') {
          const panel = document.querySelector('.email-list-panel');
          this.resizing.startWidth = panel.offsetWidth;
        }
        
        handle.classList.add('dragging');
        e.preventDefault();
      });
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!this.resizing.isResizing) return;
      
      const diff = e.clientX - this.resizing.startX;
      const newWidth = this.resizing.startWidth + diff;
      
      // Min/max constraints
      const minWidth = 150;
      const maxWidth = 600;
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      
      if (this.resizing.currentHandle === 'folders') {
        document.querySelector('.email-folders-tree').style.width = clampedWidth + 'px';
      } else if (this.resizing.currentHandle === 'list') {
        document.querySelector('.email-list-panel').style.width = clampedWidth + 'px';
      }
    });
    
    document.addEventListener('mouseup', () => {
      if (this.resizing.isResizing) {
        document.querySelectorAll('.resize-handle').forEach(h => h.classList.remove('dragging'));
        this.resizing.isResizing = false;
        
        // Save preferences to localStorage
        this.saveLayoutPreferences();
      }
    });
  },
  
  saveLayoutPreferences() {
    const prefs = {
      foldersWidth: document.querySelector('.email-folders-tree').offsetWidth,
      listWidth: document.querySelector('.email-list-panel').offsetWidth
    };
    localStorage.setItem('emailLayoutPrefs', JSON.stringify(prefs));
  },
  
  loadLayoutPreferences() {
    const prefs = localStorage.getItem('emailLayoutPrefs');
    if (prefs) {
      try {
        const parsed = JSON.parse(prefs);
        const foldersTree = document.querySelector('.email-folders-tree');
        const listPanel = document.querySelector('.email-list-panel');
        
        if (parsed.foldersWidth && foldersTree) {
          foldersTree.style.width = parsed.foldersWidth + 'px';
        }
        if (parsed.listWidth && listPanel) {
          listPanel.style.width = parsed.listWidth + 'px';
        }
      } catch (error) {
        console.error('Error loading layout preferences:', error);
      }
    }
  },
  
  // ===== FOLDER MANAGEMENT FUNCTIONALITY =====
  
  contextMenuFolderId: null,
  customFolders: [],
  
  showFolderContextMenu(event, folderId) {
    event.preventDefault();
    
    this.contextMenuFolderId = folderId;
    const menu = document.getElementById('folder-context-menu');
    
    if (menu) {
      menu.style.left = event.pageX + 'px';
      menu.style.top = event.pageY + 'px';
      menu.classList.add('active');
    }
    
    // Close any other context menus
    const emailContextMenu = document.getElementById('context-menu');
    if (emailContextMenu) {
      emailContextMenu.classList.remove('active');
    }
  },
  
  async createNewFolder() {
    const menu = document.getElementById('folder-context-menu');
    if (menu) menu.classList.remove('active');
    
    const folderName = prompt('Indtast mappe navn:');
    if (!folderName) return;
    
    try {
      const result = await apiCall('/api/email/folders', {
        method: 'POST',
        body: JSON.stringify({
          name: folderName,
          parent_folder: this.contextMenuFolderId !== 'inbox' && this.contextMenuFolderId !== 'starred' && this.contextMenuFolderId !== 'sent' ? this.contextMenuFolderId : null
        })
      });
      
      this.showNotification('Mappe oprettet!', 'success');
      this.customFolders.push(result);
      this.renderCustomFolders();
    } catch (error) {
      console.error('Error creating folder:', error);
      this.showNotification('Kunne ikke oprette mappe: ' + error.message, 'error');
    }
  },
  
  async renameFolder() {
    const menu = document.getElementById('folder-context-menu');
    if (menu) menu.classList.remove('active');
    
    // Can't rename built-in folders
    if (['inbox', 'starred', 'sent'].includes(this.contextMenuFolderId)) {
      this.showNotification('Kan ikke omdøbe system mapper', 'warning');
      return;
    }
    
    const folder = this.customFolders.find(f => f.id === this.contextMenuFolderId);
    if (!folder) return;
    
    const newName = prompt('Nyt navn:', folder.name);
    if (!newName) return;
    
    try {
      await apiCall(`/api/email/folders/${this.contextMenuFolderId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: newName })
      });
      
      this.showNotification('Mappe omdøbt!', 'success');
      folder.name = newName;
      this.renderCustomFolders();
    } catch (error) {
      console.error('Error renaming folder:', error);
      this.showNotification('Kunne ikke omdøbe mappe: ' + error.message, 'error');
    }
  },
  
  async deleteFolder() {
    const menu = document.getElementById('folder-context-menu');
    if (menu) menu.classList.remove('active');
    
    // Can't delete built-in folders
    if (['inbox', 'starred', 'sent'].includes(this.contextMenuFolderId)) {
      this.showNotification('Kan ikke slette system mapper', 'warning');
      return;
    }
    
    if (!confirm('Er du sikker på at du vil slette denne mappe?')) return;
    
    try {
      await apiCall(`/api/email/folders/${this.contextMenuFolderId}`, {
        method: 'DELETE'
      });
      
      this.showNotification('Mappe slettet!', 'success');
      this.customFolders = this.customFolders.filter(f => f.id !== this.contextMenuFolderId);
      this.renderCustomFolders();
    } catch (error) {
      console.error('Error deleting folder:', error);
      this.showNotification('Kunne ikke slette mappe: ' + error.message, 'error');
    }
  },
  
  async markAllAsRead() {
    const menu = document.getElementById('folder-context-menu');
    if (menu) menu.classList.remove('active');
    
    // Mark all emails in current folder as read
    let markedCount = 0;
    for (const email of this.emails) {
      if (!email.is_read) {
        try {
          await apiCall(`/api/email/emails/${email.id}/read`, {
            method: 'POST'
          });
          email.is_read = true;
          email.unread = false;
          markedCount++;
        } catch (error) {
          console.error(`Error marking email ${email.id} as read:`, error);
        }
      }
    }
    
    if (markedCount > 0) {
      this.showNotification(`${markedCount} email(s) markeret som læst`, 'success');
      this.renderEmailList();
      this.updateFolderCounts();
    } else {
      this.showNotification('Alle emails er allerede læst', 'info');
    }
  },
  
  async loadCustomFolders() {
    try {
      const folders = await apiCall('/api/email/folders');
      this.customFolders = Array.isArray(folders) ? folders : [];
      this.renderCustomFolders();
    } catch (error) {
      console.error('Error loading custom folders:', error);
    }
  },
  
  renderCustomFolders() {
    const container = document.getElementById('custom-folders-list');
    if (!container) return;
    
    if (this.customFolders.length === 0) {
      container.innerHTML = '';
      return;
    }
    
    // Build and render folder tree (Phase 2)
    const tree = this.buildFolderTree(this.customFolders);
    
    container.innerHTML = `
      <hr style="border: none; border-top: 1px solid #ccc; margin: 5px 0;">
      <div style="padding: 5px 10px; font-weight: bold; font-size: 11px;">Dine mapper:</div>
      ${this.renderFolderTree(tree)}
    `;
  },
  
  // ===== PHASE 1: EMAIL-TO-FOLDER MOVEMENT =====
  
  // Show folder picker modal
  showFolderPicker() {
    const contextMenu = document.getElementById('context-menu');
    if (contextMenu) contextMenu.classList.remove('active');
    
    const dialog = document.getElementById('folder-picker-dialog');
    const overlay = document.getElementById('folder-picker-overlay');
    const list = document.getElementById('folder-picker-list');
    
    // Render folders
    list.innerHTML = `
      <div class="folder-picker-item" onclick="emailClient.selectFolderForMove(null)">
        📥 Indbakke
      </div>
      ${this.customFolders.map(f => `
        <div class="folder-picker-item" onclick="emailClient.selectFolderForMove(${f.id})">
          📁 ${this.escapeHtml(f.name)}
        </div>
      `).join('')}
    `;
    
    dialog.classList.add('active');
    overlay.classList.add('active');
    
    // Center dialog
    dialog.style.left = '50%';
    dialog.style.top = '50%';
    dialog.style.transform = 'translate(-50%, -50%)';
  },
  
  selectFolderForMove(folderId) {
    this.selectedFolderForMove = folderId;
    document.querySelectorAll('.folder-picker-item').forEach(item => {
      item.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');
  },
  
  closeFolderPicker() {
    const dialog = document.getElementById('folder-picker-dialog');
    const overlay = document.getElementById('folder-picker-overlay');
    if (dialog) dialog.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    this.selectedFolderForMove = null;
  },
  
  async moveEmailToSelectedFolder() {
    const emailId = this.contextMenuEmailId || this.currentEmailId;
    if (!emailId) return;
    
    try {
      await apiCall(`/api/email/emails/${emailId}/move`, {
        method: 'PUT',
        body: JSON.stringify({ folder_id: this.selectedFolderForMove })
      });
      
      this.showNotification('Email flyttet!', 'success');
      this.closeFolderPicker();
      
      // Remove from current list
      this.emails = this.emails.filter(e => e.id !== emailId);
      this.renderEmailList();
      this.updateFolderCounts();
    } catch (error) {
      this.showNotification('Kunne ikke flytte email: ' + error.message, 'error');
    }
  },
  
  // Email drag-and-drop handlers
  handleEmailDragStart(event, emailId) {
    this.draggedEmailId = emailId;
    event.dataTransfer.effectAllowed = 'move';
    event.currentTarget.style.opacity = '0.5';
  },
  
  handleFolderDragOver(event) {
    event.preventDefault();
    
    // If dragging email, show folder highlight
    if (this.draggedEmailId) {
      event.currentTarget.style.background = '#e0e8ff';
      return;
    }
    
    // If dragging folder, show drop zone indicator (Phase 3)
    if (this.draggedFolderId) {
      const rect = event.currentTarget.getBoundingClientRect();
      const y = event.clientY - rect.top;
      
      // Remove all drop indicators
      document.querySelectorAll('.folder-tree-item').forEach(el => {
        el.style.borderTop = '';
        el.style.borderBottom = '';
        el.style.background = '';
      });
      
      if (y < rect.height / 3) {
        // Drop above
        event.currentTarget.style.borderTop = '2px solid #2196F3';
      } else if (y > (rect.height * 2) / 3) {
        // Drop below
        event.currentTarget.style.borderBottom = '2px solid #2196F3';
      } else {
        // Drop on
        event.currentTarget.style.background = '#e0e8ff';
      }
    }
  },
  
  handleFolderDragLeave(event) {
    event.currentTarget.style.background = '';
    event.currentTarget.style.borderTop = '';
    event.currentTarget.style.borderBottom = '';
  },
  
  async handleEmailDropOnFolder(event, folderId) {
    event.preventDefault();
    event.currentTarget.style.background = '';
    
    if (!this.draggedEmailId) return;
    
    try {
      await apiCall(`/api/email/emails/${this.draggedEmailId}/move`, {
        method: 'PUT',
        body: JSON.stringify({ folder_id: folderId })
      });
      
      this.showNotification('Email flyttet!', 'success');
      
      // Remove from list
      this.emails = this.emails.filter(e => e.id !== this.draggedEmailId);
      this.renderEmailList();
      this.updateFolderCounts();
      
      this.draggedEmailId = null;
    } catch (error) {
      this.showNotification('Kunne ikke flytte email: ' + error.message, 'error');
    }
  },
  
  // ===== PHASE 2: NESTED FOLDER TREE =====
  
  buildFolderTree(folders) {
    const tree = [];
    const map = {};
    
    // Create map
    folders.forEach(folder => {
      folder.children = [];
      folder.isExpanded = this.folderTreeExpanded[folder.id] !== false; // Default expanded
      map[folder.id] = folder;
    });
    
    // Build tree
    folders.forEach(folder => {
      if (folder.parent_folder && map[folder.parent_folder]) {
        map[folder.parent_folder].children.push(folder);
      } else {
        tree.push(folder);
      }
    });
    
    // Sort by sort_order then name
    const sortFolders = (folders) => {
      folders.sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return a.name.localeCompare(b.name);
      });
      folders.forEach(f => {
        if (f.children && f.children.length > 0) {
          sortFolders(f.children);
        }
      });
    };
    
    sortFolders(tree);
    return tree;
  },
  
  renderFolderTree(folders, depth = 0) {
    return folders.map(folder => {
      const hasChildren = folder.children && folder.children.length > 0;
      const indent = depth * 20; // 20px per level
      const folderId = `custom_${folder.id}`;
      
      return `
        <div class="folder-tree-item" 
             style="padding-left: ${indent + 15}px"
             data-folder="${folderId}"
             draggable="true"
             ondragstart="emailClient.handleFolderDragStart(event, ${folder.id})"
             ondragend="emailClient.handleFolderDragEnd(event)"
             onclick="emailClient.handleFolderClick(event, '${folderId}', ${folder.id})"
             oncontextmenu="emailClient.showFolderContextMenu(event, ${folder.id})"
             ondragover="emailClient.handleFolderDragOver(event)"
             ondrop="emailClient.handleFolderDrop(event, ${folder.id})"
             ondragleave="emailClient.handleFolderDragLeave(event)">
          ${hasChildren ? `
            <span class="folder-expand-arrow" onclick="event.stopPropagation(); emailClient.toggleFolderExpansion(${folder.id})" style="cursor: pointer; width: 16px; display: inline-block;">
              ${folder.isExpanded ? '▼' : '▶'}
            </span>
          ` : '<span style="width: 16px; display: inline-block;"></span>'}
          📁 ${this.escapeHtml(folder.name)}
        </div>
        ${hasChildren && folder.isExpanded ? this.renderFolderTree(folder.children, depth + 1) : ''}
      `;
    }).join('');
  },
  
  handleFolderClick(event, folderId, folderIdNum) {
    // Prevent click when clicking arrow
    if (event.target.classList.contains('folder-expand-arrow')) return;
    
    // Prevent click if we were just dragging
    if (this.isDraggingFolder) {
      this.isDraggingFolder = false;
      return;
    }
    
    this.changeFolder(folderId, folderIdNum);
  },
  
  toggleFolderExpansion(folderId) {
    this.folderTreeExpanded[folderId] = !this.folderTreeExpanded[folderId];
    this.renderCustomFolders();
  },
  
  // ===== PHASE 3: FOLDER DRAG-AND-DROP REORDERING =====
  
  handleFolderDragStart(event, folderId) {
    // Don't drag if clicking arrow
    if (event.target.classList.contains('folder-expand-arrow')) {
      event.preventDefault();
      return;
    }
    
    this.isDraggingFolder = true;
    this.draggedFolderId = folderId;
    event.dataTransfer.effectAllowed = 'move';
    event.currentTarget.style.opacity = '0.5';
  },
  
  handleFolderDragEnd(event) {
    // Reset drag state
    event.currentTarget.style.opacity = '';
    
    // Delay resetting the flag to ensure click doesn't fire
    setTimeout(() => {
      this.isDraggingFolder = false;
      this.draggedFolderId = null;
    }, 100);
  },
  
  async handleFolderDrop(event, targetFolderId) {
    event.preventDefault();
    event.currentTarget.style.background = '';
    event.currentTarget.style.borderTop = '';
    event.currentTarget.style.borderBottom = '';
    
    // If dropping email, use existing handler
    if (this.draggedEmailId) {
      return this.handleEmailDropOnFolder(event, targetFolderId);
    }
    
    // If dropping folder
    if (!this.draggedFolderId || this.draggedFolderId === targetFolderId) {
      this.draggedFolderId = null;
      this.isDraggingFolder = false;
      return;
    }
    
    // Detect drop position
    const rect = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - rect.top;
    
    if (y < rect.height / 3) {
      // Drop above - reorder
      await this.reorderFolder(this.draggedFolderId, targetFolderId, 'before');
    } else if (y > (rect.height * 2) / 3) {
      // Drop below - reorder
      await this.reorderFolder(this.draggedFolderId, targetFolderId, 'after');
    } else {
      // Drop on - nest as subfolder
      await this.nestFolder(this.draggedFolderId, targetFolderId);
    }
    
    // Reset opacity
    document.querySelectorAll('.folder-tree-item').forEach(el => {
      el.style.opacity = '';
    });
    
    this.draggedFolderId = null;
  },
  
  async nestFolder(folderId, parentFolderId) {
    // Prevent nesting folder into itself or its children
    if (folderId === parentFolderId) {
      this.showNotification('Kan ikke flytte mappe ind i sig selv', 'warning');
      return;
    }
    
    try {
      await apiCall(`/api/email/folders/${folderId}/reorder`, {
        method: 'PUT',
        body: JSON.stringify({
          parent_folder: parentFolderId,
          sort_order: 999 // Put at end
        })
      });
      
      this.showNotification('Mappe flyttet!', 'success');
      await this.loadCustomFolders();
    } catch (error) {
      this.showNotification('Kunne ikke flytte mappe: ' + error.message, 'error');
    }
  },
  
  async reorderFolder(folderId, targetFolderId, position) {
    const target = this.customFolders.find(f => f.id === targetFolderId);
    if (!target) return;
    
    const newSortOrder = position === 'before' ? target.sort_order - 1 : target.sort_order + 1;
    
    try {
      await apiCall(`/api/email/folders/${folderId}/reorder`, {
        method: 'PUT',
        body: JSON.stringify({
          parent_folder: target.parent_folder,
          sort_order: newSortOrder
        })
      });
      
      this.showNotification('Mappe omordnet!', 'success');
      await this.loadCustomFolders();
    } catch (error) {
      this.showNotification('Kunne ikke omordne mappe: ' + error.message, 'error');
    }
  },
  
  // ===== NEW COMPOSE DIALOG FEATURES =====
  
  // File attachments
  selectedFiles: [],
  
  // Strip HTML tags from text
  stripHtml(html) {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  },
  
  // Toggle CC/BCC fields
  toggleCcBcc() {
    const fields = document.getElementById('cc-bcc-fields');
    if (fields) {
      fields.style.display = fields.style.display === 'none' ? 'block' : 'none';
    }
  },
  
  // Handle file selection
  handleFileSelect() {
    const input = document.getElementById('compose-files');
    if (!input || !input.files) return;
    
    this.selectedFiles = Array.from(input.files);
    this.updateAttachmentList();
  },
  
  // Update attachment list display
  updateAttachmentList() {
    const list = document.getElementById('attachment-list');
    if (!list) return;
    
    if (this.selectedFiles.length === 0) {
      list.innerHTML = '';
      return;
    }
    
    list.innerHTML = this.selectedFiles.map((file, index) => `
      <div style="padding: 3px; background: #f0f0f0; margin-bottom: 2px; display: flex; justify-content: space-between; align-items: center;">
        <span>📎 ${this.escapeHtml(file.name)} (${this.formatFileSize(file.size)})</span>
        <button onclick="emailClient.removeAttachment(${index})" style="padding: 2px 6px; cursor: pointer;">✕</button>
      </div>
    `).join('');
  },
  
  // Remove attachment
  removeAttachment(index) {
    this.selectedFiles.splice(index, 1);
    this.updateAttachmentList();
    
    // Reset file input
    const input = document.getElementById('compose-files');
    if (input) {
      input.value = '';
    }
  },
  
  // Update character count
  updateCharCount() {
    const body = document.getElementById('compose-body');
    const counter = document.getElementById('char-count');
    
    if (body && counter) {
      const count = body.value.length;
      counter.textContent = `${count} tegn`;
    }
  },
  
  // Signature management
  editSignature() {
    const dialog = document.getElementById('signature-dialog');
    const overlay = document.getElementById('signature-overlay');
    const textarea = document.getElementById('signature-text');
    
    if (!dialog || !overlay || !textarea) return;
    
    // Load current signature
    const signature = localStorage.getItem('emailSignature') || '';
    textarea.value = signature;
    
    dialog.classList.add('active');
    overlay.classList.add('active');
    
    // Center dialog
    dialog.style.left = '50%';
    dialog.style.top = '50%';
    dialog.style.transform = 'translate(-50%, -50%)';
  },
  
  closeSignatureEditor() {
    const dialog = document.getElementById('signature-dialog');
    const overlay = document.getElementById('signature-overlay');
    
    if (dialog) dialog.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
  },
  
  saveSignature() {
    const textarea = document.getElementById('signature-text');
    if (!textarea) return;
    
    localStorage.setItem('emailSignature', textarea.value);
    this.showNotification('Signatur gemt!', 'success');
    this.closeSignatureEditor();
    
    // Update signature in current compose if open
    this.updateSignaturePreview();
  },
  
  updateSignaturePreview() {
    const body = document.getElementById('compose-body');
    const includeSignature = document.getElementById('include-signature');
    
    if (!body || !includeSignature) return;
    
    const signature = localStorage.getItem('emailSignature') || '';
    
    if (includeSignature.checked && signature) {
      // Remove old signature if exists
      let currentBody = body.value;
      const signatureMarker = '\n\n-- \n';
      const markerIndex = currentBody.indexOf(signatureMarker);
      
      if (markerIndex !== -1) {
        currentBody = currentBody.substring(0, markerIndex);
      }
      
      // Add signature
      body.value = currentBody + signatureMarker + signature;
    }
    
    this.updateCharCount();
  },
  
  // Draft management - Multiple drafts support
  currentDraftId: null, // Track which draft we're editing
  
  loadDrafts() {
    try {
      const drafts = localStorage.getItem('emailDrafts');
      return drafts ? JSON.parse(drafts) : [];
    } catch (error) {
      console.error('Error loading drafts:', error);
      return [];
    }
  },
  
  saveDraft() {
    const to = document.getElementById('compose-to').value.trim();
    const subject = document.getElementById('compose-subject').value.trim();
    const body = document.getElementById('compose-body').value.trim();
    
    if (!to && !subject && !body) {
      this.showNotification('Kladden er tom', 'warning');
      return;
    }
    
    const drafts = this.loadDrafts();
    
    const draft = {
      id: this.currentDraftId || Date.now(),
      to: document.getElementById('compose-to').value,
      cc: document.getElementById('compose-cc').value,
      bcc: document.getElementById('compose-bcc').value,
      subject: document.getElementById('compose-subject').value || '(Intet emne)',
      body: document.getElementById('compose-body').value,
      timestamp: new Date().toISOString()
    };
    
    // Update existing or add new
    const existingIndex = drafts.findIndex(d => d.id === draft.id);
    if (existingIndex >= 0) {
      drafts[existingIndex] = draft;
    } else {
      drafts.push(draft);
      this.currentDraftId = draft.id;
    }
    
    localStorage.setItem('emailDrafts', JSON.stringify(drafts));
    
    // Show notice
    const notice = document.getElementById('draft-notice');
    if (notice) {
      notice.style.display = 'block';
      setTimeout(() => {
        notice.style.display = 'none';
      }, 2000);
    }
    
    this.showNotification('Kladde gemt!', 'success');
    this.updateDraftCount();
  },
  
  openDraft(draftId) {
    const drafts = this.loadDrafts();
    const draft = drafts.find(d => d.id === draftId);
    
    if (!draft) {
      console.error('Draft not found:', draftId);
      return;
    }
    
    // Set current draft ID BEFORE opening compose
    this.currentDraftId = draft.id;
    
    // Open compose dialog
    const dialog = document.getElementById('compose-dialog');
    const overlay = document.getElementById('compose-overlay');
    
    if (!dialog || !overlay) return;

    dialog.classList.add('active', 'compose');
    overlay.classList.add('active');

    // Center dialog
    dialog.style.left = '50%';
    dialog.style.top = '50%';
    dialog.style.transform = 'translate(-50%, -50%)';
    
    // Fill fields with draft content
    document.getElementById('compose-to').value = draft.to || '';
    document.getElementById('compose-cc').value = draft.cc || '';
    document.getElementById('compose-bcc').value = draft.bcc || '';
    document.getElementById('compose-subject').value = draft.subject || '';
    document.getElementById('compose-body').value = draft.body || '';
    
    // Show CC/BCC if they were used
    if (draft.cc || draft.bcc) {
      document.getElementById('cc-bcc-fields').style.display = 'block';
    } else {
      document.getElementById('cc-bcc-fields').style.display = 'none';
    }
    
    // Reset file attachments
    this.selectedFiles = [];
    this.updateAttachmentList();
    
    // Update character count
    this.updateCharCount();
    
    // Focus on body field
    setTimeout(() => {
      document.getElementById('compose-body').focus();
    }, 100);
  },
  
  deleteDraft(draftId) {
    if (!confirm('Er du sikker på at du vil slette denne kladde?')) return;
    
    const drafts = this.loadDrafts();
    const filtered = drafts.filter(d => d.id !== draftId);
    localStorage.setItem('emailDrafts', JSON.stringify(filtered));
    
    this.showNotification('Kladde slettet', 'success');
    this.loadEmails(); // Refresh list if viewing drafts
    this.updateDraftCount();
  },
  
  updateDraftCount() {
    const drafts = this.loadDrafts();
    const countEl = document.getElementById('drafts-count');
    if (countEl) {
      countEl.textContent = `(${drafts.length})`;
    }
  },
  
  // Auto-save draft (debounced)
  autoSaveDraft() {
    clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => {
      const to = document.getElementById('compose-to').value.trim();
      const subject = document.getElementById('compose-subject').value.trim();
      const bodyEl = document.getElementById('compose-body');
      const body = bodyEl.innerHTML.trim(); // Use innerHTML for rich text
      
      if (to || subject || body) {
        const drafts = this.loadDrafts();
        
        const draft = {
          id: this.currentDraftId || Date.now(),
          to: document.getElementById('compose-to').value,
          cc: document.getElementById('compose-cc').value,
          bcc: document.getElementById('compose-bcc').value,
          subject: document.getElementById('compose-subject').value || '(Intet emne)',
          body: bodyEl.innerHTML, // Store HTML
          timestamp: new Date().toISOString()
        };
        
        // Update existing or add new
        const existingIndex = drafts.findIndex(d => d.id === draft.id);
        if (existingIndex >= 0) {
          drafts[existingIndex] = draft;
        } else {
          drafts.push(draft);
          this.currentDraftId = draft.id;
        }
        
        localStorage.setItem('emailDrafts', JSON.stringify(drafts));
        this.updateDraftCount();
      }
      
      this.updateCharCount();
    }, 2000); // Save after 2 seconds of no typing
  },
  
  // ===== RICH TEXT FORMATTING FUNCTIONS =====
  
  // Apply text formatting
  formatText(command, value = null) {
    // Focus on editor first
    const editor = document.getElementById('compose-body');
    editor.focus();
    
    // Execute formatting command
    document.execCommand(command, false, value);
    
    // Reset select values after use
    if (command === 'fontName' || command === 'fontSize') {
      event.target.selectedIndex = 0;
    }
  },
  
  // Insert hyperlink
  insertLink() {
    const editor = document.getElementById('compose-body');
    editor.focus();
    
    const url = prompt('Indtast URL:', 'https://');
    if (url && url !== 'https://') {
      document.execCommand('createLink', false, url);
    }
  },
  
  // Update character count (for rich text editor)
  updateCharCount() {
    const body = document.getElementById('compose-body');
    const counter = document.getElementById('char-count');
    
    if (body && counter) {
      // Get text content (without HTML tags)
      const text = body.textContent || body.innerText || '';
      const count = text.length;
      counter.textContent = `${count} tegn`;
    }
  },
  
  // Smart URL linkification - only linkify complete URLs (like Outlook/Word)
  smartLinkifyUrls(editor) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const cursorNode = range.startContainer;
    if (cursorNode.nodeType !== Node.TEXT_NODE) return;
    const text = cursorNode.textContent;
    const urlPattern = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/g;
    const matches = [...text.matchAll(urlPattern)];
    if (matches.length === 0) return;
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      const url = match[0];
      const startPos = match.index;
      const endPos = startPos + url.length;
      if (range.startOffset > startPos && range.startOffset <= endPos) continue;
      const fullUrl = url.startsWith('http') ? url : 'https://' + url;
      const link = document.createElement('a');
      link.href = fullUrl;
      link.target = '_blank';
      link.textContent = url;
      const beforeNode = document.createTextNode(text.substring(0, startPos));
      const afterNode = document.createTextNode(text.substring(endPos));
      const parent = cursorNode.parentNode;
      parent.insertBefore(beforeNode, cursorNode);
      parent.insertBefore(link, cursorNode);
      parent.insertBefore(afterNode, cursorNode);
      parent.removeChild(cursorNode);
      if (range.startOffset > endPos) {
        range.setStart(afterNode, range.startOffset - endPos);
      } else {
        range.setStart(afterNode, 0);
      }
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  },
  
  // Update formatting dropdowns to show current selection
  updateFormattingDropdowns() {
    try {
      const fontSelect = document.getElementById('font-family-select');
      const sizeSelect = document.getElementById('font-size-select');
      
      if (!fontSelect || !sizeSelect) return;
      
      // Get current font family
      const fontFamily = document.queryCommandValue('fontName');
      if (fontFamily) {
        const cleanFont = fontFamily.replace(/['"]/g, '');
        fontSelect.value = cleanFont || '';
      }
      
      // Get current font size
      const fontSize = document.queryCommandValue('fontSize');
      if (fontSize) {
        sizeSelect.value = fontSize || '';
      }
    } catch (error) {
      // Silently fail - selection might not be in editor
    }
  },
  
  // Handle image drop (inline images)
  async handleImageDrop(event, editor) {
    const files = event.dataTransfer.files;
    if (!files || files.length === 0) return;
    
    for (const file of files) {
      // Only accept images
      if (!file.type.startsWith('image/')) {
        this.showNotification('Kun billedfiler kan indsættes inline', 'warning');
        continue;
      }
      
      // Check file size (max 500KB)
      const maxSize = 500 * 1024; // 500KB
      if (file.size > maxSize) {
        this.showNotification(`Billede er for stort (${this.formatFileSize(file.size)}). Max 500KB`, 'warning');
        continue;
      }
      
      // Read file as base64
      const reader = new FileReader();
      reader.onload = (e) => {
        // Create image element
        const img = document.createElement('img');
        img.src = e.target.result;
        img.style.maxWidth = '600px';
        img.style.height = 'auto';
        img.style.display = 'block';
        img.style.margin = '10px 0';
        
        // Insert at cursor or at end
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.insertNode(img);
        } else {
          editor.appendChild(img);
        }
        
        this.showNotification('Billede indsat!', 'success');
      };
      
      reader.readAsDataURL(file);
    }
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
