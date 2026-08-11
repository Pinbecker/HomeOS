import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Bell,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  Plus,
  Trash2,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { enqueueMutation, getCurrentState, makeId, useAppState } from '../lib/app-store'
import { navigateInApp } from '../lib/navigation'
import { useSessionState } from '../lib/session-store'
import { SwipeRow } from '../components/swipe-row'
import { VaultDueContent } from './reminders'
import { FamilySubHeader, ScreenShell } from './shell'

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
  kind?: ReminderKind | null
  dueAt?: string | number | Date | null
  leadDays?: number | null
  repeatInterval?: RepeatInterval | null
  triggerAt: string | number | Date
  dispatchedAt?: string | number | Date | null
  dismissedAt?: string | number | Date | null
  createdAt: string | number | Date
}

type ReminderKind = 'general' | 'renewal' | 'expiry' | 'maintenance' | 'payment' | 'follow_up' | 'mot' | 'service'
type RepeatInterval = 'monthly' | 'quarterly' | 'yearly'
type ImportantDateDraft = {
  id: string | 'new'
  kind: ReminderKind
  message: string
  dueDate: string
  remindTime: string
  leadDays: number
  repeatInterval: RepeatInterval | ''
}
type RecordEditorDraft = {
  title: string
  subtitle: string
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

const IMPORTANT_DATE_KINDS: Array<{ kind: ReminderKind; label: string; icon: LucideIcon }> = [
  { kind: 'renewal', label: 'Renewal', icon: CalendarClock },
  { kind: 'expiry', label: 'Expiry', icon: Clock3 },
  { kind: 'maintenance', label: 'Service', icon: Wrench },
  { kind: 'payment', label: 'Payment', icon: CircleDollarSign },
  { kind: 'follow_up', label: 'Follow-up', icon: Bell },
  { kind: 'general', label: 'Reminder', icon: Bell },
]

const LEAD_DAY_OPTIONS = [
  { value: 0, label: 'On the day' },
  { value: 1, label: '1 day before' },
  { value: 7, label: '1 week before' },
  { value: 14, label: '2 weeks before' },
  { value: 30, label: '1 month before' },
]

const REPEAT_OPTIONS: Array<{ value: RepeatInterval | ''; label: string }> = [
  { value: '', label: 'Does not repeat' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
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

function formatRelativeDue(value: string | number | Date) {
  const target = new Date(value)
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime()
  const days = Math.round((targetStart - start) / 86_400_000)
  if (days < 0) return 'Overdue'
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days <= 30) return `${days} days`
  return formatRenewal(value)
}

function inferReminderKind(label: string | null | undefined): ReminderKind {
  const value = (label ?? '').toLowerCase()
  if (value.includes('mot')) return 'maintenance'
  if (value.includes('service')) return 'maintenance'
  if (value.includes('payment')) return 'payment'
  if (value.includes('expir')) return 'expiry'
  if (value.includes('follow')) return 'follow_up'
  return 'renewal'
}

function dateValue(reminder: VaultReminder) {
  return new Date(reminder.dueAt ?? reminder.triggerAt).getTime()
}

function kindMeta(kind: ReminderKind | null | undefined) {
  if (kind === 'mot' || kind === 'service') return IMPORTANT_DATE_KINDS.find(option => option.kind === 'maintenance') ?? IMPORTANT_DATE_KINDS[IMPORTANT_DATE_KINDS.length - 1]
  return IMPORTANT_DATE_KINDS.find(option => option.kind === (kind ?? 'general')) ?? IMPORTANT_DATE_KINDS[IMPORTANT_DATE_KINDS.length - 1]
}

function repeatLabel(value: RepeatInterval | null | undefined) {
  if (value === 'monthly') return 'Monthly'
  if (value === 'quarterly') return 'Quarterly'
  if (value === 'yearly') return 'Yearly'
  return null
}

function leadLabel(value: number | null | undefined) {
  if (!value) return 'On the day'
  if (value === 1) return '1 day before'
  if (value === 7) return '1 week before'
  if (value === 14) return '2 weeks before'
  if (value === 30) return '1 month before'
  return `${value} days before`
}

function dateAtStart(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

function triggerFromDate(dueDate: string, leadDays: number, remindTime: string) {
  const date = dateAtStart(dueDate)
  date.setDate(date.getDate() - leadDays)
  const [hour, minute] = (remindTime || '09:00').split(':').map(Number)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

function draftFromReminder(reminder: VaultReminder): ImportantDateDraft {
  const kind = reminder.kind === 'mot' || reminder.kind === 'service' ? 'maintenance' : reminder.kind ?? 'general'
  return {
    id: reminder.id,
    kind,
    message: reminder.message ?? '',
    dueDate: toInputDate(reminder.dueAt ?? reminder.triggerAt),
    remindTime: toInputTime(reminder.triggerAt),
    leadDays: reminder.leadDays ?? 0,
    repeatInterval: reminder.repeatInterval ?? '',
  }
}

function legacyRenewalReminder(record: LifeRecord, category: CategoryMeta, household: string): VaultReminder | null {
  if (!record.renewalDate) return null
  const kind = inferReminderKind(record.renewalLabel ?? category.renewalLabel)
  const dueDate = toInputDate(record.renewalDate)
  return {
    id: `legacy-renewal-${record.id}`,
    householdId: household,
    createdById: 'system',
    entityType: 'record',
    entityId: record.id,
    message: record.renewalLabel ?? category.renewalLabel ?? 'Renewal',
    kind,
    dueAt: dateFromInput(dueDate),
    leadDays: 7,
    repeatInterval: kind === 'renewal' ? 'yearly' : null,
    triggerAt: triggerFromDate(dueDate, 7, '09:00'),
    dispatchedAt: null,
    dismissedAt: null,
    createdAt: record.createdAt ?? new Date().toISOString(),
  }
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

function Section({ title, color, action, children }: { title: string; color?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="vault-detail-section mx-4 mb-5">
      <div className="vault-section-heading">
        <div>
          {color ? <span style={{ background: color }} /> : null}
          <p>{title}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function EmptyRow({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="h-7 w-[3px] shrink-0 rounded-full bg-border" />
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

export function LifeOverviewPage({ initialTab = 'records' }: { initialTab?: 'records' | 'due' } = {}) {
  const snapshot = useAppState(state => {
    const household = state.data.household[0] as HouseholdRow | undefined
    const categories = buildCategories(household?.settings ?? null)
    const records = state.data.records as LifeRecord[]
    return { household: household ?? null, categories, records }
  })
  const [adminOpen, setAdminOpen] = useState(false)
  const [tab, setTab] = useState<'records' | 'due'>(initialTab)

  return (
    <ScreenShell title="Vault">
      <div className="vault-family-page px-4 pt-4">
        <div className="vault-family-hero">
          <span className="vault-hero-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 3v18M12 10h4M12 14h3" /></svg></span>
          <div className="vault-hero-copy"><small>HOUSEHOLD VAULT</small><strong>{snapshot.records.length} {snapshot.records.length === 1 ? 'record' : 'records'}</strong><span>Important details, policies and life admin in one private place.</span></div>
          <button type="button" onClick={() => setAdminOpen(true)} className="vault-manage-button active:opacity-70">Manage</button>
        </div>

        <div className="vault-tabs">
          {([
            ['records', 'Records'],
            ['due', 'Due'],
          ] as Array<['records' | 'due', string]>).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`h-9 rounded-[9px] text-[14px] font-bold transition ${tab === id ? 'bg-surface text-text-1 shadow-sm' : 'text-text-2'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'records' ? (
          <div className="vault-category-grid">
            {snapshot.categories.map(category => {
              const count = snapshot.records.filter(record => record.category === category.key).length
              return (
                <a key={category.key} href={`/life/${category.key}`} className="vault-category-card" style={{ '--vault-color': category.color } as CSSProperties}>
                  <span className="vault-category-card-top"><i>{category.icon}</i><b>{count}</b></span>
                  <strong>{category.label}</strong>
                  <span className="vault-category-desc">{category.desc}</span>
                </a>
              )
            })}
          </div>
        ) : <div className="vault-due-panel"><VaultDueContent inset={false} /></div>}
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
    const reminders = state.data.reminders
      .filter(reminder => reminder.entityType === 'record' && !reminder.dismissedAt) as VaultReminder[]
    return { category, records, reminders }
  })
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [moving, setMoving] = useState(false)

  async function addRecord() {
    if (!newTitle.trim() || saving) return
    setSaving(true)
    const id = await createRecord(snapshot.category, newTitle)
    navigateInApp(`/life/admin/${id}`)
  }

  async function moveRecord(recordId: string, direction: -1 | 1) {
    if (moving) return
    const from = snapshot.records.findIndex(record => record.id === recordId)
    const to = from + direction
    if (from < 0 || to < 0 || to >= snapshot.records.length) return
    const next = [...snapshot.records]
    const [record] = next.splice(from, 1)
    next.splice(to, 0, record)
    setMoving(true)
    await Promise.all(next.map((entry, index) => upsertRecord(entry, { sortOrder: index })))
    setMoving(false)
  }

  return (
    <ScreenShell title={snapshot.category.label} showHeader={false} topContent={<FamilySubHeader title={snapshot.category.label} backHref="/life/admin" backLabel="Vault" action={reordering ? <button type="button" onClick={() => setReordering(false)}>Done</button> : <><button type="button" onClick={() => setReordering(true)} aria-label="Reorder items" title="Reorder items"><ArrowDownUp className="h-[16px] w-[16px]" /></button><button type="button" onClick={() => setAdding(true)}>Add</button></>} />}>
      <div className="vault-category-page px-4 pt-4" style={{ '--vault-color': snapshot.category.color } as CSSProperties}>
        <div className="vault-category-hero">
          <span className="vault-category-hero-icon">{snapshot.category.icon}</span>
          <div className="vault-category-hero-copy"><small>VAULT CATEGORY</small><strong>{snapshot.category.label}</strong><span>{snapshot.category.desc}</span></div>
          <span className="vault-category-total"><b>{snapshot.records.length}</b><small>{snapshot.records.length === 1 ? 'record' : 'records'}</small></span>
        </div>

        {adding ? (
          <div className="vault-add-record mb-3">
            <input
              autoFocus
              value={newTitle}
              onChange={event => setNewTitle(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') void addRecord() }}
              placeholder={`Add ${snapshot.category.label.toLowerCase()} item`}
              className="h-11 w-full rounded-xl bg-surface-2 px-3 text-[16px] font-semibold text-text-1 outline-none placeholder:text-text-3"
            />
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => { void addRecord() }} disabled={!newTitle.trim() || saving} className="vault-primary-button h-10 flex-1 rounded-xl text-[15px] font-semibold text-white disabled:opacity-40">Create</button>
              <button type="button" onClick={() => { setAdding(false); setNewTitle('') }} className="h-10 rounded-xl bg-surface-2 px-4 text-[15px] font-semibold text-text-2">Cancel</button>
            </div>
          </div>
        ) : null}

        {snapshot.records.length === 0 ? (
          <div className="vault-empty-state">
            <p className="mb-3 text-[14px] text-text-2">Nothing here yet</p>
            <button type="button" onClick={() => setAdding(true)} className="text-[15px] font-medium text-accent active:opacity-60">Add the first one</button>
          </div>
        ) : (
          <>
            <div className="vault-category-list-label"><div><small>SAVED RECORDS</small><strong>{snapshot.records.length} {snapshot.records.length === 1 ? 'entry' : 'entries'}</strong></div><span>Tap to open</span></div>
            <div className="vault-record-list">
              {snapshot.records.map(record => {
                const valuedFields = (record.fields ?? []).filter(field => field.value)
                const previewFields = valuedFields.slice(0, 4)
                const typedDates = snapshot.reminders
                  .filter(reminder => reminder.entityId === record.id && (reminder.kind ?? 'general') !== 'general')
                  .sort((a, b) => dateValue(a) - dateValue(b))
                const legacyDate = typedDates.length === 0 && record.renewalDate
                  ? { label: record.renewalLabel ?? 'Renewal', dueAt: record.renewalDate }
                  : null
                const nextDate = typedDates[0]
                  ? { label: kindMeta(typedDates[0].kind).label, dueAt: typedDates[0].dueAt ?? typedDates[0].triggerAt }
                  : legacyDate
                return (
                  <article
                    key={record.id}
                    role={reordering ? undefined : 'link'}
                    tabIndex={reordering ? undefined : 0}
                    onClick={() => { if (!reordering) navigateInApp(`/life/admin/${record.id}`) }}
                    onKeyDown={event => {
                      if (!reordering && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault()
                        navigateInApp(`/life/admin/${record.id}`)
                      }
                    }}
                    className={`vault-record-card ${reordering ? '' : 'cursor-pointer active:bg-surface-2'}`}
                  >
                    <div className="flex h-full min-w-0 flex-col">
                      <div className="vault-record-card-heading">
                        <div className="vault-record-card-copy">
                          <p>{record.title}</p>{record.subtitle ? <span>{record.subtitle}</span> : null}
                        </div>
                        {reordering ? (
                          <div className="flex shrink-0 items-center gap-1">
                            <button type="button" onClick={event => { event.stopPropagation(); void moveRecord(record.id, -1) }} disabled={moving || snapshot.records[0]?.id === record.id} className="flex h-8 w-8 items-center justify-center rounded-full text-text-2 active:bg-surface-2 disabled:opacity-25" aria-label="Move item up" title="Move item up"><ArrowUp className="h-4 w-4" /></button>
                            <button type="button" onClick={event => { event.stopPropagation(); void moveRecord(record.id, 1) }} disabled={moving || snapshot.records[snapshot.records.length - 1]?.id === record.id} className="flex h-8 w-8 items-center justify-center rounded-full text-text-2 active:bg-surface-2 disabled:opacity-25" aria-label="Move item down" title="Move item down"><ArrowDown className="h-4 w-4" /></button>
                          </div>
                        ) : <Chevron />}
                      </div>

                      {valuedFields.length > 0 ? (
                        <div className="vault-record-card-facts">
                          {previewFields.map(field => (
                            <div key={`${record.id}-${field.label}-${field.value}`} className="min-w-0">
                              <small>{field.label || 'Detail'}</small><span>{field.value}</span>
                            </div>
                          ))}
                          {valuedFields.length > previewFields.length ? <p className="vault-record-more">+{valuedFields.length - previewFields.length} more {valuedFields.length - previewFields.length === 1 ? 'detail' : 'details'}</p> : null}
                        </div>
                      ) : null}

                      {nextDate ? (
                        <div className="vault-record-card-date">
                          <i />
                          <div className="min-w-0 flex-1">
                            <small>NEXT IMPORTANT DATE</small><span>{nextDate.label} due {formatRelativeDue(nextDate.dueAt)}</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          </>
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
    const household = state.data.household[0]?.id ?? 'default'
    const linkedReminders = state.data.reminders
      .filter(reminder => reminder.entityType === 'record' && reminder.entityId === entityId && !reminder.dismissedAt)
      .sort((a, b) => dateValue(a as VaultReminder) - dateValue(b as VaultReminder)) as VaultReminder[]
    const hasTypedDate = linkedReminders.some(reminder => (reminder.kind ?? 'general') !== 'general')
    const legacyRenewal = record && !hasTypedDate ? legacyRenewalReminder(record, category, household) : null
    const importantDates = legacyRenewal ? [...linkedReminders, legacyRenewal].sort((a, b) => dateValue(a) - dateValue(b)) : linkedReminders
    return { category, record, importantDates }
  })
  const [recordEditor, setRecordEditor] = useState<RecordEditorDraft | null>(null)
  const [fieldEditor, setFieldEditor] = useState<{ index: number; label: string; value: string } | null>(null)
  const [dateEditor, setDateEditor] = useState<ImportantDateDraft | null>(null)
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
  const nextDate = snapshot.importantDates.find(reminder => dateValue(reminder) >= new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()) ?? snapshot.importantDates[0]

  function startRecordEdit() {
    setRecordEditor({
      title: record.title,
      subtitle: record.subtitle ?? '',
    })
  }

  async function saveRecordEdit() {
    if (!recordEditor?.title.trim() || saving) return
    setSaving(true)
    await upsertRecord(record, {
      title: recordEditor.title.trim(),
      subtitle: recordEditor.subtitle.trim() || null,
    })
    setSaving(false)
    setRecordEditor(null)
  }

  async function saveField(index: number, draft: RecordField) {
    if (saving) return
    const next = [...fields]
    const cleaned = { label: draft.label.trim(), value: draft.value.trim() }
    if (cleaned.label || cleaned.value) next[index] = cleaned
    else next.splice(index, 1)
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

  function startDateEdit(reminder?: VaultReminder) {
    if (reminder) {
      setDateEditor(draftFromReminder(reminder))
      return
    }
    setDateEditor({
      id: 'new',
      kind: snapshot.category.renewalLabel ? inferReminderKind(snapshot.category.renewalLabel) : 'follow_up',
      message: snapshot.category.renewalLabel ?? '',
      dueDate: '',
      remindTime: '09:00',
      leadDays: snapshot.category.renewalLabel ? 7 : 0,
      repeatInterval: inferReminderKind(snapshot.category.renewalLabel) === 'renewal' ? 'yearly' : '',
    })
  }

  async function addOrUpdateImportantDate(reminder?: VaultReminder) {
    if (!dateEditor || !dateEditor.dueDate || saving) return
    const triggerAt = triggerFromDate(dateEditor.dueDate, dateEditor.leadDays, dateEditor.remindTime)
    setSaving(true)
    const now = new Date().toISOString()
    const legacy = reminder?.id.startsWith('legacy-renewal-') ?? false
    const id = reminder && !legacy ? reminder.id : makeId('reminder')
    const payload = {
      id,
      householdId: household,
      createdById: reminder?.createdById ?? currentUser?.id ?? 'system',
      entityType: 'record',
      entityId: record.id,
      message: dateEditor.message.trim() || kindMeta(dateEditor.kind).label,
      kind: dateEditor.kind,
      dueAt: dateFromInput(dateEditor.dueDate),
      leadDays: dateEditor.leadDays,
      repeatInterval: dateEditor.repeatInterval || null,
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
        reminders: reminder && !legacy
          ? prev.data.reminders.map(row => row.id === id ? { ...row, ...payload } : row)
          : [...prev.data.reminders, payload],
      },
    }))
    if (legacy || record.renewalDate) await upsertRecord(record, { renewalDate: null, renewalLabel: null })
    setSaving(false)
    setDateEditor(null)
  }

  async function deleteImportantDate(reminder: VaultReminder) {
    if (reminder.id.startsWith('legacy-renewal-')) {
      await upsertRecord(record, { renewalDate: null, renewalLabel: null })
      return
    }
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'reminder.delete',
      entityType: 'reminder',
      entityId: reminder.id,
      operation: 'delete',
      payload: null,
    }, prev => ({ ...prev, data: { ...prev.data, reminders: prev.data.reminders.filter(row => row.id !== reminder.id) } }))
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
    navigateInApp(`/life/${record.category}`)
  }

  return (
    <ScreenShell title="Vault" showHeader={false} topContent={<FamilySubHeader title={record.title} backHref={`/life/${record.category}`} backLabel={snapshot.category.label} action={<button type="button" onClick={startRecordEdit}>Edit</button>} />}>
      <div className="vault-record-page mx-auto flex max-w-lg flex-col pb-4" style={{ '--vault-color': snapshot.category.color } as CSSProperties}>
        <header className="vault-record-hero">
          <div className="vault-record-hero-main"><span>{snapshot.category.icon}</span><div><small>{snapshot.category.label.toUpperCase()} · RECORD</small><h1>{record.title}</h1>{record.subtitle ? <p>{record.subtitle}</p> : null}</div></div>
          {nextDate ? (
            <div className="vault-record-next-date">
              <span />
              <div className="min-w-0">
                <small>NEXT IMPORTANT DATE</small><p>{nextDate.message || kindMeta(nextDate.kind).label} due {formatRelativeDue(nextDate.dueAt ?? nextDate.triggerAt)}</p>
              </div>
            </div>
          ) : null}
        </header>

        <Section title="Key facts" color={snapshot.category.color}>
          <div className="vault-detail-card">
            {visibleFields.length > 0 ? visibleFields.map(({ field, index }) => (
              <FieldRow
                key={`${field.label}-${field.value}-${index}`}
                field={field}
                index={index}
                color={snapshot.category.color}
                editing={fieldEditor?.index === index}
                draft={fieldEditor}
                onEdit={() => setFieldEditor({ index, label: field.label, value: field.value })}
                onDraft={patch => setFieldEditor(prev => prev ? { ...prev, ...patch } : prev)}
                onSave={() => fieldEditor ? void saveField(index, fieldEditor) : undefined}
                onCancel={() => setFieldEditor(null)}
                onDelete={() => { void deleteField(index) }}
              />
            )) : <EmptyRow title="No key facts yet" subtitle="Add labels and values for this record." />}
            {fieldEditor?.index === fields.length ? (
              <FieldRow
                field={{ label: '', value: '' }}
                index={fields.length}
                color={snapshot.category.color}
                editing
                draft={fieldEditor}
                onEdit={() => undefined}
                onDraft={patch => setFieldEditor(prev => prev ? { ...prev, ...patch } : prev)}
                onSave={() => void saveField(fields.length, fieldEditor)}
                onCancel={() => setFieldEditor(null)}
                onDelete={() => setFieldEditor(null)}
              />
            ) : (
              <button type="button" onClick={() => setFieldEditor({ index: fields.length, label: 'Detail', value: '' })} className={`flex h-12 w-full items-center gap-2 px-4 text-left text-[14px] font-semibold text-accent active:bg-surface-2 ${visibleFields.length > 0 ? 'border-t border-border' : ''}`}>
                <Plus className="h-4 w-4" /> Add new fact
              </button>
            )}
          </div>
        </Section>

        <Section title="Important dates" color={snapshot.category.color} action={<button type="button" onClick={() => startDateEdit()} className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent"><Plus className="h-3.5 w-3.5" /> Add date</button>}>
          <div className="vault-detail-card">
            {dateEditor?.id === 'new' ? <ImportantDateEditor editor={dateEditor} saving={saving} onDraft={patch => setDateEditor(prev => prev ? { ...prev, ...patch } : prev)} onSave={() => { void addOrUpdateImportantDate() }} onCancel={() => setDateEditor(null)} /> : null}
            {snapshot.importantDates.length > 0 ? snapshot.importantDates.map((reminder, index) => (
              <div key={reminder.id} className={(index > 0 || dateEditor?.id === 'new') ? 'border-t border-border' : ''}>
                {dateEditor?.id === reminder.id ? (
                  <ImportantDateEditor editor={dateEditor} saving={saving} onDraft={patch => setDateEditor(prev => prev ? { ...prev, ...patch } : prev)} onSave={() => { void addOrUpdateImportantDate(reminder) }} onCancel={() => setDateEditor(null)} />
                ) : (
                  <SwipeRow onDelete={() => { void deleteImportantDate(reminder) }} onEdit={() => startDateEdit(reminder)}>
                    <ImportantDateRow reminder={reminder} color={snapshot.category.color} onEdit={() => startDateEdit(reminder)} />
                  </SwipeRow>
                )}
              </div>
            )) : dateEditor?.id !== 'new' ? <EmptyRow title="No important dates yet" subtitle="Add renewals, services, payments and follow-ups here." /> : null}
          </div>
        </Section>

        {recordEditor ? <RecordEditorSheet editor={recordEditor} saving={saving} color={snapshot.category.color} onChange={setRecordEditor} onSave={() => { void saveRecordEdit() }} onDelete={() => { void deleteRecord() }} onClose={() => setRecordEditor(null)} /> : null}

      </div>
    </ScreenShell>
  )
}

function FieldRow({
  field,
  index,
  color,
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
  color: string
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
      <div className={`vault-field-editor p-3 ${index > 0 ? 'border-t border-border' : ''}`}>
        <div className="flex items-center gap-2">
          <input value={draft.label} onChange={event => onDraft({ label: event.target.value })} placeholder="Label" className="w-[38%] rounded-[9px] bg-surface-2 px-3 py-2.5 text-[14px] text-text-2 outline-none placeholder:text-text-3" />
          <input autoFocus value={draft.value} onChange={event => onDraft({ value: event.target.value })} placeholder="Value" className="min-w-0 flex-1 rounded-[9px] bg-surface-2 px-3 py-2.5 text-[15px] text-text-1 outline-none placeholder:text-text-3" />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <button type="button" onClick={onDelete} className="inline-flex h-9 w-9 items-center justify-center text-text-3 active:text-red" aria-label="Remove fact" title="Remove fact"><Trash2 className="h-4 w-4" /></button>
          <div className="flex gap-3">
            <button type="button" onClick={onCancel} className="text-[14px] font-semibold text-text-2">Cancel</button>
            <button type="button" onClick={onSave} className="text-[14px] font-semibold text-accent">Save</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <button type="button" onClick={onEdit} className={`vault-field-row ${index > 0 ? 'border-t border-border' : ''}`}>
      <p style={{ color }}>{field.label || 'Detail'}</p><span>{field.value || 'Not set'}</span>
    </button>
  )
}

function ImportantDateRow({ reminder, color, onEdit }: { reminder: VaultReminder; color: string; onEdit: () => void }) {
  const meta = kindMeta(reminder.kind)
  const repeat = repeatLabel(reminder.repeatInterval)
  const due = reminder.dueAt ?? reminder.triggerAt
  const overdue = dateValue(reminder) < new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()
  return (
    <button type="button" onClick={onEdit} className="vault-important-date-row">
      <span style={{ background: overdue ? 'var(--red)' : color }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-semibold text-text-1">{reminder.message || meta.label}</p>
        <p className="mt-0.5 truncate text-[12px] text-text-2">
          {meta.label} · Due {formatRenewal(due)}
          {' · '}
          Remind {leadLabel(reminder.leadDays)} at {new Date(reminder.triggerAt).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' })}
          {repeat ? ` · ${repeat}` : ''}
        </p>
      </div>
      <div className={`shrink-0 text-right ${overdue ? 'text-red' : 'text-text-2'}`}>
        <p className="text-[12px] font-semibold">{formatRelativeDue(due)}</p>
      </div>
    </button>
  )
}

function ImportantDateEditor({ editor, saving, onDraft, onSave, onCancel }: {
  editor: ImportantDateDraft
  saving: boolean
  onDraft: (patch: Partial<ImportantDateDraft>) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="p-4">
      <div className="flex flex-col gap-3">
        <input
          value={editor.message}
          onChange={event => onDraft({ message: event.target.value })}
          placeholder="Label (for example Annual boiler service)"
          className="h-11 w-full rounded-xl bg-surface-2 px-3 text-[15px] text-text-1 outline-none placeholder:text-text-3"
        />
        <div className="grid grid-cols-2 gap-2">
          {IMPORTANT_DATE_KINDS.filter(option => option.kind !== 'general').map(option => {
            const Icon = option.icon
            return (
              <button
                key={option.kind}
                type="button"
                onClick={() => onDraft({ kind: option.kind, leadDays: editor.leadDays || (option.kind === 'follow_up' ? 0 : 7), repeatInterval: option.kind === 'renewal' ? 'yearly' : editor.repeatInterval })}
                className={`flex h-10 items-center justify-center gap-2 rounded-xl text-[13px] font-bold ${editor.kind === option.kind ? 'bg-accent text-white' : 'bg-surface-2 text-text-2'}`}
              >
                <Icon className="h-4 w-4" strokeWidth={2.2} />
                {option.label}
              </button>
            )
          })}
        </div>
        <div className="overflow-hidden rounded-xl bg-surface-2">
          <label className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="shrink-0 text-[13px] font-semibold text-text-2">Due date</span>
            <input type="date" required value={editor.dueDate} onChange={event => onDraft({ dueDate: event.target.value })} className="bg-transparent text-right text-[15px] text-text-1 outline-none" />
          </label>
          <label className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
            <span className="shrink-0 text-[13px] font-semibold text-text-2">Reminder</span>
            <select value={editor.leadDays} onChange={event => onDraft({ leadDays: Number(event.target.value) })} className="bg-transparent text-right text-[15px] font-medium text-text-1 outline-none">
              {LEAD_DAY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
            <span className="shrink-0 text-[13px] font-semibold text-text-2">Reminder time</span>
            <input type="time" value={editor.remindTime} onChange={event => onDraft({ remindTime: event.target.value })} className="bg-transparent text-right text-[15px] text-text-1 outline-none" />
          </label>
          <label className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
            <span className="shrink-0 text-[13px] font-semibold text-text-2">Repeat</span>
            <select value={editor.repeatInterval} onChange={event => onDraft({ repeatInterval: event.target.value as RepeatInterval | '' })} className="bg-transparent text-right text-[15px] font-medium text-text-1 outline-none">
              {REPEAT_OPTIONS.map(option => <option key={option.value || 'none'} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onSave} disabled={!editor.dueDate || saving} className="h-11 flex-1 rounded-xl bg-accent text-[15px] font-bold text-white disabled:opacity-50">Save date</button>
          <button type="button" onClick={onCancel} className="h-11 rounded-xl bg-surface-2 px-4 text-[15px] font-semibold text-text-2">Cancel</button>
        </div>
      </div>
    </div>
  )
}

function RecordEditorSheet({ editor, saving, color, onChange, onSave, onDelete, onClose }: {
  editor: RecordEditorDraft
  saving: boolean
  color: string
  onChange: (next: RecordEditorDraft) => void
  onSave: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="vault-editor-sheet safe-bottom flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[24px] bg-bg shadow-2xl" style={{ '--vault-color': color } as CSSProperties} onClick={event => event.stopPropagation()}>
        <div className="vault-editor-header flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-text-2 active:bg-surface-2" aria-label="Close editor" title="Close editor">
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-[17px] font-semibold text-text-1">Edit record</h2>
          <button type="button" onClick={onSave} disabled={!editor.title.trim() || saving} className="px-1 text-[15px] font-semibold text-accent disabled:opacity-40">{saving ? 'Saving...' : 'Save'}</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
          <section>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-3.5 w-[3px] rounded-full" style={{ background: color }} />
              <p className="text-[14px] font-semibold text-text-1">Record</p>
            </div>
            <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
              <label className="block px-4 py-3">
                <span className="mb-1 block text-[12px] font-medium text-text-2">Name</span>
                <input value={editor.title} onChange={event => onChange({ ...editor, title: event.target.value })} placeholder="Name" className="w-full bg-transparent text-[17px] font-medium text-text-1 outline-none placeholder:text-text-3" />
              </label>
              <label className="block border-t border-border px-4 py-3">
                <span className="mb-1 block text-[12px] font-medium text-text-2">Description</span>
                <input value={editor.subtitle} onChange={event => onChange({ ...editor, subtitle: event.target.value })} placeholder="Optional description" className="w-full bg-transparent text-[15px] text-text-1 outline-none placeholder:text-text-3" />
              </label>
            </div>
          </section>

          <section className="mt-7 border-t border-border pt-4">
            {deleteConfirm ? (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[14px] font-semibold text-text-1">Delete this record?</p>
                  <p className="mt-0.5 text-[12px] text-text-2">This cannot be undone.</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button type="button" onClick={() => setDeleteConfirm(false)} className="text-[13px] font-semibold text-text-2">Cancel</button>
                  <button type="button" onClick={onDelete} disabled={saving} className="text-[13px] font-semibold text-red disabled:opacity-40">Delete</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setDeleteConfirm(true)} className="inline-flex items-center gap-2 text-[13px] font-semibold text-red"><Trash2 className="h-4 w-4" /> Delete record</button>
            )}
          </section>
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
      <div className="vault-admin-sheet safe-bottom flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-bg shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="vault-editor-header flex shrink-0 items-center justify-between border-b border-border px-5 pb-3 pt-4">
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
