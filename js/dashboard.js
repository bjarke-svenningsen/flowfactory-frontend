// Dashboard Core Functions

window.onload = function() {
    // Initialize page loader
    window.pageLoader.init();
    
    // Load user data
    loadUserData();
    
    // SSE + opkaldsnotifikationer paa ALLE sider (ikke kun chat-siden)
    if (sessionStorage.getItem('token') && typeof initChat === 'function') initChat();
    
    // Check URL hash first, then fallback to sessionStorage or default
    const hash = window.location.hash;
    let initialPage = 'feed';
    
    if (hash) {
        // Hash exists - determine which page to load
        if (hash.startsWith('#/orders/')) {
            // Workspace or orders-related hash - load quotes page
            initialPage = 'quotes';
            showPage(initialPage, false); // Don't update hash - preserve workspace URL
        } else if (hash.startsWith('#quotes/')) {
            // Quotes tab hash (e.g., #quotes/orders) - load quotes page
            initialPage = 'quotes';
            showPage(initialPage, false); // Don't update hash - preserve tab hash
        } else {
            // Simple hash like #feed or #quotes
            const pageName = hash.substring(1);
            if (pageName) {
                initialPage = pageName;
            }
            showPage(initialPage); // Update hash normally
        }
    } else {
        // No hash - use sessionStorage or default
        initialPage = sessionStorage.getItem('currentPage') || 'feed';
        // Set initial hash
        window.location.hash = initialPage;
        showPage(initialPage);
    }
    
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
        // If we're already on quotes page, don't reload - just let quotes-core.js handle tab switch
        const currentPage = sessionStorage.getItem('currentPage');
        if (currentPage === 'quotes') {
            // Already on quotes page - no need to reload, tab switch already happened
            return;
        }
        // Not on quotes page yet - load it
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

    // Render immediately from cached data...
    renderUserData(JSON.parse(userData));

    // ...then refresh from server so avatar/profile changes show without re-login
    refreshCurrentUser();
}

function renderUserData(currentUser) {
    const initials = currentUser.name.split(' ').map(n => n[0]).join('');

    // Check for profile_image from server (persistent) or profilePhoto (old base64 - deprecated)
    if (currentUser.profile_image) {
        const imageUrl = '' + currentUser.profile_image;
        document.getElementById('navAvatar').style.backgroundImage = `url(${imageUrl})`;
        document.getElementById('navAvatar').style.backgroundSize = 'cover';
        document.getElementById('navAvatar').textContent = '';
    } else if (currentUser.profilePhoto) {
        // Old base64 format - still support for backwards compatibility
        document.getElementById('navAvatar').style.backgroundImage = `url(${currentUser.profilePhoto})`;
        document.getElementById('navAvatar').style.backgroundSize = 'cover';
        document.getElementById('navAvatar').textContent = '';
    } else {
        document.getElementById('navAvatar').textContent = initials;
    }

    document.getElementById('navUserName').textContent = currentUser.name;
    window.currentUser = currentUser;
    
    // Rolle-gating: Ledelsen = is_admin, alle andre = Montor.
    // Montorer: Feed, Min Profil, Chat & Video, Ordrestyring (igangvaerende, laesetilstand), Min Tid, Indstillinger.
    // Skjul Ledelsen-menuer (backend blokerer ogsaa med 403).
    const montorBlockedPages = ['files', 'colleagues', 'email', 'materials', 'admin'];
    document.querySelectorAll('.menu-item').forEach(item => {
        const page = item.dataset.page;
        if (page === 'materials') return; // MaterialsMenuItem styres nedenfor (admin-only som foer)
        if (!currentUser.is_admin && montorBlockedPages.includes(page)) {
            item.style.display = 'none';
        }
    });
    
    // Show Materialer menu item only for admins
    if (currentUser.is_admin) {
        document.getElementById('materialsMenuItem').style.display = 'block';
    }
}

async function refreshCurrentUser() {
    try {
        const res = await fetch('/api/users/me', {
            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.user) return;
        sessionStorage.setItem('currentUser', JSON.stringify(data.user));
        renderUserData(data.user);
    } catch (error) {
        // Offline or server error - keep cached data
        console.error('Could not refresh user data:', error);
    }
}

function logout() {
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('token');
    window.location.href = 'index.html';
}

async function showPage(pageName, updateHash = true) {
    // Redirect videocall to chat (after removing videocall page)
    if (pageName === 'videocall') {
        pageName = 'chat';
    }
    
    // Montor-guard: blokerede sider redirectes til Feed (backend blokerer ogsaa API'erne med 403)
    const montorBlockedPages = ['files', 'colleagues', 'email', 'materials', 'admin'];
    if (window.currentUser && !window.currentUser.is_admin && montorBlockedPages.includes(pageName)) {
        console.warn('[rolle] Side "' + pageName + '" er kun for Ledelsen - sender til Feed');
        pageName = 'feed';
        updateHash = true;
    }
    
    // Save current page to remember after refresh
    sessionStorage.setItem('currentPage', pageName);
    
    // Update URL hash (unless coming from hashchange event)
    // Use replaceState to avoid triggering hashchange event (which would cause double-load)
    if (updateHash) {
        history.replaceState(null, '', '#' + pageName);
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
        'colleagues': 4,
        'quotes': 5,
        'email': 6,
        'time': 7,
        'materials': 8,
        'settings': 9,
        'admin': 10
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
        // Don't force any specific view - let initQuotesPage() handle it based on hash
        // This prevents the "jump" when loading with a specific tab hash like #quotes/orders
        initQuotesPage();
    } else if (pageName === 'chat') {
        initChat();
    } else if (pageName === 'email') {
        // Email page initializes itself via js/email.js
        if (window.emailClient) {
            window.emailClient.init();
        }
    } else if (pageName === 'time') {
        // Time page will initialize itself via js/time.js
    } else if (pageName === 'materials') {
        // Materials page will initialize itself via js/materials.js
    }
}

// Dialog-system (moderne kort-stil; se css/windows-dialog.css)
let activeDialogResolve = null;

function showWindowsDialog(title, message, icon, buttons) {
    return new Promise((resolve) => {
        const dialog = document.getElementById('windowsDialog');
        const overlay = document.getElementById('windowsDialogOverlay');
        const dialogTitle = document.getElementById('windowsDialogTitle');
        const dialogIcon = document.getElementById('windowsDialogIcon');
        const dialogText = document.getElementById('windowsDialogText');
        const dialogButtons = document.getElementById('windowsDialogButtons');
        
        activeDialogResolve = resolve;
        dialogTitle.textContent = title;
        dialogIcon.textContent = icon || '';
        dialogText.innerHTML = message.replace(/\n/g, '<br>');
        
        dialogButtons.innerHTML = '';
        buttons.forEach((btn, i) => {
            const button = document.createElement('button');
            button.className = 'windows-btn' + (buttons.length === 1 || i === 0 ? ' primary' : '');
            button.textContent = btn.text;
            button.onclick = () => {
                activeDialogResolve = null;
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
    if (activeDialogResolve) {
        activeDialogResolve(null);
        activeDialogResolve = null;
    }
}

window.winAlert = function(message, title = 'Besked') {
    return showWindowsDialog(title, message, 'i', [
        { text: 'OK', value: true }
    ]);
};

window.winConfirm = function(message, title = 'Bekræft') {
    return showWindowsDialog(title, message, '?', [
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
        
        activeDialogResolve = resolve;
        dialogTitle.textContent = title;
        dialogIcon.textContent = '';
        dialogText.innerHTML = message.replace(/\n/g, '<br>') +
            '<input type="text" class="windows-dialog-input" id="windowsPromptInput">';
        
        const input = document.getElementById('windowsPromptInput');
        input.value = defaultValue == null ? '' : String(defaultValue);
        
        dialogButtons.innerHTML = '';
        
        const okBtn = document.createElement('button');
        okBtn.className = 'windows-btn primary';
        okBtn.textContent = 'OK';
        okBtn.onclick = () => {
            activeDialogResolve = null;
            const value = document.getElementById('windowsPromptInput').value;
            closeWindowsDialog();
            resolve(value);
        };
        dialogButtons.appendChild(okBtn);
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'windows-btn';
        cancelBtn.textContent = 'Annuller';
        cancelBtn.onclick = () => {
            activeDialogResolve = null;
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

// Esc lukker den aktive dialog (resolver som null/annulleret)
document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    const dialog = document.getElementById('windowsDialog');
    if (dialog && dialog.style.display === 'block') {
        e.stopImmediatePropagation();
        closeWindowsDialog();
    }
});
