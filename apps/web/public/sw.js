const CACHE_NAME = 'homeos-web-shell-v9'
const APP_SHELL = [
  '/',
  '/login',
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

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )),
  )
  self.clients.claim()
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

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(async response => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME)
          await cache.put(request, response.clone())
          await cache.put('/', response.clone())
        }
        return response
      }).catch(async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        return (await caches.match('/')) || new Response('Offline', { status: 503 })
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
