// Dashboard Core Functions

window.onload = function() {
    // Initialize page loader
    window.pageLoader.init();
    
    // Load user data
    loadUserData();
    
    // Check URL hash first, then fallback to sessionStorage or default
    const hash = window.location.hash;
    let initialPage = 'feed';
    
    if (hash) {
        // Hash exists - determine which page to load
        if (hash.startsWith('#/orders/')) {
            // Workspace or orders-related hash - load quotes page
            initialPage = 'quotes';
        } else if (hash.startsWith('#quotes/')) {
            // Quotes tab hash (e.g., #quotes/orders) - load quotes page
            initialPage = 'quotes';
        } else {
            // Simple hash like #feed or #quotes
            const pageName = hash.substring(1);
            if (pageName) {
                initialPage = pageName;
            }
        }
    } else {
        // No hash - use sessionStorage or default
        initialPage = sessionStorage.getItem('currentPage') || 'feed';
        // Set initial hash
        window.location.hash = initialPage;
    }
    
    showPage(initialPage);
    
    // Load admin data if admin
    if (window.currentUser && window.currentUser.is_admin) {
        loadAdminData();
    }
    
    // Handle browser back/forward buttons
    window.addEventListener('hashchange', handleHashChange);
};

function handleHashChange() {
    const hash = window.location.hash;
    
    if (!hash || hash === '#') {
        showPage('feed');
        return;
    }
    
    // Check if it's a workspace URL
    if (hash.startsWith('#/orders/')) {
        // Let the workspace restoration handle it
        // (already set up in quotes-workspace.js)
        showPage('quotes');
        return;
    }
    
    // Check if it's a quotes tab hash (e.g., #quotes/orders)
    if (hash.startsWith('#quotes/')) {
        // Load quotes page, let quotes-core.js handle the tab
        showPage('quotes', false);
        return;
    }
    
    // Simple page hash
    const pageName = hash.substring(1);
    if (pageName) {
        showPage(pageName, false); // Don't update hash again (avoid loop)
    }
}

function loadUserData() {
    const userData = sessionStorage.getItem('currentUser');
    if (!userData) {
        window.location.href = 'index.html';
        return;
    }

    const currentUser = JSON.parse(userData);
    const initials = currentUser.name.split(' ').map(n => n[0]).join('');

    if (currentUser.profilePhoto) {
        document.getElementById('navAvatar').style.backgroundImage = `url(${currentUser.profilePhoto})`;
        document.getElementById('navAvatar').style.backgroundSize = 'cover';
        document.getElementById('navAvatar').textContent = '';
    } else {
        document.getElementById('navAvatar').textContent = initials;
    }

    document.getElementById('navUserName').textContent = currentUser.name;
    window.currentUser = currentUser;
}

function logout() {
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('token');
    window.location.href = 'index.html';
}

async function showPage(pageName, updateHash = true) {
    // Save current page to remember after refresh
    sessionStorage.setItem('currentPage', pageName);
    
    // Update URL hash (unless coming from hashchange event)
    if (updateHash && !window.location.hash.startsWith('#/orders/')) {
        // Don't overwrite workspace URLs
        window.location.hash = pageName;
    }
    
    // Toggle email-mode class for wider layout on email page
    const mainContent = document.querySelector('.main-content');
    if (pageName === 'email') {
        mainContent.classList.add('email-mode');
    } else {
        mainContent.classList.remove('email-mode');
    }
    
    // Update menu active state
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Map menu items to page names
    const pageMapping = {
        'feed': 0,
        'profile': 1,
        'files': 2,
        'chat': 3,
        'videocall': 4,
        'colleagues': 5,
        'quotes': 6,
        'email': 7,
        'settings': 8,
        'admin': 9
    };
    
    const menuIndex = pageMapping[pageName];
    if (menuIndex !== undefined) {
        const menuItems = document.querySelectorAll('.menu-item');
        if (menuItems[menuIndex]) {
            menuItems[menuIndex].classList.add('active');
        }
    }
    
    // Load the page
    await window.pageLoader.loadPage(pageName);
    
    // Page-specific initialization that needs to happen after load
    if (pageName === 'feed') {
        loadPosts();
    } else if (pageName === 'files') {
        loadRealFiles();
    } else if (pageName === 'colleagues') {
        loadColleagues();
    } else if (pageName === 'quotes') {
        // Hide all quote sub-views when switching to quotes page
        const listView = document.getElementById('quotesListView');
        const formView = document.getElementById('quotesFormView');
        const previewView = document.getElementById('quotesPreviewView');
        const customersView = document.getElementById('quotesCustomersView');
        
        if (listView) listView.style.display = 'block';
        if (formView) formView.style.display = 'none';
        if (previewView) previewView.style.display = 'none';
        if (customersView) customersView.style.display = 'none';
        
        initQuotesPage();
    } else if (pageName === 'chat') {
        initChat();
    } else if (pageName === 'videocall') {
        loadVideoCallColleagues();
    } else if (pageName === 'email') {
        // Email page initializes itself via js/email.js
        if (window.emailClient) {
            window.emailClient.init();
        }
    }
}

// Windows Dialog System
function showWindowsDialog(title, message, icon, buttons) {
    return new Promise((resolve) => {
        const dialog = document.getElementById('windowsDialog');
        const overlay = document.getElementById('windowsDialogOverlay');
        const dialogTitle = document.getElementById('windowsDialogTitle');
        const dialogIcon = document.getElementById('windowsDialogIcon');
        const dialogText = document.getElementById('windowsDialogText');
        const dialogButtons = document.getElementById('windowsDialogButtons');
        
        dialogTitle.textContent = title;
        dialogIcon.textContent = icon;
        dialogText.innerHTML = message.replace(/\n/g, '<br>');
        
        dialogButtons.innerHTML = '';
        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.className = 'windows-btn';
            button.textContent = btn.text;
            button.onclick = () => {
                closeWindowsDialog();
                resolve(btn.value);
            };
            dialogButtons.appendChild(button);
        });
        
        overlay.style.display = 'block';
        dialog.style.display = 'block';
        
        setTimeout(() => {
            const firstBtn = dialogButtons.querySelector('.windows-btn');
            if (firstBtn) firstBtn.focus();
        }, 100);
    });
}

function closeWindowsDialog() {
    document.getElementById('windowsDialog').style.display = 'none';
    document.getElementById('windowsDialogOverlay').style.display = 'none';
}

window.winAlert = function(message, title = 'Besked') {
    return showWindowsDialog(title, message, 'ℹ️', [
        { text: 'OK', value: true }
    ]);
};

window.winConfirm = function(message, title = 'Bekræft') {
    return showWindowsDialog(title, message, '❓', [
        { text: 'Ja', value: true },
        { text: 'Nej', value: false }
    ]);
};

window.winPrompt = function(message, defaultValue = '', title = 'Indtast') {
    return new Promise((resolve) => {
        const dialog = document.getElementById('windowsDialog');
        const overlay = document.getElementById('windowsDialogOverlay');
        const dialogTitle = document.getElementById('windowsDialogTitle');
        const dialogIcon = document.getElementById('windowsDialogIcon');
        const dialogText = document.getElementById('windowsDialogText');
        const dialogButtons = document.getElementById('windowsDialogButtons');
        
        dialogTitle.textContent = title;
        dialogIcon.textContent = '✏️';
        dialogText.innerHTML = message.replace(/\n/g, '<br>') + 
            '<input type="text" class="windows-dialog-input" id="windowsPromptInput" value="' + defaultValue + '">';
        
        dialogButtons.innerHTML = '';
        
        const okBtn = document.createElement('button');
        okBtn.className = 'windows-btn';
        okBtn.textContent = 'OK';
        okBtn.onclick = () => {
            const value = document.getElementById('windowsPromptInput').value;
            closeWindowsDialog();
            resolve(value);
        };
        dialogButtons.appendChild(okBtn);
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'windows-btn';
        cancelBtn.textContent = 'Annuller';
        cancelBtn.onclick = () => {
            closeWindowsDialog();
            resolve(null);
        };
        dialogButtons.appendChild(cancelBtn);
        
        overlay.style.display = 'block';
        dialog.style.display = 'block';
        
        setTimeout(() => {
            const input = document.getElementById('windowsPromptInput');
            if (input) {
                input.focus();
                input.select();
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') okBtn.click();
                });
            }
        }, 100);
    });
};
