// src/sw-update.js — Service worker registration + update banner
// Extracted from shlav-a-mega.html (Phase 2)
// Globals exposed: initSWUpdate(), applyUpdate(), dismissUpdateBanner()

var _swDismissKey;

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
'<button data-action="dismiss-update" style="background:rgba(255,255,255,.2);color:#fff;border:none;border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer">✕</button>'+
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
caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k);});});
setTimeout(function(){window.location.reload(true);},500);
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
old.forEach(function(k){caches.delete(k);console.log('Deleted old cache:',k);});
});

return navigator.serviceWorker.register('sw.js').then(function(reg){
reg.update();
if(reg.waiting){showUpdateBanner();}
reg.addEventListener('updatefound',function(){
var nw=reg.installing;
if(nw){nw.addEventListener('statechange',function(){if(nw.state==='installed'&&navigator.serviceWorker.controller){showUpdateBanner();}});}
});
return reg;
});
}
