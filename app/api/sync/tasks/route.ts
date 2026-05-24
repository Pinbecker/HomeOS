import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { items } from '@/lib/db/schema'
import { getSession } from '@/lib/auth/session'
import { eq } from 'drizzle-orm'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { op } = body

  // Add task — client supplies the ULID so retries are safe
  if (op === 'add') {
    const { id, listId, title } = body as { id: string; listId: string | null; title: string }
    if (!id || !title?.trim()) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    const existing = await db.query.items.findFirst({ where: eq(items.id, id) })
    if (!existing) {
      const now = new Date()
      await db.insert(items).values({
        id,
        householdId: HOUSEHOLD_ID,
        createdById: session.user.id,
        type: 'task',
        title: title.trim(),
        status: 'active',
        listId: listId === 'inbox' ? null : (listId ?? null),
        createdAt: now,
        updatedAt: now,
      })
    }
    return NextResponse.json({ id })
  }

  // Set task status — explicit final value, NOT a blind toggle.
  // Conflict-safe: if both users complete the same task offline,
  // both ops say { status: 'completed' } and the second sync is a no-op.
  if (op === 'set_status') {
    const { id, status } = body as { id: string; status: 'active' | 'completed' }
    if (!id || !status) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    const task = await db.query.items.findFirst({ where: eq(items.id, id) })
    if (!task) return NextResponse.json({ ok: true }) // already gone — discard
    if (task.status === status) return NextResponse.json({ ok: true }) // already correct state
    const now = new Date()
    await db.update(items)
      .set({
        status,
        completedAt: status === 'completed' ? now : null,
        updatedAt: now,
      })
      .where(eq(items.id, id))
    return NextResponse.json({ ok: true })
  }

  // Soft-delete task
  if (op === 'delete') {
    const { id } = body as { id: string }
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    await db.update(items).set({ deletedAt: new Date() }).where(eq(items.id, id))
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown op' }, { status: 400 })
}
