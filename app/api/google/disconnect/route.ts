import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { deleteConnection } from '@/lib/google/oauth'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  await deleteConnection(session.user.id)
  return NextResponse.json({ ok: true })
}
