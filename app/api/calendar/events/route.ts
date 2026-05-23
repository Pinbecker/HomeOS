import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { createEvent, NotConnectedError } from '@/lib/google/calendar'

const eventSchema = z.object({
  title: z.string().trim().min(1).max(500),
  allDay: z.boolean(),
  start: z.number().int(),
  end: z.number().int(),
  location: z.string().trim().max(500).nullish(),
  description: z.string().trim().max(5000).nullish(),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = eventSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  try {
    const externalId = await createEvent(session.user.id, parsed.data)
    return NextResponse.json({ ok: true, externalId })
  } catch (err) {
    if (err instanceof NotConnectedError) {
      return NextResponse.json({ error: 'not_connected' }, { status: 409 })
    }
    console.error('[api/calendar/events] create failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'create_failed' }, { status: 500 })
  }
}
