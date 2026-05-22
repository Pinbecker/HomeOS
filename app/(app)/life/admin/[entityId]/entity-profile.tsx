'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { EntityProfileData, HouseholdEntity } from '@/lib/entities/records'
import { SwipeRow } from '@/components/ui/swipe-row'
import { createPin } from '@/app/(app)/pins/actions'
import {
  addEntityReminder,
  deleteEntityReminder,
  updateEntityReminder,
  addLinkedTask,
  addRelatedEntity,
  attachEntityDocument,
  updateEntityDetails,
} from './actions'

type Field = { label: string; value: string }
type RelatedOption = Pick<HouseholdEntity, 'id' | 'title' | 'subtitle' | 'icon' | 'color' | 'kindLabel'>

function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

function daysUntil(timestamp: number) {
  return Math.round((timestamp - startOfToday()) / 86400000)
}

function formatShortDate(timestamp: number) {
  const d = new Date(timestamp)
  const datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  if (d.getHours() === 0 && d.getMinutes() === 0) return datePart
  const timePart = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${datePart} · ${timePart}`
}

function toInputTime(timestamp: number | null) {
  if (!timestamp) return '09:00'
  const d = new Date(timestamp)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDateWithYear(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function toInputDate(timestamp: number | null) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M10 3L5 8l5 5" />
    </svg>
  )
}

function Section({
  title,
  children,
  action,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="mx-4 mb-5">
      <div className="flex items-center justify-between mb-2">
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
      <div className="w-9 h-9 rounded-[11px] bg-surface-2 flex items-center justify-center text-[17px] text-text-2 shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-text-1">{title}</p>
        <p className="text-[12px] text-text-2 mt-0.5">{subtitle}</p>
      </div>
    </div>
  )
}

function InlinePanel({
  children,
  onCancel,
}: {
  children: React.ReactNode
  onCancel: () => void
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      {children}
      <button type="button" onClick={onCancel} className="mt-3 text-[14px] font-semibold text-text-2 active:opacity-60">
        Cancel
      </button>
    </div>
  )
}

function SubmitButton({ label, pending }: { label: string; pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 px-4 rounded-xl bg-accent text-white text-[15px] font-bold disabled:opacity-50 active:opacity-80"
    >
      {pending ? 'Saving...' : label}
    </button>
  )
}

export function EntityProfile({
  profile,
  relatedOptions,
}: {
  profile: EntityProfileData
  relatedOptions: RelatedOption[]
}) {
  const router = useRouter()
  const { entity } = profile
  const [editing, setEditing] = useState(false)
  const [openPanel, setOpenPanel] = useState<null | 'task' | 'reminder' | 'document' | 'related'>(null)
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null)
  const [fields, setFields] = useState<Field[]>(profile.facts.length ? profile.facts : [{ label: '', value: '' }])
  const [pending, startTransition] = useTransition()
  const [pinnedFlash, setPinnedFlash] = useState<string | null>(null)

  function pinFact(fact: Field) {
    if (!fact.value.trim()) return
    startTransition(async () => {
      await createPin({
        title: entity.title,
        body: `${fact.label.trim() || 'Detail'}: ${fact.value.trim()}`,
        colour: 'green',
        linkHref: entity.href,
      })
      setPinnedFlash(fact.label.trim() || 'Detail')
      setTimeout(() => setPinnedFlash(null), 2200)
    })
  }

  const relatedIds = useMemo(() => new Set(profile.relatedEntities.map(related => related.id)), [profile.relatedEntities])
  const availableRelated = relatedOptions.filter(option => !relatedIds.has(option.id))

  function submitAction(action: (formData: FormData) => Promise<void>, formData: FormData, closePanel = true) {
    formData.set('timezoneOffset', String(new Date().getTimezoneOffset()))
    startTransition(async () => {
      await action(formData)
      router.refresh()
      if (closePanel) setOpenPanel(null)
      setEditing(false)
    })
  }

  function submitReminderUpdate(reminderId: string, formData: FormData) {
    formData.set('timezoneOffset', String(new Date().getTimezoneOffset()))
    startTransition(async () => {
      await updateEntityReminder(reminderId, entity.id, formData)
      router.refresh()
      setEditingReminderId(null)
    })
  }

  return (
    <div className="flex flex-col max-w-lg mx-auto pb-4">
      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-accent active:opacity-60 -ml-1">
          <ChevronLeft />
          <span className="text-[16px]">Back</span>
        </button>
        <button
          onClick={() => setEditing(true)}
          disabled={editing}
          className={`text-[15px] font-semibold active:opacity-60 px-1 ${editing ? 'text-text-3' : 'text-accent'}`}
        >
          {editing ? 'Editing' : 'Edit'}
        </button>
      </div>

      <header className="px-5 pt-1 pb-5">
        <div
          className="w-16 h-16 rounded-[20px] flex items-center justify-center text-[32px] mb-4 shadow-[0_10px_24px_rgba(0,0,0,0.05)]"
          style={{ background: `${entity.color}1F` }}
        >
          {entity.icon}
        </div>
        <h1 className="text-[34px] leading-[1.02] font-extrabold text-text-1 tracking-tight">{entity.title}</h1>
        <p className="text-[16px] text-text-2 mt-2">
          {entity.subtitle ? `${entity.subtitle} · ${entity.kindLabel}` : entity.kindLabel}
        </p>
      </header>

      {editing && (
        <section className="mx-4 mb-5">
          <form
            action={formData => submitAction(formDataForUpdate => updateEntityDetails(entity.id, formDataForUpdate), formData)}
            className="bg-surface border border-border rounded-[24px] p-4 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-[17px] font-bold text-text-1">Edit details</p>
              <button type="button" onClick={() => setEditing(false)} className="text-[14px] font-semibold text-text-2 active:opacity-60">
                Cancel
              </button>
            </div>
            <div className="bg-surface-2 rounded-2xl overflow-hidden">
              <input name="title" defaultValue={entity.title} placeholder="Name" className="w-full px-4 py-3 bg-transparent outline-none text-[16px] font-semibold text-text-1" />
              <input name="subtitle" defaultValue={entity.subtitle ?? ''} placeholder="Provider, person or detail" className="w-full px-4 py-3 bg-transparent outline-none text-[15px] text-text-1 border-t border-border" />
            </div>

            <div>
              <p className="text-[12px] font-bold uppercase tracking-wide text-text-3 mb-2">Key facts</p>
              <div className="bg-surface-2 rounded-2xl overflow-hidden">
                {fields.map((field, index) => (
                  <div key={index} className={`flex items-center gap-2 px-3 ${index > 0 ? 'border-t border-border' : ''}`}>
                    <input
                      name="fieldLabel"
                      value={field.label}
                      onChange={event => setFields(prev => prev.map((item, i) => i === index ? { ...item, label: event.target.value } : item))}
                      placeholder="Label"
                      className="w-[38%] py-3 bg-transparent outline-none text-[14px] text-text-2"
                    />
                    <input
                      name="fieldValue"
                      value={field.value}
                      onChange={event => setFields(prev => prev.map((item, i) => i === index ? { ...item, value: event.target.value } : item))}
                      placeholder="Value"
                      className="flex-1 py-3 bg-transparent outline-none text-[15px] text-text-1"
                    />
                    <button type="button" onClick={() => setFields(prev => prev.filter((_, i) => i !== index))} className="px-1 active:opacity-60 shrink-0" aria-label="Remove fact">
                      <span className="w-[22px] h-[22px] bg-red rounded-full flex items-center justify-center">
                        <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth={2.6} strokeLinecap="round" className="w-3.5 h-3.5">
                          <path d="M4 8h8" />
                        </svg>
                      </span>
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setFields(prev => [...prev, { label: '', value: '' }])} className="mt-2 text-[14px] font-semibold text-accent active:opacity-60">
                Add fact
              </button>
            </div>

            <div>
              <p className="text-[12px] font-bold uppercase tracking-wide text-text-3 mb-2">Renewal or due date</p>
              <div className="bg-surface-2 rounded-2xl overflow-hidden">
                <input name="renewalLabel" defaultValue={entity.renewalLabel ?? ''} placeholder="Label, e.g. Renews" className="w-full px-4 py-3 bg-transparent outline-none text-[15px] text-text-1" />
                <label className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border">
                  <span className="text-[14px] font-medium text-text-2">Pick a date</span>
                  <input name="renewalDate" type="date" defaultValue={toInputDate(entity.renewalDate)} className="min-w-0 bg-transparent outline-none text-[15px] text-text-1 text-right" />
                </label>
              </div>
            </div>

            <textarea name="notes" defaultValue={entity.notes ?? ''} placeholder="Notes" rows={3} className="w-full bg-surface-2 rounded-2xl px-4 py-3 text-[15px] text-text-1 outline-none resize-none" />
            <SubmitButton label="Done" pending={pending} />
          </form>
        </section>
      )}

      {profile.renewal && (
        <section className="mx-4 mb-5">
          <div className={`rounded-[24px] px-4 py-4 border ${
            profile.renewal.tone === 'red'
              ? 'bg-red-bg border-red/20'
              : profile.renewal.tone === 'orange'
                ? 'bg-amber-bg border-amber-border'
                : 'bg-accent-bg border-accent-border'
          }`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-bold uppercase tracking-wide text-text-2">Coming up</p>
                <p className="text-[17px] font-bold text-text-1 mt-1">{profile.renewal.subtitle}</p>
              </div>
              <span className={`text-[13px] font-extrabold px-3 py-1.5 rounded-full ${
                profile.renewal.tone === 'red'
                  ? 'bg-red text-white'
                  : profile.renewal.tone === 'orange'
                    ? 'bg-amber text-white'
                    : 'bg-accent text-white'
              }`}>
                {profile.renewal.label}
              </span>
            </div>
          </div>
        </section>
      )}

      <Section title="Key facts">
        {profile.facts.length > 0 || entity.renewalDate ? (
          <>
            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
              {entity.renewalDate && (
                <div className="flex items-center justify-between gap-4 px-4 py-3 bg-amber-bg">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-[10px] bg-amber/15 flex items-center justify-center text-amber shrink-0">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                        <rect x="3" y="3.5" width="10" height="9.5" rx="2" />
                        <path d="M5.5 2.5v2M10.5 2.5v2M3 6.5h10" />
                      </svg>
                    </div>
                    <p className="text-[13.5px] font-semibold text-amber truncate">{entity.renewalLabel || 'Due date'}</p>
                  </div>
                  <p className="text-[14.5px] font-bold text-text-1 text-right shrink-0">{formatDateWithYear(entity.renewalDate)}</p>
                </div>
              )}
              {profile.facts.map((fact, index) => {
                const showBorder = index > 0 || !!entity.renewalDate
                const row = (
                  <div className="flex items-baseline justify-between gap-4 px-4 py-3">
                    <p className="text-[13.5px] text-text-2 shrink-0">{fact.label || 'Detail'}</p>
                    <p className="text-[14.5px] font-medium text-text-1 text-right break-words">{fact.value || 'Not set'}</p>
                  </div>
                )
                return fact.value ? (
                  <SwipeRow
                    key={`${fact.label}-${index}`}
                    className={showBorder ? 'border-t border-border' : ''}
                    actions={[{ key: 'pin', label: 'Pin', onClick: () => pinFact(fact), bg: '#34C759' }]}
                  >
                    {row}
                  </SwipeRow>
                ) : (
                  <div key={`${fact.label}-${index}`} className={showBorder ? 'border-t border-border' : ''}>
                    {row}
                  </div>
                )
              })}
            </div>
            {profile.facts.some(fact => fact.value) && (
              <p className="px-1 mt-2 text-[12px] text-text-3">Swipe a fact to pin it to your Home screen.</p>
            )}
          </>
        ) : (
          <div className="bg-surface border border-border rounded-2xl">
            <EmptyRow icon="+" title="No key facts yet" subtitle="Add the small details worth finding later." />
          </div>
        )}
      </Section>

      {entity.notes && (
        <Section title="Notes">
          <div className="bg-surface border border-border rounded-2xl px-4 py-3">
            <p className="text-[14.5px] leading-relaxed text-text-1 whitespace-pre-wrap">{entity.notes}</p>
          </div>
        </Section>
      )}

      <Section title="Tasks" action={<button onClick={() => setOpenPanel('task')} className="text-[12px] font-semibold text-accent">Add task</button>}>
        {openPanel === 'task' && (
          <InlinePanel onCancel={() => setOpenPanel(null)}>
            <form action={formData => submitAction(formDataForTask => addLinkedTask(entity.id, formDataForTask), formData)} className="flex flex-col gap-3">
              <input name="title" required placeholder={`Task for ${entity.title}`} className="h-11 bg-surface-2 rounded-xl px-3 text-[15px] text-text-1 outline-none" />
              <label className="bg-surface-2 rounded-xl px-3 py-2">
                <span className="block text-[12px] font-semibold text-text-2 mb-1">Due date</span>
                <input name="dueDate" type="date" className="w-full bg-transparent text-[15px] text-text-1 outline-none" />
              </label>
              <SubmitButton label="Add task" pending={pending} />
            </form>
          </InlinePanel>
        )}
        <div className={`bg-surface border border-border rounded-2xl overflow-hidden ${openPanel === 'task' ? 'mt-3' : ''}`}>
          {profile.linkedTasks.length > 0 ? (
            profile.linkedTasks.map((task, index) => (
              <Link key={task.id} href={task.href} className={`flex items-center gap-3 px-4 py-3 active:bg-surface-2 ${index > 0 ? 'border-t border-border' : ''}`}>
                <div className="w-[20px] h-[20px] rounded-full border-2 border-border shrink-0" />
                <p className="flex-1 text-[14.5px] font-medium text-text-1 truncate">{task.title}</p>
                {task.dueDate && (
                  <span className={`text-[11px] font-bold px-2 py-1 rounded-lg ${daysUntil(task.dueDate) <= 0 ? 'bg-red-bg text-red' : 'bg-amber-bg text-amber'}`}>
                    {formatShortDate(task.dueDate)}
                  </span>
                )}
              </Link>
            ))
          ) : (
            <EmptyRow icon="✓" title="No linked tasks" subtitle="Add a job that belongs with this." />
          )}
        </div>
      </Section>

      <Section title="Reminders" action={<button onClick={() => setOpenPanel('reminder')} className="text-[12px] font-semibold text-accent">Add reminder</button>}>
        {openPanel === 'reminder' && (
          <InlinePanel onCancel={() => setOpenPanel(null)}>
            <form action={formData => submitAction(formDataForReminder => addEntityReminder(entity.id, formDataForReminder), formData)} className="flex flex-col gap-3">
              <input name="message" placeholder={`Remind me about ${entity.title}`} className="h-11 bg-surface-2 rounded-xl px-3 text-[15px] text-text-1 outline-none" />
              <div className="bg-surface-2 rounded-xl overflow-hidden">
                <label className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-[13px] font-semibold text-text-2 shrink-0">Date</span>
                  <input name="triggerAt" type="date" required className="bg-transparent text-[15px] text-text-1 outline-none text-right" />
                </label>
                <label className="flex items-center justify-between gap-3 px-3 py-2 border-t border-border">
                  <span className="text-[13px] font-semibold text-text-2 shrink-0">Time</span>
                  <input name="triggerAt_time" type="time" defaultValue="09:00" className="bg-transparent text-[15px] text-text-1 outline-none text-right" />
                </label>
              </div>
              <SubmitButton label="Add reminder" pending={pending} />
            </form>
          </InlinePanel>
        )}
        <div className={`bg-surface border border-border rounded-2xl overflow-hidden ${openPanel === 'reminder' ? 'mt-3' : ''}`}>
          {profile.linkedReminders.length > 0 ? (
            profile.linkedReminders.map((reminder, index) => (
              <div key={reminder.id}>
                <SwipeRow
                  wrapClassName={index > 0 ? 'border-t border-border' : ''}
                  onDelete={() => startTransition(async () => { await deleteEntityReminder(reminder.id, entity.id); router.refresh() })}
                  onEdit={() => setEditingReminderId(prev => prev === reminder.id ? null : reminder.id)}
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-9 h-9 rounded-[11px] bg-amber-bg flex items-center justify-center text-amber text-[17px] shrink-0">⏱</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14.5px] font-semibold text-text-1 truncate">{reminder.message || entity.title}</p>
                      <p className="text-[12px] text-text-2 mt-0.5">{formatShortDate(reminder.triggerAt)}</p>
                    </div>
                  </div>
                </SwipeRow>
                {editingReminderId === reminder.id && (
                  <div className="border-t border-border p-4 bg-surface-2">
                    <form action={formData => submitReminderUpdate(reminder.id, formData)} className="flex flex-col gap-3">
                      <input name="message" defaultValue={reminder.message ?? ''} placeholder={`Remind me about ${entity.title}`} className="h-11 bg-surface rounded-xl px-3 text-[15px] text-text-1 outline-none border border-border" />
                      <div className="bg-surface rounded-xl overflow-hidden border border-border">
                        <label className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="text-[13px] font-semibold text-text-2 shrink-0">Date</span>
                          <input name="triggerAt" type="date" required defaultValue={toInputDate(reminder.triggerAt)} className="bg-transparent text-[15px] text-text-1 outline-none text-right" />
                        </label>
                        <label className="flex items-center justify-between gap-3 px-3 py-2 border-t border-border">
                          <span className="text-[13px] font-semibold text-text-2 shrink-0">Time</span>
                          <input name="triggerAt_time" type="time" defaultValue={toInputTime(reminder.triggerAt)} className="bg-transparent text-[15px] text-text-1 outline-none text-right" />
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <SubmitButton label="Save" pending={pending} />
                        <button type="button" onClick={() => setEditingReminderId(null)} className="h-11 px-4 rounded-xl bg-surface border border-border text-[15px] font-semibold text-text-2 active:opacity-60">Cancel</button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            ))
          ) : (
            <EmptyRow icon="⏱" title="No reminders yet" subtitle="Add renewals, services and follow-ups here." />
          )}
        </div>
      </Section>

      <Section title="Documents" action={<button onClick={() => setOpenPanel('document')} className="text-[12px] font-semibold text-accent">Add document</button>}>
        {openPanel === 'document' && (
          <InlinePanel onCancel={() => setOpenPanel(null)}>
            <form action={formData => submitAction(formDataForDocument => attachEntityDocument(entity.id, formDataForDocument), formData)} className="flex flex-col gap-3">
              <input name="file" type="file" required className="w-full bg-surface-2 rounded-xl px-3 py-3 text-[14px] text-text-1 outline-none" />
              <SubmitButton label="Attach document" pending={pending} />
            </form>
          </InlinePanel>
        )}
        <div className={`bg-surface border border-border rounded-2xl overflow-hidden ${openPanel === 'document' ? 'mt-3' : ''}`}>
          {profile.linkedDocuments.length > 0 ? (
            profile.linkedDocuments.map((document, index) => (
              <div key={document.id} className={`flex items-center gap-3 px-4 py-3 ${index > 0 ? 'border-t border-border' : ''}`}>
                <div className="w-9 h-9 rounded-[11px] bg-accent-bg flex items-center justify-center text-accent text-[17px] shrink-0">□</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14.5px] font-semibold text-text-1 truncate">{document.name}</p>
                  <p className="text-[12px] text-text-2 mt-0.5">{document.mimeType}</p>
                </div>
              </div>
            ))
          ) : (
            <EmptyRow icon="□" title="No documents attached" subtitle="Attach policies, warranties and PDFs here." />
          )}
        </div>
      </Section>

      <Section title="Related" action={<button onClick={() => setOpenPanel('related')} className="text-[12px] font-semibold text-accent">Add related</button>}>
        {openPanel === 'related' && (
          <InlinePanel onCancel={() => setOpenPanel(null)}>
            {availableRelated.length > 0 ? (
              <form action={formData => submitAction(formDataForRelated => addRelatedEntity(entity.id, formDataForRelated), formData)} className="flex flex-col gap-3">
                <select name="relatedId" required className="h-11 bg-surface-2 rounded-xl px-3 text-[15px] text-text-1 outline-none">
                  <option value="">Choose something</option>
                  {availableRelated.map(option => (
                    <option key={option.id} value={option.id}>
                      {option.title}
                    </option>
                  ))}
                </select>
                <SubmitButton label="Link" pending={pending} />
              </form>
            ) : (
              <p className="text-[14px] text-text-2">Everything else is already linked.</p>
            )}
          </InlinePanel>
        )}
        <div className={`bg-surface border border-border rounded-2xl overflow-hidden ${openPanel === 'related' ? 'mt-3' : ''}`}>
          {profile.relatedEntities.length > 0 ? (
            profile.relatedEntities.map((related, index) => (
              <Link key={related.id} href={related.href} className={`flex items-center gap-3 px-4 py-3 active:bg-surface-2 ${index > 0 ? 'border-t border-border' : ''}`}>
                <div className="w-9 h-9 rounded-[11px] flex items-center justify-center text-[18px] shrink-0" style={{ background: `${related.color}1F` }}>
                  {related.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14.5px] font-semibold text-text-1 truncate">{related.title}</p>
                  <p className="text-[12px] text-text-2 mt-0.5 truncate">{related.subtitle || related.kindLabel}</p>
                </div>
              </Link>
            ))
          ) : (
            <EmptyRow icon="↔" title="Nothing connected yet" subtitle="Link providers, policies and household things." />
          )}
        </div>
      </Section>

      {pinnedFlash && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[60] flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#34C759] text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M3.5 8.5l3 3 6-7" />
          </svg>
          <span className="text-[14px] font-semibold">Pinned to Home</span>
        </div>
      )}
    </div>
  )
}
