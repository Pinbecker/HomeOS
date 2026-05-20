'use server'

import { db } from '@/lib/db'
import { lists, listItems } from '@/lib/db/schema'
import { requireSession } from '@/lib/auth/session'
import { eq, and } from 'drizzle-orm'
import { ulid } from 'ulid'
import { revalidatePath } from 'next/cache'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

function revalidateShopping(shopId?: string) {
  revalidatePath('/household/shopping')
  revalidatePath('/household/shopping/all')
  if (shopId) revalidatePath(`/household/shopping/${shopId}`)
  revalidatePath('/')
}

// ---- Shops (lists of type 'shopping') ----

export async function createShop(name: string, color: string) {
  await requireSession()
  const id = ulid()
  const now = new Date()
  await db.insert(lists).values({
    id,
    householdId: HOUSEHOLD_ID,
    name: name.trim(),
    type: 'shopping',
    color,
    sortOrder: Date.now(),
    createdAt: now,
    updatedAt: now,
  })
  revalidateShopping(id)
  return { id }
}

export async function renameShop(shopId: string, name: string, color: string) {
  await requireSession()
  await db.update(lists)
    .set({ name: name.trim(), color, updatedAt: new Date() })
    .where(eq(lists.id, shopId))
  revalidateShopping(shopId)
}

export async function deleteShop(shopId: string) {
  await requireSession()
  // listItems cascade-delete via FK, then remove the shop
  await db.delete(listItems).where(eq(listItems.listId, shopId))
  await db.delete(lists).where(eq(lists.id, shopId))
  revalidateShopping()
}

// ---- Items ----

export async function addShoppingItem(listId: string, title: string) {
  await requireSession()
  const id = ulid()
  const now = new Date()

  await db.insert(listItems).values({
    id,
    listId,
    title: title.trim(),
    sortOrder: 0,
    checked: false,
    createdAt: now,
  })

  revalidateShopping(listId)
  return { item: { id, title: title.trim(), checked: false, checkedAt: null } }
}

export async function toggleShoppingItem(id: string) {
  const session = await requireSession()

  const item = await db.query.listItems.findFirst({ where: eq(listItems.id, id) })
  if (!item) return

  const now = new Date()
  await db.update(listItems)
    .set({
      checked: !item.checked,
      checkedAt: !item.checked ? now : null,
      checkedById: !item.checked ? session.user.id : null,
    })
    .where(eq(listItems.id, id))

  revalidateShopping(item.listId)
}

export async function clearChecked(listId: string) {
  await requireSession()
  await db.delete(listItems).where(and(eq(listItems.listId, listId), eq(listItems.checked, true)))
  revalidateShopping(listId)
}

export async function clearAllChecked() {
  await requireSession()
  const shops = await db.query.lists.findMany({
    where: and(eq(lists.householdId, HOUSEHOLD_ID), eq(lists.type, 'shopping')),
    columns: { id: true },
  })
  for (const s of shops) {
    await db.delete(listItems).where(and(eq(listItems.listId, s.id), eq(listItems.checked, true)))
  }
  revalidateShopping()
}
