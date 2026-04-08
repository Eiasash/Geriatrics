const CACHE='shlav-a-v8.4';
const STATIC=[
  'shlav-a-mega.html',
  'manifest.json',
  'index.html',
];
const DATA=[
  'questions.json',
  'notes.json',
  'flashcards.json',
  'drugs.json',
];
const ALL_URLS=[...STATIC,...DATA];

self.addEventListener('install',e=>e.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(ALL_URLS)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',e=>e.waitUntil(
  caches.keys()
    .then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
));

self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  // Cache-first for JSON data files
  if(DATA.some(d=>url.pathname.endsWith(d))){
    e.respondWith(
      caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
        if(res.ok){const c=res.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));}
        return res;
      }))
    );
    return;
  }
  // Network-first for HTML (gets updates), cache fallback
  if(url.pathname.endsWith('.html')||url.pathname.endsWith('/')){
    e.respondWith(
      fetch(e.request).then(res=>{
        if(res.ok){const c=res.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));}
        return res;
      }).catch(()=>caches.match(e.request).then(r=>r||caches.match('shlav-a-mega.html')))
    );
    return;
  }
  // Cache-first for everything else (PDFs, etc)
  e.respondWith(
    caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
      if(res.ok&&!url.pathname.endsWith('.pdf')){const c=res.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));}
      return res;
    }).catch(()=>caches.match('shlav-a-mega.html')))
  );
});
