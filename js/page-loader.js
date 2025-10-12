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
            
            // Call page-specific initialization if registered
            if (this.pageInitializers[pageName]) {
                this.pageInitializers[pageName]();
            }
            
            return true;
        } catch (error) {
            console.error('Page load error:', error);
            this.pageContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #f44336;">
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
