import webpush from 'web-push'
import { db } from '@/lib/db'
import { pushSubscriptions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

let configured = false

function ensureConfigured() {
  if (configured) return
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!pub || !priv || !subject) throw new Error('VAPID env vars not set')
  webpush.setVapidDetails(subject, pub, priv)
  configured = true
}

export type PushPayload = {
  title: string
  body?: string
  url?: string
  icon?: string
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  ensureConfigured()
  const subs = await db.query.pushSubscriptions.findMany({
    where: eq(pushSubscriptions.userId, userId),
  })
  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      ).catch(async err => {
        // 404 / 410 means the subscription is gone — remove it
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id))
        } else {
          throw err
        }
      })
    )
  )
  const failed = results.filter(r => r.status === 'rejected')
  if (failed.length) {
    console.error(`[push] ${failed.length}/${subs.length} deliveries failed for user ${userId}`)
  }
}

export async function sendPushToAll(payload: PushPayload) {
  ensureConfigured()
  const subs = await db.query.pushSubscriptions.findMany()
  const seen = new Set<string>()
  for (const sub of subs) {
    if (seen.has(sub.userId)) continue
    seen.add(sub.userId)
    sendPushToUser(sub.userId, payload).catch(err =>
      console.error(`[push] sendPushToAll failed for user ${sub.userId}:`, err)
    )
  }
}
