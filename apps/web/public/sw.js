const CACHE_NAME = 'homeos-web-shell-v36'
const APP_SHELL = [
  '/',
  '/index.html',
  '/login',
  '/media-card-designs',
  '/manifest.json',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/weather-icons/clear-day.svg',
  '/weather-icons/clear-night.svg',
  '/weather-icons/partly-cloudy-day.svg',
  '/weather-icons/partly-cloudy-night.svg',
  '/weather-icons/overcast.svg',
  '/weather-icons/fog.svg',
  '/weather-icons/rain.svg',
  '/weather-icons/thunderstorms-rain.svg',
  '/weather-icons/snow.svg',
]

async function cacheResponse(cache, request, response) {
  if (!response || !response.ok) return
  await cache.put(request, response.clone())
}

function isDocumentRequest(request) {
  return request.mode === 'navigate'
    || request.destination === 'document'
    || (request.headers.get('accept') || '').includes('text/html')
}

async function cachedAppShell(request) {
  const url = new URL(request.url)
  const matches = [
    () => caches.match(request, { ignoreSearch: true }),
    () => caches.match(url.pathname),
    () => caches.match('/'),
    () => caches.match('/index.html'),
  ]

  for (const match of matches) {
    const cached = await match()
    if (cached) return cached
  }

  return null
}

function appAssetUrls(html) {
  const urls = new Set()
  const patterns = [
    /<script[^>]+src=["']([^"']+)["']/g,
    /<link[^>]+href=["']([^"']+)["']/g,
  ]

  for (const pattern of patterns) {
    let match = pattern.exec(html)
    while (match) {
      const url = new URL(match[1], self.location.origin)
      if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
        urls.add(url.pathname)
      }
      match = pattern.exec(html)
    }
  }

  return [...urls]
}

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME)
  const rootResponse = await fetch('/', { cache: 'no-store' })
  if (!rootResponse.ok) throw new Error('App shell unavailable')
  await cacheResponse(cache, '/', rootResponse)
  await cacheResponse(cache, '/index.html', rootResponse)

  const html = await rootResponse.clone().text()
  await Promise.all(appAssetUrls(html).map(async assetPath => {
    const assetResponse = await fetch(assetPath, { cache: 'no-store' })
    if (!assetResponse.ok) throw new Error(`App asset unavailable: ${assetPath}`)
    await cacheResponse(cache, assetPath, assetResponse)
  }))

  await Promise.all(APP_SHELL.filter(path => path !== '/' && path !== '/index.html').map(async path => {
    try {
      const response = await fetch(path, { cache: 'no-store' })
      await cacheResponse(cache, path, response)
    } catch {
      // Keep installing even if one secondary shell file fetch fails.
    }
  }))
}

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(cacheAppShell())
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request))
    return
  }

  if (isDocumentRequest(request)) {
    event.respondWith(
      fetch(request).then(async response => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME)
          await cache.put(request, response.clone())
          await cache.put('/', response.clone())
          await cache.put('/index.html', response.clone())
          return response
        }
        return (await cachedAppShell(request)) || response
      }).catch(async () => {
        return (await cachedAppShell(request)) || new Response('Offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      }),
    )
    return
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(response => {
        if (response.ok) {
          const cloned = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, cloned))
        }
        return response
      })
    }),
  )
})

self.addEventListener('push', event => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }

  const title = payload.title || 'HomeOS'
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body,
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.url || '/' },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
      for (const client of windows) {
        if ('focus' in client && client.url === target) return client.focus()
      }
      return clients.openWindow(target)
    }),
  )
})
