import fs from 'node:fs/promises'
import path from 'node:path'
import Fastify from 'fastify'
import { fromNodeHeaders } from 'better-auth/node'
import { sql } from 'drizzle-orm'
import { auth } from '@homeos/auth'
import { db } from '@homeos/db'
import { applyMutations, buildBootstrap, getCheckpoint, getSession, pullChanges, subscribe, type SyncMutation } from './sync'

const app = Fastify({
  logger: true,
})
const webDist = path.resolve(process.cwd(), 'apps/web/dist')

app.addHook('onRequest', async (request, reply) => {
  reply.header('Access-Control-Allow-Origin', process.env.VITE_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '*')
  reply.header('Access-Control-Allow-Credentials', 'true')
  reply.header('Access-Control-Allow-Headers', 'Content-Type')
  reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')

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
