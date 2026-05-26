import { EventEmitter } from 'node:events'
import { fromNodeHeaders } from 'better-auth/node'
import { eq, gt, max } from 'drizzle-orm'
import type { FastifyRequest } from 'fastify'
import { auth } from '@homeos/auth'
import { db } from '@homeos/db'
import {
  appliedMutations,
  bins,
  calendarEvents,
  calendarFeeds,
  household,
  householdMembers,
  items,
  listItems,
  lists,
  records,
  reminders,
  syncChanges,
  users,
} from '@homeos/db/schema'

const stream = new EventEmitter()

export type SyncMutation = {
  id: string
  deviceId?: string
  name: string
  entityType: string
  entityId: string
  operation: 'upsert' | 'delete'
  payload?: Record<string, unknown> | null
}

type RecordedChange = Pick<SyncMutation, 'entityType' | 'entityId' | 'operation' | 'payload'>

export async function getSession(request: FastifyRequest) {
  return auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  })
}

export async function getCheckpoint() {
  const row = await db.select({ version: max(syncChanges.version) }).from(syncChanges)
  return row[0]?.version ?? 0
}

export async function buildBootstrap() {
  const checkpoint = await getCheckpoint()

  const [
    allUsers,
    allHouseholds,
    allMemberships,
    allLists,
    allItems,
    allListItems,
    allRecords,
    allReminders,
    allCalendarEvents,
    allCalendarFeeds,
    allBins,
  ] = await Promise.all([
    db.select().from(users),
    db.select().from(household),
    db.select().from(householdMembers),
    db.select().from(lists),
    db.select().from(items),
    db.select().from(listItems),
    db.select().from(records),
    db.select().from(reminders),
    db.select().from(calendarEvents),
    db.select().from(calendarFeeds),
    db.select().from(bins),
  ])

  return {
    checkpoint,
    data: {
      users: allUsers,
      household: allHouseholds,
      householdMembers: allMemberships,
      lists: allLists,
      items: allItems,
      listItems: allListItems,
      records: allRecords,
      reminders: allReminders,
      calendarEvents: allCalendarEvents,
      calendarFeeds: allCalendarFeeds,
      bins: allBins,
    },
  }
}

export async function pullChanges(since: number) {
  const changes = await db
    .select()
    .from(syncChanges)
    .where(gt(syncChanges.version, since))
    .orderBy(syncChanges.version)

  return {
    checkpoint: changes.at(-1)?.version ?? since,
    changes,
  }
}

export function subscribe(onChange: (change: { version: number }) => void) {
  stream.on('change', onChange)
  return () => stream.off('change', onChange)
}

export async function applyMutations(userId: string, mutations: SyncMutation[]) {
  const applied: Array<{ id: string; version: number | null; deduped: boolean }> = []

  for (const mutation of mutations) {
    const existing = await db.query.appliedMutations.findFirst({
      where: eq(appliedMutations.id, mutation.id),
    })

    if (existing) {
      applied.push({ id: mutation.id, version: null, deduped: true })
      continue
    }

    await db.insert(appliedMutations).values({
      id: mutation.id,
      userId,
      deviceId: mutation.deviceId ?? null,
      mutationName: mutation.name,
      mutationBody: mutation.payload ?? {},
      resultBody: null,
      createdAt: new Date(),
    })

    await applyDomainMutation(userId, mutation)

    const version = await recordChange(await buildRecordedChange(mutation))
    applied.push({ id: mutation.id, version, deduped: false })
  }

  return {
    applied,
    checkpoint: await getCheckpoint(),
  }
}

async function recordChange(mutation: RecordedChange) {
  const row = await db.insert(syncChanges).values({
    householdId: (mutation.payload?.householdId as string | undefined) ?? process.env.HOUSEHOLD_ID ?? null,
    entityType: mutation.entityType,
    entityId: mutation.entityId,
    operation: mutation.operation,
    payload: mutation.payload ?? null,
    createdAt: new Date(),
  }).returning({ version: syncChanges.version })

  const version = row[0]?.version ?? 0
  stream.emit('change', { version })
  return version
}

async function buildRecordedChange(mutation: SyncMutation): Promise<RecordedChange> {
  if (mutation.operation === 'delete') {
    return {
      entityType: mutation.entityType,
      entityId: mutation.entityId,
      operation: 'delete',
      payload: null,
    }
  }

  switch (mutation.entityType) {
    case 'record': {
      const row = await db.query.records.findFirst({ where: eq(records.id, mutation.entityId) })
      return row ? { ...mutation, payload: row } : { ...mutation, operation: 'delete', payload: null }
    }
    case 'item': {
      const row = await db.query.items.findFirst({ where: eq(items.id, mutation.entityId) })
      return row ? { ...mutation, payload: row } : { ...mutation, operation: 'delete', payload: null }
    }
    case 'list_item': {
      const row = await db.query.listItems.findFirst({ where: eq(listItems.id, mutation.entityId) })
      return row ? { ...mutation, payload: row } : { ...mutation, operation: 'delete', payload: null }
    }
    case 'list': {
      const row = await db.query.lists.findFirst({ where: eq(lists.id, mutation.entityId) })
      return row ? { ...mutation, payload: row } : { ...mutation, operation: 'delete', payload: null }
    }
    case 'reminder': {
      const row = await db.query.reminders.findFirst({ where: eq(reminders.id, mutation.entityId) })
      return row ? { ...mutation, payload: row } : { ...mutation, operation: 'delete', payload: null }
    }
    case 'calendar_event': {
      const row = await db.query.calendarEvents.findFirst({ where: eq(calendarEvents.id, mutation.entityId) })
      return row ? { ...mutation, payload: row } : { ...mutation, operation: 'delete', payload: null }
    }
    case 'calendar_feed': {
      const row = await db.query.calendarFeeds.findFirst({ where: eq(calendarFeeds.id, mutation.entityId) })
      return row ? { ...mutation, payload: row } : { ...mutation, operation: 'delete', payload: null }
    }
    default:
      return mutation
  }
}

async function applyDomainMutation(userId: string, mutation: SyncMutation) {
  switch (mutation.name) {
    case 'list.upsert':
      await upsertList(mutation)
      break
    case 'list.delete':
      await db.update(lists).set({ archived: true, updatedAt: new Date() }).where(eq(lists.id, mutation.entityId))
      break
    case 'task.upsert':
      await upsertTask(userId, mutation)
      break
    case 'task.delete':
      await db.update(items).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(items.id, mutation.entityId))
      break
    case 'note.upsert':
      await upsertNote(userId, mutation)
      break
    case 'note.delete':
      await db.update(items).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(items.id, mutation.entityId))
      break
    case 'note.pin':
      await setNotePinned(mutation)
      break
    case 'inbox.upsert':
      await upsertInboxItem(userId, mutation)
      break
    case 'inbox.archive':
      await db.update(items).set({ status: 'archived', updatedAt: new Date() }).where(eq(items.id, mutation.entityId))
      break
    case 'watch.upsert':
      await upsertWatchItem(userId, mutation)
      break
    case 'watch.delete':
      await db.update(items).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(items.id, mutation.entityId))
      break
    case 'record.upsert':
      await upsertRecord(mutation)
      break
    case 'record.delete':
      await db.delete(records).where(eq(records.id, mutation.entityId))
      break
    case 'shopping.upsert':
      await upsertShoppingItem(userId, mutation)
      break
    case 'shopping.delete':
      await db.update(listItems).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(listItems.id, mutation.entityId))
      break
    case 'calendar.event.upsert':
      await upsertCalendarEvent(mutation)
      break
    case 'calendar.event.delete':
      await db.delete(calendarEvents).where(eq(calendarEvents.id, mutation.entityId))
      break
    case 'calendar.feed.upsert':
      await upsertCalendarFeed(userId, mutation)
      break
    case 'calendar.feed.delete':
      await db.delete(calendarFeeds).where(eq(calendarFeeds.id, mutation.entityId))
      await db.delete(calendarEvents).where(eq(calendarEvents.calendarId, `ics:${mutation.entityId}`))
      break
    default:
      break
  }
}

async function upsertTask(userId: string, mutation: SyncMutation) {
  const payload = mutation.payload ?? {}
  const now = new Date()
  const existing = await db.query.items.findFirst({ where: eq(items.id, mutation.entityId) })

  if (existing) {
    await db.update(items).set({
      title: (payload.title as string | undefined) ?? existing.title,
      status: (payload.status as 'active' | 'completed' | 'archived' | 'snoozed' | undefined) ?? existing.status,
      listId: payload.listId === undefined ? existing.listId : (payload.listId as string | null),
      assigneeId: payload.assigneeId === undefined ? existing.assigneeId : (payload.assigneeId as string | null),
      dueDate: payload.dueDate === undefined
        ? existing.dueDate
        : (payload.dueDate ? new Date(payload.dueDate as string | number) : null),
      completedAt: payload.completedAt === undefined
        ? existing.completedAt
        : (payload.completedAt ? new Date(payload.completedAt as string | number) : null),
      updatedAt: now,
      deletedAt: payload.deletedAt ? new Date(payload.deletedAt as string | number) : existing.deletedAt,
    }).where(eq(items.id, mutation.entityId))
  } else {
    await db.insert(items).values({
      id: mutation.entityId,
      householdId: (payload.householdId as string | undefined) ?? process.env.HOUSEHOLD_ID ?? 'default',
      createdById: (payload.createdById as string | undefined) ?? userId,
      type: 'task',
      title: (payload.title as string | undefined) ?? '',
      status: (payload.status as 'active' | 'completed' | 'archived' | 'snoozed' | undefined) ?? 'active',
      listId: (payload.listId as string | null | undefined) ?? null,
      assigneeId: (payload.assigneeId as string | null | undefined) ?? null,
      dueDate: payload.dueDate ? new Date(payload.dueDate as string | number) : null,
      createdAt: now,
      updatedAt: now,
    })
  }
}

async function upsertNote(userId: string, mutation: SyncMutation) {
  const payload = mutation.payload ?? {}
  const now = new Date()
  const existing = await db.query.items.findFirst({ where: eq(items.id, mutation.entityId) })

  if (existing) {
    await db.update(items).set({
      title: (payload.title as string | undefined) ?? existing.title,
      body: payload.body === undefined ? existing.body : (payload.body as string | null),
      status: (payload.status as 'active' | 'completed' | 'archived' | 'snoozed' | undefined) ?? existing.status,
      pinned: (payload.pinned as boolean | undefined) ?? existing.pinned,
      pinnedAt: payload.pinned === undefined
        ? existing.pinnedAt
        : (payload.pinned ? now : null),
      updatedAt: now,
      deletedAt: payload.deletedAt ? new Date(payload.deletedAt as string | number) : existing.deletedAt,
    }).where(eq(items.id, mutation.entityId))
  } else {
    await db.insert(items).values({
      id: mutation.entityId,
      householdId: (payload.householdId as string | undefined) ?? process.env.HOUSEHOLD_ID ?? 'default',
      createdById: (payload.createdById as string | undefined) ?? userId,
      type: 'note',
      title: (payload.title as string | undefined) ?? '',
      body: (payload.body as string | null | undefined) ?? null,
      status: (payload.status as 'active' | 'completed' | 'archived' | 'snoozed' | undefined) ?? 'active',
      pinned: (payload.pinned as boolean | undefined) ?? false,
      pinnedAt: (payload.pinned as boolean | undefined) ? now : null,
      createdAt: now,
      updatedAt: now,
      deletedAt: payload.deletedAt ? new Date(payload.deletedAt as string | number) : null,
    })
  }
}

async function setNotePinned(mutation: SyncMutation) {
  const payload = mutation.payload ?? {}
  const now = new Date()
  const existing = await db.query.items.findFirst({ where: eq(items.id, mutation.entityId) })

  if (!existing) {
    return
  }

  const pinned = (payload.pinned as boolean | undefined) ?? existing.pinned
  await db.update(items).set({
    pinned,
    pinnedAt: pinned ? now : null,
    updatedAt: now,
  }).where(eq(items.id, mutation.entityId))
}

async function upsertInboxItem(userId: string, mutation: SyncMutation) {
  const payload = mutation.payload ?? {}
  const now = new Date()
  const existing = await db.query.items.findFirst({ where: eq(items.id, mutation.entityId) })

  if (existing) {
    await db.update(items).set({
      title: (payload.title as string | undefined) ?? existing.title,
      body: payload.body === undefined ? existing.body : (payload.body as string | null),
      status: (payload.status as 'active' | 'completed' | 'archived' | 'snoozed' | undefined) ?? existing.status,
      metadata: payload.metadata === undefined ? existing.metadata : (payload.metadata as Record<string, unknown> | null),
      updatedAt: now,
      deletedAt: payload.deletedAt ? new Date(payload.deletedAt as string | number) : existing.deletedAt,
    }).where(eq(items.id, mutation.entityId))
  } else {
    await db.insert(items).values({
      id: mutation.entityId,
      householdId: (payload.householdId as string | undefined) ?? process.env.HOUSEHOLD_ID ?? 'default',
      createdById: (payload.createdById as string | undefined) ?? userId,
      type: 'inbox',
      title: (payload.title as string | undefined) ?? '',
      body: (payload.body as string | null | undefined) ?? null,
      status: (payload.status as 'active' | 'completed' | 'archived' | 'snoozed' | undefined) ?? 'active',
      metadata: (payload.metadata as Record<string, unknown> | null | undefined) ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: payload.deletedAt ? new Date(payload.deletedAt as string | number) : null,
    })
  }
}

async function upsertRecord(mutation: SyncMutation) {
  const payload = mutation.payload ?? {}
  const now = new Date()
  const existing = await db.query.records.findFirst({ where: eq(records.id, mutation.entityId) })

  if (existing) {
    await db.update(records).set({
      category: (payload.category as typeof existing.category | undefined) ?? existing.category,
      title: (payload.title as string | undefined) ?? existing.title,
      subtitle: payload.subtitle === undefined ? existing.subtitle : (payload.subtitle as string | null),
      icon: payload.icon === undefined ? existing.icon : (payload.icon as string | null),
      fields: (payload.fields as typeof existing.fields | undefined) ?? existing.fields,
      renewalDate: payload.renewalDate ? new Date(payload.renewalDate as string | number) : payload.renewalDate === null ? null : existing.renewalDate,
      renewalLabel: payload.renewalLabel === undefined ? existing.renewalLabel : (payload.renewalLabel as string | null),
      notes: payload.notes === undefined ? existing.notes : (payload.notes as string | null),
      sortOrder: (payload.sortOrder as number | undefined) ?? existing.sortOrder,
      updatedAt: now,
    }).where(eq(records.id, mutation.entityId))
  } else {
    await db.insert(records).values({
      id: mutation.entityId,
      householdId: (payload.householdId as string | undefined) ?? process.env.HOUSEHOLD_ID ?? 'default',
      category: (payload.category as typeof records.$inferInsert.category | undefined) ?? 'reference',
      title: (payload.title as string | undefined) ?? '',
      subtitle: (payload.subtitle as string | null | undefined) ?? null,
      icon: (payload.icon as string | null | undefined) ?? null,
      fields: (payload.fields as typeof records.$inferInsert.fields | undefined) ?? [],
      renewalDate: payload.renewalDate ? new Date(payload.renewalDate as string | number) : null,
      renewalLabel: (payload.renewalLabel as string | null | undefined) ?? null,
      notes: (payload.notes as string | null | undefined) ?? null,
      sortOrder: (payload.sortOrder as number | undefined) ?? Date.now(),
      createdAt: now,
      updatedAt: now,
    })
  }
}

async function upsertWatchItem(userId: string, mutation: SyncMutation) {
  const payload = mutation.payload ?? {}
  const now = new Date()
  const existing = await db.query.items.findFirst({ where: eq(items.id, mutation.entityId) })

  if (existing) {
    await db.update(items).set({
      title: (payload.title as string | undefined) ?? existing.title,
      type: (payload.type as 'watchlist_tv' | 'watchlist_film' | undefined) ?? existing.type,
      status: (payload.status as 'active' | 'completed' | 'archived' | 'snoozed' | undefined) ?? existing.status,
      metadata: payload.metadata === undefined ? existing.metadata : (payload.metadata as Record<string, unknown> | null),
      updatedAt: now,
      deletedAt: payload.deletedAt ? new Date(payload.deletedAt as string | number) : existing.deletedAt,
    }).where(eq(items.id, mutation.entityId))
  } else {
    await db.insert(items).values({
      id: mutation.entityId,
      householdId: (payload.householdId as string | undefined) ?? process.env.HOUSEHOLD_ID ?? 'default',
      createdById: (payload.createdById as string | undefined) ?? userId,
      type: (payload.type as 'watchlist_tv' | 'watchlist_film' | undefined) ?? 'watchlist_tv',
      title: (payload.title as string | undefined) ?? '',
      status: (payload.status as 'active' | 'completed' | 'archived' | 'snoozed' | undefined) ?? 'active',
      metadata: (payload.metadata as Record<string, unknown> | null | undefined) ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: payload.deletedAt ? new Date(payload.deletedAt as string | number) : null,
    })
  }
}

async function upsertShoppingItem(userId: string, mutation: SyncMutation) {
  const payload = mutation.payload ?? {}
  const now = new Date()
  const existing = await db.query.listItems.findFirst({ where: eq(listItems.id, mutation.entityId) })

  if (existing) {
    const nextChecked = (payload.checked as boolean | undefined) ?? existing.checked
    await db.update(listItems).set({
      listId: (payload.listId as string | undefined) ?? existing.listId,
      title: (payload.title as string | undefined) ?? existing.title,
      sortOrder: (payload.sortOrder as number | undefined) ?? existing.sortOrder,
      checked: nextChecked,
      checkedAt: payload.checkedAt === undefined
        ? existing.checkedAt
        : (payload.checkedAt ? new Date(payload.checkedAt as string | number) : null),
      checkedById: nextChecked
        ? ((payload.checkedById as string | undefined) ?? existing.checkedById ?? userId)
        : null,
      updatedAt: now,
      deletedAt: existing.deletedAt ?? (payload.deletedAt ? new Date(payload.deletedAt as string | number) : null),
    }).where(eq(listItems.id, mutation.entityId))
  } else {
    await db.insert(listItems).values({
      id: mutation.entityId,
      listId: (payload.listId as string | undefined) ?? '',
      itemId: (payload.itemId as string | undefined) ?? null,
      title: (payload.title as string | undefined) ?? '',
      sortOrder: (payload.sortOrder as number | undefined) ?? 0,
      checked: (payload.checked as boolean | undefined) ?? false,
      checkedAt: payload.checkedAt ? new Date(payload.checkedAt as string | number) : null,
      checkedById: (payload.checkedById as string | undefined) ?? ((payload.checked as boolean | undefined) ? userId : null),
      createdAt: now,
      updatedAt: now,
      deletedAt: payload.deletedAt ? new Date(payload.deletedAt as string | number) : null,
    })
  }
}

async function upsertCalendarEvent(mutation: SyncMutation) {
  const payload = mutation.payload ?? {}
  const now = new Date()
  const existing = await db.query.calendarEvents.findFirst({ where: eq(calendarEvents.id, mutation.entityId) })

  if (existing) {
    await db.update(calendarEvents).set({
      externalId: payload.externalId === undefined ? existing.externalId : (payload.externalId as string | null),
      calendarId: payload.calendarId === undefined ? existing.calendarId : (payload.calendarId as string | null),
      title: (payload.title as string | undefined) ?? existing.title,
      description: payload.description === undefined ? existing.description : (payload.description as string | null),
      location: payload.location === undefined ? existing.location : (payload.location as string | null),
      startsAt: payload.startsAt ? new Date(payload.startsAt as string | number) : existing.startsAt,
      endsAt: payload.endsAt === undefined ? existing.endsAt : (payload.endsAt ? new Date(payload.endsAt as string | number) : null),
      allDay: (payload.allDay as boolean | undefined) ?? existing.allDay,
      recurrenceRule: payload.recurrenceRule === undefined ? existing.recurrenceRule : (payload.recurrenceRule as string | null),
      rawIcal: payload.rawIcal === undefined ? existing.rawIcal : (payload.rawIcal as string | null),
      lastSyncedAt: payload.lastSyncedAt === undefined
        ? existing.lastSyncedAt
        : (payload.lastSyncedAt ? new Date(payload.lastSyncedAt as string | number) : null),
      updatedAt: now,
    }).where(eq(calendarEvents.id, mutation.entityId))
  } else {
    await db.insert(calendarEvents).values({
      id: mutation.entityId,
      householdId: (payload.householdId as string | undefined) ?? process.env.HOUSEHOLD_ID ?? 'default',
      externalId: (payload.externalId as string | null | undefined) ?? null,
      calendarId: (payload.calendarId as string | null | undefined) ?? null,
      title: (payload.title as string | undefined) ?? '',
      description: (payload.description as string | null | undefined) ?? null,
      location: (payload.location as string | null | undefined) ?? null,
      startsAt: payload.startsAt ? new Date(payload.startsAt as string | number) : now,
      endsAt: payload.endsAt ? new Date(payload.endsAt as string | number) : null,
      allDay: (payload.allDay as boolean | undefined) ?? false,
      recurrenceRule: (payload.recurrenceRule as string | null | undefined) ?? null,
      rawIcal: (payload.rawIcal as string | null | undefined) ?? null,
      lastSyncedAt: payload.lastSyncedAt ? new Date(payload.lastSyncedAt as string | number) : null,
      createdAt: now,
      updatedAt: now,
    })
  }
}

async function upsertCalendarFeed(userId: string, mutation: SyncMutation) {
  const payload = mutation.payload ?? {}
  const now = new Date()
  const existing = await db.query.calendarFeeds.findFirst({ where: eq(calendarFeeds.id, mutation.entityId) })

  if (existing) {
    await db.update(calendarFeeds).set({
      name: (payload.name as string | undefined) ?? existing.name,
      url: (payload.url as string | undefined) ?? existing.url,
      color: (payload.color as string | undefined) ?? existing.color,
      enabled: (payload.enabled as boolean | undefined) ?? existing.enabled,
      lastSyncedAt: payload.lastSyncedAt === undefined
        ? existing.lastSyncedAt
        : (payload.lastSyncedAt ? new Date(payload.lastSyncedAt as string | number) : null),
      errorMessage: payload.errorMessage === undefined ? existing.errorMessage : (payload.errorMessage as string | null),
      updatedAt: now,
    }).where(eq(calendarFeeds.id, mutation.entityId))
  } else {
    await db.insert(calendarFeeds).values({
      id: mutation.entityId,
      householdId: (payload.householdId as string | undefined) ?? process.env.HOUSEHOLD_ID ?? 'default',
      userId: (payload.userId as string | null | undefined) ?? userId,
      name: (payload.name as string | undefined) ?? '',
      url: (payload.url as string | undefined) ?? '',
      color: (payload.color as string | undefined) ?? '#007AFF',
      enabled: (payload.enabled as boolean | undefined) ?? true,
      lastSyncedAt: payload.lastSyncedAt ? new Date(payload.lastSyncedAt as string | number) : null,
      errorMessage: (payload.errorMessage as string | null | undefined) ?? null,
      createdAt: now,
      updatedAt: now,
    })
  }
}

async function upsertList(mutation: SyncMutation) {
  const payload = mutation.payload ?? {}
  const now = new Date()
  const existing = await db.query.lists.findFirst({ where: eq(lists.id, mutation.entityId) })

  if (existing) {
    await db.update(lists).set({
      name: (payload.name as string | undefined) ?? existing.name,
      type: (payload.type as 'tasks' | 'shopping' | 'custom' | 'house_plans' | undefined) ?? existing.type,
      icon: (payload.icon as string | null | undefined) ?? existing.icon,
      color: (payload.color as string | null | undefined) ?? existing.color,
      archived: (payload.archived as boolean | undefined) ?? existing.archived,
      sortOrder: (payload.sortOrder as number | undefined) ?? existing.sortOrder,
      updatedAt: now,
    }).where(eq(lists.id, mutation.entityId))
  } else {
    await db.insert(lists).values({
      id: mutation.entityId,
      householdId: (payload.householdId as string | undefined) ?? process.env.HOUSEHOLD_ID ?? 'default',
      name: (payload.name as string | undefined) ?? '',
      type: (payload.type as 'tasks' | 'shopping' | 'custom' | 'house_plans' | undefined) ?? 'custom',
      icon: (payload.icon as string | null | undefined) ?? null,
      color: (payload.color as string | null | undefined) ?? null,
      archived: (payload.archived as boolean | undefined) ?? false,
      sortOrder: (payload.sortOrder as number | undefined) ?? 0,
      createdAt: now,
      updatedAt: now,
    })
  }
}
