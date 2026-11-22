// Service worker (website only; the phone apps have their files built in): shows push
// notifications, opens the app when one is tapped, and keeps the app's own files, the OCR engine
// and recently seen photos, so the app opens and shows drinks without a connection.
// Pages are fetched from the network first, so updates show up at once when online. Data
// (/graphql, /api) is never cached here; src/lib/offline.ts keeps the last-seen data instead.

const SHELL = 'beer-shell-v1'
const ASSETS = 'beer-assets-v1'
const MEDIA = 'beer-media-v1'
const MAX_ASSETS = 80
const MAX_MEDIA = 300

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      const keep = [SHELL, ASSETS, MEDIA]
      for (const name of await caches.keys()) if (!keep.includes(name)) await caches.delete(name)
      await self.clients.claim()
    })(),
  ),
)

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  // Oldest first.
  for (const request of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(request)
}

async function cacheFirst(event, cacheName, max) {
  const cached = await caches.match(event.request)
  if (cached) return cached
  const response = await fetch(event.request)
  if (response.ok) {
    await (await caches.open(cacheName)).put(event.request, response.clone())
    event.waitUntil(trim(cacheName, max))
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Data, the Django admin and the docs (a separate site under /docs/) are left alone.
  if (/^\/(graphql|api|admin|static|docs)(\/|$)/.test(url.pathname)) return

  // App pages: network first, the saved shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request)
          if (response.ok) (await caches.open(SHELL)).put('/', response.clone())
          return response
        } catch {
          return (await caches.match('/', { cacheName: SHELL })) || Response.error()
        }
      })(),
    )
    return
  }

  // Photos never change (new upload = new file name): cache first, keep the most recent ones.
  if (url.pathname.startsWith('/media/')) {
    event.respondWith(cacheFirst(event, MEDIA, MAX_MEDIA))
    return
  }

  // Build files (hashed), the OCR engine and icons: cache first.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/ocr/') || /\.(png|svg|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(event, ASSETS, MAX_ASSETS))
  }
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Beer Rates', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (open) {
        await open.focus()
        return open.navigate(url)
      }
      return self.clients.openWindow(url)
    })(),
  )
})
