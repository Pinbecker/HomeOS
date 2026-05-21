import { db } from '@/lib/db'
import { household } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { CATEGORIES, type CategoryMeta } from './record-taxonomy'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

type CategoryOverride = Partial<Pick<CategoryMeta, 'label' | 'icon' | 'color' | 'desc'>>

type StoredCategorySettings = {
  custom?: CategoryMeta[]
  overrides?: Record<string, CategoryOverride>
  deleted?: string[]
}

type HouseholdSettings = Record<string, unknown> & {
  recordCategories?: StoredCategorySettings
}

export type CategoryInput = {
  key?: string
  label: string
  icon: string
  color: string
  desc?: string
}

const DEFAULT_FIELDS = ['Provider', 'Account / reference', 'Phone']

function slugify(value: string) {
  const slug = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return slug || `category_${Date.now()}`
}

function normaliseSettings(settings: unknown): HouseholdSettings {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return {}
  return settings as HouseholdSettings
}

async function getHouseholdSettings() {
  const row = await db.query.household.findFirst({ where: eq(household.id, HOUSEHOLD_ID) })
  return normaliseSettings(row?.settings)
}

async function writeCategorySettings(recordCategories: StoredCategorySettings) {
  const existing = await getHouseholdSettings()
  await db.update(household)
    .set({ settings: { ...existing, recordCategories } })
    .where(eq(household.id, HOUSEHOLD_ID))
}

export async function getCategorySettings() {
  const settings = await getHouseholdSettings()
  return settings.recordCategories ?? {}
}

export async function getCategories(): Promise<CategoryMeta[]> {
  const settings = await getCategorySettings()
  const deleted = new Set(settings.deleted ?? [])
  const overrides = settings.overrides ?? {}

  const builtins = CATEGORIES
    .filter(category => !deleted.has(category.key))
    .map(category => ({ ...category, ...(overrides[category.key] ?? {}) }))

  const custom = (settings.custom ?? [])
    .filter(category => !deleted.has(category.key))
    .map(category => ({
      ...category,
      defaultFields: category.defaultFields?.length ? category.defaultFields : DEFAULT_FIELDS,
    }))

  return [...builtins, ...custom]
}

export async function getCategoryMap() {
  const categories = await getCategories()
  return Object.fromEntries(categories.map(category => [category.key, category]))
}

export async function upsertCategory(input: CategoryInput) {
  const settings = await getCategorySettings()
  const custom = settings.custom ?? []
  const overrides = settings.overrides ?? {}
  const deleted = (settings.deleted ?? []).filter(key => key !== input.key)
  const key = input.key?.trim() || `custom_${slugify(input.label)}_${Date.now()}`
  const builtin = CATEGORIES.find(category => category.key === key)

  if (builtin) {
    overrides[key] = {
      label: input.label.trim(),
      icon: input.icon.trim() || builtin.icon,
      color: input.color.trim() || builtin.color,
      desc: input.desc?.trim() || builtin.desc,
    }
  } else {
    const existingIndex = custom.findIndex(category => category.key === key)
    const category: CategoryMeta = {
      key,
      label: input.label.trim(),
      icon: input.icon.trim() || '📌',
      color: input.color.trim() || '#8E8E93',
      desc: input.desc?.trim() || 'Household records',
      defaultFields: existingIndex >= 0 ? custom[existingIndex].defaultFields : DEFAULT_FIELDS,
      renewalLabel: existingIndex >= 0 ? custom[existingIndex].renewalLabel : undefined,
    }

    if (existingIndex >= 0) custom[existingIndex] = category
    else custom.push(category)
  }

  await writeCategorySettings({ ...settings, custom, overrides, deleted })
  return key
}

export async function deleteCategorySetting(key: string) {
  const settings = await getCategorySettings()
  const custom = (settings.custom ?? []).filter(category => category.key !== key)
  const overrides = { ...(settings.overrides ?? {}) }
  delete overrides[key]
  const deleted = Array.from(new Set([...(settings.deleted ?? []), key]))
  await writeCategorySettings({ ...settings, custom, overrides, deleted })
}
