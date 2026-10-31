// Theme functionality
function changeTheme(theme) {
    localStorage.setItem('theme', theme);
    applyTheme(theme);
    alert(` Tema ændret til: ${theme === 'dark' ? ' Mørkt' : theme === 'light' ? ' Lyst' : ' Automatisk'}`);
}

function applyTheme(theme) {
    const body = document.body;
    
    if (theme === 'dark') {
        // Body & main containers
        body.style.background = 'var(--bg-header)';
        body.style.color = 'var(--text)';
        
        // Dashboard background
        const dashboard = document.querySelector('.dashboard');
        if (dashboard) dashboard.style.background = 'var(--bg-header)';
        
        // Top navigation
        const topNav = document.querySelector('.top-nav');
        if (topNav) {
            topNav.style.background = 'var(--bg-header)';
            topNav.style.borderBottom = '1px solid var(--border)';
        }
        
        // Sidebar
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.style.background = 'var(--bg-header)';
            sidebar.style.color = 'var(--text)';
        }
        
        document.querySelectorAll('.sidebar h3').forEach(el => {
            el.style.color = 'var(--surface)';
        });
        
        document.querySelectorAll('.menu-item').forEach(el => {
            el.style.color = 'var(--text)';
            el.addEventListener('mouseenter', function() {
                this.style.background = 'var(--border)';
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
            contentArea.style.background = 'var(--bg-header)';
        }
        
        // All cards
        document.querySelectorAll('.info-card, .create-post, .post-card, .file-explorer, .chat-container, .colleagues-grid > div').forEach(el => {
            el.style.background = 'var(--bg-header)';
            el.style.color = 'var(--text)';
            el.style.borderColor = 'var(--border)';
        });
        
        // Headings
        document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(el => {
            el.style.color = 'var(--surface)';
        });
        
        // Inputs & textareas
        document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="password"], textarea, select').forEach(el => {
            el.style.background = 'var(--border)';
            el.style.color = 'var(--surface)';
            el.style.borderColor = 'var(--border)';
        });
        
        // Buttons - preserve their original colors but adjust for dark theme
        document.querySelectorAll('button').forEach(el => {
            if (!el.style.background || el.style.background === '') {
                el.style.background = 'var(--border)';
                el.style.color = 'var(--surface)';
                el.style.borderColor = 'var(--border)';
            }
        });
        
        // Tables
        document.querySelectorAll('table, th, td').forEach(el => {
            el.style.background = 'var(--bg-header)';
            el.style.color = 'var(--text)';
            el.style.borderColor = 'var(--border)';
        });
        
        document.querySelectorAll('thead tr').forEach(el => {
            el.style.background = 'var(--bg-header)';
        });
        
        // File explorer specific
        const explorerToolbar = document.querySelector('.explorer-toolbar');
        if (explorerToolbar) {
            explorerToolbar.style.background = 'var(--bg-header)';
            explorerToolbar.style.borderColor = 'var(--border)';
        }
        
        const explorerTree = document.querySelector('.explorer-tree');
        if (explorerTree) {
            explorerTree.style.background = 'var(--bg-header)';
            explorerTree.style.borderColor = 'var(--border)';
        }
        
        const statusbar = document.querySelector('.explorer-statusbar');
        if (statusbar) {
            statusbar.style.background = 'var(--bg-header)';
            statusbar.style.borderColor = 'var(--border)';
            statusbar.style.color = 'var(--text)';
        }
        
        // Chat specific
        const chatUsers = document.querySelector('.chat-users');
        if (chatUsers) {
            chatUsers.style.background = 'var(--bg-header)';
            chatUsers.style.borderColor = 'var(--border)';
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
