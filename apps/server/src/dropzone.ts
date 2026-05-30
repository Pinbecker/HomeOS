import fs from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import path from 'node:path'
import { once } from 'node:events'
import { pipeline } from 'node:stream/promises'
import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { and, eq, gt, inArray, isNull, lt } from 'drizzle-orm'
import { db } from '@homeos/db'
import { dropzoneEntries, dropzoneUploadSessions, files } from '@homeos/db/schema'
import { getSession } from './sync'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'
const FILE_ROOT = process.env.FILE_STORAGE_PATH ?? '/data/files'
const DROP_ROOT = path.join(FILE_ROOT, 'dropzone')
const CHUNK_SIZE_BYTES = 8 * 1024 * 1024
const MAX_FILE_BYTES = 5 * 1024 * 1024 * 1024
const ENTRY_TTL_MS = 7 * 24 * 60 * 60 * 1000
const SESSION_TTL_MS = 24 * 60 * 60 * 1000

type DropzoneEntryPayload = {
  id: string
  kind: 'text' | 'link' | 'file'
  text: string | null
  originalUrl: string | null
  fileId: string | null
  fileName: string | null
  mimeType: string | null
  sizeBytes: number | null
  createdAt: string
  expiresAt: string
}

function nowPlus(ms: number) {
  return new Date(Date.now() + ms)
}

function safeOriginalName(value: string) {
  const name = value.replace(/[\\/\0]/g, ' ').trim()
  return name || 'download'
}

function safeDisplayName(value: string) {
  const parts = value
    .replace(/\0/g, '')
    .split(/[\\/]+/)
    .map(part => part.trim())
    .filter(part => part && part !== '.' && part !== '..')
  return parts.join('/') || 'download'
}

function storagePathFor(fileId: string, originalName: string) {
  return path.posix.join('dropzone', 'files', fileId, safeOriginalName(path.posix.basename(originalName)))
}

function absoluteStoragePath(storagePath: string) {
  const absolute = path.resolve(FILE_ROOT, storagePath)
  const root = path.resolve(FILE_ROOT)
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error('Invalid storage path')
  }
  return absolute
}

function chunkDir(sessionId: string) {
  return path.join(DROP_ROOT, 'chunks', sessionId)
}

function chunkPath(sessionId: string, index: number) {
  return path.join(chunkDir(sessionId), `${index}.part`)
}

function contentDisposition(fileName: string, inline: boolean) {
  const fallback = safeOriginalName(fileName).replace(/["\r\n]/g, '')
  return `${inline ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fallback)}`
}

function maybeUrl(value: string) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

async function cleanupDropzone() {
  const now = new Date()
  const [expiredEntries, expiredSessions] = await Promise.all([
    db.query.dropzoneEntries.findMany({
      where: and(isNull(dropzoneEntries.deletedAt), lt(dropzoneEntries.expiresAt, now)),
    }),
    db.query.dropzoneUploadSessions.findMany({
      where: and(eq(dropzoneUploadSessions.status, 'active'), lt(dropzoneUploadSessions.expiresAt, now)),
    }),
  ])

  const fileIds = expiredEntries.map(entry => entry.fileId).filter((id): id is string => Boolean(id))
  if (fileIds.length) {
    const rows = await db.query.files.findMany({ where: inArray(files.id, fileIds) })
    await Promise.all(rows.map(row => fs.rm(absoluteStoragePath(row.storagePath), { force: true }).catch(() => undefined)))
    await db.delete(files).where(inArray(files.id, fileIds))
  }

  if (expiredEntries.length) {
    await db.delete(dropzoneEntries).where(inArray(dropzoneEntries.id, expiredEntries.map(entry => entry.id)))
  }

  if (expiredSessions.length) {
    await Promise.all(expiredSessions.map(session => fs.rm(chunkDir(session.id), { recursive: true, force: true }).catch(() => undefined)))
    await db.delete(dropzoneUploadSessions).where(inArray(dropzoneUploadSessions.id, expiredSessions.map(session => session.id)))
  }
}

async function entryPayloads() {
  await cleanupDropzone()
  const now = new Date()
  const entries = await db.query.dropzoneEntries.findMany({
    where: and(isNull(dropzoneEntries.deletedAt), gt(dropzoneEntries.expiresAt, now)),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  })
  const fileIds = entries.map(entry => entry.fileId).filter((id): id is string => Boolean(id))
  const fileRows = fileIds.length ? await db.query.files.findMany({ where: inArray(files.id, fileIds) }) : []
  const fileById = new Map(fileRows.map(file => [file.id, file]))

  return entries.map((entry): DropzoneEntryPayload => {
    const file = entry.fileId ? fileById.get(entry.fileId) ?? null : null
    return {
      id: entry.id,
      kind: entry.kind,
      text: entry.text ?? null,
      originalUrl: entry.originalUrl ?? null,
      fileId: entry.fileId ?? null,
      fileName: file?.originalName ?? null,
      mimeType: file?.mimeType ?? null,
      sizeBytes: file?.sizeBytes ?? null,
      createdAt: entry.createdAt.toISOString(),
      expiresAt: entry.expiresAt.toISOString(),
    }
  })
}

async function requireSession(request: FastifyRequest, reply: FastifyReply) {
  const session = await getSession(request)
  if (!session) {
    reply.status(401).send({ error: 'Unauthorized' })
    return null
  }
  return session
}

export function registerDropzoneRoutes(app: FastifyInstance) {
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body)
  })

  app.get('/api/dropzone', async (request, reply) => {
    const session = await requireSession(request, reply)
    if (!session) return
    return reply.send({ entries: await entryPayloads(), maxFileBytes: MAX_FILE_BYTES, chunkSizeBytes: CHUNK_SIZE_BYTES })
  })

  app.post('/api/dropzone/text', async (request, reply) => {
    const session = await requireSession(request, reply)
    if (!session) return
    const body = (request.body ?? {}) as { text?: string }
    const text = body.text?.trim()
    if (!text) return reply.status(400).send({ error: 'Nothing to drop yet.' })

    const id = `drop-${randomUUID()}`
    const now = new Date()
    const url = maybeUrl(text)
    await db.insert(dropzoneEntries).values({
      id,
      householdId: HOUSEHOLD_ID,
      createdById: session.user.id,
      kind: url ? 'link' : 'text',
      text,
      originalUrl: url,
      fileId: null,
      expiresAt: nowPlus(ENTRY_TTL_MS),
      deletedAt: null,
      createdAt: now,
    })
    return reply.send({ entries: await entryPayloads() })
  })

  app.post('/api/dropzone/uploads', async (request, reply) => {
    const session = await requireSession(request, reply)
    if (!session) return
    const body = (request.body ?? {}) as { fileName?: string; mimeType?: string; sizeBytes?: number }
    const sizeBytes = Number(body.sizeBytes ?? 0)
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return reply.status(400).send({ error: 'Invalid file size.' })
    if (sizeBytes > MAX_FILE_BYTES) return reply.status(413).send({ error: 'Drop files are limited to 5 GB.' })

    const id = `upload-${randomUUID()}`
    const now = new Date()
    const totalChunks = Math.ceil(sizeBytes / CHUNK_SIZE_BYTES)
    await fs.mkdir(chunkDir(id), { recursive: true })
    await db.insert(dropzoneUploadSessions).values({
      id,
      householdId: HOUSEHOLD_ID,
      createdById: session.user.id,
      originalName: safeDisplayName(body.fileName ?? 'download'),
      mimeType: body.mimeType || 'application/octet-stream',
      sizeBytes,
      chunkSizeBytes: CHUNK_SIZE_BYTES,
      totalChunks,
      uploadedChunks: [],
      status: 'active',
      fileId: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: nowPlus(SESSION_TTL_MS),
    })

    return reply.send({ id, chunkSizeBytes: CHUNK_SIZE_BYTES, totalChunks, uploadedChunks: [] })
  })

  app.get('/api/dropzone/uploads/:id', async (request, reply) => {
    const session = await requireSession(request, reply)
    if (!session) return
    const id = (request.params as { id?: string }).id ?? ''
    const upload = await db.query.dropzoneUploadSessions.findFirst({ where: and(eq(dropzoneUploadSessions.id, id), eq(dropzoneUploadSessions.createdById, session.user.id)) })
    if (!upload) return reply.status(404).send({ error: 'Upload not found.' })
    return reply.send({ id: upload.id, status: upload.status, chunkSizeBytes: upload.chunkSizeBytes, totalChunks: upload.totalChunks, uploadedChunks: upload.uploadedChunks ?? [] })
  })

  app.put('/api/dropzone/uploads/:id/chunks/:index', async (request, reply) => {
    const session = await requireSession(request, reply)
    if (!session) return
    const params = request.params as { id?: string; index?: string }
    const index = Number(params.index)
    if (!Number.isInteger(index) || index < 0) return reply.status(400).send({ error: 'Invalid chunk index.' })

    const upload = await db.query.dropzoneUploadSessions.findFirst({ where: and(eq(dropzoneUploadSessions.id, params.id ?? ''), eq(dropzoneUploadSessions.createdById, session.user.id)) })
    if (!upload || upload.status !== 'active') return reply.status(404).send({ error: 'Upload not found.' })
    if (index >= upload.totalChunks) return reply.status(400).send({ error: 'Invalid chunk index.' })

    await fs.mkdir(chunkDir(upload.id), { recursive: true })
    const target = chunkPath(upload.id, index)
    const temp = `${target}.tmp-${randomUUID()}`
    const body = request.body
    if (!Buffer.isBuffer(body)) return reply.status(400).send({ error: 'Invalid upload chunk.' })
    await fs.writeFile(temp, body)
    const stat = await fs.stat(temp)
    const expectedMax = Math.min(upload.chunkSizeBytes, upload.sizeBytes - (index * upload.chunkSizeBytes))
    if (stat.size <= 0 || stat.size > expectedMax) {
      await fs.rm(temp, { force: true }).catch(() => undefined)
      return reply.status(400).send({ error: 'Invalid chunk size.' })
    }
    await fs.rename(temp, target)

    const uploadedChunks = Array.from(new Set([...(upload.uploadedChunks ?? []), index])).sort((a, b) => a - b)
    await db.update(dropzoneUploadSessions)
      .set({ uploadedChunks, updatedAt: new Date(), expiresAt: nowPlus(SESSION_TTL_MS) })
      .where(eq(dropzoneUploadSessions.id, upload.id))

    return reply.send({ uploadedChunks })
  })

  app.post('/api/dropzone/uploads/:id/complete', async (request, reply) => {
    const session = await requireSession(request, reply)
    if (!session) return
    const id = (request.params as { id?: string }).id ?? ''
    const upload = await db.query.dropzoneUploadSessions.findFirst({ where: and(eq(dropzoneUploadSessions.id, id), eq(dropzoneUploadSessions.createdById, session.user.id)) })
    if (!upload) return reply.status(404).send({ error: 'Upload not found.' })
    if (upload.status === 'complete') return reply.send({ entries: await entryPayloads() })
    if (upload.status !== 'active') return reply.status(400).send({ error: 'Upload is not active.' })

    const uploaded = new Set(upload.uploadedChunks ?? [])
    if (uploaded.size !== upload.totalChunks) return reply.status(400).send({ error: 'Upload is not complete yet.' })

    const fileId = `file-${randomUUID()}`
    const storagePath = storagePathFor(fileId, upload.originalName)
    const absolute = absoluteStoragePath(storagePath)
    await fs.mkdir(path.dirname(absolute), { recursive: true })
    await fs.rm(absolute, { force: true }).catch(() => undefined)

    const output = createWriteStream(absolute, { flags: 'wx' })
    let assembled = false
    try {
      for (let index = 0; index < upload.totalChunks; index += 1) {
        await pipeline(createReadStream(chunkPath(upload.id, index)), output, { end: false })
      }
      output.end()
      await once(output, 'finish')
      assembled = true
    } finally {
      if (!assembled && !output.closed) output.destroy()
    }

    const stat = await fs.stat(absolute)
    if (stat.size !== upload.sizeBytes) {
      await fs.rm(absolute, { force: true }).catch(() => undefined)
      return reply.status(400).send({ error: 'Uploaded file size did not match.' })
    }

    const now = new Date()
    const entryId = `drop-${randomUUID()}`
    const expiresAt = nowPlus(ENTRY_TTL_MS)
    await db.insert(files).values({
      id: fileId,
      householdId: HOUSEHOLD_ID,
      uploadedById: session.user.id,
      originalName: upload.originalName,
      storagePath,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      createdAt: now,
    })
    await db.insert(dropzoneEntries).values({
      id: entryId,
      householdId: HOUSEHOLD_ID,
      createdById: session.user.id,
      kind: 'file',
      text: null,
      originalUrl: null,
      fileId,
      expiresAt,
      deletedAt: null,
      createdAt: now,
    })
    await db.update(dropzoneUploadSessions)
      .set({ status: 'complete', fileId, updatedAt: now })
      .where(eq(dropzoneUploadSessions.id, upload.id))
    await fs.rm(chunkDir(upload.id), { recursive: true, force: true }).catch(() => undefined)

    return reply.send({ entries: await entryPayloads() })
  })

  app.get('/api/dropzone/files/:fileId/download', async (request, reply) => {
    const session = await requireSession(request, reply)
    if (!session) return
    const fileId = (request.params as { fileId?: string }).fileId ?? ''
    const now = new Date()
    const entry = await db.query.dropzoneEntries.findFirst({ where: and(eq(dropzoneEntries.fileId, fileId), isNull(dropzoneEntries.deletedAt), gt(dropzoneEntries.expiresAt, now)) })
    if (!entry) return reply.status(404).send({ error: 'File not found.' })
    const row = await db.query.files.findFirst({ where: eq(files.id, fileId) })
    if (!row) return reply.status(404).send({ error: 'File not found.' })

    const absolute = absoluteStoragePath(row.storagePath)
    const stat = await fs.stat(absolute).catch(() => null)
    if (!stat) return reply.status(404).send({ error: 'File not found.' })

    const range = request.headers.range
    const inline = (request.query as { inline?: string }).inline === '1'
    reply.header('Accept-Ranges', 'bytes')
    reply.header('Content-Type', row.mimeType || 'application/octet-stream')
    reply.header('Content-Disposition', contentDisposition(row.originalName, inline))

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (match) {
        const start = match[1] ? Number(match[1]) : 0
        const end = match[2] ? Number(match[2]) : stat.size - 1
        if (start >= 0 && end >= start && end < stat.size) {
          reply.status(206)
          reply.header('Content-Range', `bytes ${start}-${end}/${stat.size}`)
          reply.header('Content-Length', String(end - start + 1))
          return reply.send(createReadStream(absolute, { start, end }))
        }
      }
      return reply.status(416).header('Content-Range', `bytes */${stat.size}`).send()
    }

    reply.header('Content-Length', String(stat.size))
    return reply.send(createReadStream(absolute))
  })

  app.delete('/api/dropzone/:entryId', async (request, reply) => {
    const session = await requireSession(request, reply)
    if (!session) return
    const entryId = (request.params as { entryId?: string }).entryId ?? ''
    const entry = await db.query.dropzoneEntries.findFirst({ where: and(eq(dropzoneEntries.id, entryId), eq(dropzoneEntries.createdById, session.user.id)) })
    if (!entry) return reply.status(404).send({ error: 'Drop item not found.' })
    if (entry.fileId) {
      const row = await db.query.files.findFirst({ where: eq(files.id, entry.fileId) })
      if (row) await fs.rm(absoluteStoragePath(row.storagePath), { force: true }).catch(() => undefined)
      await db.delete(files).where(eq(files.id, entry.fileId))
    }
    await db.delete(dropzoneEntries).where(eq(dropzoneEntries.id, entry.id))
    return reply.send({ entries: await entryPayloads() })
  })

  app.delete('/api/dropzone', async (request, reply) => {
    const session = await requireSession(request, reply)
    if (!session) return
    const entries = await db.query.dropzoneEntries.findMany({ where: and(eq(dropzoneEntries.createdById, session.user.id), isNull(dropzoneEntries.deletedAt)) })
    const fileIds = entries.map(entry => entry.fileId).filter((id): id is string => Boolean(id))
    if (fileIds.length) {
      const rows = await db.query.files.findMany({ where: inArray(files.id, fileIds) })
      await Promise.all(rows.map(row => fs.rm(absoluteStoragePath(row.storagePath), { force: true }).catch(() => undefined)))
      await db.delete(files).where(inArray(files.id, fileIds))
    }
    if (entries.length) await db.delete(dropzoneEntries).where(inArray(dropzoneEntries.id, entries.map(entry => entry.id)))
    return reply.send({ entries: await entryPayloads() })
  })
}
