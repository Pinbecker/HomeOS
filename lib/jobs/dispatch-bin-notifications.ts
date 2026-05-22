import { STATIC_BIN_SCHEDULES, getNextStaticBinCollection, daysUntil } from '@/lib/utils/bins'
import { sendPushToAll } from '@/lib/services/push'

export async function dispatchBinNotifications() {
  const tomorrow = STATIC_BIN_SCHEDULES
    .map(bin => ({ ...bin, next: getNextStaticBinCollection(bin) }))
    .filter(bin => daysUntil(bin.next) === 1)

  if (tomorrow.length === 0) return

  const names = tomorrow.map(b => b.name).join(' & ')
  await sendPushToAll({
    title: '🗑 Bin day tomorrow',
    body: names,
    url: '/',
  })

  console.log(`[bins] Sent bin notification for: ${names}`)
}
