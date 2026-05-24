// ── Cache names ────────────────────────────────────────────────────────────
// Bump the version suffix to force all clients to pick up a new cache on deploy.
const SHELL_CACHE   = 'homeos-shell-v1'
const DATA_CACHE    = 'homeos-data-v1'
const KNOWN_CACHES  = [SHELL_CACHE, DATA_CACHE]

// ── Install ────────────────────────────────────────────────────────────────
// Cache the offline fallback + key static assets immediately.
// skipWaiting so the new SW activates without waiting for tabs to close.
self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache =>
      cache.addAll(['/offline.html', '/icons/icon-192.png', '/manifest.json'])
    )
  )
})

// ── Activate ───────────────────────────────────────────────────────────────
// Purge any old caches from previous versions, then claim open clients.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !KNOWN_CACHES.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request
  const url = new URL(req.url)

  // Only intercept same-origin GET requests
  if (url.origin !== self.location.origin) return
  if (req.method !== 'GET') return

  // 1. Next.js static assets (content-addressed, hashed filenames) — cache first.
  //    Once cached they never change, so we never need to revalidate.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(req, SHELL_CACHE))
    return
  }

  // 2. Static public files (icons, images, manifest, offline page) — cache first.
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|ico|webp|json|html)$/) &&
      !url.pathname.startsWith('/api/')) {
    event.respondWith(cacheFirst(req, SHELL_CACHE))
    return
  }

  // 3. API GET requests — network first, fall back to last cached response.
  //    This means data is readable offline (read-only) after first visit.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(req, DATA_CACHE, null))
    return
  }

  // 4. Page navigations — network first, cache a copy, fall back to cached or offline page.
  if (req.mode === 'navigate') {
    event.respondWith(navigateWithFallback(req))
    return
  }
})

// ── Strategy: cache first ─────────────────────────────────────────────────
async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req)
  if (cached) return cached
  try {
    const res = await fetch(req)
    if (res.ok) {
      const cache = await caches.open(cacheName)
      cache.put(req, res.clone())
    }
    return res
  } catch {
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
  }
}

// ── Strategy: network first ───────────────────────────────────────────────
async function networkFirst(req, cacheName, fallbackUrl) {
  try {
    const res = await fetch(req)
    if (res.ok) {
      const cache = await caches.open(cacheName)
      cache.put(req, res.clone())
    }
    return res
  } catch {
    const cached = await caches.match(req)
    if (cached) return cached
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl)
      if (fallback) return fallback
    }
    return new Response(
      JSON.stringify({ error: 'offline', message: 'You are offline. Showing cached data.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// ── Strategy: navigate with offline fallback ──────────────────────────────
async function navigateWithFallback(req) {
  try {
    const res = await fetch(req)
    if (res.ok) {
      // Cache visited pages so they load offline next time
      const cache = await caches.open(SHELL_CACHE)
      cache.put(req, res.clone())
    }
    return res
  } catch {
    // Try exact cached URL first, then the root (app shell), then offline page
    const cached = await caches.match(req)
      ?? await caches.match('/')
      ?? await caches.match('/offline.html')
    return cached ?? new Response('<h1>Offline</h1>', {
      status: 503,
      headers: { 'Content-Type': 'text/html' },
    })
  }
}

// ── Push notifications ─────────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return
  let data
  try { data = event.data.json() } catch { return }

  const { title, body, url, icon } = data
  event.waitUntil(
    self.registration.showNotification(title || 'HomeOS', {
      body: body || '',
      icon: icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: url || '/' },
      vibrate: [150, 50, 150],
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin))
      if (existing) {
        existing.focus()
        existing.navigate(url)
      } else {
        clients.openWindow(url)
      }
    })
  )
})
