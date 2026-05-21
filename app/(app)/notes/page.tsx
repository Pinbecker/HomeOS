import { db } from '@/lib/db'
import { items } from '@/lib/db/schema'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { NotesClient } from './notes-client'

export default async function NotesPage() {
  const notes = await db.query.items.findMany({
    where: and(
      eq(items.type, 'note'),
      eq(items.status, 'active'),
      isNull(items.deletedAt)
    ),
    orderBy: [desc(items.updatedAt)],
    with: { createdBy: { columns: { name: true } } },
  })

  return <NotesClient notes={notes} />
}
