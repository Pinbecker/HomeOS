import { google } from 'googleapis'
import { db } from '@/lib/db'
import { googleCalendarConnections } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'

export type GoogleOAuthClient = InstanceType<typeof google.auth.OAuth2>
type Credentials = Parameters<GoogleOAuthClient['setCredentials']>[0]
type Connection = typeof googleCalendarConnections.$inferSelect

// Calendar read/write + the user's email (so we can show which account is linked).
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar',
]

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not configured`)
  return v
}

export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI,
  )
}

function baseClient(): GoogleOAuthClient {
  return new google.auth.OAuth2(
    env('GOOGLE_CLIENT_ID'),
    env('GOOGLE_CLIENT_SECRET'),
    env('GOOGLE_REDIRECT_URI'),
  )
}

// The URL we send the user to in order to grant calendar access.
export function consentUrl(state: string): string {
  return baseClient().generateAuthUrl({
    access_type: 'offline',     // ask for a refresh token
    prompt: 'consent',          // force a refresh token to be returned every time
    scope: SCOPES,
    include_granted_scopes: true,
    state,
  })
}

// Exchange the ?code from the callback for tokens, and read the Google account email.
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
    // Non-fatal — the connection still works without a display email.
  }

  return { tokens, email }
}

// Insert or update a user's connection after a successful consent.
export async function saveConnection(
  userId: string,
  tokens: Credentials,
  email: string | null,
): Promise<void> {
  const now = new Date()
  const existing = await db.query.googleCalendarConnections.findFirst({
    where: eq(googleCalendarConnections.userId, userId),
  })

  // Google only re-issues a refresh token on first consent; keep the old one if absent.
  const refreshToken = tokens.refresh_token ?? existing?.refreshToken
  if (!refreshToken) {
    throw new Error('No refresh token returned by Google — re-consent with prompt=consent required')
  }

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
      id: ulid(),
      userId,
      calendarId: null,
      createdAt: now,
      ...values,
    })
  }
}

// Build an OAuth client from a stored connection that auto-refreshes and
// persists the new access token whenever the library refreshes it.
function clientFromConnection(conn: Connection): GoogleOAuthClient {
  const client = baseClient()
  client.setCredentials({
    access_token: conn.accessToken ?? undefined,
    refresh_token: conn.refreshToken,
    expiry_date: conn.expiresAt ? conn.expiresAt.getTime() : undefined,
    scope: conn.scope ?? undefined,
  })

  client.on('tokens', (t) => {
    const patch: Partial<Connection> = { updatedAt: new Date() }
    if (t.access_token) patch.accessToken = t.access_token
    if (t.expiry_date) patch.expiresAt = new Date(t.expiry_date)
    if (t.refresh_token) patch.refreshToken = t.refresh_token
    db.update(googleCalendarConnections)
      .set(patch)
      .where(eq(googleCalendarConnections.id, conn.id))
      .catch(err => console.error('[google-oauth] Failed to persist refreshed token:', err))
  })

  return client
}

export async function getConnection(userId: string): Promise<Connection | undefined> {
  return db.query.googleCalendarConnections.findFirst({
    where: eq(googleCalendarConnections.userId, userId),
  })
}

// Authorized client for a specific user (for write-through on their behalf).
export async function authorizedClientForUser(userId: string): Promise<GoogleOAuthClient | null> {
  const conn = await getConnection(userId)
  return conn ? clientFromConnection(conn) : null
}

// Authorized client + its connection row (writes need the row to cache calendar id).
export async function authorizedContextForUser(
  userId: string,
): Promise<{ client: GoogleOAuthClient; conn: Connection } | null> {
  const conn = await getConnection(userId)
  return conn ? { client: clientFromConnection(conn), conn } : null
}

// Any connected account — used by the background sync to read the shared calendar.
export async function anyAuthorizedClient(): Promise<{ client: GoogleOAuthClient; conn: Connection } | null> {
  const conn = await db.query.googleCalendarConnections.findFirst()
  return conn ? { client: clientFromConnection(conn), conn } : null
}

export async function deleteConnection(userId: string): Promise<void> {
  await db.delete(googleCalendarConnections).where(eq(googleCalendarConnections.userId, userId))
}

// Persist the resolved target calendar id back onto the connection row.
export async function setConnectionCalendarId(connId: string, calendarId: string): Promise<void> {
  await db.update(googleCalendarConnections)
    .set({ calendarId, updatedAt: new Date() })
    .where(eq(googleCalendarConnections.id, connId))
}
