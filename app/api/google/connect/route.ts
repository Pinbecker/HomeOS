import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { getSession } from '@/lib/auth/session'
import { consentUrl, isGoogleConfigured } from '@/lib/google/oauth'

function appBase() {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}

// Kicks off the OAuth consent flow. Navigated to directly (a link), so it
// 302-redirects the browser to Google's consent screen.
export async function GET() {
  if (!isGoogleConfigured()) {
    return NextResponse.json({ error: 'Google Calendar is not configured on the server' }, { status: 500 })
  }

  const session = await getSession()
  if (!session) return NextResponse.redirect(new URL('/login', appBase()))

  const state = randomBytes(16).toString('hex')
  const jar = await cookies()
  jar.set('g_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })

  return NextResponse.redirect(consentUrl(state))
}
