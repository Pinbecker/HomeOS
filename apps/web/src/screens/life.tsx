import { useMemo, useState, type ReactNode } from 'react'
import { enqueueMutation, getCurrentState, makeId, useAppState } from '../lib/app-store'
import { useSessionState } from '../lib/session-store'
import { SwipeRow } from '../components/swipe-row'
import { ScreenShell } from './shell'

type CategoryMeta = {
  key: string
  label: string
  icon: string
  color: string
  desc: string
  defaultFields: string[]
  renewalLabel?: string
  builtin?: boolean
}

type RecordField = { label: string; value: string }

type LifeRecord = {
  id: string
  householdId: string
  category: string
  title: string
  subtitle?: string | null
  icon?: string | null
  fields?: RecordField[] | null
  renewalDate?: string | number | Date | null
  renewalLabel?: string | null
  notes?: string | null
  sortOrder?: number
  createdAt?: string | number | Date
  updatedAt?: string | number | Date
}

type VaultReminder = {
  id: string
  householdId: string
  createdById: string
  entityType: string
  entityId: string
  message?: string | null
  triggerAt: string | number | Date
  dispatchedAt?: string | number | Date | null
  dismissedAt?: string | number | Date | null
  createdAt: string | number | Date
}

type HouseholdRow = {
  id: string
  name: string
  settings?: Record<string, unknown> | null
  createdAt?: string | number | Date
}

const BASE_CATEGORIES: CategoryMeta[] = [
  { key: 'identity', label: 'People & IDs', icon: '🪪', color: '#5856D6', desc: 'Names, NHS, NI, passports, licences', defaultFields: ['NHS number', 'NI number', 'Passport number', 'Passport expiry', 'Driving licence', 'Blood type'], builtin: true },
  { key: 'home', label: 'Home', icon: '🏠', color: '#FF9500', desc: 'Property, mortgage, boiler, council tax', defaultFields: ['Provider', 'Account / reference', 'Phone'], renewalLabel: 'Renews', builtin: true },
  { key: 'utility', label: 'Utilities', icon: '💡', color: '#FFCC00', desc: 'Water, energy, broadband, mobile', defaultFields: ['Provider', 'Account number', 'Phone', 'Online login'], renewalLabel: 'Contract ends', builtin: true },
  { key: 'insurance', label: 'Insurance & Cover', icon: '🛡️', color: '#34C759', desc: 'Home, car, breakdown, pet', defaultFields: ['Provider', 'Policy number', 'Cover', 'Phone', 'Excess'], renewalLabel: 'Renews', builtin: true },
  { key: 'vehicle', label: 'Vehicles', icon: '🚗', color: '#007AFF', desc: 'Reg, MOT, service, VIN', defaultFields: ['Registration', 'Make & model', 'VIN', 'Insurer'], renewalLabel: 'MOT due', builtin: true },
  { key: 'contact', label: 'Contacts', icon: '📇', color: '#00C7BE', desc: 'GP, dentist, employers, key people', defaultFields: ['Phone', 'Email', 'Address'], builtin: true },
  { key: 'subscription', label: 'Money & Bills', icon: '💳', color: '#AF52DE', desc: 'Recurring payments and subscriptions', defaultFields: ['Amount', 'Frequency', 'Account'], renewalLabel: 'Next payment', builtin: true },
  { key: 'pet', label: 'Pets', icon: '🐾', color: '#FF2D55', desc: 'Insurance, vet, microchip', defaultFields: ['Microchip', 'Vet', 'Date of birth', 'Insurer'], builtin: true },
  { key: 'reference', label: 'Reference', icon: '📋', color: '#8E8E93', desc: 'Wi-Fi, router, anything else handy', defaultFields: ['Detail'], builtin: true },
]

type CategoryOverride = Partial<Pick<CategoryMeta, 'label' | 'icon' | 'color' | 'desc' | 'defaultFields' | 'renewalLabel'>>
type StoredCategorySettings = {
  custom?: CategoryMeta[]
  overrides?: Record<string, CategoryOverride>
  deleted?: string[]
  order?: string[]
}

function getCategorySettings(raw: Record<string, unknown> | null | undefined): StoredCategorySettings {
  if (!raw || typeof raw !== 'object') return {}
  const recordCategories = (raw as { recordCategories?: StoredCategorySettings }).recordCategories
  return recordCategories && typeof recordCategories === 'object' ? recordCategories : {}
}

function buildCategories(settingsRaw: Record<string, unknown> | null | undefined) {
  const settings = getCategorySettings(settingsRaw)
  const deleted = new Set(settings.deleted ?? [])
  const overrides = settings.overrides ?? {}
  const builtins = BASE_CATEGORIES
    .filter(category => !deleted.has(category.key))
    .map(category => ({ ...category, ...(overrides[category.key] ?? {}), builtin: true }))
  const custom = (settings.custom ?? [])
    .filter(category => !deleted.has(category.key))
    .map(category => ({ ...category, builtin: false }))
  const categories = [...builtins, ...custom]
  if (!settings.order?.length) return categories
  const order = new Map(settings.order.map((key, index) => [key, index]))
  return [...categories].sort((a, b) => {
    const aIndex = order.get(a.key) ?? Number.MAX_SAFE_INTEGER
    const bIndex = order.get(b.key) ?? Number.MAX_SAFE_INTEGER
    return aIndex === bIndex ? categories.indexOf(a) - categories.indexOf(b) : aIndex - bIndex
  })
}

function householdId() {
  return getCurrentState().data.household[0]?.id ?? 'default'
}

function formatRenewal(value: string | number | Date | null | undefined) {
  if (!value) return null
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function toInputDate(value: string | number | Date | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function toInputTime(value: string | number | Date | null | undefined) {
  if (!value) return '09:00'
  const date = new Date(value)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function dateFromInput(value: string) {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toISOString()
}

function dateTimeFromInputs(dateValue: string, timeValue: string) {
  if (!dateValue) return null
  const [year, month, day] = dateValue.split('-').map(Number)
  const [hour, minute] = (timeValue || '09:00').split(':').map(Number)
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString()
}

function formatShortDate(value: string | number | Date) {
  const date = new Date(value)
  const datePart = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  if (date.getHours() === 0 && date.getMinutes() === 0) return datePart
  return `${datePart} · ${date.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' })}`
}

function normalizeFields(fields: RecordField[]) {
  return fields
    .map(field => ({ label: field.label.trim(), value: field.value.trim() }))
    .filter(field => field.label || field.value)
}

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-text-3">
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}

function BackChevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M10 3L5 8l5 5" />
    </svg>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mx-4 mb-5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12px] font-bold uppercase tracking-wide text-text-3">{title}</p>
        {action}
      </div>
      {children}
    </section>
  )
}

function EmptyRow({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-surface-2 text-[17px] text-text-2">{icon}</div>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-text-1">{title}</p>
        <p className="mt-0.5 text-[12px] text-text-2">{subtitle}</p>
      </div>
    </div>
  )
}

async function upsertRecord(record: LifeRecord, patch: Partial<LifeRecord>) {
  const now = new Date().toISOString()
  const payload = { ...record, ...patch, updatedAt: now }
  await enqueueMutation({
    id: makeId('mutation'),
    name: 'record.upsert',
    entityType: 'record',
    entityId: record.id,
    operation: 'upsert',
    payload,
  }, prev => ({
    ...prev,
    data: {
      ...prev.data,
      records: prev.data.records.map(row => row.id === record.id ? { ...row, ...payload } : row),
    },
  }))
}

async function createRecord(category: CategoryMeta, title: string) {
  const now = new Date().toISOString()
  const id = makeId('record')
  const payload: LifeRecord = {
    id,
    householdId: householdId(),
    category: category.key,
    title: title.trim(),
    subtitle: null,
    icon: null,
    fields: category.defaultFields.map(label => ({ label, value: '' })),
    renewalDate: null,
    renewalLabel: category.renewalLabel ?? null,
    sortOrder: Date.now(),
    createdAt: now,
    updatedAt: now,
  }
  await enqueueMutation({
    id: makeId('mutation'),
    name: 'record.upsert',
    entityType: 'record',
    entityId: id,
    operation: 'upsert',
    payload,
  }, prev => ({
    ...prev,
    data: { ...prev.data, records: [...prev.data.records, payload] },
  }))
  return id
}

async function saveCategorySettings(household: HouseholdRow, next: StoredCategorySettings) {
  const nextSettings = { ...(household.settings ?? {}), recordCategories: next }
  const nextHousehold = { ...household, settings: nextSettings }
  await enqueueMutation({
    id: makeId('mutation'),
    name: 'household.upsert',
    entityType: 'household',
    entityId: household.id,
    operation: 'upsert',
    payload: nextHousehold,
  }, prev => ({
    ...prev,
    data: {
      ...prev.data,
      household: prev.data.household.map(row => row.id === household.id ? nextHousehold : row),
    },
  }))
}

export function LifeOverviewPage() {
  const snapshot = useAppState(state => {
    const household = state.data.household[0] as HouseholdRow | undefined
    const categories = buildCategories(household?.settings ?? null)
    const records = state.data.records as LifeRecord[]
    return { household: household ?? null, categories, records }
  })
  const [adminOpen, setAdminOpen] = useState(false)

  return (
    <ScreenShell title="Vault">
      <div className="px-4">
        <div className="mb-4 rounded-3xl bg-surface px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[24px] font-bold text-text-1">Household records</p>
              <p className="mt-1 text-[14px] text-text-2">Life admin, policies, IDs, vehicles, utilities, and reference details.</p>
            </div>
            <button type="button" onClick={() => setAdminOpen(true)} className="shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-accent active:opacity-70">Manage</button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-surface">
          {snapshot.categories.map((category, index) => {
            const count = snapshot.records.filter(record => record.category === category.key).length
            return (
              <a key={category.key} href={`/life/${category.key}`} className={`flex items-center gap-3.5 px-4 py-3.5 active:bg-surface-2 ${index > 0 ? 'border-t border-border' : ''}`}>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] text-[22px]" style={{ background: `${category.color}1F` }}>{category.icon}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold text-text-1">{category.label}</p>
                  <p className="truncate text-[12.5px] text-text-2">{category.desc}</p>
                </div>
                <span className="flex h-[26px] min-w-[26px] shrink-0 items-center justify-center rounded-full px-2 text-[13px] font-bold" style={{ background: `${category.color}1F`, color: category.color }}>{count}</span>
                <Chevron />
              </a>
            )
          })}
        </div>
      </div>

      {adminOpen && snapshot.household ? (
        <CategoryAdminSheet household={snapshot.household} categories={snapshot.categories} records={snapshot.records} onClose={() => setAdminOpen(false)} />
      ) : null}
    </ScreenShell>
  )
}

export function LifeCategoryPage() {
  const pathname = typeof window === 'undefined' ? '' : window.location.pathname
  const categoryKey = pathname.split('/').pop() ?? 'reference'
  const snapshot = useAppState(state => {
    const categories = buildCategories(state.data.household[0]?.settings ?? null)
    const category = categories.find(entry => entry.key === categoryKey) ?? categories.find(entry => entry.key === 'reference') ?? BASE_CATEGORIES[BASE_CATEGORIES.length - 1]
    const records = (state.data.records as LifeRecord[])
      .filter(record => record.category === category.key)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    return { category, records }
  })
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [saving, setSaving] = useState(false)

  async function addRecord() {
    if (!newTitle.trim() || saving) return
    setSaving(true)
    const id = await createRecord(snapshot.category, newTitle)
    window.location.href = `/life/admin/${id}`
  }

  return (
    <ScreenShell title={snapshot.category.label} showHeader={false}>
      <div className="safe-top sticky top-0 z-20 border-b border-border bg-bg/95 px-3 pb-2 pt-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <a href="/life/admin" className="flex items-center gap-1 text-accent active:opacity-60">
            <BackChevron />
            <span className="text-[16px]">Vault</span>
          </a>
          <p className="max-w-[44%] truncate text-center text-[15px] font-semibold text-text-1">{snapshot.category.label}</p>
          <button type="button" onClick={() => setAdding(true)} className="text-[16px] font-medium text-accent active:opacity-60">Add</button>
        </div>
      </div>

      <div className="px-4 pt-4">
        <div className="mb-4 rounded-2xl bg-surface px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[11px] text-[22px]" style={{ background: `${snapshot.category.color}1F` }}>{snapshot.category.icon}</div>
            <div className="min-w-0">
              <p className="truncate text-[22px] font-bold tracking-tight text-text-1">{snapshot.category.label}</p>
              <p className="truncate text-[13px] text-text-2">{snapshot.category.desc}</p>
            </div>
          </div>
        </div>

        {adding ? (
          <div className="mb-3 rounded-2xl bg-surface p-3">
            <input
              autoFocus
              value={newTitle}
              onChange={event => setNewTitle(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') void addRecord() }}
              placeholder={`Add ${snapshot.category.label.toLowerCase()} item`}
              className="h-11 w-full rounded-xl bg-surface-2 px-3 text-[16px] font-semibold text-text-1 outline-none placeholder:text-text-3"
            />
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => { void addRecord() }} disabled={!newTitle.trim() || saving} className="h-10 flex-1 rounded-xl bg-accent text-[15px] font-semibold text-white disabled:opacity-40">Create</button>
              <button type="button" onClick={() => { setAdding(false); setNewTitle('') }} className="h-10 rounded-xl bg-surface-2 px-4 text-[15px] font-semibold text-text-2">Cancel</button>
            </div>
          </div>
        ) : null}

        {snapshot.records.length === 0 ? (
          <div className="rounded-2xl bg-surface px-4 py-8 text-center">
            <p className="mb-3 text-[14px] text-text-2">Nothing here yet</p>
            <button type="button" onClick={() => setAdding(true)} className="text-[15px] font-medium text-accent active:opacity-60">Add the first one</button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-surface">
            {snapshot.records.map((record, index) => {
              const visibleFields = (record.fields ?? []).filter(field => field.value).slice(0, 4)
              return (
                <a key={record.id} href={`/life/admin/${record.id}`} className={`relative flex bg-surface active:bg-surface-2 ${index > 0 ? 'border-t border-border' : ''}`}>
                  <span className="w-[3px] shrink-0" style={{ background: snapshot.category.color }} aria-hidden />
                  <div className="min-w-0 flex-1 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[16px] font-semibold text-text-1">{record.title}</p>
                        {record.subtitle ? <p className="mt-0.5 truncate text-[13px] text-text-2">{record.subtitle}</p> : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {record.renewalDate ? <span className="rounded-lg bg-surface-2 px-2 py-1 text-[11.5px] font-semibold text-text-2">{record.renewalLabel ?? 'Due'} · {formatRenewal(record.renewalDate)}</span> : null}
                        <Chevron />
                      </div>
                    </div>
                    {visibleFields.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {visibleFields.map(field => (
                          <span key={`${record.id}-${field.label}-${field.value}`} className="max-w-full truncate rounded-lg bg-surface-2 px-2 py-1 text-[11.5px] font-medium">
                            <span className="text-text-3">{field.label}: </span>
                            <span className="text-text-1">{field.value}</span>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </a>
              )
            })}
          </div>
        )}
      </div>
    </ScreenShell>
  )
}

export function LifeEntityPage() {
  const currentUser = useSessionState(state => state.user)
  const pathname = typeof window === 'undefined' ? '' : window.location.pathname
  const entityId = pathname.split('/').pop() ?? ''
  const snapshot = useAppState(state => {
    const categories = buildCategories(state.data.household[0]?.settings ?? null)
    const record = (state.data.records as LifeRecord[]).find(entry => entry.id === entityId) ?? null
    const category = record ? categories.find(entry => entry.key === record.category) ?? BASE_CATEGORIES[BASE_CATEGORIES.length - 1] : BASE_CATEGORIES[BASE_CATEGORIES.length - 1]
    const linkedReminders = state.data.reminders
      .filter(reminder => reminder.entityType === 'record' && reminder.entityId === entityId && !reminder.dismissedAt)
      .sort((a, b) => new Date(a.triggerAt).getTime() - new Date(b.triggerAt).getTime()) as VaultReminder[]
    return { category, record, linkedReminders }
  })
  const [headerEditing, setHeaderEditing] = useState(false)
  const [headerDraft, setHeaderDraft] = useState({ title: '', subtitle: '' })
  const [fieldEditor, setFieldEditor] = useState<{ index: number; label: string; value: string } | null>(null)
  const [renewalEditing, setRenewalEditing] = useState(false)
  const [renewalDraft, setRenewalDraft] = useState({ label: '', date: '' })
  const [reminderEditor, setReminderEditor] = useState<{ id: string | 'new'; message: string; date: string; time: string } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [saving, setSaving] = useState(false)

  if (!snapshot.record) {
    return (
      <ScreenShell title="Vault">
        <div className="px-4">
          <div className="rounded-2xl bg-surface px-5 py-6">
            <p className="text-[15px] font-semibold text-text-1">Record not found</p>
          </div>
        </div>
      </ScreenShell>
    )
  }

  const record = snapshot.record
  const fields = record.fields?.length ? record.fields : snapshot.category.defaultFields.map(label => ({ label, value: '' }))
  const visibleFields = fields
    .map((field, index) => ({ field, index }))
    .filter(row => row.field.label || row.field.value)
  const household = householdId()

  function startHeaderEdit() {
    setHeaderDraft({ title: record.title, subtitle: record.subtitle ?? '' })
    setHeaderEditing(true)
    setDeleteConfirm(false)
  }

  async function saveHeader() {
    if (!headerDraft.title.trim() || saving) return
    setSaving(true)
    await upsertRecord(record, {
      title: headerDraft.title.trim(),
      subtitle: headerDraft.subtitle.trim() || null,
    })
    setSaving(false)
    setDeleteConfirm(false)
    setHeaderEditing(false)
  }

  async function saveField(index: number, draft: RecordField) {
    if (saving) return
    const next = [...fields]
    const cleaned = { label: draft.label.trim(), value: draft.value.trim() }
    if (cleaned.label || cleaned.value) {
      next[index] = cleaned
    } else {
      next.splice(index, 1)
    }
    setSaving(true)
    await upsertRecord(record, { fields: normalizeFields(next) })
    setSaving(false)
    setFieldEditor(null)
  }

  async function deleteField(index: number) {
    if (saving) return
    const next = [...fields]
    next.splice(index, 1)
    setSaving(true)
    await upsertRecord(record, { fields: normalizeFields(next) })
    setSaving(false)
    setFieldEditor(null)
  }

  function startRenewalEdit() {
    setRenewalDraft({ label: record.renewalLabel ?? snapshot.category.renewalLabel ?? '', date: toInputDate(record.renewalDate) })
    setRenewalEditing(true)
  }

  async function saveRenewal() {
    if (saving) return
    setSaving(true)
    await upsertRecord(record, {
      renewalLabel: renewalDraft.label.trim() || null,
      renewalDate: dateFromInput(renewalDraft.date),
    })
    setSaving(false)
    setRenewalEditing(false)
  }

  async function addOrUpdateReminder(reminder?: VaultReminder) {
    if (!reminderEditor || !reminderEditor.date || saving) return
    const triggerAt = dateTimeFromInputs(reminderEditor.date, reminderEditor.time)
    if (!triggerAt) return
    setSaving(true)
    const now = new Date().toISOString()
    const id = reminder?.id ?? makeId('reminder')
    const payload = {
      id,
      householdId: household,
      createdById: reminder?.createdById ?? currentUser?.id ?? 'system',
      entityType: 'record',
      entityId: record.id,
      message: reminderEditor.message.trim() || null,
      triggerAt,
      dispatchedAt: reminder?.dispatchedAt ?? null,
      dismissedAt: reminder?.dismissedAt ?? null,
      createdAt: reminder?.createdAt ?? now,
    }
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'reminder.upsert',
      entityType: 'reminder',
      entityId: id,
      operation: 'upsert',
      payload,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        reminders: reminder
          ? prev.data.reminders.map(row => row.id === id ? { ...row, ...payload } : row)
          : [...prev.data.reminders, payload],
      },
    }))
    setSaving(false)
    setReminderEditor(null)
  }

  async function deleteReminder(reminderId: string) {
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'reminder.delete',
      entityType: 'reminder',
      entityId: reminderId,
      operation: 'delete',
      payload: null,
    }, prev => ({ ...prev, data: { ...prev.data, reminders: prev.data.reminders.filter(row => row.id !== reminderId) } }))
  }

  async function deleteRecord() {
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'record.delete',
      entityType: 'record',
      entityId: record.id,
      operation: 'delete',
      payload: null,
    }, prev => ({ ...prev, data: { ...prev.data, records: prev.data.records.filter(row => row.id !== record.id) } }))
    window.location.href = `/life/${record.category}`
  }

  return (
    <ScreenShell title="Vault" showHeader={false}>
      <div className="mx-auto flex max-w-lg flex-col pb-4">
        <div className="safe-top sticky top-0 z-20 border-b border-border bg-bg/95 px-3 pb-2 pt-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => window.history.back()} className="-ml-1 flex items-center gap-1 text-accent active:opacity-60">
              <BackChevron />
              <span className="text-[16px]">Back</span>
            </button>
            <p className="max-w-[44%] truncate text-center text-[15px] font-semibold text-text-1">{record.title}</p>
            {headerEditing ? (
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => { setDeleteConfirm(false); setHeaderEditing(false) }} className="px-1 text-[15px] font-semibold text-text-2 active:opacity-60">Cancel</button>
                <button type="button" onClick={() => { void saveHeader() }} disabled={!headerDraft.title.trim() || saving} className="px-1 text-[15px] font-semibold text-accent active:opacity-60 disabled:opacity-40">{saving ? 'Saving...' : 'Save'}</button>
              </div>
            ) : (
              <button type="button" onClick={startHeaderEdit} className="px-1 text-[15px] font-semibold text-accent active:opacity-60">Edit</button>
            )}
          </div>
        </div>

        <header className="px-5 pb-5 pt-4">
          {headerEditing ? (
            <div>
              <input value={headerDraft.title} onChange={event => setHeaderDraft(prev => ({ ...prev, title: event.target.value }))} placeholder="Title" className="w-full bg-transparent text-[34px] font-extrabold leading-[1.02] tracking-tight text-text-1 outline-none placeholder:text-text-3" />
              <input value={headerDraft.subtitle} onChange={event => setHeaderDraft(prev => ({ ...prev, subtitle: event.target.value }))} placeholder="Description" className="mt-2 w-full bg-transparent text-[16px] text-text-2 outline-none placeholder:text-text-3" />
              <div className="mt-4">
                {deleteConfirm ? (
                  <div className="rounded-2xl bg-surface p-4">
                    <p className="text-[14px] font-semibold text-text-1">Delete this record?</p>
                    <p className="mt-1 text-[12.5px] text-text-2">This removes it from Vault. This cannot be undone from this screen.</p>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => { void deleteRecord() }} disabled={saving} className="h-10 flex-1 rounded-xl bg-red text-[15px] font-semibold text-white disabled:opacity-50">Delete</button>
                      <button type="button" onClick={() => setDeleteConfirm(false)} className="h-10 rounded-xl bg-surface-2 px-4 text-[15px] font-semibold text-text-2">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setDeleteConfirm(true)} className="text-[13px] font-semibold text-red active:opacity-70">Delete record</button>
                )}
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-[34px] font-extrabold leading-[1.02] tracking-tight text-text-1">{record.title}</h1>
              {record.subtitle ? <p className="mt-2 text-[16px] text-text-2">{record.subtitle}</p> : null}
            </>
          )}
        </header>

        <Section title="Key facts" action={<button type="button" onClick={() => setFieldEditor({ index: fields.length, label: '', value: '' })} className="text-[12px] font-semibold text-accent">Add field</button>}>
          <div className="overflow-hidden rounded-2xl bg-surface">
            {visibleFields.length > 0 ? visibleFields.map(({ field, index }) => (
              <FieldRow
                key={`${field.label}-${field.value}-${index}`}
                field={field}
                index={index}
                editing={fieldEditor?.index === index}
                draft={fieldEditor}
                onEdit={() => setFieldEditor({ index, label: field.label, value: field.value })}
                onDraft={patch => setFieldEditor(prev => prev ? { ...prev, ...patch } : prev)}
                onSave={() => fieldEditor ? void saveField(index, fieldEditor) : undefined}
                onCancel={() => setFieldEditor(null)}
                onDelete={() => { void deleteField(index) }}
              />
            )) : <EmptyRow icon="•" title="No key facts yet" subtitle="Add labels and values for this record." />}
            {fieldEditor?.index === fields.length ? (
              <FieldRow
                field={{ label: '', value: '' }}
                index={fields.length}
                editing
                draft={fieldEditor}
                onEdit={() => undefined}
                onDraft={patch => setFieldEditor(prev => prev ? { ...prev, ...patch } : prev)}
                onSave={() => void saveField(fields.length, fieldEditor)}
                onCancel={() => setFieldEditor(null)}
                onDelete={() => setFieldEditor(null)}
              />
            ) : null}
          </div>
        </Section>

        <Section title="Renewal" action={<button type="button" onClick={startRenewalEdit} className="text-[12px] font-semibold text-accent">{record.renewalDate ? 'Edit' : 'Add renewal'}</button>}>
          <div className="overflow-hidden rounded-2xl bg-surface">
            {renewalEditing ? (
              <div className="p-4">
                <div className="flex flex-col gap-3">
                  <input value={renewalDraft.label} onChange={event => setRenewalDraft(prev => ({ ...prev, label: event.target.value }))} placeholder="Label, e.g. Renews, Expires" className="h-11 rounded-xl bg-surface-2 px-3 text-[15px] text-text-1 outline-none" />
                  <label className="rounded-xl bg-surface-2 px-3 py-2">
                    <span className="mb-1 block text-[12px] font-semibold text-text-2">Date</span>
                    <input type="date" value={renewalDraft.date} onChange={event => setRenewalDraft(prev => ({ ...prev, date: event.target.value }))} className="w-full bg-transparent text-[15px] text-text-1 outline-none" />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { void saveRenewal() }} disabled={saving} className="h-11 flex-1 rounded-xl bg-accent text-[15px] font-bold text-white disabled:opacity-50">Save renewal</button>
                    <button type="button" onClick={() => setRenewalEditing(false)} className="h-11 rounded-xl bg-surface-2 px-4 text-[15px] font-semibold text-text-2">Cancel</button>
                  </div>
                </div>
              </div>
            ) : record.renewalDate ? (
              <SwipeRow onDelete={() => { setRenewalDraft({ label: '', date: '' }); void upsertRecord(record, { renewalDate: null, renewalLabel: null }) }} deleteLabel="Clear" onEdit={startRenewalEdit}>
                <button type="button" onClick={startRenewalEdit} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left active:bg-surface-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-amber-bg text-[17px] text-amber">📅</div>
                    <p className="truncate text-[13.5px] font-semibold text-amber">{record.renewalLabel || 'Due date'}</p>
                  </div>
                  <p className="shrink-0 text-right text-[14.5px] font-bold text-text-1">{formatRenewal(record.renewalDate)}</p>
                </button>
              </SwipeRow>
            ) : <EmptyRow icon="📅" title="No renewal set" subtitle="Add a due date or renewal date for this record." />}
          </div>
        </Section>

        <Section title="Reminders" action={<button type="button" onClick={() => setReminderEditor({ id: 'new', message: '', date: '', time: '09:00' })} className="text-[12px] font-semibold text-accent">Add reminder</button>}>
          <div className="overflow-hidden rounded-2xl bg-surface">
            {reminderEditor?.id === 'new' ? <ReminderEditor editor={reminderEditor} saving={saving} fallbackTitle={record.title} onDraft={patch => setReminderEditor(prev => prev ? { ...prev, ...patch } : prev)} onSave={() => { void addOrUpdateReminder() }} onCancel={() => setReminderEditor(null)} /> : null}
            {snapshot.linkedReminders.length > 0 ? snapshot.linkedReminders.map((reminder, index) => (
              <div key={reminder.id} className={(index > 0 || reminderEditor?.id === 'new') ? 'border-t border-border' : ''}>
                {reminderEditor?.id === reminder.id ? (
                  <ReminderEditor editor={reminderEditor} saving={saving} fallbackTitle={record.title} onDraft={patch => setReminderEditor(prev => prev ? { ...prev, ...patch } : prev)} onSave={() => { void addOrUpdateReminder(reminder) }} onCancel={() => setReminderEditor(null)} />
                ) : (
                  <SwipeRow onDelete={() => { void deleteReminder(reminder.id) }} onEdit={() => setReminderEditor({ id: reminder.id, message: reminder.message ?? '', date: toInputDate(reminder.triggerAt), time: toInputTime(reminder.triggerAt) })}>
                    <button type="button" onClick={() => setReminderEditor({ id: reminder.id, message: reminder.message ?? '', date: toInputDate(reminder.triggerAt), time: toInputTime(reminder.triggerAt) })} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-amber-bg text-[17px] text-amber">⏱</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14.5px] font-semibold text-text-1">{reminder.message || record.title}</p>
                        <p className="mt-0.5 text-[12px] text-text-2">{formatShortDate(reminder.triggerAt)}</p>
                      </div>
                    </button>
                  </SwipeRow>
                )}
              </div>
            )) : reminderEditor?.id !== 'new' ? <EmptyRow icon="⏱" title="No reminders yet" subtitle="Add renewals, services and follow-ups here." /> : null}
          </div>
        </Section>

      </div>
    </ScreenShell>
  )
}

function FieldRow({
  field,
  index,
  editing,
  draft,
  onEdit,
  onDraft,
  onSave,
  onCancel,
  onDelete,
}: {
  field: RecordField
  index: number
  editing: boolean
  draft: { label: string; value: string } | null
  onEdit: () => void
  onDraft: (patch: Partial<RecordField>) => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  if (editing && draft) {
    return (
      <div className={`p-3 ${index > 0 ? 'border-t border-border' : ''}`}>
        <div className="flex items-center gap-2">
          <input autoFocus value={draft.label} onChange={event => onDraft({ label: event.target.value })} placeholder="Label" className="w-[38%] rounded-xl bg-surface-2 px-3 py-2.5 text-[14px] text-text-2 outline-none placeholder:text-text-3" />
          <input value={draft.value} onChange={event => onDraft({ value: event.target.value })} placeholder="Value" className="min-w-0 flex-1 rounded-xl bg-surface-2 px-3 py-2.5 text-[15px] text-text-1 outline-none placeholder:text-text-3" />
        </div>
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={onSave} className="h-9 flex-1 rounded-xl bg-accent text-[14px] font-semibold text-white">Save</button>
          <button type="button" onClick={onCancel} className="h-9 rounded-xl bg-surface-2 px-4 text-[14px] font-semibold text-text-2">Cancel</button>
          <button type="button" onClick={onDelete} className="h-9 rounded-xl bg-red px-4 text-[14px] font-semibold text-white">Delete</button>
        </div>
      </div>
    )
  }

  return (
    <button type="button" onClick={onEdit} className={`flex w-full items-baseline justify-between gap-4 px-4 py-3 text-left active:bg-surface-2 ${index > 0 ? 'border-t border-border' : ''}`}>
      <p className="shrink-0 text-[13.5px] text-text-2">{field.label || 'Detail'}</p>
      <p className="break-words text-right text-[14.5px] font-medium text-text-1">{field.value || 'Not set'}</p>
    </button>
  )
}

function ReminderEditor({ editor, saving, fallbackTitle, onDraft, onSave, onCancel }: {
  editor: { message: string; date: string; time: string }
  saving: boolean
  fallbackTitle: string
  onDraft: (patch: Partial<{ message: string; date: string; time: string }>) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="p-4">
      <div className="flex flex-col gap-3">
        <input value={editor.message} onChange={event => onDraft({ message: event.target.value })} placeholder={`Remind me about ${fallbackTitle}`} className="h-11 rounded-xl bg-surface-2 px-3 text-[15px] text-text-1 outline-none" />
        <div className="overflow-hidden rounded-xl bg-surface-2">
          <label className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="shrink-0 text-[13px] font-semibold text-text-2">Date</span>
            <input type="date" required value={editor.date} onChange={event => onDraft({ date: event.target.value })} className="bg-transparent text-right text-[15px] text-text-1 outline-none" />
          </label>
          <label className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
            <span className="shrink-0 text-[13px] font-semibold text-text-2">Time</span>
            <input type="time" value={editor.time} onChange={event => onDraft({ time: event.target.value })} className="bg-transparent text-right text-[15px] text-text-1 outline-none" />
          </label>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onSave} disabled={!editor.date || saving} className="h-11 flex-1 rounded-xl bg-accent text-[15px] font-bold text-white disabled:opacity-50">Save reminder</button>
          <button type="button" onClick={onCancel} className="h-11 rounded-xl bg-surface-2 px-4 text-[15px] font-semibold text-text-2">Cancel</button>
        </div>
      </div>
    </div>
  )
}

function CategoryAdminSheet({ household, categories, records, onClose }: { household: HouseholdRow; categories: CategoryMeta[]; records: LifeRecord[]; onClose: () => void }) {
  const settings = getCategorySettings(household.settings)
  const counts = useMemo(() => new Map(categories.map(category => [category.key, records.filter(record => record.category === category.key).length])), [categories, records])
  const [editingKey, setEditingKey] = useState<string | 'new' | null>(null)
  const [draft, setDraft] = useState<CategoryMeta | null>(null)
  const [fieldText, setFieldText] = useState('')
  const [saving, setSaving] = useState(false)

  function beginEdit(category: CategoryMeta | 'new') {
    if (category === 'new') {
      setEditingKey('new')
      setDraft({ key: `custom-${Date.now()}`, label: '', icon: '📁', color: '#8E8E93', desc: '', defaultFields: ['Detail'], builtin: false })
      setFieldText('Detail')
      return
    }
    setEditingKey(category.key)
    setDraft({ ...category })
    setFieldText(category.defaultFields.join('\n'))
  }

  async function saveDraft() {
    if (!draft || !draft.label.trim() || saving) return
    setSaving(true)
    const nextDraft = {
      ...draft,
      label: draft.label.trim(),
      icon: draft.icon.trim() || '📁',
      color: draft.color || '#8E8E93',
      desc: draft.desc.trim(),
      defaultFields: fieldText.split('\n').map(field => field.trim()).filter(Boolean),
    }
    const next: StoredCategorySettings = {
      ...settings,
      custom: [...(settings.custom ?? [])],
      overrides: { ...(settings.overrides ?? {}) },
      deleted: [...(settings.deleted ?? [])],
      order: settings.order?.length ? [...settings.order] : categories.map(category => category.key),
    }
    if (editingKey === 'new' || !nextDraft.builtin) {
      const custom = next.custom ?? []
      const existingIndex = custom.findIndex(category => category.key === nextDraft.key)
      const customCategory = { ...nextDraft, builtin: false }
      next.custom = existingIndex === -1 ? [...custom, customCategory] : custom.map(category => category.key === nextDraft.key ? customCategory : category)
    } else {
      next.overrides = {
        ...(next.overrides ?? {}),
        [nextDraft.key]: {
          label: nextDraft.label,
          icon: nextDraft.icon,
          color: nextDraft.color,
          desc: nextDraft.desc,
          defaultFields: nextDraft.defaultFields,
          renewalLabel: nextDraft.renewalLabel,
        },
      }
    }
    if (!next.order?.includes(nextDraft.key)) next.order = [...(next.order ?? []), nextDraft.key]
    await saveCategorySettings(household, next)
    setSaving(false)
    setEditingKey(null)
    setDraft(null)
    setFieldText('')
  }

  async function deleteCategory(category: CategoryMeta) {
    if ((counts.get(category.key) ?? 0) > 0 || saving) return
    setSaving(true)
    const next: StoredCategorySettings = {
      ...settings,
      custom: (settings.custom ?? []).filter(row => row.key !== category.key),
      overrides: { ...(settings.overrides ?? {}) },
      deleted: [...(settings.deleted ?? [])],
      order: (settings.order ?? categories.map(row => row.key)).filter(key => key !== category.key),
    }
    delete next.overrides?.[category.key]
    if (category.builtin) next.deleted = Array.from(new Set([...(next.deleted ?? []), category.key]))
    await saveCategorySettings(household, next)
    setSaving(false)
  }

  async function moveCategory(category: CategoryMeta, direction: -1 | 1) {
    const order = settings.order?.length ? [...settings.order] : categories.map(row => row.key)
    const index = order.indexOf(category.key)
    const nextIndex = index + direction
    if (index === -1 || nextIndex < 0 || nextIndex >= order.length) return
    const nextOrder = [...order]
    const [key] = nextOrder.splice(index, 1)
    nextOrder.splice(nextIndex, 0, key)
    await saveCategorySettings(household, { ...settings, order: nextOrder })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45" onClick={onClose}>
      <div className="safe-bottom flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-bg shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 pb-3 pt-4">
          <button type="button" onClick={onClose} className="text-[15px] font-semibold text-text-2">Close</button>
          <h2 className="text-[18px] font-bold text-text-1">Manage categories</h2>
          <button type="button" onClick={() => beginEdit('new')} className="text-[15px] font-semibold text-accent">New</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {editingKey && draft ? (
            <div className="mb-4 rounded-2xl bg-surface p-4">
              <div className="mb-3 flex items-center gap-3">
                <input value={draft.icon} onChange={event => setDraft(prev => prev ? { ...prev, icon: event.target.value } : prev)} className="h-11 w-11 rounded-xl bg-surface-2 text-center text-[24px] outline-none" />
                <input value={draft.label} onChange={event => setDraft(prev => prev ? { ...prev, label: event.target.value } : prev)} placeholder="Category name" className="h-11 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-[16px] font-semibold text-text-1 outline-none" />
                <input type="color" value={draft.color} onChange={event => setDraft(prev => prev ? { ...prev, color: event.target.value } : prev)} className="h-11 w-11 rounded-xl bg-surface-2" />
              </div>
              <input value={draft.desc} onChange={event => setDraft(prev => prev ? { ...prev, desc: event.target.value } : prev)} placeholder="Short description" className="mb-3 h-11 w-full rounded-xl bg-surface-2 px-3 text-[15px] text-text-1 outline-none" />
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-text-2">Default fields</span>
                <textarea value={fieldText} onChange={event => setFieldText(event.target.value)} rows={4} className="w-full resize-none rounded-xl bg-surface-2 px-3 py-2 text-[14px] text-text-1 outline-none" />
              </label>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => { void saveDraft() }} disabled={!draft.label.trim() || saving} className="h-10 flex-1 rounded-xl bg-accent text-[15px] font-semibold text-white disabled:opacity-40">Save</button>
                <button type="button" onClick={() => { setEditingKey(null); setDraft(null) }} className="h-10 rounded-xl bg-surface-2 px-4 text-[15px] font-semibold text-text-2">Cancel</button>
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-2xl bg-surface">
            {categories.map((category, index) => {
              const count = counts.get(category.key) ?? 0
              return (
                <div key={category.key} className={`flex items-center gap-3 px-4 py-3 ${index > 0 ? 'border-t border-border' : ''}`}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-[21px]" style={{ background: `${category.color}1F` }}>{category.icon}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-text-1">{category.label}</p>
                    <p className="truncate text-[12px] text-text-2">{count} records</p>
                  </div>
                  <button type="button" onClick={() => { void moveCategory(category, -1) }} disabled={index === 0} className="h-8 w-8 rounded-full bg-surface-2 text-[14px] font-bold text-text-2 disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => { void moveCategory(category, 1) }} disabled={index === categories.length - 1} className="h-8 w-8 rounded-full bg-surface-2 text-[14px] font-bold text-text-2 disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => beginEdit(category)} className="text-[13px] font-semibold text-accent">Edit</button>
                  <button type="button" onClick={() => { void deleteCategory(category) }} disabled={count > 0 || saving} className="text-[13px] font-semibold text-red disabled:text-text-3">Delete</button>
                </div>
              )
            })}
          </div>
          <p className="mt-3 px-1 text-[12px] leading-5 text-text-2">Categories can only be deleted when empty. Built-in categories are hidden when deleted; custom categories are removed.</p>
        </div>
      </div>
    </div>
  )
}
