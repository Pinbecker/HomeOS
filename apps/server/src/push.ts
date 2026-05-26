import webpush from 'web-push'
import { eq } from 'drizzle-orm'
import { db } from '@homeos/db'
import { pushSubscriptions } from '@homeos/db/schema'

let configured = false

function ensureConfigured() {
  if (configured) return true
  const pub = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!pub || !priv || !subject) return false
  webpush.setVapidDetails(subject, pub, priv)
  configured = true
  return true
}

export type PushPayload = {
  title: string
  body?: string
  url?: string
  icon?: string
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!ensureConfigured()) return
  const subs = await db.query.pushSubscriptions.findMany({ where: eq(pushSubscriptions.userId, userId) })
  await Promise.all(subs.map(sub =>
    webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    ).catch(async error => {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id))
      } else {
        console.error(`[push] Delivery failed for ${userId}:`, error)
      }
    }),
  ))
}

export async function sendPushToAll(payload: PushPayload) {
  if (!ensureConfigured()) return
  const subs = await db.query.pushSubscriptions.findMany()
  const userIds = [...new Set(subs.map(sub => sub.userId))]
  await Promise.all(userIds.map(userId => sendPushToUser(userId, payload)))
}
