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
