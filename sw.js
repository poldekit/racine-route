// Racine Route -- offline app-shell cache.
//
// Why this exists: a delivery driver needs to create/edit/print invoices
// with zero cell signal, and needs the APP ITSELF to still launch with zero
// signal too -- not just keep working once it happens to already be open.
// A plain static site (no service worker) fails to even load with no
// network, because the browser has to fetch it fresh every time the tab or
// standalone app is opened. This service worker caches the whole app shell
// on the very first (online) visit, then serves everything from that cache
// from then on, network or no network -- the two PDF libraries included, so
// Save as PDF works offline too, not just receipt entry.
//
// Bump CACHE_NAME whenever the app-shell file list changes, so returning
// devices pick up the new set instead of serving a stale mix.
var CACHE_NAME = "racine-route-shell-v2";
var SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./html2canvas.min.js",
  "./jspdf.umd.min.js"
];

self.addEventListener("install", function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(SHELL_FILES);
    }).then(function(){
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function(event){
  event.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(
        names.filter(function(n){ return n !== CACHE_NAME; })
             .map(function(n){ return caches.delete(n); })
      );
    }).then(function(){
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function(event){
  var req = event.request;
  if(req.method !== "GET") return; // don't intercept anything but simple GETs

  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;

  if(!sameOrigin){
    // Cross-origin (Google Fonts, etc.) -- best effort only. The app's CSS
    // already has real font fallbacks, so a failure here is a cosmetic
    // difference offline, never a broken app.
    event.respondWith(
      fetch(req).catch(function(){ return new Response("", {status: 504}); })
    );
    return;
  }

  // Same-origin app-shell files: cache-first, so the app opens instantly
  // and identically whether online or not, then refresh the cache in the
  // background when a network is actually available.
  event.respondWith(
    caches.match(req).then(function(cached){
      var networkFetch = fetch(req).then(function(res){
        if(res && res.status === 200){
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copy); });
        }
        return res;
      }).catch(function(){ return cached; });
      return cached || networkFetch;
    })
  );
});
