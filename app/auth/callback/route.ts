import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSession } from '@/lib/auth/session'
import { exchangeCode, saveConnection } from '@/lib/google/oauth'

function appBase(fallback: string) {
  return process.env.NEXT_PUBLIC_APP_URL ?? fallback
}

// Google redirects here after consent (must match GOOGLE_REDIRECT_URI).
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const base = appBase(url.origin)
  const back = new URL('/calendar', base)

  const session = await getSession()
  if (!session) return NextResponse.redirect(new URL('/login', base))

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')

  const jar = await cookies()
  const expectedState = jar.get('g_oauth_state')?.value
  jar.delete('g_oauth_state')

  if (oauthError) {
    back.searchParams.set('google', 'denied')
    return NextResponse.redirect(back)
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    back.searchParams.set('google', 'error')
    return NextResponse.redirect(back)
  }

  try {
    const { tokens, email } = await exchangeCode(code)
    await saveConnection(session.user.id, tokens, email)
    back.searchParams.set('google', 'connected')
  } catch (err) {
    console.error('[google-callback] Token exchange failed:', err instanceof Error ? err.message : err)
    back.searchParams.set('google', 'error')
  }

  return NextResponse.redirect(back)
}
