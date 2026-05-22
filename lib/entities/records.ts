import { and, asc, eq, inArray, isNull, lte, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  entityLinks,
  fileAttachments,
  files,
  items,
  records,
  reminders,
  type RecordCategory,
  type RecordField,
} from '@/lib/db/schema'
import {
  ENTITY_GROUPS,
  ENTITY_KIND_LABELS,
  type CategoryMeta,
} from './record-taxonomy'
import { getCategories, getCategoryMap } from './category-settings'

type CategoryMap = Record<string, CategoryMeta>


const RECORD_ENTITY_TYPE = 'record'
const ITEM_ENTITY_TYPE = 'item'

type RecordRow = typeof records.$inferSelect

export type HouseholdEntity = {
  id: string
  title: string
  subtitle: string | null
  category: RecordCategory
  categoryLabel: string
  kindLabel: string
  icon: string
  color: string
  fields: RecordField[]
  renewalDate: number | null
  renewalLabel: string | null
  notes: string | null
  href: string
  lensHref: string
  searchText: string
}

export type EntityGroup = {
  key: string
  title: string
  subtitle: string
  entities: HouseholdEntity[]
}

export type AttentionItem = {
  id: string
  title: string
  subtitle: string
  label: string
  tone: 'red' | 'orange' | 'blue'
  href: string
}

export type RecordsReminderItem = {
  id: string
  entityId: string
  entityTitle: string
  message: string | null
  triggerAt: number
  href: string
}

export type RecordsOverviewData = {
  entities: HouseholdEntity[]
  groups: EntityGroup[]
  attention: AttentionItem[]
  reminders: RecordsReminderItem[]
  categories: Array<{
    key: string
    label: string
    icon: string
    color: string
    desc: string
    href: string
    count: number
  }>
  viewCards: Array<{
    title: string
    subtitle: string
    icon: string
    href: string
    countLabel: string
  }>
}

export type EntityProfileData = {
  entity: HouseholdEntity
  facts: RecordField[]
  renewal: AttentionItem | null
  linkedTasks: Array<{ id: string; title: string; dueDate: number | null; href: string }>
  linkedReminders: Array<{ id: string; message: string | null; triggerAt: number }>
  linkedDocuments: Array<{ id: string; name: string; mimeType: string; sizeBytes: number }>
  relatedEntities: HouseholdEntity[]
  emptyHooks: Array<{ title: string; subtitle: string; icon: string }>
}

export type RelatedEntityOption = Pick<HouseholdEntity, 'id' | 'title' | 'subtitle' | 'icon' | 'color' | 'kindLabel'>

function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

export function daysUntil(timestamp: number) {
  return Math.round((timestamp - startOfToday()) / 86400000)
}

export function formatShortDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function renewalAttention(entity: HouseholdEntity): AttentionItem | null {
  if (!entity.renewalDate) return null
  const days = daysUntil(entity.renewalDate)
  const date = formatShortDate(entity.renewalDate)
  const label = entity.renewalLabel ?? 'Due'

  if (days < 0) {
    return {
      id: entity.id,
      title: entity.title,
      subtitle: `${label} was ${date}`,
      label: 'Overdue',
      tone: 'red',
      href: entity.href,
    }
  }

  if (days <= 45) {
    return {
      id: entity.id,
      title: entity.title,
      subtitle: `${label} ${date}`,
      label: days === 0 ? 'Today' : `${days}d`,
      tone: days <= 14 ? 'orange' : 'blue',
      href: entity.href,
    }
  }

  return null
}

export function toHouseholdEntity(row: RecordRow, categoryMap: CategoryMap): HouseholdEntity {
  const meta = categoryMap[row.category]
  const fields = row.fields ?? []
  const searchText = [
    row.title,
    row.subtitle,
    row.notes,
    meta?.label,
    ...fields.flatMap(field => [field.label, field.value]),
  ].filter(Boolean).join(' ').toLowerCase()

  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    category: row.category,
    categoryLabel: meta?.label ?? row.category,
    kindLabel: ENTITY_KIND_LABELS[row.category] ?? 'Household thing',
    icon: row.icon || meta?.icon || '📌',
    color: meta?.color ?? '#8E8E93',
    fields,
    renewalDate: row.renewalDate ? row.renewalDate.getTime() : null,
    renewalLabel: row.renewalLabel,
    notes: row.notes,
    href: `/life/admin/${row.id}`,
    lensHref: `/life/${row.category}`,
    searchText,
  }
}

export async function getRecordsOverviewData(): Promise<RecordsOverviewData> {
  const [rows, categoryMap, categoryList] = await Promise.all([
    db.query.records.findMany({
      orderBy: [asc(records.sortOrder), asc(records.createdAt)],
    }),
    getCategoryMap(),
    getCategories(),
  ])

  const entities = rows.map(row => toHouseholdEntity(row, categoryMap))
  const renewalAttentionItems = entities
    .map(renewalAttention)
    .filter((item): item is AttentionItem => item != null)
    .sort((a, b) => {
      const entityA = entities.find(entity => entity.id === a.id)
      const entityB = entities.find(entity => entity.id === b.id)
      return (entityA?.renewalDate ?? 0) - (entityB?.renewalDate ?? 0)
    })

  const reminderWindow = new Date()
  reminderWindow.setDate(reminderWindow.getDate() + 14)

  const reminderRows = await db.query.reminders.findMany({
    where: and(
      eq(reminders.entityType, RECORD_ENTITY_TYPE),
      isNull(reminders.dismissedAt),
      lte(reminders.triggerAt, reminderWindow),
    ),
    orderBy: [asc(reminders.triggerAt)],
  })

  const entityById = new Map(entities.map(entity => [entity.id, entity]))
  const reminderItems = reminderRows
    .map(reminder => {
      const entity = entityById.get(reminder.entityId)
      if (!entity) return null
      return {
        id: reminder.id,
        entityId: entity.id,
        entityTitle: entity.title,
        message: reminder.message,
        triggerAt: reminder.triggerAt.getTime(),
        href: entity.href,
      }
    })
    .filter((item): item is RecordsReminderItem => item != null)

  const reminderAttentionItems: AttentionItem[] = reminderItems.map(reminder => {
    const days = daysUntil(reminder.triggerAt)
    return {
      id: reminder.id,
      title: reminder.entityTitle,
      subtitle: reminder.message || `Reminder ${formatShortDate(reminder.triggerAt)}`,
      label: days < 0 ? 'Overdue' : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`,
      tone: days <= 0 ? 'red' : days <= 7 ? 'orange' : 'blue',
      href: reminder.href,
    }
  })

  const attention = [...reminderAttentionItems, ...renewalAttentionItems]
    .sort((a, b) => {
      const reminderA = reminderItems.find(item => item.id === a.id)
      const reminderB = reminderItems.find(item => item.id === b.id)
      const entityA = entities.find(entity => entity.id === a.id)
      const entityB = entities.find(entity => entity.id === b.id)
      return (reminderA?.triggerAt ?? entityA?.renewalDate ?? 0) - (reminderB?.triggerAt ?? entityB?.renewalDate ?? 0)
    })
    .slice(0, 5)

  const groups = ENTITY_GROUPS
    .map(group => ({
      ...group,
      entities: entities.filter(entity => group.categories.includes(entity.category)).slice(0, 6),
    }))
    .filter(group => group.entities.length > 0)

  const categories = categoryList.map(category => ({
    key: category.key,
    label: category.label,
    icon: category.icon,
    color: category.color,
    desc: category.desc,
    href: `/life/${category.key}`,
    count: entities.filter(entity => entity.category === category.key).length,
  }))

  const documentCount = await db.$count(files)
  const renewalCount = entities.filter(entity => entity.renewalDate != null).length
  const whereCount = entities.filter(entity => ['home', 'reference', 'vehicle'].includes(entity.category)).length
  const emergencyCount = entities.filter(entity => ['identity', 'contact', 'pet'].includes(entity.category)).length

  return {
    entities,
    groups,
    attention,
    reminders: reminderItems,
    categories,
    viewCards: [
      {
        title: 'Reminders & due dates',
        subtitle: 'Life admin things happening soon',
        icon: '⏱️',
        href: '/life/admin/reminders',
        countLabel: reminderItems.length ? `${reminderItems.length}` : renewalCount ? `${renewalCount}` : 'None',
      },
      {
        title: 'Documents',
        subtitle: 'Policies, warranties and useful files',
        icon: '📄',
        href: '#documents',
        countLabel: documentCount ? `${documentCount}` : 'Ready',
      },
      {
        title: 'Where things are',
        subtitle: 'Home details, vehicles and references',
        icon: '📍',
        href: '/life/reference',
        countLabel: whereCount ? `${whereCount}` : 'Add',
      },
      {
        title: 'Emergency info',
        subtitle: 'People, pets and key contacts',
        icon: '🆘',
        href: '/life/contact',
        countLabel: emergencyCount ? `${emergencyCount}` : 'Add',
      },
    ],
  }
}

export async function getRelatedEntityOptions(excludeId: string): Promise<RelatedEntityOption[]> {
  const [rows, categoryMap] = await Promise.all([
    db.query.records.findMany({
      where: undefined,
      orderBy: [asc(records.sortOrder), asc(records.createdAt)],
    }),
    getCategoryMap(),
  ])

  return rows
    .map(row => toHouseholdEntity(row, categoryMap))
    .filter(entity => entity.id !== excludeId)
    .map(entity => ({
      id: entity.id,
      title: entity.title,
      subtitle: entity.subtitle,
      icon: entity.icon,
      color: entity.color,
      kindLabel: entity.kindLabel,
    }))
}

export async function getRecordsReminderViewData() {
  const data = await getRecordsOverviewData()
  const renewalItems = data.entities
    .filter(entity => entity.renewalDate != null)
    .sort((a, b) => (a.renewalDate ?? 0) - (b.renewalDate ?? 0))

  return {
    reminders: data.reminders,
    renewals: renewalItems,
  }
}

export async function getEntityProfileData(id: string): Promise<EntityProfileData | null> {
  const row = await db.query.records.findFirst({ where: eq(records.id, id) })
  if (!row) return null

  const categoryMap = await getCategoryMap()
  const entity = toHouseholdEntity(row, categoryMap)

  const [links, attachedFiles, linkedReminders] = await Promise.all([
    db.query.entityLinks.findMany({
      where: or(
        and(eq(entityLinks.fromType, RECORD_ENTITY_TYPE), eq(entityLinks.fromId, id)),
        and(eq(entityLinks.toType, RECORD_ENTITY_TYPE), eq(entityLinks.toId, id)),
      ),
      orderBy: [asc(entityLinks.createdAt)],
    }),
    db.query.fileAttachments.findMany({
      where: and(eq(fileAttachments.entityType, RECORD_ENTITY_TYPE), eq(fileAttachments.entityId, id)),
      orderBy: [asc(fileAttachments.createdAt)],
    }),
    db.query.reminders.findMany({
      where: and(eq(reminders.entityType, RECORD_ENTITY_TYPE), eq(reminders.entityId, id)),
      orderBy: [asc(reminders.triggerAt)],
    }),
  ])

  const relatedRecordIds = links
    .flatMap(link => {
      const ids: string[] = []
      if (link.fromType === RECORD_ENTITY_TYPE && link.fromId !== id) ids.push(link.fromId)
      if (link.toType === RECORD_ENTITY_TYPE && link.toId !== id) ids.push(link.toId)
      return ids
    })
  const taskIds = links
    .flatMap(link => {
      const ids: string[] = []
      if (link.fromType === ITEM_ENTITY_TYPE) ids.push(link.fromId)
      if (link.toType === ITEM_ENTITY_TYPE) ids.push(link.toId)
      return ids
    })

  const [relatedRows, linkedItems, fileRows] = await Promise.all([
    relatedRecordIds.length
      ? db.query.records.findMany({ where: inArray(records.id, relatedRecordIds) })
      : Promise.resolve([]),
    taskIds.length
      ? db.query.items.findMany({ where: inArray(items.id, taskIds) })
      : Promise.resolve([]),
    attachedFiles.length
      ? db.query.files.findMany({ where: inArray(files.id, attachedFiles.map(file => file.fileId)) })
      : Promise.resolve([]),
  ])

  return {
    entity,
    facts: entity.fields.filter(field => field.label || field.value),
    renewal: renewalAttention(entity),
    linkedTasks: linkedItems
      .filter(item => item.type === 'task' && item.status !== 'completed' && !item.deletedAt)
      .map(item => ({
        id: item.id,
        title: item.title,
        dueDate: item.dueDate ? item.dueDate.getTime() : null,
        href: item.listId ? `/household/tasks/${item.listId}` : '/household/tasks/all',
      })),
    linkedReminders: linkedReminders.map(reminder => ({
      id: reminder.id,
      message: reminder.message,
      triggerAt: reminder.triggerAt.getTime(),
    })),
    linkedDocuments: fileRows.map(file => ({
      id: file.id,
      name: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    })),
    relatedEntities: relatedRows.map(row => toHouseholdEntity(row, categoryMap)),
    emptyHooks: [
      { title: 'Tasks', subtitle: 'Link reminders and jobs to this household thing', icon: '✓' },
      { title: 'Documents', subtitle: 'Attach warranties, policies and PDFs here', icon: '□' },
      { title: 'Related', subtitle: 'Connect providers, people, vehicles and property', icon: '↔' },
    ],
  }
}
