import cron from 'node-cron'
import { dispatchBinNotifications } from '@/lib/jobs/dispatch-bin-notifications'
import { dispatchDueTasks, dispatchTaskDueNotifications } from '@/lib/jobs/dispatch-due-tasks'
import { dispatchReminders } from '@/lib/jobs/dispatch-reminders'
import { dispatchTvNotifications } from '@/lib/jobs/dispatch-tv-notifications'
import { ingestEpg } from '@/lib/jobs/ingest-epg'
import { syncCalendar } from '@/lib/services/calendar-sync'

process.env.NEXT_RUNTIME = 'nodejs'

async function main() {
  await Promise.allSettled([
    syncCalendar(),
    ingestEpg(),
  ])

  cron.schedule('30 4,16 * * *', () => {
    ingestEpg().catch(err => console.error('[worker] EPG ingest failed:', err))
  })

  cron.schedule('*/2 * * * *', () => {
    syncCalendar().catch(err => console.error('[worker] Calendar sync failed:', err))
  })

  cron.schedule('* * * * *', () => {
    dispatchReminders().catch(err => console.error('[worker] Reminder dispatch failed:', err))
    dispatchTaskDueNotifications().catch(err => console.error('[worker] Timed task dispatch failed:', err))
  })

  cron.schedule('0 20 * * *', () => {
    dispatchBinNotifications().catch(err => console.error('[worker] Bin notifications failed:', err))
  })

  cron.schedule('0 7 * * *', () => {
    dispatchDueTasks().catch(err => console.error('[worker] Due task notifications failed:', err))
  })

  cron.schedule('0 15 * * *', () => {
    dispatchTvNotifications().catch(err => console.error('[worker] TV notifications failed:', err))
  })

  console.log('[worker] Started HomeOS background jobs')
}

main().catch(err => {
  console.error('[worker] Startup failed:', err)
  process.exit(1)
})
