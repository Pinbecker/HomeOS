import { NextRequest, NextResponse } from 'next/server'
import { ulid } from 'ulid'
import { db } from '@/lib/db'
import { pushSubscriptions } from '@/lib/db/schema'
import { requireSession } from '@/lib/auth/session'
import { eq } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  const session = await requireSession()
  const body = await req.json()
  const { endpoint, keys } = body
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  // Upsert by endpoint so re-subscribing the same device is idempotent
  const existing = await db.query.pushSubscriptions.findFirst({
    where: eq(pushSubscriptions.endpoint, endpoint),
  })

  if (existing) {
    await db.update(pushSubscriptions)
      .set({ userId: session.user.id, p256dh: keys.p256dh, auth: keys.auth })
      .where(eq(pushSubscriptions.endpoint, endpoint))
  } else {
    await db.insert(pushSubscriptions).values({
      id: ulid(),
      userId: session.user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      createdAt: new Date(),
    })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  await requireSession()
  const body = await req.json()
  const { endpoint } = body
  if (!endpoint) return NextResponse.json({ error: 'No endpoint' }, { status: 400 })

  await db.delete(pushSubscriptions).where(
    eq(pushSubscriptions.endpoint, endpoint)
  )
  return NextResponse.json({ ok: true })
}
