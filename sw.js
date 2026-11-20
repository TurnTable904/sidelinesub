/* Service worker for https://www.sidelinesub.com/.
   Register this file at /sw.js with scope /. Cache keys are root paths on
   this origin. activate drops every other cache so a previous cache cannot
   keep serving a page from the old /sidelinesub/ path. */
'use strict';
var CACHE = 'sidelinesub-root-3';
var PRECACHE = ['/', '/index.html', '/manifest.json', '/icon-180.png', '/icon-192.png', '/icon-512.png', '/favicon.ico', '/favicon-32.png', '/og.png', '/robots.txt', '/sitemap.xml'];

function stripBase(url) {
  var u = new URL(url);
  if (u.origin === self.location.origin && (u.pathname === '/sidelinesub' || u.pathname.indexOf('/sidelinesub/') === 0)) {
    u.pathname = u.pathname.slice('/sidelinesub'.length) || '/';
    if (!u.pathname || u.pathname.charAt(0) !== '/') u.pathname = '/' + (u.pathname || '');
  }
  return u;
}

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return Promise.all(PRECACHE.map(function (url) {
      return cache.add(url).catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  // Photo files live on Firebase Storage, not in this app cache. Thumbnails are kept in page memory only.
  if (/firebasestorage\.googleapis\.com|storage\.googleapis\.com|:9199\//.test(req.url)) return;
  var url;
  try { url = stripBase(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;
  var moved = url.href !== new URL(req.url).href;
  if (req.mode === 'navigate' && moved) {
    event.respondWith(Response.redirect(url.href, 302));
    return;
  }
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(function (fresh) {
      if (fresh && fresh.ok && fresh.type === 'basic' && !fresh.redirected) {
        var copy = fresh.clone();
        caches.open(CACHE).then(function (cache) { return cache.put(req, copy); }).catch(function () {});
      }
      return fresh;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        return caches.match('/index.html');
      }).then(function (hit) {
        if (hit) return hit;
        return caches.match('/');
      }).then(function (hit) {
        return hit || new Response('Sideline Sub is offline. Reconnect and reload.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      });
    }));
    return;
  }
  event.respondWith(fetch(moved ? url.href : req).then(function (fresh) {
    if (fresh && fresh.ok && fresh.type === 'basic' && !fresh.redirected) {
      var copy = fresh.clone();
      caches.open(CACHE).then(function (cache) { return cache.put(url.href, copy); }).catch(function () {});
    }
    return fresh;
  }).catch(function () {
    return caches.match(moved ? url.href : req).then(function (hit) {
      return hit || Response.error();
    });
  }));
});
