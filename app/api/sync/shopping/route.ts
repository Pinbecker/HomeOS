import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { listItems } from '@/lib/db/schema'
import { getSession } from '@/lib/auth/session'
import { eq, and } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { op } = body

  // Add item — client supplies the ULID so retries are safe
  if (op === 'add') {
    const { id, listId, title } = body as { id: string; listId: string; title: string }
    if (!id || !listId || !title?.trim()) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    const existing = await db.query.listItems.findFirst({ where: eq(listItems.id, id) })
    if (!existing) {
      const now = new Date()
      await db.insert(listItems).values({
        id,
        listId,
        title: title.trim(),
        sortOrder: 0,
        checked: false,
        createdAt: now,
      })
    }
    return NextResponse.json({ id })
  }

  // Set checked state — explicit final value, NOT a blind toggle.
  // This is conflict-safe: if Dan and Imogen both check the same item offline,
  // both ops say { checked: true } and the second sync is a no-op rather than
  // accidentally flipping it back to unchecked.
  if (op === 'set_checked') {
    const { id, checked } = body as { id: string; checked: boolean }
    if (!id || checked === undefined) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    const item = await db.query.listItems.findFirst({ where: eq(listItems.id, id) })
    if (!item) return NextResponse.json({ ok: true }) // already gone — discard
    if (item.checked === checked) return NextResponse.json({ ok: true }) // already correct state
    const now = new Date()
    await db.update(listItems)
      .set({
        checked,
        checkedAt: checked ? now : null,
        checkedById: checked ? session.user.id : null,
      })
      .where(eq(listItems.id, id))
    return NextResponse.json({ ok: true })
  }

  // Delete single item
  if (op === 'delete') {
    const { id } = body as { id: string }
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    await db.delete(listItems).where(eq(listItems.id, id))
    return NextResponse.json({ ok: true })
  }

  // Clear all checked items in a list
  if (op === 'clear_checked') {
    const { listId } = body as { listId: string }
    if (!listId) return NextResponse.json({ error: 'Missing listId' }, { status: 400 })
    await db.delete(listItems).where(
      and(eq(listItems.listId, listId), eq(listItems.checked, true))
    )
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown op' }, { status: 400 })
}
