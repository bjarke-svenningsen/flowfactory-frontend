// Breeze Portal Service Worker
// Provides offline caching and PWA functionality

const CACHE_NAME = 'breeze-portal-v1';
const urlsToCache = [
  '/flowfactory-frontend/',
  '/flowfactory-frontend/dashboard.html',
  '/flowfactory-frontend/index.html',
  '/flowfactory-frontend/css/dashboard.css',
  '/flowfactory-frontend/css/login.css',
  '/flowfactory-frontend/css/windows-dialog.css',
  '/flowfactory-frontend/css/mobile.css',
  '/flowfactory-frontend/js/dashboard.js',
  '/flowfactory-frontend/js/login.js',
  '/flowfactory-frontend/js/api.js',
  '/flowfactory-frontend/logobreeze.png',
  '/flowfactory-frontend/favicon.svg'
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

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        
        // Clone the request
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest).then(response => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response
          const responseToCache = response.clone();
          
          // Cache the fetched response
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        });
      })
  );
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
