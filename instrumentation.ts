export async function register() {
  // Only run in the Node.js runtime (not edge), and only once
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { syncCalendar } = await import('./lib/services/calendar-sync')
  const cron = await import('node-cron')

  // Sync calendar immediately on startup, then every 15 minutes
  syncCalendar().catch(err => console.error('[startup] Initial calendar sync failed:', err))

  cron.default.schedule('*/15 * * * *', () => {
    syncCalendar().catch(err => console.error('[cron] Calendar sync failed:', err))
  })

  console.log('[startup] Calendar sync job registered (every 15 min)')
}
