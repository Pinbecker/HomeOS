import { enqueueMutation, getCurrentState, makeId } from './app-store'

export function settingObject(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

export function readUserSettings(settings: Record<string, unknown> | null | undefined, userId: string | null | undefined) {
  const all = settingObject(settings?.userSettings)
  return settingObject(userId ? all[userId] : null)
}

export async function saveUserSettings(userId: string, recipe: (current: Record<string, unknown>) => Record<string, unknown>) {
  const state = getCurrentState()
  const householdRow = state.data.household[0] ?? null
  const householdId = householdRow?.id ?? 'default'
  const currentSettings = householdRow?.settings ?? {}
  const currentUserSettings = readUserSettings(currentSettings, userId)
  const nextUserSettings = recipe(currentUserSettings)
  const now = new Date().toISOString()
  const payload = {
    id: householdId,
    name: householdRow?.name ?? 'Home',
    settings: {
      ...currentSettings,
      userSettings: {
        ...settingObject(currentSettings.userSettings),
        [userId]: nextUserSettings,
      },
    },
    createdAt: householdRow?.createdAt ?? now,
  }

  await enqueueMutation({
    id: makeId('mutation'),
    name: 'household.upsert',
    entityType: 'household',
    entityId: householdId,
    operation: 'upsert',
    payload,
  }, prev => ({
    ...prev,
    data: {
      ...prev.data,
      household: prev.data.household.some(row => row.id === householdId)
        ? prev.data.household.map(row => row.id === householdId ? { ...row, ...payload } : row)
        : [...prev.data.household, payload],
    },
  }))
}
