export function registerPwa() {
  if (!('serviceWorker' in navigator)) return

  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })

  navigator.serviceWorker.register('/sw.js').then(registration => {
    registration.update().catch(() => undefined)
    setInterval(() => registration.update(), 10 * 60 * 1000)
  }).catch(error => {
    console.error('[pwa] registration failed', error)
  })
}
