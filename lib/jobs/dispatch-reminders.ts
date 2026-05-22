import { db } from '@/lib/db'
import { reminders } from '@/lib/db/schema'
import { and, eq, isNull, lte } from 'drizzle-orm'
import { sendPushToUser } from '@/lib/services/push'

export async function dispatchReminders() {
  const now = new Date()
  const due = await db.query.reminders.findMany({
    where: and(
      isNull(reminders.dispatchedAt),
      isNull(reminders.dismissedAt),
      lte(reminders.triggerAt, now),
    ),
  })

  if (due.length === 0) return

  // Fetch record titles for context
  const recordIds = [...new Set(due.filter(r => r.entityType === 'record').map(r => r.entityId))]
  const recordMap = new Map<string, string>()
  if (recordIds.length) {
    const rows = await db.query.records.findMany({
      where: (t, { inArray }) => inArray(t.id, recordIds),
      columns: { id: true, title: true },
    })
    rows.forEach(r => recordMap.set(r.id, r.title))
  }

  for (const reminder of due) {
    const entityTitle = recordMap.get(reminder.entityId) ?? null
    const title = reminder.message || (entityTitle ? `Reminder: ${entityTitle}` : 'HomeOS Reminder')
    const body = entityTitle && reminder.message ? entityTitle : undefined
    const url = reminder.entityType === 'record' ? `/life/admin/${reminder.entityId}` : '/'

    try {
      await sendPushToUser(reminder.createdById, { title, body, url })
    } catch (err) {
      console.error(`[reminders] Push failed for reminder ${reminder.id}:`, err)
    }

    await db.update(reminders)
      .set({ dispatchedAt: now })
      .where(eq(reminders.id, reminder.id))
  }
}
