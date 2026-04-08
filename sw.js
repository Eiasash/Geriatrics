const CACHE='shlav-a-v9.1';
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
  'explanations_cache.json',
];
const ALL_URLS=[...STATIC,...DATA];

self.addEventListener('message',e=>{
  if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting();
});

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
  // Pass-through for external APIs (no caching)
  if(url.hostname==='api.anthropic.com'||url.hostname.endsWith('.supabase.co')){
    e.respondWith(
      fetch(e.request).catch(()=>new Response(JSON.stringify({error:{message:'offline'}}),{status:503,headers:{'Content-Type':'application/json'}}))
    );
    return;
  }
  // Pass-through for CDN resources (supabase-js, fonts, etc.)
  if(url.hostname==='cdn.jsdelivr.net'||url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com'){
    e.respondWith(
      caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
        if(res.ok){const c=res.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));}
        return res;
      }).catch(()=>new Response('',{status:503})))
    );
    return;
  }
  // Network-first for JSON data files (get updates, cache fallback)
  if(DATA.some(d=>url.pathname.endsWith(d))){
    e.respondWith(
      fetch(e.request).then(res=>{
        if(res.ok){const c=res.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));}
        return res;
      }).catch(()=>caches.match(e.request))
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
