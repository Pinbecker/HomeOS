import { db } from '@/lib/db'
import { lists } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { ulid } from 'ulid'

export const GENERAL_SHOPPING_ICON = 'general-shopping'
export const GENERAL_SHOPPING_NAME = 'General'
const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

export async function ensureGeneralShoppingList() {
  const existingGeneral = await db.query.lists.findFirst({
    where: and(
      eq(lists.householdId, HOUSEHOLD_ID),
      eq(lists.type, 'shopping'),
      eq(lists.icon, GENERAL_SHOPPING_ICON),
    ),
  })
  if (existingGeneral) return existingGeneral

  const oldDefault = await db.query.lists.findFirst({
    where: and(
      eq(lists.householdId, HOUSEHOLD_ID),
      eq(lists.type, 'shopping'),
      eq(lists.name, 'Shopping'),
    ),
  })
  if (oldDefault) {
    const updatedAt = new Date()
    await db.update(lists)
      .set({
        name: GENERAL_SHOPPING_NAME,
        icon: GENERAL_SHOPPING_ICON,
        color: oldDefault.color ?? '#34C759',
        sortOrder: -1000,
        archived: false,
        updatedAt,
      })
      .where(eq(lists.id, oldDefault.id))

    return {
      ...oldDefault,
      name: GENERAL_SHOPPING_NAME,
      icon: GENERAL_SHOPPING_ICON,
      color: oldDefault.color ?? '#34C759',
      sortOrder: -1000,
      archived: false,
      updatedAt,
    }
  }

  const now = new Date()
  const id = ulid()
  const general = {
    id,
    householdId: HOUSEHOLD_ID,
    name: GENERAL_SHOPPING_NAME,
    type: 'shopping' as const,
    icon: GENERAL_SHOPPING_ICON,
    color: '#34C759',
    archived: false,
    sortOrder: -1000,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(lists).values(general)
  return general
}
