/*
 * Shan Village service worker.
 *
 * DELIBERATELY CONSERVATIVE ABOUT CACHING.
 *
 * Roster and request pages contain personal information about staff, so no
 * page HTML and no API response is ever stored. Only the build's own static
 * assets and the offline notice are cached, which is what makes the app open
 * instantly and still be honest about needing a connection for real data.
 */

const VERSION = 'shan-village-v1'
const SHELL_CACHE = `${VERSION}-shell`
const SHELL_ASSETS = ['/offline', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Never touch authentication or data endpoints.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return

  // Immutable build output: safe to serve from cache first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
    return
  }

  // Pages: always from the network, so nobody ever sees a stale roster.
  // Offline, show the offline notice rather than a browser error page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline').then((cached) => cached ?? Response.error())),
    )
  }
})
