// Theme functionality
function changeTheme(theme) {
    localStorage.setItem('theme', theme);
    applyTheme(theme);
    alert(`✅ Tema ændret til: ${theme === 'dark' ? '🌙 Mørkt' : theme === 'light' ? '☀️ Lyst' : '🔄 Automatisk'}`);
}

function applyTheme(theme) {
    const body = document.body;
    
    if (theme === 'dark') {
        // Body & main containers
        body.style.background = '#1a1a1a';
        body.style.color = '#e0e0e0';
        
        // Dashboard background
        const dashboard = document.querySelector('.dashboard');
        if (dashboard) dashboard.style.background = '#1a1a1a';
        
        // Top navigation
        const topNav = document.querySelector('.top-nav');
        if (topNav) {
            topNav.style.background = '#2a2a2a';
            topNav.style.borderBottom = '1px solid #404040';
        }
        
        // Sidebar
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.style.background = '#2a2a2a';
            sidebar.style.color = '#e0e0e0';
        }
        
        document.querySelectorAll('.sidebar h3').forEach(el => {
            el.style.color = '#ffffff';
        });
        
        document.querySelectorAll('.menu-item').forEach(el => {
            el.style.color = '#e0e0e0';
            el.addEventListener('mouseenter', function() {
                this.style.background = '#404040';
            });
            el.addEventListener('mouseleave', function() {
                if (!this.classList.contains('active')) {
                    this.style.background = 'transparent';
                }
            });
        });
        
        // Content area
        const contentArea = document.querySelector('.content-area');
        if (contentArea) {
            contentArea.style.background = '#1a1a1a';
        }
        
        // All cards
        document.querySelectorAll('.info-card, .create-post, .post-card, .file-explorer, .chat-container, .colleagues-grid > div').forEach(el => {
            el.style.background = '#2a2a2a';
            el.style.color = '#e0e0e0';
            el.style.borderColor = '#404040';
        });
        
        // Headings
        document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(el => {
            el.style.color = '#ffffff';
        });
        
        // Inputs & textareas
        document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="password"], textarea, select').forEach(el => {
            el.style.background = '#404040';
            el.style.color = '#ffffff';
            el.style.borderColor = '#555';
        });
        
        // Buttons - preserve their original colors but adjust for dark theme
        document.querySelectorAll('button').forEach(el => {
            if (!el.style.background || el.style.background === '') {
                el.style.background = '#404040';
                el.style.color = '#ffffff';
                el.style.borderColor = '#555';
            }
        });
        
        // Tables
        document.querySelectorAll('table, th, td').forEach(el => {
            el.style.background = '#2a2a2a';
            el.style.color = '#e0e0e0';
            el.style.borderColor = '#404040';
        });
        
        document.querySelectorAll('thead tr').forEach(el => {
            el.style.background = '#333';
        });
        
        // File explorer specific
        const explorerToolbar = document.querySelector('.explorer-toolbar');
        if (explorerToolbar) {
            explorerToolbar.style.background = '#2a2a2a';
            explorerToolbar.style.borderColor = '#404040';
        }
        
        const explorerTree = document.querySelector('.explorer-tree');
        if (explorerTree) {
            explorerTree.style.background = '#2a2a2a';
            explorerTree.style.borderColor = '#404040';
        }
        
        const statusbar = document.querySelector('.explorer-statusbar');
        if (statusbar) {
            statusbar.style.background = '#2a2a2a';
            statusbar.style.borderColor = '#404040';
            statusbar.style.color = '#e0e0e0';
        }
        
        // Chat specific
        const chatUsers = document.querySelector('.chat-users');
        if (chatUsers) {
            chatUsers.style.background = '#2a2a2a';
            chatUsers.style.borderColor = '#404040';
        }
        
    } else if (theme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(prefersDark ? 'dark' : 'light');
    } else {
        // Light theme - reset everything
        body.style.background = '';
        body.style.color = '';
        
        document.querySelectorAll('.dashboard, .top-nav, .sidebar, .content-area, .info-card, .create-post, .post-card, .file-explorer, .chat-container, .explorer-toolbar, .explorer-tree, .explorer-statusbar, .chat-users').forEach(el => {
            el.style.background = '';
            el.style.color = '';
            el.style.borderColor = '';
        });
        
        document.querySelectorAll('h1, h2, h3, h4, h5, h6, input, textarea, select, button, table, th, td, thead tr, .menu-item').forEach(el => {
            el.style.background = '';
            el.style.color = '';
            el.style.borderColor = '';
        });
    }
}

// Load saved theme on page load
function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    const select = document.getElementById('themeSelect');
    if (select) {
        select.value = savedTheme;
    }
    applyTheme(savedTheme);
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadTheme);
} else {
    loadTheme();
}
