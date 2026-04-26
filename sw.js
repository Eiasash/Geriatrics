const CACHE='shlav-a-v10.38.0';
const HTML_URLS=['shlav-a-mega.html','manifest.json','shared/fsrs.js','src/storage.js','src/sw-update.js','icons/icon-192.png','icons/icon-512.png'];
const FONT_URLS=['fonts/heebo-hebrew-400-normal.woff2','fonts/heebo-hebrew-500-normal.woff2','fonts/heebo-hebrew-600-normal.woff2','fonts/heebo-hebrew-700-normal.woff2','fonts/heebo-latin-400-normal.woff2','fonts/heebo-latin-500-normal.woff2','fonts/heebo-latin-600-normal.woff2','fonts/heebo-latin-700-normal.woff2','fonts/inter-latin-400-normal.woff2','fonts/inter-latin-500-normal.woff2','fonts/inter-latin-600-normal.woff2','fonts/inter-latin-700-normal.woff2'];
const JSON_DATA_URLS=['data/questions.json','data/topics.json','data/notes.json','data/drugs.json','data/flashcards.json','harrison_chapters.json','data/hazzard_chapters.json','data/grs8_chapters.json','data/grs8_question_pages.json','data/tabs.json','data/question_chapters.json','data/distractors.json','data/regulatory.json'];
const ALL_URLS=[...HTML_URLS,...JSON_DATA_URLS,...FONT_URLS];

// Supabase question-images: cache-first (images are immutable once uploaded)
const SUPA_IMG_PATTERN=/supabase\.co\/storage\/v1\/object\/public\/question-images\//;
const IMG_CACHE='shlav-img-v1';
const MAX_IMG_CACHE_ENTRIES=100;

// Textbook PDFs (Hazzard/Harrison/articles) and exam PDFs: cache-first on-demand.
// Not in ALL_URLS — pre-caching 170MB of PDFs would blow storage quotas.
// First open fetches from network + caches; subsequent reads are offline-ready.
const PDF_CACHE='shlav-pdf-v1';
const MAX_PDF_CACHE_ENTRIES=40; // LRU-lite cap to protect storage quota
const PDF_PATTERN=/\.pdf(\?|$)/i;

function trimCache(cacheName,max){
  caches.open(cacheName).then(cache=>cache.keys().then(keys=>{
    if(keys.length>max)cache.delete(keys[0]);
  }));
}

self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ALL_URLS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(ks=>Promise.all(
    // Preserve IMG_CACHE + PDF_CACHE across version bumps (on-demand LRU caches,
    // not tied to app version — trashing them forces users to re-download books).
    ks.filter(k=>k!==CACHE&&k!==IMG_CACHE&&k!==PDF_CACHE).map(k=>caches.delete(k))
  ))
  .then(()=>self.clients.claim())
  // Tell live clients the SW has a newer version so they can reload if stuck
  .then(()=>self.clients.matchAll({type:'window'}).then(cls=>cls.forEach(c=>c.postMessage({type:'SW_ACTIVATED',cache:CACHE}))))
));

// Cache strategy dispatcher
function shouldUseCacheFirst(url){
  return JSON_DATA_URLS.some(pattern=>url.endsWith(pattern));
}

// Fetch strategies: navigate→HTML fallback, data→network-first, assets→cache-first, Supabase images→cache-first
self.addEventListener('fetch',e=>{
  // Skip non-GET (Supabase POSTs, Claude proxy, etc)
  if(e.request.method!=='GET')return;

  // Supabase question images: cache-first (cross-origin, immutable)
  if(SUPA_IMG_PATTERN.test(e.request.url)){
    e.respondWith(
      caches.open(IMG_CACHE).then(cache=>
        cache.match(e.request).then(r=>{
          if(r)return r;
          return fetch(e.request).then(res=>{
            if(res.ok){cache.put(e.request,res.clone());trimCache(IMG_CACHE,MAX_IMG_CACHE_ENTRIES);}
            return res;
          });
        })
      )
    );
    return;
  }

  // Skip other cross-origin requests
  if(!e.request.url.startsWith(self.location.origin))return;

  const url=new URL(e.request.url).pathname;

  // Textbook / article / exam PDFs: cache-first on-demand (Hazzard, Harrison, articles, exams/).
  // First read fetches + caches; later reads work offline even with poor network.
  if(PDF_PATTERN.test(url)){
    e.respondWith(
      caches.open(PDF_CACHE).then(cache=>
        cache.match(e.request).then(r=>{
          if(r)return r;
          return fetch(e.request).then(res=>{
            if(res.ok){cache.put(e.request,res.clone());trimCache(PDF_CACHE,MAX_PDF_CACHE_ENTRIES);}
            return res;
          }).catch(()=>cache.match(e.request)); // second match covers race where cache.put finished elsewhere
        })
      )
    );
    return;
  }

  if(e.request.mode==='navigate'){
    // Navigation: network-first, fallback to cached HTML shell
    e.respondWith(
      fetch(e.request).then(res=>{
        if(res.ok){const c=res.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));}
        return res;
      }).catch(()=>caches.match('shlav-a-mega.html'))
    );
  }else if(shouldUseCacheFirst(url)){
    // JSON data: cache-first, update in background
    e.respondWith(
      caches.match(e.request).then(r=>{
        const netFetch=fetch(e.request).then(res=>{
          if(res.ok){const c=res.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));}
          return res;
        });
        return r||netFetch;
      }).catch(()=>caches.match(e.request))
    );
  }else{
    // Other assets (JS, manifest): cache-first with network fallback
    e.respondWith(
      caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
        if(res.ok){const c=res.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));}
        return res;
      }))
    );
  }
});

// ===== BACKGROUND SYNC =====
// When a Supabase backup fails offline, the app registers a sync event.
// When connectivity returns, this fires and retries the backup.
self.addEventListener('sync',e=>{
if(e.tag==='supabase-backup'){
e.waitUntil(
(async()=>{
try{
const db=await new Promise((resolve,reject)=>{
const req=indexedDB.open('shlav_mega_db',1);
req.onsuccess=ev=>resolve(ev.target.result);
req.onerror=ev=>reject(ev.target.error);
});
const tx=db.transaction('state','readonly');
const req=tx.objectStore('state').get('pending_sync');
const data=await new Promise(r=>{req.onsuccess=()=>r(req.result);req.onerror=()=>r(null);});
if(data&&data.url&&data.body){
// Whitelist Supabase REST hosts — IDB is writable by any same-origin script,
// so a compromised tab could otherwise redirect the queued POST (with the
// apikey header attached) to an attacker-controlled URL.
const _supaOk=/^https:\/\/[a-z0-9-]+\.supabase\.co\/rest\/v1\//i.test(data.url);
if(!_supaOk){console.warn('Background sync: refusing non-Supabase url',data.url);return;}
const res=await fetch(data.url,{method:'POST',headers:{'Content-Type':'application/json','apikey':data.apikey||''},body:JSON.stringify(data.body)});
if(res.ok){
// Clear pending sync
const clearTx=db.transaction('state','readwrite');
clearTx.objectStore('state').delete('pending_sync');
}
}
}catch(err){console.warn('Background sync failed:',err);}
})()
);
}
});

// ===== DAILY PUSH NOTIFICATION (07:00 local time) =====
// Scheduled via periodic background sync or a setInterval from the main thread.
// The main thread sends a message with due count; SW shows notification.

// Skip waiting when update banner clicked
self.addEventListener('message',e=>{
if(e.data&&e.data.type==='SKIP_WAITING'){self.skipWaiting();}
});

self.addEventListener('message',e=>{
if(e.data&&e.data.type==='schedule-notification'){
const dueCount=e.data.dueCount||0;
if(dueCount>0&&self.registration.showNotification){
self.registration.showNotification('Shlav A — Daily Review',{
body:`You have ${dueCount} question${dueCount>1?'s':''} due for spaced repetition review.`,
icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🩺</text></svg>',
badge:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📝</text></svg>',
tag:'daily-review',
renotify:true,
data:{url:self.registration.scope+'shlav-a-mega.html'}
});
}
}
});

self.addEventListener('notificationclick',e=>{
e.notification.close();
e.waitUntil(
clients.matchAll({type:'window'}).then(cls=>{
for(const c of cls){if(c.url.includes('shlav-a-mega')&&'focus' in c)return c.focus();}
if(clients.openWindow)return clients.openWindow(e.notification.data?.url||'shlav-a-mega.html');
})
);
});
