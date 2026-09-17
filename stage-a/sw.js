/* stage-a service worker — scope ./ only. Network first, cached copy when offline. */
const CACHE = 'stage-a-v1';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.add('./').catch(()=>{}))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('stage-a-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || !url.pathname.includes('/stage-a/')) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { caches.open(CACHE).then(c => c.put(e.request, r.clone())); return r; }
    /* a resolved-but-not-ok response (500/503/...) used to be returned as-is — only a
       network-level rejection (offline, DNS failure) fell back to the cache. A server error
       therefore blanked a page that was already cached and available. Fall back to cache
       for a not-ok navigation response too, same as a rejection; other requests (assets)
       still return the not-ok response as-is if nothing cached beats it. */
    if (e.request.mode === 'navigate') return caches.match(e.request).then(m => m || caches.match('./')).then(m => m || r);
    return r;
  }).catch(() => caches.match(e.request).then(m => m || caches.match('./'))));
});
