import { google } from 'googleapis'
import { eq } from 'drizzle-orm'
import { db } from '@homeos/db'
import { googleCalendarConnections } from '@homeos/db/schema'

export type GoogleOAuthClient = InstanceType<typeof google.auth.OAuth2>
type Credentials = Parameters<GoogleOAuthClient['setCredentials']>[0]
type Connection = typeof googleCalendarConnections.$inferSelect

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar',
]

function env(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

export function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI)
}

function baseClient(): GoogleOAuthClient {
  return new google.auth.OAuth2(
    env('GOOGLE_CLIENT_ID'),
    env('GOOGLE_CLIENT_SECRET'),
    env('GOOGLE_REDIRECT_URI'),
  )
}

export function consentUrl(state: string) {
  return baseClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    include_granted_scopes: true,
    state,
  })
}

export async function exchangeCode(code: string): Promise<{ tokens: Credentials; email: string | null }> {
  const client = baseClient()
  const { tokens } = await client.getToken(code)
  client.setCredentials(tokens)

  let email: string | null = null
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: client })
    const me = await oauth2.userinfo.get()
    email = me.data.email ?? null
  } catch {
    // The calendar token is still usable without the display email.
  }

  return { tokens, email }
}

export async function saveConnection(userId: string, tokens: Credentials, email: string | null) {
  const now = new Date()
  const existing = await db.query.googleCalendarConnections.findFirst({
    where: eq(googleCalendarConnections.userId, userId),
  })
  const refreshToken = tokens.refresh_token ?? existing?.refreshToken
  if (!refreshToken) throw new Error('No refresh token returned by Google')

  const values = {
    googleEmail: email ?? existing?.googleEmail ?? null,
    accessToken: tokens.access_token ?? null,
    refreshToken,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    scope: tokens.scope ?? existing?.scope ?? null,
    updatedAt: now,
  }

  if (existing) {
    await db.update(googleCalendarConnections).set(values).where(eq(googleCalendarConnections.id, existing.id))
  } else {
    await db.insert(googleCalendarConnections).values({
      id: crypto.randomUUID(),
      userId,
      calendarId: null,
      createdAt: now,
      ...values,
    })
  }
}

function clientFromConnection(conn: Connection): GoogleOAuthClient {
  const client = baseClient()
  client.setCredentials({
    access_token: conn.accessToken ?? undefined,
    refresh_token: conn.refreshToken,
    expiry_date: conn.expiresAt ? conn.expiresAt.getTime() : undefined,
    scope: conn.scope ?? undefined,
  })

  client.on('tokens', tokens => {
    const patch: Partial<Connection> = { updatedAt: new Date() }
    if (tokens.access_token) patch.accessToken = tokens.access_token
    if (tokens.expiry_date) patch.expiresAt = new Date(tokens.expiry_date)
    if (tokens.refresh_token) patch.refreshToken = tokens.refresh_token
    db.update(googleCalendarConnections)
      .set(patch)
      .where(eq(googleCalendarConnections.id, conn.id))
      .catch(error => console.error('[google-oauth] Failed to persist refreshed token:', error))
  })

  return client
}

export async function getConnection(userId: string) {
  return db.query.googleCalendarConnections.findFirst({
    where: eq(googleCalendarConnections.userId, userId),
  })
}

export async function authorizedContextForUser(userId: string) {
  const conn = await getConnection(userId)
  return conn ? { client: clientFromConnection(conn), conn } : null
}

export async function anyAuthorizedClient() {
  const conn = await db.query.googleCalendarConnections.findFirst()
  return conn ? { client: clientFromConnection(conn), conn } : null
}

export async function setConnectionCalendarId(connId: string, calendarId: string) {
  await db.update(googleCalendarConnections)
    .set({ calendarId, updatedAt: new Date() })
    .where(eq(googleCalendarConnections.id, connId))
}
