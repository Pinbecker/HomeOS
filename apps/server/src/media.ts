import type { FastifyInstance, FastifyReply } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '@homeos/db'
import { mediaFamilyStates, mediaInteractions, mediaUserStates } from '@homeos/db/schema'
import { discoverFeed, getMediaDetails, getSeason, getWatchProviders, isTmdbConfigured, searchMedia, type MediaType } from './tmdb'
import { getSession } from './sync'

function configured(reply: FastifyReply) {
  if (isTmdbConfigured()) return true
  reply.status(503).send({ error: 'TMDB is not configured' })
  return false
}

function validMediaType(value: string | undefined): value is MediaType {
  return value === 'movie' || value === 'tv'
}

export function registerMediaRoutes(app: FastifyInstance) {
  app.get('/api/media/feed', async (request, reply) => {
    if (!configured(reply)) return
    const session = await getSession(request)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const page = Math.max(1, Number((request.query as { page?: string }).page ?? 1))
    const [userStates, familyStates, interactions] = await Promise.all([
      db.query.mediaUserStates.findMany({
        where: eq(mediaUserStates.userId, session.user.id),
        columns: { mediaItemId: true },
      }),
      db.query.mediaFamilyStates.findMany({
        columns: { mediaItemId: true },
      }),
      db.query.mediaInteractions.findMany({
        where: eq(mediaInteractions.userId, session.user.id),
        columns: { mediaItemId: true },
      }),
    ])
    const excluded = new Set([
      ...userStates.map(row => row.mediaItemId),
      ...familyStates.map(row => row.mediaItemId),
      ...interactions.map(row => row.mediaItemId),
    ])
    return reply.send({ items: await discoverFeed(excluded, page), page })
  })

  app.get('/api/media/search', async (request, reply) => {
    if (!configured(reply)) return
    const session = await getSession(request)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const query = ((request.query as { q?: string }).q ?? '').trim()
    if (query.length < 2) return reply.send({ items: [] })
    return reply.send({ items: await searchMedia(query) })
  })

  app.get('/api/media/item/:mediaType/:tmdbId', async (request, reply) => {
    if (!configured(reply)) return
    const session = await getSession(request)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const params = request.params as { mediaType?: string; tmdbId?: string }
    if (!validMediaType(params.mediaType)) return reply.status(400).send({ error: 'Invalid media type' })
    const tmdbId = Number(params.tmdbId)
    if (!Number.isFinite(tmdbId)) return reply.status(400).send({ error: 'Invalid TMDB id' })
    return reply.send({ item: await getMediaDetails(params.mediaType, tmdbId) })
  })

  app.get('/api/media/tv/:tmdbId/season/:seasonNumber', async (request, reply) => {
    if (!configured(reply)) return
    const session = await getSession(request)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const params = request.params as { tmdbId?: string; seasonNumber?: string }
    const tmdbId = Number(params.tmdbId)
    const seasonNumber = Number(params.seasonNumber)
    if (!Number.isFinite(tmdbId) || !Number.isFinite(seasonNumber)) {
      return reply.status(400).send({ error: 'Invalid season request' })
    }
    return reply.send(await getSeason(tmdbId, seasonNumber))
  })

  app.get('/api/media/providers', async (request, reply) => {
    if (!configured(reply)) return
    const session = await getSession(request)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    return reply.send({ providers: await getWatchProviders() })
  })
}
