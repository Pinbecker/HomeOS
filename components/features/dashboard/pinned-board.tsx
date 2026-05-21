'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ulid } from 'ulid'
import type { PinColour } from '@/lib/db/schema'
import {
  createPin,
  updatePin,
  deletePin,
  getPinnableRecords,
  type PinnableCategory,
  type PinnableRecord,
  type PinnableFact,
} from '@/app/(app)/pins/actions'
import { createNote, updateNote, setNotePinned, getPinnableNotes } from '@/app/(app)/notes/actions'

export type BoardPin =
  | { kind: 'note'; id: string; title: string; body: string | null; ts?: number }
  | { kind: 'fact'; id: string; title: string; body: string | null; colour: PinColour; linkHref: string | null; ts?: number }

const PIN_COLOURS: Record<PinColour, { tint: string; bar: string }> = {
  yellow: { tint: 'rgba(255,204,0,0.16)',  bar: '#F5B800' },
  blue:   { tint: 'rgba(0,122,255,0.12)',  bar: '#007AFF' },
  green:  { tint: 'rgba(52,199,89,0.15)',  bar: '#34C759' },
  pink:   { tint: 'rgba(255,45,85,0.12)',  bar: '#FF2D55' },
  orange: { tint: 'rgba(255,149,0,0.15)',  bar: '#FF9500' },
  purple: { tint: 'rgba(175,82,222,0.13)', bar: '#AF52DE' },
}
const COLOUR_KEYS = Object.keys(PIN_COLOURS) as PinColour[]

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}

export function PinnedBoard({ initialPins }: { initialPins: BoardPin[] }) {
  const [pins, setPins] = useState<BoardPin[]>(initialPins)
  const [picking, setPicking] = useState(false)
  const [editingFact, setEditingFact] = useState<Extract<BoardPin, { kind: 'fact' }> | null>(null)
  const [editingNote, setEditingNote] = useState<{ id: string; title: string; body: string | null } | 'new' | null>(null)

  function prepend(pin: BoardPin) {
    setPins(prev => [pin, ...prev.filter(p => !(p.kind === pin.kind && p.id === pin.id))])
  }
  function replacePin(pin: BoardPin) {
    setPins(prev => prev.map(p => (p.kind === pin.kind && p.id === pin.id ? pin : p)))
  }
  function removePin(kind: BoardPin['kind'], id: string) {
    setPins(prev => prev.filter(p => !(p.kind === kind && p.id === id)))
  }

  return (
    <section className="mx-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-3">Pinned</p>
        {pins.length > 0 && (
          <button onClick={() => setPicking(true)} className="text-[11.5px] font-semibold text-accent active:opacity-60">
            Add pin
          </button>
        )}
      </div>

      {pins.length === 0 ? (
        <button
          onClick={() => setPicking(true)}
          className="w-full flex items-center gap-3 bg-surface border border-dashed border-border rounded-2xl px-4 py-3.5 active:bg-surface-2"
        >
          <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center shrink-0">
            <svg viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" className="w-3.5 h-3.5">
              <path d="M8 3.5v9M3.5 8h9" />
            </svg>
          </div>
          <span className="text-[13.5px] font-medium text-text-2">Pin a note or a key fact to Home</span>
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {pins.map(pin => {
            const colour: PinColour = pin.kind === 'note' ? 'yellow' : pin.colour
            const c = PIN_COLOURS[colour] ?? PIN_COLOURS.yellow
            const hasLink = pin.kind === 'fact' && !!pin.linkHref
            return (
              <button
                key={`${pin.kind}-${pin.id}`}
                onClick={() => pin.kind === 'note' ? setEditingNote({ id: pin.id, title: pin.title, body: pin.body }) : setEditingFact(pin)}
                className="relative text-left rounded-2xl p-3.5 active:scale-[0.98] transition-transform border border-border/50"
                style={{ background: c.tint }}
              >
                {hasLink && (
                  <span className="absolute top-2.5 right-2.5 text-text-3" aria-hidden>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                      <path d="M6.5 9.5l3-3M7 4.5l.8-.8a2.5 2.5 0 0 1 3.5 3.5l-.8.8M9 11.5l-.8.8a2.5 2.5 0 0 1-3.5-3.5l.8-.8" />
                    </svg>
                  </span>
                )}
                <div className="flex items-start gap-2">
                  <div className="w-1 self-stretch rounded-full shrink-0 mt-0.5" style={{ background: c.bar, minHeight: 18 }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-text-1 leading-snug break-words pr-4">{pin.title}</p>
                    {pin.body && (
                      <p className="text-[12px] text-text-2 mt-1 leading-snug whitespace-pre-wrap line-clamp-4 break-words">{pin.body}</p>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
          {/* Add tile */}
          <button
            onClick={() => setPicking(true)}
            className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border min-h-[72px] active:bg-surface-2"
          >
            <div className="w-7 h-7 rounded-full bg-accent/15 flex items-center justify-center">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="w-3.5 h-3.5 text-accent">
                <path d="M8 3.5v9M3.5 8h9" />
              </svg>
            </div>
            <span className="text-[12px] font-medium text-text-3">Add pin</span>
          </button>
        </div>
      )}

      {picking && (
        <PinPicker
          onClose={() => setPicking(false)}
          onNewNote={() => { setPicking(false); setEditingNote('new') }}
          onPinned={prepend}
        />
      )}

      {editingNote && (
        <NotePinEditor
          note={editingNote === 'new' ? null : editingNote}
          onClose={() => setEditingNote(null)}
          onSaved={(pin, isNew) => {
            if (isNew) {
              prepend(pin)
            } else {
              replacePin(pin)
            }
            setEditingNote(null)
          }}
          onUnpinned={id => { removePin('note', id); setEditingNote(null) }}
        />
      )}

      {editingFact && (
        <FactPinEditor
          pin={editingFact}
          onClose={() => setEditingFact(null)}
          onSaved={pin => { replacePin(pin); setEditingFact(null) }}
          onDeleted={id => { removePin('fact', id); setEditingFact(null) }}
        />
      )}
    </section>
  )
}

type PickerStep = 'choose' | 'note' | 'noteExisting' | 'categories' | 'records' | 'facts'

function PinPicker({
  onClose, onNewNote, onPinned,
}: {
  onClose: () => void
  onNewNote: () => void
  onPinned: (pin: BoardPin) => void
}) {
  const [step, setStep] = useState<PickerStep>('choose')
  const [recordData, setRecordData] = useState<PinnableCategory[] | null>(null)
  const [noteData, setNoteData] = useState<{ id: string; title: string; body: string | null }[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState<PinnableCategory | null>(null)
  const [record, setRecord] = useState<PinnableRecord | null>(null)
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set())
  const [busyKey, setBusyKey] = useState<string | null>(null)

  async function openKeyFacts() {
    setStep('categories')
    if (!recordData) {
      setLoading(true)
      try { setRecordData(await getPinnableRecords()) } finally { setLoading(false) }
    }
  }

  async function openExistingNotes() {
    setStep('noteExisting')
    if (!noteData) {
      setLoading(true)
      try { setNoteData(await getPinnableNotes()) } finally { setLoading(false) }
    }
  }

  function back() {
    if (step === 'note' || step === 'categories') setStep('choose')
    else if (step === 'noteExisting') setStep('note')
    else if (step === 'records') { setStep('categories'); setCategory(null) }
    else if (step === 'facts') { setStep('records'); setRecord(null) }
  }

  async function pinFact(rec: PinnableRecord, fact: PinnableFact) {
    const key = `f:${rec.id}:${fact.label}:${fact.value}`
    if (doneKeys.has(key) || busyKey) return
    setBusyKey(key)
    const input = {
      title: rec.title,
      body: `${fact.label.trim() || 'Detail'}: ${fact.value.trim()}`,
      colour: 'green' as PinColour,
      linkHref: rec.href,
    }
    try {
      const res = await createPin(input)
      onPinned({ kind: 'fact', id: res?.id ?? ulid(), title: input.title, body: input.body, colour: 'green', linkHref: input.linkHref })
      setDoneKeys(prev => new Set(prev).add(key))
    } finally { setBusyKey(null) }
  }

  async function pinExistingNote(note: { id: string; title: string; body: string | null }) {
    const key = `n:${note.id}`
    if (doneKeys.has(key) || busyKey) return
    setBusyKey(key)
    try {
      await setNotePinned(note.id, true)
      onPinned({ kind: 'note', id: note.id, title: note.title, body: note.body })
      setDoneKeys(prev => new Set(prev).add(key))
    } finally { setBusyKey(null) }
  }

  const crumb =
    step === 'categories' ? 'Key fact'
    : step === 'records' ? `Key fact › ${category?.label ?? ''}`
    : step === 'facts' ? `Key fact › ${category?.label ?? ''} › ${record?.title ?? ''}`
    : step === 'noteExisting' ? 'Note › Existing'
    : step === 'note' ? 'Note'
    : null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg bg-surface rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+12px)] flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-9 h-1 bg-border rounded-full" />
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
          {step === 'choose' ? (
            <button onClick={onClose} className="text-[15px] text-text-2 active:opacity-60 w-16 text-left">Cancel</button>
          ) : (
            <button onClick={back} className="flex items-center gap-0.5 text-[15px] text-accent active:opacity-60 w-16 text-left">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M10 3L5 8l5 5" /></svg>
              Back
            </button>
          )}
          <p className="text-[15px] font-bold text-text-1 flex items-center gap-1.5"><span>📌</span> Pin to Home</p>
          <button onClick={onClose} className="text-[15px] font-semibold text-accent active:opacity-60 w-16 text-right">Done</button>
        </div>

        {crumb && <p className="px-5 pt-2.5 text-[12px] font-semibold text-text-3 truncate shrink-0">{crumb}</p>}

        <div className="overflow-y-auto px-4 py-4 flex flex-col gap-2.5">
          {step === 'choose' && (
            <>
              <p className="px-1 text-[13px] text-text-2">What would you like to pin?</p>
              <PickerOption emoji="📝" tint="rgba(255,204,0,0.18)" title="A note" subtitle="Write a new one or pin an existing note" onClick={() => setStep('note')} />
              <PickerOption emoji="🗂️" tint="rgba(52,199,89,0.18)" title="A key fact" subtitle="Pin a detail from one of your records" onClick={openKeyFacts} />
            </>
          )}

          {step === 'note' && (
            <>
              <p className="px-1 text-[13px] text-text-2">Pin a note</p>
              <PickerOption emoji="✏️" tint="rgba(0,122,255,0.14)" title="Write a new note" subtitle="It’ll be saved in Notes too" onClick={onNewNote} />
              <PickerOption emoji="🗒️" tint="rgba(255,204,0,0.18)" title="Pin an existing note" subtitle="Choose from your notes" onClick={openExistingNotes} />
            </>
          )}

          {step === 'noteExisting' && (
            loading ? (
              <p className="px-1 py-6 text-center text-[14px] text-text-2">Loading your notes…</p>
            ) : !noteData || noteData.length === 0 ? (
              <div className="px-1 py-6 text-center">
                <p className="text-[15px] font-semibold text-text-1">No notes to pin</p>
                <p className="text-[13px] text-text-2 mt-1">Write a new note instead.</p>
              </div>
            ) : (
              noteData.map(note => {
                const key = `n:${note.id}`
                const done = doneKeys.has(key)
                return (
                  <button
                    key={note.id}
                    onClick={() => pinExistingNote(note)}
                    disabled={done}
                    className="flex items-center gap-3 bg-surface-2 rounded-2xl px-4 py-3 active:opacity-70 text-left disabled:active:opacity-100"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-text-1 truncate">{note.title}</p>
                      {note.body && <p className="text-[12px] text-text-2 truncate">{note.body}</p>}
                    </div>
                    {done ? (
                      <span className="flex items-center gap-1 text-[13px] font-bold text-[#34C759] shrink-0">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3.5 8.5l3 3 6-7" /></svg>
                        Pinned
                      </span>
                    ) : (
                      <span className="text-[13px] font-bold text-white rounded-full px-3 py-1.5 shrink-0" style={{ background: '#34C759' }}>{busyKey === key ? '…' : 'Pin'}</span>
                    )}
                  </button>
                )
              })
            )
          )}

          {step === 'categories' && (
            loading ? (
              <p className="px-1 py-6 text-center text-[14px] text-text-2">Loading your records…</p>
            ) : !recordData || recordData.length === 0 ? (
              <div className="px-1 py-6 text-center">
                <p className="text-[15px] font-semibold text-text-1">No facts to pin yet</p>
                <p className="text-[13px] text-text-2 mt-1">Add some key facts to a record first.</p>
              </div>
            ) : (
              recordData.map(cat => (
                <button key={cat.key} onClick={() => { setCategory(cat); setStep('records') }} className="flex items-center gap-3.5 bg-surface-2 rounded-2xl px-4 py-3 active:opacity-70 text-left">
                  <div className="w-10 h-10 rounded-[12px] flex items-center justify-center text-[20px] shrink-0" style={{ background: `${cat.color}1F` }}>{cat.icon}</div>
                  <p className="flex-1 text-[15.5px] font-semibold text-text-1 truncate">{cat.label}</p>
                  <span className="text-[12px] font-bold text-text-2">{cat.records.length}</span>
                  <span className="text-text-3"><Chevron /></span>
                </button>
              ))
            )
          )}

          {step === 'records' && category && (
            category.records.map(rec => (
              <button key={rec.id} onClick={() => { setRecord(rec); setStep('facts') }} className="flex items-center gap-3.5 bg-surface-2 rounded-2xl px-4 py-3 active:opacity-70 text-left">
                <div className="w-10 h-10 rounded-[12px] flex items-center justify-center text-[20px] shrink-0" style={{ background: `${category.color}1F` }}>{category.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15.5px] font-semibold text-text-1 truncate">{rec.title}</p>
                  <p className="text-[12px] text-text-2">{rec.facts.length} {rec.facts.length === 1 ? 'fact' : 'facts'}</p>
                </div>
                <span className="text-text-3"><Chevron /></span>
              </button>
            ))
          )}

          {step === 'facts' && record && (
            <>
              <p className="px-1 text-[13px] text-text-2">Tap a fact to pin it.</p>
              {record.facts.map((fact, i) => {
                const key = `f:${record.id}:${fact.label}:${fact.value}`
                const done = doneKeys.has(key)
                return (
                  <button key={i} onClick={() => pinFact(record, fact)} disabled={done} className="flex items-center gap-3 bg-surface-2 rounded-2xl px-4 py-3 active:opacity-70 text-left disabled:active:opacity-100">
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] text-text-2 truncate">{fact.label || 'Detail'}</p>
                      <p className="text-[15px] font-semibold text-text-1 break-words">{fact.value}</p>
                    </div>
                    {done ? (
                      <span className="flex items-center gap-1 text-[13px] font-bold text-[#34C759] shrink-0">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3.5 8.5l3 3 6-7" /></svg>
                        Pinned
                      </span>
                    ) : (
                      <span className="text-[13px] font-bold text-white rounded-full px-3 py-1.5 shrink-0" style={{ background: '#34C759' }}>{busyKey === key ? '…' : 'Pin'}</span>
                    )}
                  </button>
                )
              })}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function PickerOption({ emoji, tint, title, subtitle, onClick }: { emoji: string; tint: string; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3.5 bg-surface-2 rounded-2xl px-4 py-3.5 active:opacity-70 text-left">
      <div className="w-11 h-11 rounded-[13px] flex items-center justify-center text-[22px] shrink-0" style={{ background: tint }}>{emoji}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[16px] font-semibold text-text-1">{title}</p>
        <p className="text-[12.5px] text-text-2">{subtitle}</p>
      </div>
      <span className="text-text-3"><Chevron /></span>
    </button>
  )
}

function NotePinEditor({
  note, onClose, onSaved, onUnpinned,
}: {
  note: { id: string; title: string; body: string | null } | null
  onClose: () => void
  onSaved: (pin: Extract<BoardPin, { kind: 'note' }>, isNew: boolean) => void
  onUnpinned: (id: string) => void
}) {
  const isNew = note === null
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const [saving, setSaving] = useState(false)

  async function unpin() {
    if (!note || saving) return
    setSaving(true)
    await setNotePinned(note.id, false)
    onUnpinned(note.id)
  }

  async function save() {
    if (!title.trim() || saving) return
    setSaving(true)
    const t = title.trim()
    const b = body.trim() || null
    if (isNew) {
      const res = await createNote(t, body, true)
      onSaved({ kind: 'note', id: res.note.id, title: t, body: b }, true)
    } else {
      await updateNote(note!.id, t, body)
      onSaved({ kind: 'note', id: note!.id, title: t, body: b }, false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-bg flex flex-col max-w-lg mx-auto">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border safe-top">
        <button onClick={onClose} className="text-accent text-[16px] active:opacity-60">Cancel</button>
        <span className="text-[16px] font-semibold text-text-1">{isNew ? 'New pinned note' : 'Edit note'}</span>
        <button onClick={save} disabled={!title.trim() || saving} className="text-accent text-[16px] font-semibold active:opacity-60 disabled:opacity-40">
          {saving ? 'Saving…' : 'Done'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        <div className="bg-surface rounded-2xl overflow-hidden">
          <input
            autoFocus={isNew}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full px-4 py-3 text-[16px] font-semibold text-text-1 placeholder:text-text-3 bg-transparent outline-none"
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Start writing…"
            rows={8}
            className="w-full px-4 py-3 text-[15px] text-text-1 placeholder:text-text-3 bg-transparent outline-none border-t border-border resize-none leading-relaxed"
          />
        </div>

        <p className="px-1 text-[12px] text-text-3">Pinned notes also live in your Notes section.</p>

        {!isNew && (
          <button onClick={unpin} disabled={saving} className="bg-surface rounded-2xl py-3 text-[15px] font-medium text-red active:bg-surface-2 disabled:opacity-50">
            Unpin from Home
          </button>
        )}

        <div className="h-8" />
      </div>
    </div>
  )
}

function FactPinEditor({
  pin, onClose, onSaved, onDeleted,
}: {
  pin: Extract<BoardPin, { kind: 'fact' }>
  onClose: () => void
  onSaved: (pin: Extract<BoardPin, { kind: 'fact' }>) => void
  onDeleted: (id: string) => void
}) {
  const [title, setTitle] = useState(pin.title)
  const [body, setBody] = useState(pin.body ?? '')
  const [colour, setColour] = useState<PinColour>(pin.colour)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!title.trim() || saving) return
    setSaving(true)
    await updatePin(pin.id, { title: title.trim(), body: body.trim() || null, colour })
    onSaved({ ...pin, title: title.trim(), body: body.trim() || null, colour })
  }

  async function remove() {
    await deletePin(pin.id)
    onDeleted(pin.id)
  }

  return (
    <div className="fixed inset-0 z-[60] bg-bg flex flex-col max-w-lg mx-auto">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border safe-top">
        <button onClick={onClose} className="text-accent text-[16px] active:opacity-60">Cancel</button>
        <span className="text-[16px] font-semibold text-text-1">Edit pin</span>
        <button onClick={save} disabled={!title.trim() || saving} className="text-accent text-[16px] font-semibold active:opacity-60 disabled:opacity-40">
          {saving ? 'Saving…' : 'Done'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {pin.linkHref && (
          <Link href={pin.linkHref} className="flex items-center justify-between gap-2 bg-surface rounded-2xl px-4 py-3 active:bg-surface-2">
            <span className="flex items-center gap-2 text-[15px] font-semibold text-accent">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M6.5 9.5l3-3M7 4.5l.8-.8a2.5 2.5 0 0 1 3.5 3.5l-.8.8M9 11.5l-.8.8a2.5 2.5 0 0 1-3.5-3.5l.8-.8" />
              </svg>
              Open linked record
            </span>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-text-3"><path d="M6 4l4 4-4 4" /></svg>
          </Link>
        )}
        <div className="bg-surface rounded-2xl overflow-hidden">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" className="w-full px-4 py-3 text-[16px] font-semibold text-text-1 placeholder:text-text-3 bg-transparent outline-none" />
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Detail" rows={4} className="w-full px-4 py-3 text-[15px] text-text-1 placeholder:text-text-3 bg-transparent outline-none border-t border-border resize-none" />
        </div>

        <div>
          <p className="px-1 mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-2">Colour</p>
          <div className="flex flex-wrap gap-3 px-1">
            {COLOUR_KEYS.map(key => {
              const c = PIN_COLOURS[key]
              return (
                <button key={key} onClick={() => setColour(key)} className="w-9 h-9 rounded-full transition-transform active:scale-90"
                  style={{ background: c.bar, boxShadow: colour === key ? `0 0 0 2.5px var(--bg), 0 0 0 4.5px ${c.bar}` : 'none' }} aria-label={key} />
              )
            })}
          </div>
        </div>

        <button onClick={remove} className="bg-surface rounded-2xl py-3 text-[15px] font-medium text-red active:bg-surface-2">Unpin</button>

        <div className="h-8" />
      </div>
    </div>
  )
}
