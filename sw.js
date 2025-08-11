// Service Worker for Shaare Zedek Geriatrics System
// Version: 2.0.0
// Last Updated: 2024

const CACHE_NAME = 'geriatrics-v2.0.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/offline.html',
  'https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;900&display=swap'
];

// Install event - cache essential files
self.addEventListener('install', event => {
  console.log('[ServiceWorker] Install');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[ServiceWorker] Caching app shell');
        // Create offline fallback page
        const offlinePageContent = `
          <!DOCTYPE html>
          <html lang="he" dir="rtl">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Offline - Shaare Zedek Geriatrics</title>
            <style>
              body {
                font-family: 'Heebo', Arial, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                text-align: center;
                direction: rtl;
              }
              .offline-container {
                padding: 40px;
                background: rgba(255,255,255,0.1);
                border-radius: 20px;
                backdrop-filter: blur(10px);
              }
              h1 { font-size: 48px; margin-bottom: 20px; }
              p { font-size: 18px; margin-bottom: 30px; }
              .offline-icon { font-size: 80px; margin-bottom: 20px; }
              .btn {
                background: white;
                color: #667eea;
                padding: 12px 30px;
                border-radius: 25px;
                text-decoration: none;
                font-weight: bold;
                display: inline-block;
                margin: 10px;
              }
            </style>
          </head>
          <body>
            <div class="offline-container">
              <div class="offline-icon">📵</div>
              <h1>אתה במצב אופליין</h1>
              <p>המערכת הגריאטרית זמינה גם ללא חיבור לאינטרנט</p>
              <p>כל הפרוטוקולים, המחשבונים והמידע החיוני נשמרו במכשירך</p>
              <a href="/" class="btn">חזור למערכת</a>
            </div>
          </body>
          </html>
        `;
        
        // Create a response for the offline page
        const offlineResponse = new Response(offlinePageContent, {
          headers: { 'Content-Type': 'text/html' }
        });
        
        // Cache the offline page
        return cache.put('/offline.html', offlineResponse)
          .then(() => cache.addAll(urlsToCache.filter(url => url !== '/offline.html')));
      })
      .then(() => {
        // Skip waiting to activate immediately
        self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Activate');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          console.log('[ServiceWorker] Serving from cache:', event.request.url);
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

          // Cache the fetched response for future use
          caches.open(CACHE_NAME)
            .then(cache => {
              // Only cache same-origin and HTTPS requests
              if (event.request.url.startsWith('http')) {
                cache.put(event.request, responseToCache);
              }
            });

          return response;
        }).catch(() => {
          // Network request failed, serve offline page for navigation requests
          if (event.request.destination === 'document') {
            return caches.match('/offline.html');
          }
          
          // For other requests, return a fallback response
          return new Response('Offline content not available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        });
      })
  );
});

// Background sync for data updates
self.addEventListener('sync', event => {
  console.log('[ServiceWorker] Background sync triggered');
  
  if (event.tag === 'sync-data') {
    event.waitUntil(
      // Sync local data with server when connection is restored
      syncDataWithServer()
    );
  }
});

// Push notifications for updates
self.addEventListener('push', event => {
  console.log('[ServiceWorker] Push received');
  
  const options = {
    body: event.data ? event.data.text() : 'עדכון חדש במערכת הגריאטרית',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'פתח מערכת',
        icon: '/checkmark.png'
      },
      {
        action: 'close',
        title: 'סגור',
        icon: '/xmark.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Shaare Zedek Geriatrics', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  console.log('[ServiceWorker] Notification click received');
  
  event.notification.close();

  if (event.action === 'explore') {
    // Open the app
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Helper function to sync data
async function syncDataWithServer() {
  try {
    // Get all clients
    const allClients = await clients.matchAll();
    
    // Send message to all clients to sync their data
    allClients.forEach(client => {
      client.postMessage({
        type: 'SYNC_REQUEST',
        timestamp: Date.now()
      });
    });
    
    console.log('[ServiceWorker] Data sync completed');
  } catch (error) {
    console.error('[ServiceWorker] Sync failed:', error);
  }
}

// Check for updates every hour
setInterval(() => {
  console.log('[ServiceWorker] Checking for updates...');
  
  // Check if there's a new version available
  fetch('/version.json')
    .then(response => response.json())
    .then(data => {
      if (data.version !== CACHE_NAME) {
        // Notify clients about the update
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'UPDATE_AVAILABLE',
              version: data.version
            });
          });
        });
      }
    })
    .catch(error => {
      console.log('[ServiceWorker] Update check failed:', error);
    });
}, 3600000); // Check every hour

// Message handler for client communication
self.addEventListener('message', event => {
  console.log('[ServiceWorker] Message received:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then(cache => cache.addAll(event.data.urls))
    );
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      })
    );
  }
});

console.log('[ServiceWorker] Loaded successfully');