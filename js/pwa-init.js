// PWA Initialization
// Register service worker and handle install prompt

let deferredPrompt;
let installButton;

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/flowfactory-frontend/service-worker.js')
      .then(registration => {
        console.log('✅ Service Worker registered:', registration);
      })
      .catch(error => {
        console.log('❌ Service Worker registration failed:', error);
      });
  });
}

// Listen for install prompt
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later
  deferredPrompt = e;
  
  // Show install button on mobile
  if (window.innerWidth <= 768) {
    showInstallPrompt();
  }
});

// Show install prompt
function showInstallPrompt() {
  if (!deferredPrompt) return;
  
  // Create install prompt UI
  const promptDiv = document.createElement('div');
  promptDiv.id = 'pwa-install-prompt';
  promptDiv.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 15px 20px;
    border-radius: 10px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    z-index: 9999;
    display: flex;
    justify-content: space-between;
    align-items: center;
    animation: slideUp 0.3s ease;
  `;
  
  promptDiv.innerHTML = `
    <div>
      <div style="font-weight: 600; margin-bottom: 5px;">📱 Installer Breeze Portal</div>
      <div style="font-size: 12px; opacity: 0.9;">Tilføj til hjemmeskærm for hurtig adgang</div>
    </div>
    <div style="display: flex; gap: 10px;">
      <button id="pwa-install-btn" style="padding: 8px 16px; background: white; color: #667eea; border: none; border-radius: 5px; font-weight: 600; cursor: pointer;">
        Installer
      </button>
      <button id="pwa-dismiss-btn" style="padding: 8px 16px; background: rgba(255,255,255,0.2); color: white; border: none; border-radius: 5px; cursor: pointer;">
        ✕
      </button>
    </div>
  `;
  
  document.body.appendChild(promptDiv);
  
  // Add animation CSS
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideUp {
      from { transform: translateY(100px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  // Install button click
  document.getElementById('pwa-install-btn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('✅ User accepted install');
    } else {
      console.log('❌ User dismissed install');
    }
    
    deferredPrompt = null;
    promptDiv.remove();
  });
  
  // Dismiss button
  document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
    promptDiv.remove();
  });
}

// Mobile menu toggle
let menuOpen = false;

function initMobileMenu() {
  // Only add hamburger on mobile
  if (window.innerWidth > 768) return;
  
  // Create hamburger button
  const hamburger = document.createElement('button');
  hamburger.id = 'mobile-menu-toggle';
  hamburger.innerHTML = '☰';
  hamburger.style.cssText = `
    position: fixed;
    top: 15px;
    left: 15px;
    z-index: 9998;
    background: #667eea;
    color: white;
    border: none;
    width: 44px;
    height: 44px;
    border-radius: 8px;
    font-size: 24px;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    display: none;
  `;
  
  // Show hamburger only on mobile
  if (window.innerWidth <= 480) {
    hamburger.style.display = 'block';
  }
  
  document.body.appendChild(hamburger);
  
  // Toggle menu
  hamburger.addEventListener('click', () => {
    const sidebar = document.querySelector('.sidebar');
    menuOpen = !menuOpen;
    
    if (menuOpen) {
      sidebar.style.position = 'fixed';
      sidebar.style.top = '60px';
      sidebar.style.left = '0';
      sidebar.style.bottom = '0';
      sidebar.style.zIndex = '9997';
      sidebar.style.width = '250px';
      sidebar.style.boxShadow = '2px 0 10px rgba(0,0,0,0.3)';
      sidebar.style.display = 'flex';
      sidebar.style.flexDirection = 'column';
      hamburger.innerHTML = '✕';
    } else {
      sidebar.style.position = '';
      sidebar.style.top = '';
      sidebar.style.left = '';
      sidebar.style.bottom = '';
      sidebar.style.zIndex = '';
      sidebar.style.width = '';
      sidebar.style.boxShadow = '';
      hamburger.innerHTML = '☰';
    }
  });
  
  // Close menu when clicking menu item
  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
      if (menuOpen && window.innerWidth <= 480) {
        const sidebar = document.querySelector('.sidebar');
        sidebar.style.position = '';
        menuOpen = false;
        hamburger.innerHTML = '☰';
      }
    });
  });
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
});

// Reinitialize on resize
window.addEventListener('resize', () => {
  const hamburger = document.getElementById('mobile-menu-toggle');
  if (window.innerWidth <= 480) {
    if (hamburger) hamburger.style.display = 'block';
  } else {
    if (hamburger) hamburger.style.display = 'none';
    // Reset menu if open
    if (menuOpen) {
      const sidebar = document.querySelector('.sidebar');
      sidebar.style.position = '';
      menuOpen = false;
    }
  }
});
