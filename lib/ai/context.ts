import { asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { lists, records, users } from '@/lib/db/schema'
import { getCategories } from '@/lib/entities/category-settings'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

export type AiPlanningContext = {
  now: string
  timezone: string
  householdId: string
  currentUser: {
    id: string
    name: string
    email: string
  }
  users: Array<{
    id: string
    name: string
    email: string
  }>
  lists: Array<{
    id: string
    name: string
    type: string
  }>
  recordCategories: Array<{
    key: string
    label: string
    defaultFields: string[]
  }>
  records: Array<{
    id: string
    title: string
    subtitle: string | null
    category: string
    fields: Array<{ label: string; value: string }>
  }>
}

export async function loadAiPlanningContext(currentUser: AiPlanningContext['currentUser']): Promise<AiPlanningContext> {
  const [userRows, listRows, categoryRows, recordRows] = await Promise.all([
    db.query.users.findMany({
      orderBy: [asc(users.name)],
      columns: { id: true, name: true, email: true },
    }),
    db.query.lists.findMany({
      orderBy: [asc(lists.type), asc(lists.sortOrder), asc(lists.name)],
      columns: { id: true, name: true, type: true },
    }),
    getCategories(),
    db.query.records.findMany({
      orderBy: [asc(records.category), asc(records.sortOrder), asc(records.title)],
      columns: { id: true, title: true, subtitle: true, category: true, fields: true },
    }),
  ])

  return {
    now: new Date().toISOString(),
    timezone: process.env.TZ ?? 'Europe/London',
    householdId: HOUSEHOLD_ID,
    currentUser,
    users: userRows,
    lists: listRows,
    recordCategories: categoryRows.map(category => ({
      key: category.key,
      label: category.label,
      defaultFields: category.defaultFields,
    })),
    records: recordRows.map(record => ({
      id: record.id,
      title: record.title,
      subtitle: record.subtitle,
      category: record.category,
      fields: record.fields ?? [],
    })),
  }
}
