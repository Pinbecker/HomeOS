import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { items, lists, listItems, records, calendarEvents, pins, reminders } from '@/lib/db/schema'
import { eq, and, isNull, isNotNull, lte, gte, asc, desc, inArray } from 'drizzle-orm'
import { DashboardClient } from '@/components/features/dashboard/dashboard-client'
import { STATIC_BIN_SCHEDULES, daysUntil, getNextStaticBinCollection } from '@/lib/utils/bins'
import { getTodayMatches } from '@/lib/services/epg'
import { formatAirtime, channelName } from '@/lib/utils/freeview-channels'

const RECORD_ENTITY_TYPE = 'record'

export default async function DashboardPage() {
  const session = await requireSession()

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const renewalWindow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30, 23, 59, 59)
  const calWindow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14, 23, 59, 59)

  // These queries are independent — run in parallel
  const [shoppingLists, tasks, inboxCount, inboxPreview, renewalRows, reminderRows, calRows, pinRows, pinnedNoteRows, followedTvShows] =
    await Promise.all([
      db.query.lists.findMany({
        where: and(eq(lists.type, 'shopping'), eq(lists.archived, false)),
        with: {
          items: {
            where: eq(listItems.checked, false),
            orderBy: [asc(listItems.sortOrder), asc(listItems.createdAt)],
          },
        },
      }),
      db.query.items.findMany({
        where: and(
          eq(items.type, 'task'),
          eq(items.status, 'active'),
          isNull(items.deletedAt),
          isNotNull(items.dueDate),
          lte(items.dueDate, calWindow)
        ),
        orderBy: [asc(items.dueDate), asc(items.createdAt)],
        limit: 20,
        with: { assignee: true, createdBy: true },
      }),
      db.$count(items, and(eq(items.type, 'inbox'), eq(items.status, 'active'), isNull(items.deletedAt))),
      db.query.items.findMany({
        where: and(eq(items.type, 'inbox'), eq(items.status, 'active'), isNull(items.deletedAt)),
        orderBy: [desc(items.createdAt)],
        limit: 2,
        columns: { title: true, id: true },
      }),
      db.query.records.findMany({
        where: and(isNotNull(records.renewalDate), lte(records.renewalDate, renewalWindow)),
        orderBy: [asc(records.renewalDate)],
        columns: { id: true, title: true, category: true, renewalLabel: true, renewalDate: true },
      }),
      db.query.reminders.findMany({
        where: and(
          eq(reminders.entityType, RECORD_ENTITY_TYPE),
          isNull(reminders.dismissedAt),
          lte(reminders.triggerAt, renewalWindow)
        ),
        orderBy: [asc(reminders.triggerAt)],
        columns: { id: true, entityId: true, message: true, triggerAt: true },
      }),
      db.query.calendarEvents.findMany({
        where: and(gte(calendarEvents.startsAt, startOfToday), lte(calendarEvents.startsAt, calWindow)),
        orderBy: [asc(calendarEvents.startsAt)],
        columns: { id: true, title: true, startsAt: true, endsAt: true, allDay: true, location: true },
        limit: 8,
      }),
      db.query.pins.findMany({
        where: isNotNull(pins.linkHref),
        orderBy: [desc(pins.sortOrder), desc(pins.createdAt)],
        columns: { id: true, title: true, body: true, colour: true, linkHref: true, createdAt: true },
      }),
      db.query.items.findMany({
        where: and(eq(items.type, 'note'), eq(items.pinned, true), eq(items.status, 'active'), isNull(items.deletedAt)),
        orderBy: [desc(items.pinnedAt)],
        columns: { id: true, title: true, body: true, pinnedAt: true, updatedAt: true },
      }),
      db.query.items.findMany({
        where: and(eq(items.type, 'watchlist_tv'), eq(items.status, 'active'), isNull(items.deletedAt)),
        columns: { id: true, title: true, metadata: true },
      }),
    ])

  const boardPins = [
    ...pinnedNoteRows.map(note => ({
      kind: 'note' as const,
      id: note.id,
      title: note.title,
      body: note.body,
      ts: (note.pinnedAt ?? note.updatedAt).getTime(),
    })),
    ...pinRows.map(pin => ({
      kind: 'fact' as const,
      id: pin.id,
      title: pin.title,
      body: pin.body,
      colour: pin.colour,
      linkHref: pin.linkHref ?? null,
      ts: pin.createdAt.getTime(),
    })),
  ].sort((a, b) => b.ts - a.ts)

  const allShoppingItems = shoppingLists.flatMap(l =>
    l.items.map(it => ({
      id: it.id,
      title: it.title,
      checked: it.checked,
      shopName: l.name,
      shopColor: l.color ?? '#34C759',
    }))
  )
  const shoppingItems = allShoppingItems.slice(0, 12)
  const shoppingTotal = allShoppingItems.length

  const reminderRecordIds = Array.from(new Set(reminderRows.map(r => r.entityId)))
  const reminderRecords = reminderRecordIds.length
    ? await db.query.records.findMany({
        where: inArray(records.id, reminderRecordIds),
        columns: { id: true, title: true },
      })
    : []
  const reminderRecordMap = new Map(reminderRecords.map(r => [r.id, r.title]))

  const tvMatches = followedTvShows.length > 0
    ? await getTodayMatches(followedTvShows.map(s => ({
        title: s.title,
        channel: (s.metadata as Record<string, unknown> | null)?.channel as string ?? null,
      }))).catch(() => [])
    : []

  const seenTitles = new Set<string>()
  const tonightShows = tvMatches.flatMap(prog => {
    const key = prog.title.toLowerCase()
    if (seenTitles.has(key)) return []
    seenTitles.add(key)
    return [{
      title: prog.title,
      channel: channelName(prog.channelId),
      airtime: formatAirtime(prog.startsAt),
      channelId: prog.channelId,
      atMs: prog.startsAt.getTime(),
    }]
  })

  const nextBins = STATIC_BIN_SCHEDULES.map(bin => ({
    ...bin,
    nextCollection: getNextStaticBinCollection(bin),
  })).sort((a, b) => a.nextCollection.getTime() - b.nextCollection.getTime())

  const relevantBins = nextBins.filter(b => daysUntil(b.nextCollection) === 1)

  const renewals = [
    ...reminderRows.map(r => ({
      id: `reminder-${r.id}`,
      title: reminderRecordMap.get(r.entityId) ?? 'Record reminder',
      label: r.message || 'Reminder',
      date: r.triggerAt,
      href: `/life/admin/${r.entityId}`,
    })),
    ...renewalRows.map(r => ({
    id: r.id,
    title: r.title,
    label: r.renewalLabel,
    date: r.renewalDate!,
      href: `/life/admin/${r.id}`,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime())

  return (
    <DashboardClient
      user={session.user}
      shoppingItems={shoppingItems}
      tasks={tasks}
      inboxCount={inboxCount}
      inboxPreview={inboxPreview}
      bins={relevantBins}
      renewals={renewals}
      calendarEvents={calRows}
      pins={boardPins}
      tonightShows={tonightShows}
      shoppingTotal={shoppingTotal}
    />
  )
}
