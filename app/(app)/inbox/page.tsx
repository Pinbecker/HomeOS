import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { items } from '@/lib/db/schema'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { InboxClient } from './inbox-client'

export default async function InboxPage() {
  await requireSession()

  const inboxItems = await db.query.items.findMany({
    where: and(
      eq(items.type, 'inbox'),
      eq(items.status, 'active'),
      isNull(items.deletedAt)
    ),
    orderBy: [desc(items.createdAt)],
    with: { createdBy: { columns: { name: true } } },
  })

  return <InboxClient items={inboxItems} />
}
