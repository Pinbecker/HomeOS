'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createRecord, updateRecord, deleteRecord } from '../actions'
import type { CategoryMeta } from '../categories'

type Field = { label: string; value: string }
type Rec = {
  id: string
  title: string
  subtitle: string | null
  fields: Field[]
  renewalDate: number | null
  renewalLabel: string | null
  notes: string | null
}

function toInputDate(ms: number) {
  const d = new Date(ms)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
function formatRenewal(ms: number): { text: string; soon: boolean } {
  const d = new Date(ms)
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000)
  const text = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return { text, soon: days <= 30 }
}

export function CategoryView({ meta, initialRecords }: { meta: CategoryMeta; initialRecords: Rec[] }) {
  const [list, setList] = useState<Rec[]>(initialRecords)
  const [editing, setEditing] = useState<Rec | 'new' | null>(null)

  function blankRecord(): Rec {
    return {
      id: '',
      title: '',
      subtitle: null,
      fields: meta.defaultFields.map(label => ({ label, value: '' })),
      renewalDate: null,
      renewalLabel: meta.renewalLabel ?? null,
      notes: null,
    }
  }

  return (
    <div className="flex flex-col max-w-lg mx-auto">
      {/* Nav bar */}
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <Link href="/life/admin" className="flex items-center gap-1 text-accent active:opacity-60 -ml-1">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M10 3L5 8l5 5" />
          </svg>
          <span className="text-[16px]">Records</span>
        </Link>
        <button onClick={() => setEditing('new')} className="text-accent text-[16px] font-medium active:opacity-60 px-1">
          Add
        </button>
      </div>

      {/* Title */}
      <header className="px-5 pt-1 pb-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-[11px] flex items-center justify-center text-[22px]" style={{ background: `${meta.color}1F` }}>
          {meta.icon}
        </div>
        <h1 className="text-[26px] font-bold text-text-1 tracking-tight">{meta.label}</h1>
      </header>

      {/* Records */}
      {list.length === 0 ? (
        <div className="mx-4 bg-surface rounded-2xl px-4 py-8 text-center">
          <p className="text-[14px] text-text-2 mb-3">Nothing here yet</p>
          <button onClick={() => setEditing('new')} className="text-accent text-[15px] font-medium active:opacity-60">
            Add the first one
          </button>
        </div>
      ) : (
        <div className="mx-4 flex flex-col gap-3">
          {list.map(rec => {
            const shownFields = rec.fields.filter(f => f.value)
            return (
              <Link
                key={rec.id}
                href={`/life/admin/${rec.id}`}
                className="relative flex bg-surface border border-border rounded-2xl overflow-hidden active:bg-surface-2 transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              >
                <span className="w-[3px] shrink-0" style={{ background: meta.color }} aria-hidden />
                <div className="flex-1 min-w-0 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[16px] font-semibold text-text-1 truncate">{rec.title}</p>
                      {rec.subtitle && <p className="text-[13px] text-text-2 mt-0.5 truncate">{rec.subtitle}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {rec.renewalDate && (() => {
                        const r = formatRenewal(rec.renewalDate)
                        return (
                          <span className={`text-[11.5px] font-semibold px-2 py-1 rounded-lg shrink-0 ${r.soon ? 'bg-amber-bg text-amber' : 'bg-surface-2 text-text-2'}`}>
                            {rec.renewalLabel ?? 'Due'} · {r.text}
                          </span>
                        )
                      })()}
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-text-3 shrink-0">
                        <path d="M6 4l4 4-4 4" />
                      </svg>
                    </div>
                  </div>

                  {shownFields.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {shownFields.slice(0, 4).map((f, i) => (
                        <span key={i} className="text-[11.5px] font-medium px-2 py-1 rounded-lg bg-surface-2 max-w-full truncate">
                          <span className="text-text-3">{f.label}: </span>
                          <span className="text-text-1">{f.value}</span>
                        </span>
                      ))}
                      {shownFields.length > 4 && (
                        <span className="text-[11.5px] font-semibold px-2 py-1 rounded-lg bg-surface-2 text-text-3">
                          +{shownFields.length - 4}
                        </span>
                      )}
                    </div>
                  )}

                  {rec.notes && <p className="text-[13px] text-text-2 mt-3 whitespace-pre-wrap line-clamp-2">{rec.notes}</p>}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <div className="h-4" />

      {editing && (
        <RecordEditor
          meta={meta}
          record={editing === 'new' ? blankRecord() : editing}
          isNew={editing === 'new'}
          onClose={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            setList(prev => isNew ? [...prev, saved] : prev.map(r => (r.id === saved.id ? saved : r)))
            setEditing(null)
          }}
          onDeleted={(id) => {
            setList(prev => prev.filter(r => r.id !== id))
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function RecordEditor({
  meta, record, isNew, onClose, onSaved, onDeleted,
}: {
  meta: CategoryMeta
  record: Rec
  isNew: boolean
  onClose: () => void
  onSaved: (rec: Rec, isNew: boolean) => void
  onDeleted: (id: string) => void
}) {
  const [title, setTitle] = useState(record.title)
  const [subtitle, setSubtitle] = useState(record.subtitle ?? '')
  const [fields, setFields] = useState<Field[]>(record.fields.length ? record.fields : [{ label: '', value: '' }])
  const [renewalLabel, setRenewalLabel] = useState(record.renewalLabel ?? meta.renewalLabel ?? '')
  const [renewalDate, setRenewalDate] = useState<string>(record.renewalDate ? toInputDate(record.renewalDate) : '')
  const [showRenewal, setShowRenewal] = useState(!!record.renewalDate)
  const [notes, setNotes] = useState(record.notes ?? '')
  const [saving, setSaving] = useState(false)

  function setField(i: number, patch: Partial<Field>) {
    setFields(prev => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  }
  function addField() { setFields(prev => [...prev, { label: '', value: '' }]) }
  function removeField(i: number) { setFields(prev => prev.filter((_, idx) => idx !== i)) }

  async function save() {
    if (!title.trim()) return
    setSaving(true)
    const cleanedFields = fields.map(f => ({ label: f.label.trim(), value: f.value.trim() })).filter(f => f.label || f.value)
    const renewalMs = renewalDate ? (() => { const [y, m, d] = renewalDate.split('-').map(Number); return new Date(y, m - 1, d).getTime() })() : null
    const input = {
      category: meta.key,
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      fields: cleanedFields,
      renewalDate: renewalMs,
      renewalLabel: renewalLabel.trim() || null,
      notes: notes.trim() || null,
    }
    let id = record.id
    if (isNew) {
      const res = await createRecord(input)
      id = res.id
    } else {
      await updateRecord(record.id, input)
    }
    onSaved({ id, title: input.title, subtitle: input.subtitle, fields: cleanedFields, renewalDate: renewalMs, renewalLabel: input.renewalLabel, notes: input.notes }, isNew)
  }

  async function del() {
    if (isNew) { onClose(); return }
    await deleteRecord(record.id, meta.key)
    onDeleted(record.id)
  }

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col max-w-lg mx-auto">
      {/* Editor nav */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border safe-top">
        <button onClick={onClose} className="text-accent text-[16px] active:opacity-60">Cancel</button>
        <span className="text-[16px] font-semibold text-text-1">{isNew ? `New ${meta.label}` : 'Edit'}</span>
        <button onClick={save} disabled={!title.trim() || saving} className="text-accent text-[16px] font-semibold active:opacity-60 disabled:opacity-40">
          {saving ? 'Saving…' : 'Done'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {/* Title + subtitle */}
        <div className="bg-surface rounded-2xl overflow-hidden">
          <input
            autoFocus={isNew}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title (e.g. Home Insurance)"
            className="w-full px-4 py-3 text-[16px] font-semibold text-text-1 placeholder:text-text-3 bg-transparent outline-none"
          />
          <input
            value={subtitle}
            onChange={e => setSubtitle(e.target.value)}
            placeholder="Subtitle (e.g. Admiral)"
            className="w-full px-4 py-3 text-[15px] text-text-1 placeholder:text-text-3 bg-transparent outline-none border-t border-border"
          />
        </div>

        {/* Fields */}
        <div>
          <p className="px-1 mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-text-2">Details</p>
          <div className="bg-surface rounded-2xl overflow-hidden">
            {fields.map((f, i) => (
              <div key={i} className={`flex items-center gap-2 px-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                <input
                  value={f.label}
                  onChange={e => setField(i, { label: e.target.value })}
                  placeholder="Label"
                  className="w-[38%] py-3 text-[14px] text-text-2 bg-transparent outline-none"
                />
                <input
                  value={f.value}
                  onChange={e => setField(i, { value: e.target.value })}
                  placeholder="Value"
                  className="flex-1 py-3 text-[15px] text-text-1 bg-transparent outline-none"
                />
                <button onClick={() => removeField(i)} className="px-1 active:opacity-60 shrink-0" aria-label="Remove field">
                  <span className="w-[22px] h-[22px] bg-red rounded-full flex items-center justify-center">
                    <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth={2.6} strokeLinecap="round" className="w-3.5 h-3.5">
                      <path d="M4 8h8" />
                    </svg>
                  </span>
                </button>
              </div>
            ))}
          </div>
          <button onClick={addField} className="mt-2 px-1 flex items-center gap-1.5 text-accent text-[14px] font-medium active:opacity-60">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="w-4 h-4">
              <path d="M8 3.5v9M3.5 8h9" />
            </svg>
            Add field
          </button>
        </div>

        {/* Renewal */}
        {showRenewal ? (
          <div>
            <div className="px-1 mb-1.5 flex items-center justify-between">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-text-2">Renewal / due date</p>
              <button
                onClick={() => { setShowRenewal(false); setRenewalDate(''); setRenewalLabel('') }}
                className="text-[12px] text-red active:opacity-60"
              >
                Remove
              </button>
            </div>
            <div className="bg-surface rounded-2xl overflow-hidden">
              <input
                value={renewalLabel}
                onChange={e => setRenewalLabel(e.target.value)}
                placeholder="Label (e.g. Renews, MOT due)"
                className="w-full px-4 py-3 text-[15px] text-text-1 placeholder:text-text-3 bg-transparent outline-none"
              />
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
                <input
                  type="date"
                  value={renewalDate}
                  onChange={e => setRenewalDate(e.target.value)}
                  className="bg-transparent text-[15px] text-text-1 outline-none"
                />
                {renewalDate && (
                  <button onClick={() => setRenewalDate('')} className="text-[13px] text-red active:opacity-60">Clear date</button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowRenewal(true)}
            className="px-1 flex items-center gap-1.5 text-accent text-[14px] font-medium active:opacity-60"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="w-4 h-4">
              <path d="M8 3.5v9M3.5 8h9" />
            </svg>
            Add renewal date
          </button>
        )}

        {/* Notes */}
        <div>
          <p className="px-1 mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-text-2">Notes</p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Anything else worth remembering"
            rows={3}
            className="w-full bg-surface rounded-2xl px-4 py-3 text-[15px] text-text-1 placeholder:text-text-3 outline-none resize-none"
          />
        </div>

        {!isNew && (
          <button onClick={del} className="bg-surface rounded-2xl py-3 text-[15px] font-medium text-red active:bg-surface-2">
            Delete
          </button>
        )}

        <div className="h-8" />
      </div>
    </div>
  )
}
