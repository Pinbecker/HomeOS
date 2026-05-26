import fs from 'node:fs/promises'
import path from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import Fastify from 'fastify'
import { fromNodeHeaders } from 'better-auth/node'
import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm'
import { auth } from '@homeos/auth'
import { db } from '@homeos/db'
import { calendarFeeds, items, pushSubscriptions, tvChannels, tvProgrammes } from '@homeos/db/schema'
import { exchangeCode, isGoogleConfigured, saveConnection, consentUrl } from './google-oauth'
import { syncGoogleCalendar } from './google-calendar'
import { syncAllIcsFeeds, syncIcsFeed } from './ics-sync'
import { applyMutations, buildBootstrap, getCheckpoint, getSession, pullChanges, recordExternalChange, subscribe, sweepOrphanedRecordReminders, type SyncMutation } from './sync'
import { transcribeAudio } from './ai-planner'
import { appendConversationUserMessage, confirmAiJob, conversationMessages, getActiveInboxItem, recentAiJobs, runAiCapture } from './ai-service'
import { dispatchBinNotifications, dispatchDailyTaskNotifications, dispatchReminders, dispatchTaskDueNotifications, dispatchTvNotifications } from './notification-jobs'

const app = Fastify({
  logger: true,
  bodyLimit: 25 * 1024 * 1024,
})
const webDist = path.resolve(process.cwd(), 'apps/web/dist')
const GOOGLE_SYNC_INTERVAL_MS = Number(process.env.GOOGLE_SYNC_INTERVAL_MS ?? 60_000)
let googleSyncInFlight: Promise<number> | null = null

app.addHook('onRequest', async (request, reply) => {
  reply.header('Access-Control-Allow-Origin', process.env.VITE_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '*')
  reply.header('Access-Control-Allow-Credentials', 'true')
  reply.header('Access-Control-Allow-Headers', 'Content-Type')
  reply.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')

  if (request.url.startsWith('/api/')) {
    reply.header('Cache-Control', 'no-store')
  }

  if (request.method === 'OPTIONS') {
    return reply.status(204).send()
  }
})

app.route({
  method: ['GET', 'POST'],
  url: '/api/auth/*',
  async handler(request, reply) {
    const url = new URL(request.url, process.env.BETTER_AUTH_URL ?? `http://${request.headers.host}`)
    const headers = fromNodeHeaders(request.headers)
    const req = new Request(url.toString(), {
      method: request.method,
      headers,
      body: request.body ? JSON.stringify(request.body) : undefined,
    })

    const response = await auth.handler(req)
    reply.status(response.status)
    response.headers.forEach((value, key) => reply.header(key, value))
    return reply.send(response.body ? await response.text() : null)
  },
})

app.get('/api/health', async (_request, reply) => {
  try {
    db.run(sql`SELECT 1`)
    return reply.send({
      status: 'ok',
      db: 'connected',
      version: process.env.npm_package_version ?? '0.1.0',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      checkpoint: await getCheckpoint(),
    })
  } catch (error) {
    requestLog(error)
    return reply.status(503).send({ status: 'error', db: 'disconnected' })
  }
})

app.get('/api/bootstrap', async (request, reply) => {
  const session = await getSession(request)
  if (!session) return reply.status(401).send({ error: 'Unauthorized' })

  const bootstrap = await buildBootstrap()
  return reply.send({
    session,
    ...bootstrap,
  })
})

app.get('/api/sync/pull', async (request, reply) => {
  const session = await getSession(request)
  if (!session) return reply.status(401).send({ error: 'Unauthorized' })

  const since = Number((request.query as { since?: string }).since ?? 0)
  return reply.send(await pullChanges(since))
})

app.post('/api/sync/push', async (request, reply) => {
  const session = await getSession(request)
  if (!session) return reply.status(401).send({ error: 'Unauthorized' })

  const body = (request.body ?? {}) as { mutations?: SyncMutation[] }
  const mutations = Array.isArray(body.mutations) ? body.mutations : []

  return reply.send(await applyMutations(session.user.id, mutations))
})

app.get('/api/sync/stream', async (request, reply) => {
  const session = await getSession(request)
  if (!session) return reply.status(401).send({ error: 'Unauthorized' })

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  })

  const write = (event: string, payload: unknown) => {
    reply.raw.write(`event: ${event}\n`)
    reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`)
  }

  write('ready', { checkpoint: await getCheckpoint() })

  const stop = subscribe(change => write('change', change))
  const keepAlive = setInterval(() => write('ping', { ts: Date.now() }), 15000)

  request.raw.on('close', () => {
    clearInterval(keepAlive)
    stop()
  })
})

app.get('/api/me', async (request, reply) => {
  const session = await getSession(request)
  if (!session) return reply.status(401).send({ error: 'Unauthorized' })
  return reply.send(session)
})

app.get('/api/google/connect', async (request, reply) => {
  if (!isGoogleConfigured()) return reply.status(500).send({ error: 'Google Calendar is not configured' })
  const session = await getSession(request)
  if (!session) return reply.redirect('/login')

  const state = randomBytes(16).toString('hex')
  reply.header('Set-Cookie', `g_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`)
  return reply.redirect(consentUrl(state))
})

app.get('/api/push/config', async (request, reply) => {
  const session = await getSession(request)
  if (!session) return reply.status(401).send({ error: 'Unauthorized' })
  return reply.send({ publicKey: process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '' })
})

app.post('/api/push/subscribe', async (request, reply) => {
  const session = await getSession(request)
  if (!session) return reply.status(401).send({ error: 'Unauthorized' })

  const body = (request.body ?? {}) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  if (!body.endpoint || !body.keys?.p256dh || !body.keys.auth) {
    return reply.status(400).send({ error: 'Invalid push subscription' })
  }

  const now = new Date()
  const existing = await db.query.pushSubscriptions.findFirst({ where: eq(pushSubscriptions.endpoint, body.endpoint) })
  if (existing) {
    await db.update(pushSubscriptions)
      .set({ userId: session.user.id, p256dh: body.keys.p256dh, auth: body.keys.auth })
      .where(eq(pushSubscriptions.endpoint, body.endpoint))
  } else {
    await db.insert(pushSubscriptions).values({
      id: `push-${randomUUID()}`,
      userId: session.user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      createdAt: now,
    })
  }
  return reply.send({ ok: true })
})

app.delete('/api/push/subscribe', async (request, reply) => {
  const session = await getSession(request)
  if (!session) return reply.status(401).send({ error: 'Unauthorized' })

  const body = (request.body ?? {}) as { endpoint?: string }
  if (body.endpoint) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, body.endpoint))
  return reply.send({ ok: true })
})

app.get('/auth/callback', async (request, reply) => {
  const session = await getSession(request)
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VITE_APP_URL ?? `https://${request.headers.host}`
  const back = new URL('/calendar', base)
  if (!session) return reply.redirect('/login')

  const query = request.query as { code?: string; state?: string; error?: string }
  const expectedState = cookieValue(request.headers.cookie ?? '', 'g_oauth_state')
  reply.header('Set-Cookie', 'g_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0')

  if (query.error) {
    back.searchParams.set('google', 'denied')
    return reply.redirect(back.toString())
  }
  if (!query.code || !query.state || !expectedState || query.state !== expectedState) {
    back.searchParams.set('google', 'error')
    return reply.redirect(back.toString())
  }

  try {
    const { tokens, email } = await exchangeCode(query.code)
    await saveConnection(session.user.id, tokens, email)
    await syncAndRecordGoogleCalendar()
    back.searchParams.set('google', 'connected')
  } catch (error) {
    requestLog(error)
    back.searchParams.set('google', 'error')
  }

  return reply.redirect(back.toString())
})

app.get('/api/watch/initial', async (request, reply) => {
  const session = await getSession(request)
  if (!session) return reply.status(401).send({ error: 'Unauthorized' })

  const now = new Date()
  const followedShows = await db.query.items.findMany({
    where: and(eq(items.type, 'watchlist_tv'), eq(items.status, 'active'), isNull(items.deletedAt)),
    columns: { id: true, title: true, metadata: true },
  })
  const feedIds = getMainChannelDefs().map(channel => channel.feedId)
  const [channels, tonight, initialGrid] = await Promise.all([
    getOnNow(now),
    getTodayMatches(followedShows.map(show => ({
      title: show.title,
      channel: typeof show.metadata?.channel === 'string' ? show.metadata.channel : null,
    })), now),
    getDayGrid(feedIds, now),
  ])

  return reply.send({
    channels,
    followedShows,
    tonight,
    initialGrid,
    today: ymd(now),
  })
})

app.get('/api/watch/tonight', async (request, reply) => {
  const session = await getSession(request)
  if (!session) return reply.status(401).send({ error: 'Unauthorized' })

  const followedShows = await db.query.items.findMany({
    where: and(eq(items.type, 'watchlist_tv'), eq(items.status, 'active'), isNull(items.deletedAt)),
    columns: { title: true, metadata: true },
  })
  const tonight = await getTodayMatches(followedShows.map(show => ({
    title: show.title,
    channel: typeof show.metadata?.channel === 'string' ? show.metadata.channel : null,
  })), new Date())

  return reply.send(tonight.map(programme => ({
    title: programme.title,
    channel: channelName(programme.channelId),
    airtime: formatAirtime(programme.startsAt),
    channelId: programme.channelId,
    atMs: programme.startsAt.getTime(),
  })))
})

app.get('/api/watch/grid/:date', async (request, reply) => {
  const session = await getSession(request)
  if (!session) return reply.status(401).send({ error: 'Unauthorized' })

  const dateParam = (request.params as { date?: string }).date ?? ''
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateParam)
  const target = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date()
  const feedIds = getMainChannelDefs().map(channel => channel.feedId)
  return reply.send(await getDayGrid(feedIds, target))
})

app.get('/api/watch/channel/:channelId', async (request, reply) => {
  const session = await getSession(request)
  if (!session) return reply.status(401).send({ error: 'Unauthorized' })

  const channelId = (request.params as { channelId?: string }).channelId ?? ''
  const dateParam = (request.query as { date?: string }).date
  const date = dateParam ? new Date(dateParam) : new Date()
  return reply.send(await getChannelDay(channelId, date))
})

app.post('/api/calendar/feeds/:id/sync', async (request, reply) => {
  const session = await getSession(request)
  if (!session) return reply.status(401).send({ error: 'Unauthorized' })

  const id = (request.params as { id?: string }).id ?? ''
  const feed = await db.query.calendarFeeds.findFirst({ where: and(eq(calendarFeeds.id, id), eq(calendarFeeds.userId, session.user.id)) })
  if (!feed) return reply.status(404).send({ error: 'Not found' })

  const result = await syncIcsFeed(id)
  return reply.status(result.error ? 500 : 200).send(result)
})

app.post('/api/calendar/google/sync', async (request, reply) => {
  const session = await getSession(request)
  if (!session) return reply.status(401).send({ error: 'Unauthorized' })

  try {
    const changes = await syncAndRecordGoogleCalendar()
    return reply.send({ count: changes })
  } catch (error) {
    requestLog(error)
    return reply.status(500).send({ error: 'sync_failed' })
  }
})

app.post('/api/ai/capture', async (request, reply) => {
  const session = await getSession(request)
  if (!session) return reply.status(401).send({ error: 'Unauthorized' })

  try {
    const body = (request.body ?? {}) as {
      text?: string
      sourceType?: 'typed_capture' | 'inbox_triage'
      sourceContext?: Record<string, unknown>
    }
    const rawInput = body.text?.trim()
    if (!rawInput) return reply.status(400).send({ error: 'Nothing to capture yet.' })

    return reply.send(await runAiCapture({
      rawInput,
      inputType: 'text',
      sourceType: body.sourceType ?? 'typed_capture',
      sourceContext: body.sourceContext ?? { route: 'capture' },
    }, session.user))
  } catch (error) {
    requestLog(error)
    return reply.status(500).send({ error: error instanceof Error ? error.message : 'AI capture failed' })
  }
})

app.post('/api/ai/voice', async (request, reply) => {
  const session = await getSession(request)
  if (!session) return reply.status(401).send({ error: 'Unauthorized' })

  try {
    const body = (request.body ?? {}) as {
      audioBase64?: string
      mimeType?: string
      fileName?: string
    }
    if (!body.audioBase64) return reply.status(400).send({ error: 'No audio was attached.' })

    const bytes = Buffer.from(body.audioBase64, 'base64')
    const audio = new File([bytes], body.fileName ?? 'capture.webm', { type: body.mimeType ?? 'audio/webm' })
    const transcript = await transcribeAudio(audio)
    if (!transcript.text) return reply.status(400).send({ error: 'I could not hear enough to save that.' })

    const result = await runAiCapture({
      rawInput: transcript.text,
      inputType: 'voice',
      sourceType: 'voice',
      sourceContext: {
        route: 'voice_capture',
        fileName: audio.name,
        mimeType: audio.type,
        sizeBytes: audio.size,
      },
      transcriptConfidence: transcript.confidence,
    }, session.user)

    return reply.send({ ...result, transcript: transcript.text })
  } catch (error) {
    requestLog(error)
    return reply.status(500).send({ error: error instanceof Error ? error.message : 'Voice capture failed' })
  }
})

app.post('/api/ai/inbox/:itemId/triage', async (request, reply) => {
  const session = await getSession(request)
  if (!session) return reply.status(401).send({ error: 'Unauthorized' })

  try {
    const itemId = (request.params as { itemId?: string }).itemId ?? ''
    const body = (request.body ?? {}) as { message?: string; conversationId?: string | null }
    const item = await getActiveInboxItem(itemId)
    if (!item) return reply.status(404).send({ error: 'Inbox item not found.' })

    let previousMessages = await conversationMessages(body.conversationId)
    if (body.conversationId && body.message?.trim()) {
      previousMessages = await appendConversationUserMessage(body.conversationId, body.message.trim())
    }

    const rawInput = body.message?.trim()
      ? `${item.title}\n\nFollow-up: ${body.message.trim()}`
      : [item.title, item.body].filter(Boolean).join('\n\n')

    return reply.send(await runAiCapture({
      rawInput,
      inputType: 'text',
      sourceType: 'inbox_triage',
      sourceContext: { route: 'inbox_triage', itemId, existingMetadata: item.metadata ?? null },
      originItemId: itemId,
      conversationId: body.conversationId ?? null,
      previousMessages,
    }, session.user))
  } catch (error) {
    requestLog(error)
    return reply.status(500).send({ error: error instanceof Error ? error.message : 'Inbox AI triage failed' })
  }
})

app.post('/api/ai/jobs/:jobId/confirm', async (request, reply) => {
  const session = await getSession(request)
  if (!session) return reply.status(401).send({ error: 'Unauthorized' })

  try {
    const jobId = (request.params as { jobId?: string }).jobId ?? ''
    return reply.send(await confirmAiJob(jobId, session.user))
  } catch (error) {
    requestLog(error)
    return reply.status(500).send({ error: error instanceof Error ? error.message : 'AI confirmation failed' })
  }
})

app.get('/api/ai/jobs', async (request, reply) => {
  const session = await getSession(request)
  if (!session) return reply.status(401).send({ error: 'Unauthorized' })
  return reply.send({ jobs: await recentAiJobs() })
})

app.get('/*', async (request, reply) => {
  if (request.url.startsWith('/api/')) {
    return reply.status(404).send({ error: 'Not found' })
  }

  const pathnameOnly = request.url.split('?')[0] ?? '/'
  const pathname = pathnameOnly === '/' ? '/index.html' : pathnameOnly
  const candidate = path.join(webDist, pathname.replace(/^\//, ''))

  try {
    const file = await fs.readFile(candidate)
    reply.header('Content-Type', contentType(candidate))
    reply.header('Cache-Control', cacheControl(candidate))
    return reply.send(file)
  } catch {
    try {
      const index = await fs.readFile(path.join(webDist, 'index.html'))
      reply.header('Content-Type', 'text/html; charset=utf-8')
      reply.header('Cache-Control', 'no-store')
      return reply.send(index)
    } catch {
      return reply.status(404).send({ error: 'Web bundle not found' })
    }
  }
})

const port = Number(process.env.PORT ?? 3000)

app.listen({ port, host: '0.0.0.0' }).catch(error => {
  requestLog(error)
  process.exit(1)
})

setInterval(() => {
  syncAllIcsFeeds().catch(error => app.log.error(error))
}, 10 * 60 * 1000)

setInterval(() => {
  syncAndRecordGoogleCalendar().catch(error => app.log.error(error))
}, GOOGLE_SYNC_INTERVAL_MS)

setInterval(() => {
  dispatchReminders(recordExternalChange).catch(error => app.log.error(error))
  dispatchTaskDueNotifications(recordExternalChange).catch(error => app.log.error(error))
}, 60_000)

setInterval(() => {
  dispatchBinNotifications().catch(error => app.log.error(error))
  dispatchDailyTaskNotifications().catch(error => app.log.error(error))
  dispatchTvNotifications().catch(error => app.log.error(error))
}, 60 * 60 * 1000)

setTimeout(() => {
  sweepOrphanedRecordReminders().catch(error => app.log.error(error))
  syncAllIcsFeeds().catch(error => app.log.error(error))
  syncAndRecordGoogleCalendar().catch(error => app.log.error(error))
  dispatchReminders(recordExternalChange).catch(error => app.log.error(error))
  dispatchTaskDueNotifications(recordExternalChange).catch(error => app.log.error(error))
  dispatchBinNotifications().catch(error => app.log.error(error))
  dispatchDailyTaskNotifications().catch(error => app.log.error(error))
  dispatchTvNotifications().catch(error => app.log.error(error))
}, 15_000)

function cookieValue(cookieHeader: string, name: string) {
  const found = cookieHeader
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`))
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null
}

async function syncAndRecordGoogleCalendar() {
  if (googleSyncInFlight) return googleSyncInFlight

  googleSyncInFlight = (async () => {
    const changes = await syncGoogleCalendar()
    for (const change of changes) {
      await recordExternalChange(change)
    }
    return changes.length
  })()

  try {
    return await googleSyncInFlight
  } finally {
    googleSyncInFlight = null
  }
}

function requestLog(error: unknown) {
  app.log.error(error)
}

function contentType(filePath: string) {
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8'
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8'
  if (filePath.endsWith('.svg')) return 'image/svg+xml'
  if (filePath.endsWith('.png')) return 'image/png'
  if (filePath.endsWith('.ico')) return 'image/x-icon'
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8'
  return 'application/octet-stream'
}

function cacheControl(filePath: string) {
  if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
    return 'no-store'
  }

  if (filePath.includes('/assets/')) {
    return 'public, max-age=31536000, immutable'
  }

  return 'public, max-age=3600'
}

type Programme = typeof tvProgrammes.$inferSelect
type GridChannel = {
  feedId: string
  name: string
  logo: string | null
  programmes: Programme[]
}
type ChannelNowNext = {
  feedId: string
  name: string
  logo: string | null
  now: Programme | null
  next: Programme | null
}
type FollowMatch = { title: string; channel: string | null }
type ChannelDef = { feedId: string; name: string }

const REGION = process.env.TV_REGION ?? 'south_west'
const BBC_ONE_BY_REGION: Record<string, string> = {
  london: 'BBCOneLondonHD.uk',
  south: 'BBCOneSouth.uk',
  south_west: 'BBCOneSouthWest.uk',
  north_west: 'BBCOneNorthWest.uk',
  midlands: 'BBCOneWestMidlands.uk',
  wales: 'BBCOneWalesHD.uk',
  scotland: 'BBCOneScotHD.uk',
}
const ITV1_BY_REGION: Record<string, string> = {
  london: 'ITV1London.uk',
  south: 'ITV1MeridianS.uk',
  south_west: 'ITV1WestCountry.uk',
  north_west: 'ITV1Granada.uk',
  midlands: 'ITV1CentralW.uk',
  wales: 'ITV1Wales.uk',
  scotland: 'STVCentral.uk',
}
const CHANNEL4_BY_REGION: Record<string, string> = {
  london: 'Channel4London.uk',
  south: 'Channel4South.uk',
  south_west: 'Channel4South.uk',
  north_west: 'Channel4North.uk',
  midlands: 'Channel4Midlands.uk',
  wales: 'Channel4London.uk',
  scotland: 'Channel4Scotland.uk',
}
const channelDefs: ChannelDef[] = [
  { feedId: regional(BBC_ONE_BY_REGION), name: 'BBC One' },
  { feedId: 'BBCTwoHD.uk', name: 'BBC Two' },
  { feedId: regional(ITV1_BY_REGION), name: 'ITV1' },
  { feedId: regional(CHANNEL4_BY_REGION), name: 'Channel 4' },
  { feedId: '5.uk', name: 'Channel 5' },
  { feedId: 'ITV2.uk', name: 'ITV2' },
  { feedId: 'BBCThreeHD.uk', name: 'BBC Three' },
  { feedId: 'BBCFourHD.uk', name: 'BBC Four' },
  { feedId: 'ITV3.uk', name: 'ITV3' },
  { feedId: 'ITV4.uk', name: 'ITV4' },
  { feedId: 'E4.uk', name: 'E4' },
  { feedId: 'E4Extra.uk', name: 'E4 Extra' },
  { feedId: 'More4.uk', name: 'More4' },
  { feedId: '4seven.uk', name: '4seven' },
  { feedId: 'Film4.uk', name: 'Film4' },
  { feedId: 'SkyMix.uk', name: 'Sky Mix' },
  { feedId: 'SkyArts.uk', name: 'Sky Arts' },
  { feedId: 'UAndDave.uk', name: 'U&Dave' },
  { feedId: 'UAndDrama.uk', name: 'U&Drama' },
  { feedId: 'UAndYesterday.uk', name: 'U&Yesterday' },
  { feedId: 'UAndW.uk', name: 'U&W' },
  { feedId: 'UAndEden.uk', name: 'U&Eden' },
  { feedId: '5USA.uk', name: '5USA' },
  { feedId: '5Star.uk', name: '5Star' },
  { feedId: '5Action.uk', name: '5Action' },
  { feedId: '5Select.uk', name: '5Select' },
  { feedId: 'Quest.uk', name: 'Quest' },
  { feedId: 'QuestRed.uk', name: 'Quest Red' },
  { feedId: 'DMAX.uk', name: 'DMAX' },
  { feedId: 'TLC.uk', name: 'TLC' },
  { feedId: 'FoodNetwork.uk', name: 'Food Network' },
  { feedId: 'Blaze.uk', name: 'Blaze' },
  { feedId: 'Legend.uk', name: 'Legend' },
  { feedId: 'Really.uk', name: 'Really' },
  { feedId: 'TrueCrime.uk', name: 'True Crime' },
  { feedId: 'GreatTV.uk', name: 'GREAT! TV' },
  { feedId: 'GreatMovies.uk', name: 'GREAT! Movies' },
  { feedId: 'GreatAction.uk', name: 'GREAT! Action' },
  { feedId: 'GreatMystery.uk', name: 'GREAT! Mystery' },
  { feedId: 'Movies24.uk', name: 'Movies24' },
  { feedId: 'TalkingPicturesTV.uk', name: 'Talking Pictures TV' },
  { feedId: 'RewindTV.uk', name: 'Rewind TV' },
  { feedId: 'ThatsTV.uk', name: "That's TV" },
  { feedId: 'TogetherTV.uk', name: 'Together TV' },
  { feedId: 'PBSAmerica.uk', name: 'PBS America' },
  { feedId: 'CourtTV.uk', name: 'Court TV' },
  { feedId: 'LondonLive.uk', name: 'London Live' },
  { feedId: 'CBBC.uk', name: 'CBBC' },
  { feedId: 'CBeebies.uk', name: 'CBeebies' },
  { feedId: 'BBCNews.uk', name: 'BBC News' },
  { feedId: 'SkyNews.uk', name: 'Sky News' },
  { feedId: 'GBNews.uk', name: 'GB News' },
  { feedId: 'CNNInternational.uk', name: 'CNN' },
  { feedId: 'AlJazeeraEnglish.qa', name: 'Al Jazeera' },
  { feedId: 'CNBCEurope.uk', name: 'CNBC' },
  { feedId: 'BloombergTVEurope.uk', name: 'Bloomberg' },
  { feedId: 'NewsmaxTV.uk', name: 'Newsmax' },
  { feedId: 'LBCNews.uk', name: 'LBC News' },
  { feedId: 'BBCParliament.uk', name: 'BBC Parliament' },
  { feedId: 'BBCScotland.uk', name: 'BBC Scotland' },
  { feedId: 'BBCAlba.uk', name: 'BBC Alba' },
  { feedId: 'S4C.uk', name: 'S4C' },
  { feedId: 'STVCentral.uk', name: 'STV' },
  { feedId: 'UTV.uk', name: 'UTV' },
  { feedId: 'QVCUK.uk', name: 'QVC' },
  { feedId: 'QVCBeautyUK.uk', name: 'QVC Beauty' },
  { feedId: 'QVCStyleUK.uk', name: 'QVC Style' },
  { feedId: 'IdealWorld.uk', name: 'Ideal World' },
  { feedId: 'GemsTV.uk', name: 'Gemporia' },
  { feedId: 'HighStreetTV1.uk', name: 'High Street TV' },
  { feedId: 'MustHaveIdeas.uk', name: 'Must Have Ideas' },
  { feedId: 'TJC.uk', name: 'TJC' },
]
const MAIN_CHANNELS = new Set(['BBC One', 'BBC Two', 'ITV1', 'Channel 4', 'Channel 5', 'ITV2', 'BBC Three', 'BBC Four', 'ITV3', 'ITV4', 'E4', 'More4', 'Film4', 'Sky Mix', '5USA', 'U&Dave'])
const channelById = new Map(channelDefs.map(channel => [channel.feedId, channel]))

function regional(map: Record<string, string>) {
  return map[REGION] ?? map.london
}

function getMainChannelDefs() {
  return channelDefs.filter(channel => MAIN_CHANNELS.has(channel.name))
}

function channelName(feedId: string) {
  return channelById.get(feedId)?.name ?? feedId
}

function formatAirtime(date: Date) {
  return date.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hourCycle: 'h12', timeZone: 'Europe/London' })
}

function ymd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

async function channelLogoMap() {
  const rows = await db.select({ id: tvChannels.id, logo: tvChannels.logo }).from(tvChannels)
  return new Map(rows.map(row => [row.id, row.logo]))
}

async function getOnNow(at: Date): Promise<ChannelNowNext[]> {
  const horizon = new Date(at.getTime() + 12 * 60 * 60 * 1000)
  const rows = await db.select().from(tvProgrammes)
    .where(and(gt(tvProgrammes.endsAt, at), lte(tvProgrammes.startsAt, horizon)))
    .orderBy(asc(tvProgrammes.startsAt))
  const byChannel = new Map<string, Programme[]>()
  for (const row of rows) {
    const list = byChannel.get(row.channelId) ?? []
    list.push(row)
    byChannel.set(row.channelId, list)
  }
  const logos = await channelLogoMap()
  return channelDefs.map(channel => {
    const list = byChannel.get(channel.feedId) ?? []
    return {
      feedId: channel.feedId,
      name: channel.name,
      logo: logos.get(channel.feedId) ?? null,
      now: list.find(programme => programme.startsAt <= at && programme.endsAt > at) ?? null,
      next: list.find(programme => programme.startsAt > at) ?? null,
    }
  })
}

async function getChannelDay(channelId: string, date: Date): Promise<Programme[]> {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  return db.select().from(tvProgrammes)
    .where(and(eq(tvProgrammes.channelId, channelId), lt(tvProgrammes.startsAt, dayEnd), gte(tvProgrammes.endsAt, dayStart)))
    .orderBy(asc(tvProgrammes.startsAt))
}

async function getDayGrid(feedIds: string[], date: Date): Promise<GridChannel[]> {
  if (feedIds.length === 0) return []
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  const rows = await db.select().from(tvProgrammes)
    .where(and(inArray(tvProgrammes.channelId, feedIds), lt(tvProgrammes.startsAt, dayEnd), gte(tvProgrammes.endsAt, dayStart)))
    .orderBy(asc(tvProgrammes.startsAt))
  const byChannel = new Map<string, Programme[]>()
  for (const row of rows) {
    const list = byChannel.get(row.channelId) ?? []
    list.push(row)
    byChannel.set(row.channelId, list)
  }
  const logos = await channelLogoMap()
  return feedIds.map(feedId => ({
    feedId,
    name: channelName(feedId),
    logo: logos.get(feedId) ?? null,
    programmes: byChannel.get(feedId) ?? [],
  }))
}

async function getTodayMatches(follows: FollowMatch[], from: Date): Promise<Programme[]> {
  if (follows.length === 0) return []
  const dayEnd = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 23, 59, 59)
  const rows = await db.select().from(tvProgrammes)
    .where(and(gt(tvProgrammes.endsAt, from), lte(tvProgrammes.startsAt, dayEnd)))
    .orderBy(asc(tvProgrammes.startsAt))
  const wanted = new Map<string, { anyChannel: boolean; channels: Set<string> }>()
  for (const follow of follows) {
    const key = follow.title.toLowerCase()
    const entry = wanted.get(key) ?? { anyChannel: false, channels: new Set<string>() }
    if (follow.channel?.trim()) entry.channels.add(follow.channel.trim())
    else entry.anyChannel = true
    wanted.set(key, entry)
  }
  return rows.filter(row => {
    const entry = wanted.get(row.title.toLowerCase())
    if (!entry) return false
    if (entry.anyChannel) return true
    return entry.channels.has(channelName(row.channelId))
  })
}
