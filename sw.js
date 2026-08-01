// Service Worker für Link-Archiv
// Cached nur die App-Hülle (HTML/CSS/JS/Icons), damit die App schnell startet
// und sich wie eine installierte App verhält. Die eigentlichen Link-Daten kommen
// weiterhin live von jsonblob.com und werden hier NICHT zwischengespeichert.
//
// Strategie: HTML/JS/Manifest -> "Netzwerk zuerst" (immer aktuell, Cache nur als
// Offline-Rückfallebene). Icons -> "Cache zuerst" (ändern sich praktisch nie,
// dadurch schneller Start). So kommen künftige Updates automatisch an, ohne dass
// diese Datei jedes Mal manuell geändert werden muss.

var CACHE_NAME = 'link-archiv-shell-v2';
var APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
  './favicon.png'
];

// Dateitypen, die sich kaum ändern -> Cache-zuerst ist hier sinnvoll.
var CACHE_FIRST_EXT = ['.png', '.jpg', '.jpeg', '.svg', '.ico'];

function isCacheFirst(pathname) {
  return CACHE_FIRST_EXT.some(function (ext) { return pathname.endsWith(ext); });
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_NAME; })
            .map(function (key) { return caches.delete(key); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);

  // Nie API-Aufrufe an jsonblob.com oder api.microlink.io cachen – diese Daten
  // sollen immer live/aktuell sein.
  if (url.hostname.indexOf('jsonblob.com') !== -1 || url.hostname.indexOf('microlink.io') !== -1) {
    return;
  }

  // Nur eigene Origin (App-Hülle) über den Cache bedienen.
  if (url.origin !== self.location.origin) {
    return;
  }

  if (isCacheFirst(url.pathname)) {
    // Cache zuerst, Netzwerk als Rückfallebene (für Icons etc.)
    event.respondWith(
      caches.match(event.request).then(function (cached) {
        if (cached) return cached;
        return fetch(event.request).then(function (response) {
          if (response && response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, clone); });
          }
          return response;
        });
      })
    );
    return;
  }

  // Netzwerk zuerst für HTML/JS/Manifest, damit Updates sofort ankommen.
  // cache: 'no-store' erzwingt eine echte Netzwerkanfrage und verhindert,
  // dass der normale Browser-HTTP-Cache eine alte Antwort ausliefert.
  // Nur wenn das Netzwerk nicht erreichbar ist, wird aus dem SW-Cache bedient.
  event.respondWith(
    fetch(event.request, { cache: 'no-store' }).then(function (response) {
      if (response && response.ok) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, clone); });
      }
      return response;
    }).catch(function () {
      return caches.match(event.request).then(function (cached) {
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
