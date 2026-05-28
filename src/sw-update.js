// src/sw-update.js — Service worker registration + auto-update
// Extracted from shlav-a-mega.html (Phase 2)
// Globals exposed: initSWUpdate(), applyUpdate(), dismissUpdateBanner()
//
// v10.64.133: now auto-reloads on update for consistency with the sibling apps
// (mishpacha v1.21.38, pnimit v10.4.25). The earlier "do NOT auto-reload, it
// loses unsaved state" stance is superseded: answers are persisted on check()
// (save()), so the only thing a version-triggered reload can lose is a
// not-yet-checked selection — trivial to redo, and far better than running a
// stale cached bundle. A newly-installed SW auto-skipWaitings while an old one
// controls the page; the resulting controllerchange triggers one reload onto
// fresh assets. Guards: _swHadController (no first-install reload) + _swRefreshing
// (no loop). The proactive SW_ACTIVATED banner is kept as a complement/fallback.

var _swDismissKey;
var _swRefreshing = false;
var _swHadController = false;

function showUpdateBanner(){
if(localStorage.getItem(_swDismissKey))return;
var existing=document.getElementById('update-banner');
if(existing)return;
var b=document.createElement('div');
b.id='update-banner';
b.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;background:linear-gradient(135deg,#0D7377,#14919B);color:#fff;padding:12px 16px;font-size:12px;display:flex;align-items:center;gap:10px;justify-content:space-between;box-shadow:0 2px 12px rgba(0,0,0,.3)';
b.innerHTML='<div><b>🆕 עדכון זמין!</b> גרסה חדשה מוכנה</div>'+
'<div style="display:flex;gap:6px;flex-shrink:0">'+
'<button data-action="apply-update" style="background:rgb(var(--card-bg));color:#0D7377;border:none;border-radius:8px;padding:6px 14px;font-size:11px;font-weight:700;cursor:pointer">🔄 עדכן עכשיו</button>'+
'<button data-action="dismiss-update" aria-label="Dismiss update banner" title="Dismiss update banner" style="background:rgba(0,0,0,.25);color:#fff;border:none;border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer">✕</button>'+
'</div>';
document.body.prepend(b);
}

function dismissUpdateBanner(){
localStorage.setItem(_swDismissKey,'1');
var b=document.getElementById('update-banner');
if(b)b.remove();
}

function applyUpdate(){
localStorage.removeItem(_swDismissKey);
if(navigator.serviceWorker&&navigator.serviceWorker.controller){
navigator.serviceWorker.getRegistrations().then(function(regs){
regs.forEach(function(r){if(r.waiting)r.waiting.postMessage({type:'SKIP_WAITING'});});
});
}
// Wipe only the app-shell cache. Preserve shlav-img-* and shlav-pdf-* — those hold
// user-downloaded textbook PDFs and exam images; nuking them would force re-download
// over possibly-bad networks and defeat the offline-reading purpose.
caches.keys().then(function(ks){
  ks.filter(function(k){return k.startsWith('shlav-a-');}).forEach(function(k){caches.delete(k);});
});
// reload(true) was the legacy "force from server" arg; modern browsers ignore it.
// Cache-bust here is already handled above by deleting all `shlav-a-*` caches
// before reload, so a plain reload() picks up fresh assets via the SW fetch path.
setTimeout(function(){window.location.reload();},500);
}

/**
 * Register service worker, set up update detection, clean old caches.
 * @param {string} appVersion - APP_VERSION from the main app
 * @returns {Promise<ServiceWorkerRegistration|null>} registration (or null if SW unsupported)
 */
function initSWUpdate(appVersion){
if(!('serviceWorker' in navigator))return Promise.resolve(null);
_swDismissKey='shlav_update_dismissed_'+appVersion;

// Clear old caches
caches.keys().then(function(ks){
var old=ks.filter(function(k){return k.startsWith('shlav-a-')&&k!=='shlav-a-v'+appVersion;});
old.forEach(function(k){caches.delete(k);});
});

// Snapshot control state before registration: a controller now means any later
// controllerchange is an UPDATE (reload), not a first install (which also fires
// controllerchange via clients.claim and must NOT reload).
_swHadController=!!navigator.serviceWorker.controller;
navigator.serviceWorker.addEventListener('controllerchange',function(){
if(_swRefreshing)return;
if(!_swHadController){_swHadController=true;return;}
_swRefreshing=true;
window.location.reload();
});

// Auto-activate a waiting worker so the controllerchange/reload fires without a tap.
function _autoApply(w){if(w){try{w.postMessage({type:'SKIP_WAITING'});}catch(e){}}}

// SW_ACTIVATED broadcast — kept as a complementary cue (the auto-reload above
// usually wins the race, but this covers windows that miss controllerchange).
navigator.serviceWorker.addEventListener('message',function(ev){
if(ev.data&&ev.data.type==='SW_ACTIVATED'&&ev.data.cache&&ev.data.cache!=='shlav-a-v'+appVersion){
showUpdateBanner();
}
});

return navigator.serviceWorker.register('sw.js').then(function(reg){
reg.update();
if(reg.waiting&&navigator.serviceWorker.controller){_autoApply(reg.waiting);showUpdateBanner();}
reg.addEventListener('updatefound',function(){
var nw=reg.installing;
if(nw){nw.addEventListener('statechange',function(){if(nw.state==='installed'&&navigator.serviceWorker.controller){_autoApply(nw);showUpdateBanner();}});}
});
return reg;
});
}
