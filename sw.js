const CACHE='shlav-a-v9.53';
const HTML_URLS=['shlav-a-mega.html','manifest.json','shared/fsrs.js','src/bridge.js','src/ui/library-view.js','src/ui/calc-view.js','src/ui/track-view.js','src/ui/study-view.js','src/ui/more-view.js','src/ui/quiz-view.js'];
const JSON_DATA_URLS=['data/questions.json','data/topics.json','data/notes.json','data/drugs.json','data/flashcards.json','harrison_chapters.json','data/hazzard_chapters.json','data/tabs.json'];
const ALL_URLS=[...HTML_URLS,...JSON_DATA_URLS];

self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ALL_URLS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));

// Cache strategy dispatcher
function shouldUseCacheFirst(url){
  return JSON_DATA_URLS.some(pattern=>url.endsWith(pattern));
}

// Fetch strategies: navigate→HTML fallback, data→network-first, assets→cache-first
self.addEventListener('fetch',e=>{
  // Skip non-GET (Supabase POSTs, Claude proxy, etc)
  if(e.request.method!=='GET')return;
  // Skip cross-origin requests
  if(!e.request.url.startsWith(self.location.origin))return;

  const url=new URL(e.request.url).pathname;

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
