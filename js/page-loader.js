// Page Loader System for Dynamic Page Loading
class PageLoader {
    constructor() {
        this.currentPage = null;
        this.pageContainer = null;
        this.pageInitializers = {};
    }

    init() {
        this.pageContainer = document.getElementById('pageContainer');
        if (!this.pageContainer) {
            console.error('Page container not found');
            return;
        }
    }

    // Register page-specific initialization function
    registerPageInit(pageName, initFunction) {
        this.pageInitializers[pageName] = initFunction;
    }

    // Load page HTML from pages/ directory
    async loadPage(pageName) {
        try {
            const response = await fetch(`pages/${pageName}.html`);
            if (!response.ok) {
                throw new Error(`Failed to load page: ${pageName}`);
            }
            
            const html = await response.text();
            this.pageContainer.innerHTML = html;
            this.currentPage = pageName;

            // Re-render Lucide icons injected by the loaded page
            if (window.lucide) {
                try { lucide.createIcons(); } catch (e) { /* ignore */ }
            }

            // Call page-specific initialization if registered
            if (this.pageInitializers[pageName]) {
                this.pageInitializers[pageName]();
            }
            
            return true;
        } catch (error) {
            console.error('Page load error:', error);
            this.pageContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--color-red);">
                    <h2>⚠️ Fejl ved indlæsning af side</h2>
                    <p>Kunne ikke indlæse siden: ${pageName}</p>
                    <p style="font-size: 14px; color: #999;">${error.message}</p>
                </div>
            `;
            return false;
        }
    }
}

// Create global instance
window.pageLoader = new PageLoader();
// ============================================================
// Fælles avatar-komponent — bruges ALLE steder (header, feed,
// kolleger, chat, kommentarer). Billede rundt med fallback til
// initialer (maks 2 bogstaver: fornavn + efternavn) ved manglende
// eller fejlende billede. Teksten skalerer med cirklen.
// ============================================================
window.__avatarFail = function (img) {
    const el = img.parentNode;
    if (!el) return;
    el.classList.add('avatar-fallback');
    el.innerHTML = el.dataset.initials || '?';
};

window.renderAvatar = function (name, photoUrl, size) {
    size = size || 40;
    const raw = String(name || '?').trim();
    const parts = raw.split(/\s+/).filter(Boolean);
    const first = parts.length ? parts[0].charAt(0) : '';
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    const initials = (first + last).toUpperCase() || '?';
    const fs = Math.max(10, Math.round(size * 0.38));
    const style = `width:${size}px;height:${size}px;font-size:${fs}px;`;
    if (photoUrl) {
        return `<span class="avatar-circle" style="${style}" data-initials="${initials}" title="${raw}">` +
            `<img src="${photoUrl}" alt="${raw}" loading="lazy" onerror="window.__avatarFail(this)">` +
            `</span>`;
    }
    return `<span class="avatar-circle avatar-fallback" style="${style}" title="${raw}">${initials}</span>`;
};
