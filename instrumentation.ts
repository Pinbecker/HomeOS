export async function register() {
  // Only run in the Node.js runtime (not edge), and only once
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { syncCalendar } = await import('./lib/services/calendar-sync')
  const { dispatchReminders } = await import('./lib/jobs/dispatch-reminders')
  const { dispatchBinNotifications } = await import('./lib/jobs/dispatch-bin-notifications')
  const { dispatchDueTasks, dispatchTaskDueNotifications } = await import('./lib/jobs/dispatch-due-tasks')
  const { dispatchTvNotifications } = await import('./lib/jobs/dispatch-tv-notifications')
  const { ingestEpg } = await import('./lib/jobs/ingest-epg')
  const cron = await import('node-cron')

  // Sync calendar immediately on startup, then every 15 minutes
  syncCalendar().catch(err => console.error('[startup] Initial calendar sync failed:', err))

  // Refresh TV listings on startup, then twice a day (the feed rebuilds every 12h)
  ingestEpg().catch(err => console.error('[startup] Initial EPG ingest failed:', err))

  cron.default.schedule('30 4,16 * * *', () => {
    ingestEpg().catch(err => console.error('[cron] EPG ingest failed:', err))
  })

  cron.default.schedule('*/15 * * * *', () => {
    syncCalendar().catch(err => console.error('[cron] Calendar sync failed:', err))
  })

  // Check reminders every minute and push any that are now due
  cron.default.schedule('* * * * *', () => {
    dispatchReminders().catch(err => console.error('[cron] Reminder dispatch failed:', err))
  })

  // Check timed task due dates every minute. Date-only tasks stay in the 7am summary.
  cron.default.schedule('* * * * *', () => {
    dispatchTaskDueNotifications().catch(err => console.error('[cron] Timed task dispatch failed:', err))
  })

  // Every evening at 8pm — notify if there's a bin collection tomorrow
  cron.default.schedule('0 20 * * *', () => {
    dispatchBinNotifications().catch(err => console.error('[cron] Bin notifications failed:', err))
  })

  // Every morning at 7am — notify about tasks due today
  cron.default.schedule('0 7 * * *', () => {
    dispatchDueTasks().catch(err => console.error('[cron] Due task notifications failed:', err))
  })

  // Every afternoon at 3pm — notify about followed TV shows on tonight
  cron.default.schedule('0 15 * * *', () => {
    dispatchTvNotifications().catch(err => console.error('[cron] TV notifications failed:', err))
  })

  console.log('[startup] Calendar sync job registered (every 15 min)')
  console.log('[startup] Push notification jobs registered')
  console.log('[startup] TV notification job registered (3pm daily)')
  console.log('[startup] EPG ingest job registered (4:30am & 4:30pm)')
}
