'use server'

import { db } from '@/lib/db'
import { listItems } from '@/lib/db/schema'
import { requireSession } from '@/lib/auth/session'
import { eq, and } from 'drizzle-orm'
import { ulid } from 'ulid'
import { revalidatePath } from 'next/cache'

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

  revalidatePath('/household/shopping')
  revalidatePath('/')

  return {
    item: { id, title: title.trim(), checked: false, checkedAt: null },
  }
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

  revalidatePath('/household/shopping')
  revalidatePath('/')
}

export async function clearChecked(listId: string) {
  await requireSession()
  await db.delete(listItems).where(and(eq(listItems.listId, listId), eq(listItems.checked, true)))
  revalidatePath('/household/shopping')
  revalidatePath('/')
}
