// SG Seest Gulvteknik Service Worker
// Provides offline caching and PWA functionality

const CACHE_NAME = 'breeze-portal-v75';
const urlsToCache = [
  '/',
  '/dashboard.html',
  '/index.html',
  '/css/dashboard.css',
    '/css/tokens.css',
  '/css/login.css',
  '/css/windows-dialog.css',
  '/css/mobile.css',
  '/js/dashboard.js',
  '/js/login.js',
  '/js/api.js',
  '/seestlogo.png',
  '/favicon.svg'
];

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.log('Cache failed:', err);
      })
  );
  self.skipWaiting();
});

// Fetch event - NETWORK FIRST for HTML/JS/CSS, then cache
self.addEventListener('fetch', event => {
  // Always fetch fresh HTML, JS, CSS files
  // Lad POST/PUT/DELETE og API/socket-trafik passere urÃ¸rt (POST mÃ¥ ikke caches, API mÃ¥ aldrig caches)
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/') || url.pathname.startsWith('/uploads/')) return;
  const shouldAlwaysFetch =
    event.request.url.includes('.html') ||
    event.request.url.includes('.js') ||
    event.request.url.includes('.css') ||
    event.request.url.includes('dashboard') ||
    event.request.url.includes('pages/');
  
  if (shouldAlwaysFetch) {
    // Network first - always get fresh version
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (!response || !response.ok) return response;
          // Cache the fresh response
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // Fallback to cache if offline
          return caches.match(event.request);
        })
    );
  } else {
    // Cache first for images, fonts, etc.
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          if (response) {
            return response;
          }
          
          const fetchRequest = event.request.clone();
          
          return fetch(fetchRequest).then(response => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
            
            return response;
          });
        })
    );
  }
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  return self.clients.claim();
});
