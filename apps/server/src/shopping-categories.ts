import { and, eq, isNull, lte } from 'drizzle-orm'
import { db } from '@homeos/db'
import { household, listItems, lists, shoppingCategoryJobs } from '@homeos/db/schema'
import { categorizeShoppingItems } from './ai-planner'

const QUIET_PERIOD_MS = 15_000
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000]

function key(title: string) {
  return title.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function object(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function stringMap(value: unknown) {
  return Object.fromEntries(Object.entries(object(value)).filter(([, row]) => typeof row === 'string').map(([id, row]) => [id, row as string]))
}

function shopMaps(settings: Record<string, unknown> | null | undefined, listId: string) {
  const planner = object(settings?.shoppingPlanner)
  return {
    categories: stringMap(object(planner.shopCategories)[listId]),
    attempts: stringMap(object(planner.shopCategoryAttempts)[listId]),
  }
}

export async function queueShoppingCategorization(listId: string, householdId: string) {
  const now = new Date()
  const dueAt = new Date(now.getTime() + QUIET_PERIOD_MS)
  const existing = await db.query.shoppingCategoryJobs.findFirst({ where: eq(shoppingCategoryJobs.listId, listId) })
  if (existing) {
    await db.update(shoppingCategoryJobs).set({ dueAt, updatedAt: now, attempts: 0, lastError: null }).where(eq(shoppingCategoryJobs.listId, listId))
  } else {
    await db.insert(shoppingCategoryJobs).values({ listId, householdId, dueAt, attempts: 0, lastError: null, createdAt: now, updatedAt: now })
  }
}

export async function processShoppingCategoryJobs(onHouseholdUpdated: (row: typeof household.$inferSelect) => Promise<void>) {
  const jobs = await db.query.shoppingCategoryJobs.findMany({ where: lte(shoppingCategoryJobs.dueAt, new Date()) })
  for (const job of jobs) {
    try {
      const [shop, home, rows] = await Promise.all([
        db.query.lists.findFirst({ where: and(eq(lists.id, job.listId), eq(lists.type, 'shopping'), eq(lists.archived, false)) }),
        db.query.household.findFirst({ where: eq(household.id, job.householdId) }),
        db.query.listItems.findMany({ where: and(eq(listItems.listId, job.listId), isNull(listItems.deletedAt)) }),
      ])
      if (!shop || !home) {
        await db.delete(shoppingCategoryJobs).where(eq(shoppingCategoryJobs.listId, job.listId))
        continue
      }
      const { categories, attempts } = shopMaps(home.settings, job.listId)
      const pending = rows.filter(row => {
        const category = categories[row.id]
        return !category || (category === 'Other' && attempts[row.id] !== row.title)
      })
      if (!pending.length) {
        await db.delete(shoppingCategoryJobs).where(eq(shoppingCategoryJobs.listId, job.listId))
        continue
      }

      const resolved = new Map((await categorizeShoppingItems(pending.map(row => row.title))).map(row => [key(row.title), row.category]))
      const nextCategories = { ...categories }
      const nextAttempts = { ...attempts }
      for (const item of pending) {
        const category = resolved.get(key(item.title)) ?? 'Other'
        nextCategories[item.id] = category
        if (category === 'Other') nextAttempts[item.id] = item.title
        else delete nextAttempts[item.id]
      }
      const planner = object(home.settings?.shoppingPlanner)
      const settings = {
        ...(home.settings ?? {}),
        shoppingPlanner: {
          ...planner,
          shopCategories: { ...object(planner.shopCategories), [job.listId]: nextCategories },
          shopCategoryAttempts: { ...object(planner.shopCategoryAttempts), [job.listId]: nextAttempts },
        },
      }
      await db.update(household).set({ settings }).where(eq(household.id, home.id))
      const updated = await db.query.household.findFirst({ where: eq(household.id, home.id) })
      if (updated) await onHouseholdUpdated(updated)
      await db.delete(shoppingCategoryJobs).where(eq(shoppingCategoryJobs.listId, job.listId))
    } catch (error) {
      const now = new Date()
      const nextAttempt = job.attempts + 1
      const delay = RETRY_DELAYS_MS[Math.min(nextAttempt - 1, RETRY_DELAYS_MS.length - 1)]
      await db.update(shoppingCategoryJobs).set({ attempts: nextAttempt, lastError: error instanceof Error ? error.message.slice(0, 500) : 'Categorisation failed', dueAt: new Date(now.getTime() + delay), updatedAt: now }).where(eq(shoppingCategoryJobs.listId, job.listId))
    }
  }
}
