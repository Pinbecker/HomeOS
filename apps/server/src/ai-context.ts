import { asc, eq } from 'drizzle-orm'
import { db } from '@homeos/db'
import { household, lists, records, users } from '@homeos/db/schema'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

type CategoryMeta = {
  key: string
  label: string
  defaultFields: string[]
}

const BASE_CATEGORIES: CategoryMeta[] = [
  { key: 'identity', label: 'People & IDs', defaultFields: ['NHS number', 'NI number', 'Passport number', 'Passport expiry', 'Driving licence', 'Blood type'] },
  { key: 'home', label: 'Home', defaultFields: ['Provider', 'Account / reference', 'Phone'] },
  { key: 'utility', label: 'Utilities', defaultFields: ['Provider', 'Account number', 'Phone', 'Online login'] },
  { key: 'insurance', label: 'Insurance & Cover', defaultFields: ['Provider', 'Policy number', 'Cover', 'Phone', 'Excess'] },
  { key: 'vehicle', label: 'Vehicles', defaultFields: ['Registration', 'Make & model', 'VIN', 'Insurer'] },
  { key: 'contact', label: 'Contacts', defaultFields: ['Phone', 'Email', 'Address'] },
  { key: 'subscription', label: 'Money & Bills', defaultFields: ['Amount', 'Frequency', 'Account'] },
  { key: 'pet', label: 'Pets', defaultFields: ['Microchip', 'Vet', 'Date of birth', 'Insurer'] },
  { key: 'reference', label: 'Reference', defaultFields: ['Detail'] },
]

type StoredCategorySettings = {
  custom?: Array<CategoryMeta & Record<string, unknown>>
  overrides?: Record<string, Partial<CategoryMeta>>
  deleted?: string[]
  order?: string[]
}

export type AiPlanningContext = {
  now: string
  timezone: string
  householdId: string
  currentUser: { id: string; name: string; email: string }
  users: Array<{ id: string; name: string; email: string }>
  lists: Array<{ id: string; name: string; type: string }>
  recordCategories: CategoryMeta[]
  records: Array<{
    id: string
    title: string
    subtitle: string | null
    category: string
    fields: Array<{ label: string; value: string }>
  }>
}

function categoriesFromSettings(settings: unknown) {
  const recordCategories = settings && typeof settings === 'object'
    ? (settings as { recordCategories?: StoredCategorySettings }).recordCategories
    : undefined
  const deleted = new Set(recordCategories?.deleted ?? [])
  const overrides = recordCategories?.overrides ?? {}
  const builtins = BASE_CATEGORIES
    .filter(category => !deleted.has(category.key))
    .map(category => ({ ...category, ...(overrides[category.key] ?? {}) }))
  const custom = (recordCategories?.custom ?? [])
    .filter(category => !deleted.has(category.key))
    .map(category => ({
      key: category.key,
      label: category.label,
      defaultFields: category.defaultFields?.length ? category.defaultFields : ['Provider', 'Account / reference', 'Phone'],
    }))
  const categories = [...builtins, ...custom]
  if (!recordCategories?.order?.length) return categories
  const order = new Map(recordCategories.order.map((key, index) => [key, index]))
  return [...categories].sort((a, b) => {
    const aIndex = order.get(a.key) ?? Number.MAX_SAFE_INTEGER
    const bIndex = order.get(b.key) ?? Number.MAX_SAFE_INTEGER
    return aIndex === bIndex ? categories.indexOf(a) - categories.indexOf(b) : aIndex - bIndex
  })
}

export async function loadAiPlanningContext(currentUser: AiPlanningContext['currentUser']): Promise<AiPlanningContext> {
  const [userRows, listRows, householdRow, recordRows] = await Promise.all([
    db.query.users.findMany({ orderBy: [asc(users.name)], columns: { id: true, name: true, email: true } }),
    db.query.lists.findMany({ orderBy: [asc(lists.type), asc(lists.sortOrder), asc(lists.name)], columns: { id: true, name: true, type: true } }),
    db.query.household.findFirst({ where: eq(household.id, HOUSEHOLD_ID), columns: { settings: true } }),
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
    recordCategories: categoriesFromSettings(householdRow?.settings),
    records: recordRows.map(record => ({
      id: record.id,
      title: record.title,
      subtitle: record.subtitle,
      category: record.category,
      fields: record.fields ?? [],
    })),
  }
}
