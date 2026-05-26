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
type VaultTask = {
  id: string
  householdId: string
  createdById: string
  title: string
  status: string
  listId?: string | null
  assigneeId?: string | null
  dueDate?: string | number | Date | null
  createdAt: string | number | Date
  updatedAt: string | number | Date
  deletedAt?: string | number | Date | null
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

const BASE_CATEGORIES: CategoryMeta[] = [
  {
    key: 'identity',
    label: 'People & IDs',
    icon: '🪪',
    color: '#5856D6',
    desc: 'Names, NHS, NI, passports, licences',
    defaultFields: ['NHS number', 'NI number', 'Passport number', 'Passport expiry', 'Driving licence', 'Blood type'],
  },
  {
    key: 'home',
    label: 'Home',
    icon: '🏠',
    color: '#FF9500',
    desc: 'Property, mortgage, boiler, council tax',
    defaultFields: ['Provider', 'Account / reference', 'Phone'],
    renewalLabel: 'Renews',
  },
  {
    key: 'utility',
    label: 'Utilities',
    icon: '💡',
    color: '#FFCC00',
    desc: 'Water, energy, broadband, mobile',
    defaultFields: ['Provider', 'Account number', 'Phone', 'Online login'],
    renewalLabel: 'Contract ends',
  },
  {
    key: 'insurance',
    label: 'Insurance & Cover',
    icon: '🛡️',
    color: '#34C759',
    desc: 'Home, car, breakdown, pet',
    defaultFields: ['Provider', 'Policy number', 'Cover', 'Phone', 'Excess'],
    renewalLabel: 'Renews',
  },
  {
    key: 'vehicle',
    label: 'Vehicles',
    icon: '🚗',
    color: '#007AFF',
    desc: 'Reg, MOT, service, VIN',
    defaultFields: ['Registration', 'Make & model', 'VIN', 'Insurer'],
    renewalLabel: 'MOT due',
  },
  {
    key: 'contact',
    label: 'Contacts',
    icon: '📇',
    color: '#00C7BE',
    desc: 'GP, dentist, employers, key people',
    defaultFields: ['Phone', 'Email', 'Address'],
  },
  {
    key: 'subscription',
    label: 'Money & Bills',
    icon: '💳',
    color: '#AF52DE',
    desc: 'Recurring payments and subscriptions',
    defaultFields: ['Amount', 'Frequency', 'Account'],
    renewalLabel: 'Next payment',
  },
  {
    key: 'pet',
    label: 'Pets',
    icon: '🐾',
    color: '#FF2D55',
    desc: 'Insurance, vet, microchip',
    defaultFields: ['Microchip', 'Vet', 'Date of birth', 'Insurer'],
  },
  {
    key: 'reference',
    label: 'Reference',
    icon: '📋',
    color: '#8E8E93',
    desc: 'Wi-Fi, router, anything else handy',
    defaultFields: ['Detail'],
  },
]

type CategoryOverride = Partial<Pick<CategoryMeta, 'label' | 'icon' | 'color' | 'desc'>>
type StoredCategorySettings = {
  custom?: CategoryMeta[]
  overrides?: Record<string, CategoryOverride>
  deleted?: string[]
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
    .map(category => ({ ...category, ...(overrides[category.key] ?? {}) }))

  const custom = (settings.custom ?? []).filter(category => !deleted.has(category.key))
  return [...builtins, ...custom]
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

function RecordEditor({
  category,
  initial,
  onClose,
}: {
  category: CategoryMeta
  initial: LifeRecord | null
  onClose: () => void
}) {
  const isNew = !initial
  const [title, setTitle] = useState(initial?.title ?? '')
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? '')
  const [fields, setFields] = useState<RecordField[]>(
    initial?.fields?.length
      ? initial.fields
      : category.defaultFields.map(label => ({ label, value: '' })),
  )
  const [renewalLabel, setRenewalLabel] = useState(initial?.renewalLabel ?? category.renewalLabel ?? '')
  const [renewalDate, setRenewalDate] = useState(
    initial?.renewalDate
      ? new Date(initial.renewalDate).toISOString().slice(0, 10)
      : '',
  )
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)

  function setField(index: number, patch: Partial<RecordField>) {
    setFields(prev => prev.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field))
  }

  function addField() {
    setFields(prev => [...prev, { label: '', value: '' }])
  }

  function removeField(index: number) {
    setFields(prev => prev.filter((_, fieldIndex) => fieldIndex !== index))
  }

  async function save() {
    if (!title.trim() || saving) return
    setSaving(true)

    const now = new Date().toISOString()
    const id = initial?.id ?? makeId('record')
    const householdId = getCurrentState().data.household[0]?.id ?? 'default'
    const payload = {
      id,
      householdId,
      category: category.key,
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      fields: fields.map(field => ({ label: field.label.trim(), value: field.value.trim() })).filter(field => field.label || field.value),
      renewalDate: renewalDate ? new Date(`${renewalDate}T00:00:00`).toISOString() : null,
      renewalLabel: renewalLabel.trim() || null,
      notes: notes.trim() || null,
      sortOrder: initial?.sortOrder ?? Date.now(),
      createdAt: initial?.createdAt ?? now,
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
      data: {
        ...prev.data,
        records: initial
          ? prev.data.records.map(record => record.id === id ? { ...record, ...payload } : record)
          : [...prev.data.records, payload],
      },
    }))

    onClose()
  }

  async function remove() {
    if (!initial) {
      onClose()
      return
    }

    await enqueueMutation({
      id: makeId('mutation'),
      name: 'record.delete',
      entityType: 'record',
      entityId: initial.id,
      operation: 'delete',
      payload: null,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        records: prev.data.records.filter(record => record.id !== initial.id),
      },
    }))

    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50"
      onClick={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="max-h-[84dvh] w-full max-w-lg rounded-t-3xl bg-surface pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <div className="flex justify-center pb-1 pt-3">
          <div className="h-1 w-9 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <button onClick={onClose} className="text-[15px] text-text-2 active:opacity-60">Cancel</button>
          <p className="text-[15px] font-semibold text-text-1">{isNew ? 'New record' : 'Edit record'}</p>
          <button
            onClick={() => { void save() }}
            disabled={!title.trim() || saving}
            className="text-[15px] font-semibold text-accent active:opacity-60 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        <div className="flex max-h-[72dvh] flex-col gap-4 overflow-y-auto px-5 py-4">
          <div className="overflow-hidden rounded-2xl bg-surface-2">
            <input
              autoFocus
              value={title}
              onChange={event => setTitle(event.target.value)}
              placeholder="Title"
              className="w-full bg-transparent px-4 py-3 text-[16px] font-semibold text-text-1 outline-none"
            />
            <input
              value={subtitle}
              onChange={event => setSubtitle(event.target.value)}
              placeholder="Subtitle"
              className="w-full border-t border-border bg-transparent px-4 py-3 text-[15px] text-text-1 outline-none"
            />
          </div>

          <div>
            <p className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-text-2">Details</p>
            <div className="overflow-hidden rounded-2xl bg-surface-2">
              {fields.map((field, index) => (
                <div key={index} className={`flex items-center gap-2 px-3 ${index > 0 ? 'border-t border-border' : ''}`}>
                  <input
                    value={field.label}
                    onChange={event => setField(index, { label: event.target.value })}
                    placeholder="Label"
                    className="w-[38%] bg-transparent py-3 text-[14px] text-text-2 outline-none"
                  />
                  <input
                    value={field.value}
                    onChange={event => setField(index, { value: event.target.value })}
                    placeholder="Value"
                    className="flex-1 bg-transparent py-3 text-[15px] text-text-1 outline-none"
                  />
                  <button onClick={() => removeField(index)} className="px-1 text-red active:opacity-60">-</button>
                </div>
              ))}
            </div>
            <button onClick={addField} className="mt-2 px-1 text-[14px] font-semibold text-accent active:opacity-60">Add field</button>
          </div>

          <div className="overflow-hidden rounded-2xl bg-surface-2">
            <input
              value={renewalLabel}
              onChange={event => setRenewalLabel(event.target.value)}
              placeholder="Renewal label"
              className="w-full bg-transparent px-4 py-3 text-[15px] text-text-1 outline-none"
            />
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
              <span className="text-[13px] font-semibold text-text-2">Date</span>
              <input
                type="date"
                value={renewalDate}
                onChange={event => setRenewalDate(event.target.value)}
                className="bg-transparent text-[15px] text-text-1 outline-none"
              />
            </div>
          </div>

          <textarea
            value={notes}
            onChange={event => setNotes(event.target.value)}
            placeholder="Notes"
            rows={4}
            className="w-full resize-none rounded-2xl bg-surface-2 px-4 py-3 text-[15px] text-text-1 outline-none"
          />

          {!isNew ? (
            <button onClick={() => { void remove() }} className="rounded-xl bg-red px-4 py-3 text-[15px] font-semibold text-white active:opacity-80">
              Delete record
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function LifeOverviewPage() {
  const snapshot = useAppState(state => {
    const categories = buildCategories(state.data.household[0]?.settings ?? null)
    const records = state.data.records
    return { categories, records }
  })

  return (
    <ScreenShell title="Vault">
      <div className="px-4">
        <div className="mb-4 rounded-3xl bg-surface px-5 py-5">
          <p className="text-[24px] font-bold text-text-1">Household records</p>
          <p className="mt-1 text-[14px] text-text-2">Life admin, policies, IDs, vehicles, utilities, and reference details.</p>
        </div>

        <div className="overflow-hidden rounded-2xl bg-surface">
          {snapshot.categories.map((category, index) => {
            const count = snapshot.records.filter(record => record.category === category.key).length
            return (
              <a
                key={category.key}
                href={`/life/${category.key}`}
                className={`flex items-center gap-3.5 px-4 py-3.5 active:bg-surface-2 ${index > 0 ? 'border-t border-border' : ''}`}
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] text-[22px]"
                  style={{ background: `${category.color}1F` }}
                >
                  {category.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold text-text-1">{category.label}</p>
                  <p className="truncate text-[12.5px] text-text-2">{category.desc}</p>
                </div>
                <span
                  className="flex h-[26px] min-w-[26px] shrink-0 items-center justify-center rounded-full px-2 text-[13px] font-bold"
                  style={{ background: `${category.color}1F`, color: category.color }}
                >
                  {count}
                </span>
                <Chevron />
              </a>
            )
          })}
        </div>
      </div>
    </ScreenShell>
  )
}

export function LifeCategoryPage() {
  const pathname = typeof window === 'undefined' ? '' : window.location.pathname
  const categoryKey = pathname.split('/').pop() ?? 'reference'
  const snapshot = useAppState(state => {
    const categories = buildCategories(state.data.household[0]?.settings ?? null)
    const category = categories.find(entry => entry.key === categoryKey) ?? categories.find(entry => entry.key === 'reference') ?? BASE_CATEGORIES[BASE_CATEGORIES.length - 1]
    const records = state.data.records
      .filter(record => record.category === category.key)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    return { category, records }
  })
  const [editing, setEditing] = useState<LifeRecord | null | 'new'>(null)

  return (
    <ScreenShell title={snapshot.category.label}>
      <div className="px-4">
        <div className="mb-4 flex items-center justify-between px-1">
          <a href="/life/admin" className="flex items-center gap-1 text-accent active:opacity-60">
            <BackChevron />
            <span className="text-[16px]">Vault</span>
          </a>
          <button onClick={() => setEditing('new')} className="text-[16px] font-medium text-accent active:opacity-60">Add</button>
        </div>

        <div className="mb-4 flex items-center gap-3 px-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-[11px] text-[22px]" style={{ background: `${snapshot.category.color}1F` }}>
            {snapshot.category.icon}
          </div>
          <p className="text-[26px] font-bold tracking-tight text-text-1">{snapshot.category.label}</p>
        </div>

        {snapshot.records.length === 0 ? (
          <div className="rounded-2xl bg-surface px-4 py-8 text-center">
            <p className="mb-3 text-[14px] text-text-2">Nothing here yet</p>
            <button onClick={() => setEditing('new')} className="text-[15px] font-medium text-accent active:opacity-60">
              Add the first one
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-surface">
            {snapshot.records.map((record, index) => {
              const visibleFields = (record.fields ?? []).filter(field => field.value).slice(0, 4)
              return (
                <div key={record.id} className={index > 0 ? 'border-t border-border' : ''}>
                  <a href={`/life/admin/${record.id}`} className="relative flex bg-surface active:bg-surface-2">
                    <span className="w-[3px] shrink-0" style={{ background: snapshot.category.color }} aria-hidden />
                    <div className="min-w-0 flex-1 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[16px] font-semibold text-text-1">{record.title}</p>
                          {record.subtitle ? <p className="mt-0.5 truncate text-[13px] text-text-2">{record.subtitle}</p> : null}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {record.renewalDate ? (
                            <span className="rounded-lg bg-surface-2 px-2 py-1 text-[11.5px] font-semibold text-text-2">
                              {(record.renewalLabel ?? 'Due')} · {formatRenewal(record.renewalDate)}
                            </span>
                          ) : null}
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

                      {record.notes ? <p className="mt-3 line-clamp-2 whitespace-pre-wrap text-[13px] text-text-2">{record.notes}</p> : null}
                    </div>
                  </a>
                  <div className="flex justify-end px-4 pb-3">
                    <button onClick={() => setEditing(record)} className="text-[12px] font-semibold text-accent active:opacity-60">Edit</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {editing ? (
        <RecordEditor
          category={snapshot.category}
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </ScreenShell>
  )
}

export function LifeEntityPage() {
  const currentUser = useSessionState(state => state.user)
  const pathname = typeof window === 'undefined' ? '' : window.location.pathname
  const entityId = pathname.split('/').pop() ?? ''
  const snapshot = useAppState(state => {
    const categories = buildCategories(state.data.household[0]?.settings ?? null)
    const record = state.data.records.find(entry => entry.id === entityId) ?? null
    const category = record
      ? categories.find(entry => entry.key === record.category) ?? BASE_CATEGORIES[BASE_CATEGORIES.length - 1]
      : BASE_CATEGORIES[BASE_CATEGORIES.length - 1]
    const linkRows = state.data.entityLinks.filter(link =>
      (link.fromType === 'record' && link.fromId === entityId) ||
      (link.toType === 'record' && link.toId === entityId),
    )
    const taskIds = new Set(linkRows.flatMap(link => {
      const ids: string[] = []
      if (link.fromType === 'item') ids.push(link.fromId)
      if (link.toType === 'item') ids.push(link.toId)
      return ids
    }))
    const linkedTasks = state.data.items
      .filter(item => taskIds.has(item.id) && item.type === 'task' && item.status !== 'completed' && !item.deletedAt)
      .sort((a, b) => {
        const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER
        const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER
        return aDue - bDue
      }) as VaultTask[]
    const linkedReminders = state.data.reminders
      .filter(reminder => reminder.entityType === 'record' && reminder.entityId === entityId && !reminder.dismissedAt)
      .sort((a, b) => new Date(a.triggerAt).getTime() - new Date(b.triggerAt).getTime()) as VaultReminder[]
    return { category, record, linkedTasks, linkedReminders }
  })
  const [editing, setEditing] = useState(false)
  const [openPanel, setOpenPanel] = useState<null | 'reminder' | 'renewal' | 'task'>(null)
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null)
  const [reminderMessage, setReminderMessage] = useState('')
  const [reminderDate, setReminderDate] = useState('')
  const [reminderTime, setReminderTime] = useState('09:00')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [renewalLabel, setRenewalLabel] = useState('')
  const [renewalDate, setRenewalDate] = useState('')
  const [savingPanel, setSavingPanel] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editSubtitle, setEditSubtitle] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [editFields, setEditFields] = useState<RecordField[]>([])
  const [editNotes, setEditNotes] = useState('')

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

  const visibleFields = (snapshot.record.fields ?? []).filter(field => field.label || field.value)
  const householdId = getCurrentState().data.household[0]?.id ?? 'default'

  function startInlineEdit() {
    setEditTitle(snapshot.record?.title ?? '')
    setEditSubtitle(snapshot.record?.subtitle ?? '')
    setEditIcon(snapshot.record?.icon ?? '')
    setEditFields(
      snapshot.record?.fields?.length
        ? snapshot.record.fields.map(field => ({ ...field }))
        : snapshot.category.defaultFields.map(label => ({ label, value: '' })),
    )
    setEditNotes(snapshot.record?.notes ?? '')
    setEditing(true)
  }

  function cancelInlineEdit() {
    setEditing(false)
    setEditTitle('')
    setEditSubtitle('')
    setEditIcon('')
    setEditFields([])
    setEditNotes('')
  }

  function setEditField(index: number, patch: Partial<RecordField>) {
    setEditFields(prev => prev.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field))
  }

  function addEditField() {
    setEditFields(prev => [...prev, { label: '', value: '' }])
  }

  function removeEditField(index: number) {
    setEditFields(prev => prev.filter((_, fieldIndex) => fieldIndex !== index))
  }

  async function saveInlineRecord() {
    if (!snapshot.record || !editTitle.trim() || savingPanel) return
    setSavingPanel(true)
    const now = new Date().toISOString()
    const payload = {
      ...snapshot.record,
      title: editTitle.trim(),
      subtitle: editSubtitle.trim() || null,
      icon: editIcon.trim() || null,
      fields: editFields.map(field => ({ label: field.label.trim(), value: field.value.trim() })).filter(field => field.label || field.value),
      notes: editNotes.trim() || null,
      updatedAt: now,
    }

    await enqueueMutation({
      id: makeId('mutation'),
      name: 'record.upsert',
      entityType: 'record',
      entityId: snapshot.record.id,
      operation: 'upsert',
      payload,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        records: prev.data.records.map(record => record.id === snapshot.record!.id ? { ...record, ...payload } : record),
      },
    }))
    setSavingPanel(false)
    cancelInlineEdit()
  }

  function openRenewalPanel() {
    setRenewalLabel(snapshot.record?.renewalLabel ?? '')
    setRenewalDate(toInputDate(snapshot.record?.renewalDate))
    setOpenPanel(prev => prev === 'renewal' ? null : 'renewal')
  }

  async function saveRenewal(nextLabel = renewalLabel, nextDate = renewalDate) {
    if (!snapshot.record || savingPanel) return
    setSavingPanel(true)
    const now = new Date().toISOString()
    const payload = {
      ...snapshot.record,
      renewalLabel: nextLabel.trim() || null,
      renewalDate: dateFromInput(nextDate),
      updatedAt: now,
    }
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'record.upsert',
      entityType: 'record',
      entityId: snapshot.record.id,
      operation: 'upsert',
      payload,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        records: prev.data.records.map(record => record.id === snapshot.record!.id ? { ...record, ...payload } : record),
      },
    }))
    setSavingPanel(false)
    setOpenPanel(null)
  }

  async function clearRenewal() {
    setRenewalLabel('')
    setRenewalDate('')
    await saveRenewal('', '')
  }

  async function addReminder() {
    if (!snapshot.record || !reminderDate || savingPanel) return
    const triggerAt = dateTimeFromInputs(reminderDate, reminderTime)
    if (!triggerAt) return
    setSavingPanel(true)
    const now = new Date().toISOString()
    const id = makeId('reminder')
    const payload = {
      id,
      householdId,
      createdById: currentUser?.id ?? 'system',
      entityType: 'record',
      entityId: snapshot.record.id,
      message: reminderMessage.trim() || null,
      triggerAt,
      dispatchedAt: null,
      dismissedAt: null,
      createdAt: now,
    }
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'reminder.upsert',
      entityType: 'reminder',
      entityId: id,
      operation: 'upsert',
      payload,
    }, prev => ({ ...prev, data: { ...prev.data, reminders: [...prev.data.reminders, payload] } }))
    setReminderMessage('')
    setReminderDate('')
    setReminderTime('09:00')
    setSavingPanel(false)
    setOpenPanel(null)
  }

  async function updateReminder(reminder: VaultReminder) {
    if (!reminderDate || savingPanel) return
    const triggerAt = dateTimeFromInputs(reminderDate, reminderTime)
    if (!triggerAt) return
    setSavingPanel(true)
    const payload = {
      ...reminder,
      message: reminderMessage.trim() || null,
      triggerAt,
    }
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'reminder.upsert',
      entityType: 'reminder',
      entityId: reminder.id,
      operation: 'upsert',
      payload,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        reminders: prev.data.reminders.map(row => row.id === reminder.id ? { ...row, ...payload } : row),
      },
    }))
    setSavingPanel(false)
    setEditingReminderId(null)
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

  function startEditReminder(reminder: VaultReminder) {
    setEditingReminderId(prev => prev === reminder.id ? null : reminder.id)
    setReminderMessage(reminder.message ?? '')
    setReminderDate(toInputDate(reminder.triggerAt))
    setReminderTime(toInputTime(reminder.triggerAt))
  }

  async function addTask() {
    if (!snapshot.record || !taskTitle.trim() || savingPanel) return
    setSavingPanel(true)
    const now = new Date().toISOString()
    const taskId = makeId('task')
    const linkId = makeId('link')
    const taskPayload = {
      id: taskId,
      householdId,
      createdById: currentUser?.id ?? 'system',
      type: 'task',
      title: taskTitle.trim(),
      status: 'active',
      listId: null,
      assigneeId: null,
      dueDate: dateFromInput(taskDueDate),
      createdAt: now,
      updatedAt: now,
    }
    const linkPayload = {
      id: linkId,
      fromType: 'record',
      fromId: snapshot.record.id,
      toType: 'item',
      toId: taskId,
      linkType: 'related_to',
      createdById: currentUser?.id ?? 'system',
      createdAt: now,
    }
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'task.upsert',
      entityType: 'item',
      entityId: taskId,
      operation: 'upsert',
      payload: taskPayload,
    }, prev => ({ ...prev, data: { ...prev.data, items: [...prev.data.items, taskPayload] } }))
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'entity_link.upsert',
      entityType: 'entity_link',
      entityId: linkId,
      operation: 'upsert',
      payload: linkPayload,
    }, prev => ({ ...prev, data: { ...prev.data, entityLinks: [...prev.data.entityLinks, linkPayload] } }))
    setTaskTitle('')
    setTaskDueDate('')
    setSavingPanel(false)
    setOpenPanel(null)
  }

  async function completeTask(task: VaultTask) {
    const now = new Date().toISOString()
    const payload = { ...task, status: 'completed', completedAt: now, updatedAt: now }
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'task.upsert',
      entityType: 'item',
      entityId: task.id,
      operation: 'upsert',
      payload,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        items: prev.data.items.map(row => row.id === task.id ? { ...row, ...payload } : row),
      },
    }))
  }

  return (
    <ScreenShell title="Vault">
      <div className="mx-auto flex max-w-lg flex-col pb-4">
        <div className="flex items-center justify-between px-3 pb-2 pt-3">
          <button onClick={() => window.history.back()} className="-ml-1 flex items-center gap-1 text-accent active:opacity-60">
            <BackChevron />
            <span className="text-[16px]">Back</span>
          </button>
          {editing ? (
            <div className="flex items-center gap-4">
              <button onClick={cancelInlineEdit} className="px-1 text-[15px] font-semibold text-text-2 active:opacity-60">Cancel</button>
              <button onClick={() => { void saveInlineRecord() }} disabled={!editTitle.trim() || savingPanel} className="px-1 text-[15px] font-semibold text-accent active:opacity-60 disabled:opacity-40">{savingPanel ? 'Saving...' : 'Save'}</button>
            </div>
          ) : (
            <button onClick={startInlineEdit} className="px-1 text-[15px] font-semibold text-accent active:opacity-60">Edit</button>
          )}
        </div>

        <header className="px-5 pb-5 pt-1">
          <div
            className="mb-4 flex h-16 w-16 items-center justify-center rounded-[20px] text-[32px] shadow-[0_10px_24px_rgba(0,0,0,0.05)]"
            style={{ background: `${snapshot.category.color}1F` }}
          >
            {editing ? (
              <input value={editIcon} onChange={event => setEditIcon(event.target.value)} placeholder={snapshot.category.icon} className="h-12 w-12 bg-transparent text-center text-[30px] outline-none" />
            ) : (
              snapshot.record.icon || snapshot.category.icon
            )}
          </div>
          {editing ? (
            <div className="overflow-hidden rounded-2xl bg-surface">
              <input value={editTitle} onChange={event => setEditTitle(event.target.value)} placeholder="Title" className="w-full bg-transparent px-4 py-3 text-[22px] font-extrabold text-text-1 outline-none placeholder:text-text-3" />
              <input value={editSubtitle} onChange={event => setEditSubtitle(event.target.value)} placeholder="Subtitle" className="w-full border-t border-border bg-transparent px-4 py-3 text-[15px] text-text-1 outline-none placeholder:text-text-3" />
            </div>
          ) : (
            <>
              <h1 className="text-[34px] font-extrabold leading-[1.02] tracking-tight text-text-1">{snapshot.record.title}</h1>
              <p className="mt-2 text-[16px] text-text-2">
                {snapshot.record.subtitle ? `${snapshot.record.subtitle} · ${snapshot.category.label}` : snapshot.category.label}
              </p>
            </>
          )}
        </header>

        <Section title="Key facts">
          {editing ? (
            <>
              <div className="overflow-hidden rounded-2xl bg-surface">
                {editFields.map((field, index) => (
                  <div key={index} className={`flex items-center gap-2 px-3 ${index > 0 ? 'border-t border-border' : ''}`}>
                    <input value={field.label} onChange={event => setEditField(index, { label: event.target.value })} placeholder="Label" className="w-[38%] bg-transparent py-3 text-[14px] text-text-2 outline-none placeholder:text-text-3" />
                    <input value={field.value} onChange={event => setEditField(index, { value: event.target.value })} placeholder="Value" className="min-w-0 flex-1 bg-transparent py-3 text-[15px] text-text-1 outline-none placeholder:text-text-3" />
                    <button onClick={() => removeEditField(index)} className="px-1 text-[18px] font-semibold text-red active:opacity-60">-</button>
                  </div>
                ))}
              </div>
              <button onClick={addEditField} className="mt-2 px-1 text-[14px] font-semibold text-accent active:opacity-60">Add field</button>
            </>
          ) : (
            <div className="overflow-hidden rounded-2xl bg-surface">
              {visibleFields.length > 0 ? visibleFields.map((field, index) => (
                <div key={`${field.label}-${field.value}-${index}`} className={`flex items-baseline justify-between gap-4 px-4 py-3 ${index > 0 ? 'border-t border-border' : ''}`}>
                  <p className="shrink-0 text-[13.5px] text-text-2">{field.label || 'Detail'}</p>
                  <p className="break-words text-right text-[14.5px] font-medium text-text-1">{field.value || 'Not set'}</p>
                </div>
              )) : (
                <div className="px-4 py-3">
                  <p className="text-[14px] text-text-2">No key facts yet.</p>
                </div>
              )}
            </div>
          )}
        </Section>

        {(editing || snapshot.record.notes) ? (
          <Section title="Notes">
            {editing ? (
              <textarea value={editNotes} onChange={event => setEditNotes(event.target.value)} placeholder="Notes" rows={5} className="w-full resize-none rounded-2xl bg-surface px-4 py-3 text-[14.5px] leading-relaxed text-text-1 outline-none placeholder:text-text-3" />
            ) : (
              <div className="rounded-2xl bg-surface px-4 py-3">
                <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-text-1">{snapshot.record.notes}</p>
              </div>
            )}
          </Section>
        ) : null}

        <Section title="Renewal" action={<button onClick={openRenewalPanel} className="text-[12px] font-semibold text-accent">{snapshot.record.renewalDate ? 'Edit' : 'Add renewal'}</button>}>
          {openPanel === 'renewal' ? (
            <div className="mb-3 rounded-2xl bg-surface p-4">
              <div className="flex flex-col gap-3">
                <input value={renewalLabel} onChange={event => setRenewalLabel(event.target.value)} placeholder="Label, e.g. Renews, Expires" className="h-11 rounded-xl bg-surface-2 px-3 text-[15px] text-text-1 outline-none" />
                <label className="rounded-xl bg-surface-2 px-3 py-2">
                  <span className="mb-1 block text-[12px] font-semibold text-text-2">Date</span>
                  <input type="date" value={renewalDate} onChange={event => setRenewalDate(event.target.value)} className="w-full bg-transparent text-[15px] text-text-1 outline-none" />
                </label>
                <div className="flex gap-2">
                  <button onClick={() => { void saveRenewal() }} disabled={savingPanel} className="h-11 flex-1 rounded-xl bg-accent text-[15px] font-bold text-white disabled:opacity-50">Save renewal</button>
                  <button onClick={() => setOpenPanel(null)} className="h-11 rounded-xl bg-surface-2 px-4 text-[15px] font-semibold text-text-2">Cancel</button>
                </div>
              </div>
            </div>
          ) : null}
          <div className="overflow-hidden rounded-2xl bg-surface">
            {snapshot.record.renewalDate ? (
              <SwipeRow onDelete={() => { void clearRenewal() }} deleteLabel="Clear" onEdit={openRenewalPanel}>
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-amber-bg text-[17px] text-amber">📅</div>
                    <p className="truncate text-[13.5px] font-semibold text-amber">{snapshot.record.renewalLabel || 'Due date'}</p>
                  </div>
                  <p className="shrink-0 text-right text-[14.5px] font-bold text-text-1">{formatRenewal(snapshot.record.renewalDate)}</p>
                </div>
              </SwipeRow>
            ) : (
              <EmptyRow icon="📅" title="No renewal set" subtitle="Add a due date or renewal date for this record." />
            )}
          </div>
        </Section>

        <Section title="Tasks" action={<button onClick={() => setOpenPanel(prev => prev === 'task' ? null : 'task')} className="text-[12px] font-semibold text-accent">Add task</button>}>
          {openPanel === 'task' ? (
            <div className="mb-3 rounded-2xl bg-surface p-4">
              <div className="flex flex-col gap-3">
                <input value={taskTitle} onChange={event => setTaskTitle(event.target.value)} placeholder={`Task for ${snapshot.record.title}`} className="h-11 rounded-xl bg-surface-2 px-3 text-[15px] text-text-1 outline-none" />
                <label className="rounded-xl bg-surface-2 px-3 py-2">
                  <span className="mb-1 block text-[12px] font-semibold text-text-2">Due date</span>
                  <input type="date" value={taskDueDate} onChange={event => setTaskDueDate(event.target.value)} className="w-full bg-transparent text-[15px] text-text-1 outline-none" />
                </label>
                <div className="flex gap-2">
                  <button onClick={() => { void addTask() }} disabled={!taskTitle.trim() || savingPanel} className="h-11 flex-1 rounded-xl bg-accent text-[15px] font-bold text-white disabled:opacity-50">Add task</button>
                  <button onClick={() => setOpenPanel(null)} className="h-11 rounded-xl bg-surface-2 px-4 text-[15px] font-semibold text-text-2">Cancel</button>
                </div>
              </div>
            </div>
          ) : null}
          <div className="overflow-hidden rounded-2xl bg-surface">
            {snapshot.linkedTasks.length > 0 ? snapshot.linkedTasks.map((task, index) => (
              <SwipeRow key={task.id} wrapClassName={index > 0 ? 'border-t border-border' : ''} actions={[{ key: 'done', label: 'Done', bg: '#34C759', onClick: () => { void completeTask(task) } }]}>
                <a href={task.listId ? `/household/tasks/${task.listId}` : '/household/tasks/all'} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
                  <div className="h-[22px] w-[22px] shrink-0 rounded-full border-2 border-border" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-semibold text-text-1">{task.title}</p>
                    {task.dueDate ? <p className="mt-0.5 text-[12px] text-text-2">{formatShortDate(task.dueDate)}</p> : null}
                  </div>
                  <Chevron />
                </a>
              </SwipeRow>
            )) : <EmptyRow icon="✓" title="No linked tasks" subtitle="Add jobs connected to this vault item." />}
          </div>
        </Section>

        <Section title="Reminders" action={<button onClick={() => setOpenPanel(prev => prev === 'reminder' ? null : 'reminder')} className="text-[12px] font-semibold text-accent">Add reminder</button>}>
          {openPanel === 'reminder' ? (
            <div className="mb-3 rounded-2xl bg-surface p-4">
              <div className="flex flex-col gap-3">
                <input value={reminderMessage} onChange={event => setReminderMessage(event.target.value)} placeholder={`Remind me about ${snapshot.record.title}`} className="h-11 rounded-xl bg-surface-2 px-3 text-[15px] text-text-1 outline-none" />
                <div className="overflow-hidden rounded-xl bg-surface-2">
                  <label className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="shrink-0 text-[13px] font-semibold text-text-2">Date</span>
                    <input type="date" required value={reminderDate} onChange={event => setReminderDate(event.target.value)} className="bg-transparent text-right text-[15px] text-text-1 outline-none" />
                  </label>
                  <label className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
                    <span className="shrink-0 text-[13px] font-semibold text-text-2">Time</span>
                    <input type="time" value={reminderTime} onChange={event => setReminderTime(event.target.value)} className="bg-transparent text-right text-[15px] text-text-1 outline-none" />
                  </label>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { void addReminder() }} disabled={!reminderDate || savingPanel} className="h-11 flex-1 rounded-xl bg-accent text-[15px] font-bold text-white disabled:opacity-50">Add reminder</button>
                  <button onClick={() => setOpenPanel(null)} className="h-11 rounded-xl bg-surface-2 px-4 text-[15px] font-semibold text-text-2">Cancel</button>
                </div>
              </div>
            </div>
          ) : null}
          <div className="overflow-hidden rounded-2xl bg-surface">
            {snapshot.linkedReminders.length > 0 ? snapshot.linkedReminders.map((reminder, index) => (
              <div key={reminder.id}>
                <SwipeRow
                  wrapClassName={index > 0 ? 'border-t border-border' : ''}
                  onDelete={() => { void deleteReminder(reminder.id) }}
                  onEdit={() => startEditReminder(reminder)}
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-amber-bg text-[17px] text-amber">⏱</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-semibold text-text-1">{reminder.message || snapshot.record!.title}</p>
                      <p className="mt-0.5 text-[12px] text-text-2">{formatShortDate(reminder.triggerAt)}</p>
                    </div>
                  </div>
                </SwipeRow>
                {editingReminderId === reminder.id ? (
                  <div className="border-t border-border bg-surface-2 p-4">
                    <div className="flex flex-col gap-3">
                      <input value={reminderMessage} onChange={event => setReminderMessage(event.target.value)} placeholder={`Remind me about ${snapshot.record!.title}`} className="h-11 rounded-xl border border-border bg-surface px-3 text-[15px] text-text-1 outline-none" />
                      <div className="overflow-hidden rounded-xl border border-border bg-surface">
                        <label className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="shrink-0 text-[13px] font-semibold text-text-2">Date</span>
                          <input type="date" required value={reminderDate} onChange={event => setReminderDate(event.target.value)} className="bg-transparent text-right text-[15px] text-text-1 outline-none" />
                        </label>
                        <label className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
                          <span className="shrink-0 text-[13px] font-semibold text-text-2">Time</span>
                          <input type="time" value={reminderTime} onChange={event => setReminderTime(event.target.value)} className="bg-transparent text-right text-[15px] text-text-1 outline-none" />
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { void updateReminder(reminder) }} disabled={!reminderDate || savingPanel} className="h-11 rounded-xl bg-accent px-4 text-[15px] font-bold text-white disabled:opacity-50">Save</button>
                        <button onClick={() => setEditingReminderId(null)} className="h-11 rounded-xl border border-border bg-surface px-4 text-[15px] font-semibold text-text-2">Cancel</button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )) : <EmptyRow icon="⏱" title="No reminders yet" subtitle="Add renewals, services and follow-ups here." />}
          </div>
        </Section>
      </div>

    </ScreenShell>
  )
}
