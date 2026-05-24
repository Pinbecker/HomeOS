// ── Cache names ────────────────────────────────────────────────────────────
// Bump the version suffix to force all clients onto fresh caches on deploy.
const SHELL_CACHE = 'homeos-shell-v3'   // app shell: static assets, icons, offline page, home
const DATA_CACHE  = 'homeos-data-v3'    // /api GET responses
const PAGE_CACHE  = 'homeos-pages-v3'   // navigations (HTML) + RSC payloads
const KNOWN_CACHES = [SHELL_CACHE, DATA_CACHE, PAGE_CACHE]

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE)
    await cache.addAll(['/offline.html', '/icons/icon-192.png', '/manifest.json'])
    // Best-effort precache of the home shell so the installed PWA + "Go to Home"
    // work offline even before the user has browsed. May be a login redirect if
    // not yet authenticated — that's fine, it gets refreshed on the next online nav.
    try { await cache.add('/') } catch { /* ignore */ }
  })())
})

// ── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => !KNOWN_CACHES.includes(k)).map(k => caches.delete(k)))
    await self.clients.claim()
  })())
})

// A request is for React Server Component data (client-side nav / link prefetch)
function isRSC(req, url) {
  return req.headers.get('RSC') === '1' || url.searchParams.has('_rsc')
}

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request
  const url = new URL(req.url)

  if (url.origin !== self.location.origin) return
  if (req.method !== 'GET') return

  // 1. Next.js static assets (hashed, immutable) → cache first
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(req, SHELL_CACHE))
    return
  }

  // 2. Static public files (icons, fonts, manifest, offline page) → cache first
  if (/\.(png|jpe?g|svg|ico|webp|gif|json|html|woff2?)$/.test(url.pathname) && !url.pathname.startsWith('/api/')) {
    event.respondWith(cacheFirst(req, SHELL_CACHE))
    return
  }

  // 3. RSC payloads (the data behind client-side navigation) → network first, cache fallback.
  //    Caching these is what makes tapping links work offline for visited/prefetched pages.
  if (isRSC(req, url)) {
    event.respondWith(networkFirst(req, PAGE_CACHE))
    return
  }

  // Never cache auth — always go straight to network
  if (url.pathname.startsWith('/api/auth/')) return

  // 4. API GET requests → network first, last-known data fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(req, DATA_CACHE))
    return
  }

  // 5. Page navigations (hard loads) → network first, cached page → home shell → offline page
  if (req.mode === 'navigate') {
    event.respondWith(handleNavigation(req))
    return
  }
})

// ── Strategy: cache first ─────────────────────────────────────────────────
async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req)
  if (cached) return cached
  try {
    const res = await fetch(req)
    if (res && res.ok) (await caches.open(cacheName)).put(req, res.clone())
    return res
  } catch {
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
  }
}

// ── Strategy: network first ───────────────────────────────────────────────
async function networkFirst(req, cacheName) {
  try {
    const res = await fetch(req)
    if (res && res.ok) (await caches.open(cacheName)).put(req, res.clone())
    return res
  } catch {
    const cached = await caches.match(req)
    if (cached) return cached
    // No cached copy — let the caller (Next router / fetch) see a failure
    return new Response('', { status: 503, statusText: 'Offline' })
  }
}

// ── Navigation: network first with layered offline fallback ───────────────
async function handleNavigation(req) {
  try {
    const res = await fetch(req)
    if (res && res.ok) (await caches.open(PAGE_CACHE)).put(req, res.clone())
    return res
  } catch {
    const url = new URL(req.url)
    // Exact cached page (was hard-loaded online before)
    const exact = await caches.match(req)
    if (exact) return exact
    // Same path without query string
    const bare = await caches.match(url.pathname)
    if (bare) return bare
    // Home shell — lets the app boot and client-route to cached pages
    if (url.pathname === '/') {
      const home = await caches.match('/')
      if (home) return home
    }
    // Last resort: friendly offline page
    return (await caches.match('/offline.html'))
      ?? new Response('<h1>Offline</h1>', { status: 503, headers: { 'Content-Type': 'text/html' } })
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
