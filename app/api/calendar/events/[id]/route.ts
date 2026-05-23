import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { updateEvent, deleteEvent, NotConnectedError } from '@/lib/google/calendar'

const eventSchema = z.object({
  title: z.string().trim().min(1).max(500),
  allDay: z.boolean(),
  start: z.number().int(),
  end: z.number().int(),
  location: z.string().trim().max(500).nullish(),
  description: z.string().trim().max(5000).nullish(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const parsed = eventSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  try {
    await updateEvent(session.user.id, id, parsed.data)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof NotConnectedError) return NextResponse.json({ error: 'not_connected' }, { status: 409 })
    console.error('[api/calendar/events] update failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  try {
    await deleteEvent(session.user.id, id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof NotConnectedError) return NextResponse.json({ error: 'not_connected' }, { status: 409 })
    console.error('[api/calendar/events] delete failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
  }
}
