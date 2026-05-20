'use client'

import { useState } from 'react'
import { ulid } from 'ulid'
import type { PinColour } from '@/lib/db/schema'
import { createPin, updatePin, deletePin } from '@/app/(app)/pins/actions'

type Pin = { id: string; title: string; body: string | null; colour: PinColour }

const PIN_COLOURS: Record<PinColour, { tint: string; bar: string }> = {
  yellow: { tint: 'rgba(255,204,0,0.16)',  bar: '#F5B800' },
  blue:   { tint: 'rgba(0,122,255,0.12)',  bar: '#007AFF' },
  green:  { tint: 'rgba(52,199,89,0.15)',  bar: '#34C759' },
  pink:   { tint: 'rgba(255,45,85,0.12)',  bar: '#FF2D55' },
  orange: { tint: 'rgba(255,149,0,0.15)',  bar: '#FF9500' },
  purple: { tint: 'rgba(175,82,222,0.13)', bar: '#AF52DE' },
}
const COLOUR_KEYS = Object.keys(PIN_COLOURS) as PinColour[]

export function PinnedBoard({ initialPins }: { initialPins: Pin[] }) {
  const [pins, setPins] = useState<Pin[]>(initialPins)
  const [editing, setEditing] = useState<Pin | 'new' | null>(null)

  function handleSaved(saved: Pin, isNew: boolean) {
    setPins(prev => (isNew ? [saved, ...prev] : prev.map(p => (p.id === saved.id ? saved : p))))
    setEditing(null)
  }
  function handleDeleted(id: string) {
    setPins(prev => prev.filter(p => p.id !== id))
    setEditing(null)
  }

  return (
    <section className="mx-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-3">Pinned</p>
        {pins.length > 0 && (
          <button onClick={() => setEditing('new')} className="text-[11.5px] font-semibold text-accent active:opacity-60">
            Add pin
          </button>
        )}
      </div>

      {pins.length === 0 ? (
        <button
          onClick={() => setEditing('new')}
          className="w-full flex items-center gap-3 bg-surface border border-dashed border-border rounded-2xl px-4 py-3.5 active:bg-surface-2"
        >
          <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center shrink-0">
            <svg viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" className="w-3.5 h-3.5">
              <path d="M8 3.5v9M3.5 8h9" />
            </svg>
          </div>
          <span className="text-[13.5px] font-medium text-text-2">Pin a note to your home screen</span>
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {pins.map(pin => {
            const c = PIN_COLOURS[pin.colour] ?? PIN_COLOURS.yellow
            return (
              <button
                key={pin.id}
                onClick={() => setEditing(pin)}
                className="text-left rounded-2xl p-3.5 active:scale-[0.98] transition-transform border border-border/50"
                style={{ background: c.tint }}
              >
                <div className="flex items-start gap-2">
                  <div className="w-1 self-stretch rounded-full shrink-0 mt-0.5" style={{ background: c.bar, minHeight: 18 }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-text-1 leading-snug break-words">{pin.title}</p>
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
            onClick={() => setEditing('new')}
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

      {editing && (
        <PinEditor
          pin={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </section>
  )
}

function PinEditor({
  pin, onClose, onSaved, onDeleted,
}: {
  pin: Pin | null
  onClose: () => void
  onSaved: (pin: Pin, isNew: boolean) => void
  onDeleted: (id: string) => void
}) {
  const isNew = pin === null
  const [title, setTitle] = useState(pin?.title ?? '')
  const [body, setBody] = useState(pin?.body ?? '')
  const [colour, setColour] = useState<PinColour>(pin?.colour ?? 'yellow')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!title.trim()) return
    setSaving(true)
    const input = { title: title.trim(), body: body.trim() || null, colour }
    if (isNew) {
      const optimisticId = ulid()
      const res = await createPin(input)
      onSaved({ id: res?.id ?? optimisticId, ...input }, true)
    } else {
      await updatePin(pin.id, input)
      onSaved({ id: pin.id, ...input }, false)
    }
  }

  async function remove() {
    if (isNew) { onClose(); return }
    await deletePin(pin.id)
    onDeleted(pin.id)
  }

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col max-w-lg mx-auto">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border safe-top">
        <button onClick={onClose} className="text-accent text-[16px] active:opacity-60">Cancel</button>
        <span className="text-[16px] font-semibold text-text-1">{isNew ? 'New Pin' : 'Edit Pin'}</span>
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
            placeholder="Title (e.g. Call the plumber)"
            className="w-full px-4 py-3 text-[16px] font-semibold text-text-1 placeholder:text-text-3 bg-transparent outline-none"
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Anything else worth remembering"
            rows={4}
            className="w-full px-4 py-3 text-[15px] text-text-1 placeholder:text-text-3 bg-transparent outline-none border-t border-border resize-none"
          />
        </div>

        <div>
          <p className="px-1 mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-2">Colour</p>
          <div className="flex flex-wrap gap-3 px-1">
            {COLOUR_KEYS.map(key => {
              const c = PIN_COLOURS[key]
              return (
                <button
                  key={key}
                  onClick={() => setColour(key)}
                  className="w-9 h-9 rounded-full transition-transform active:scale-90"
                  style={{
                    background: c.bar,
                    boxShadow: colour === key ? `0 0 0 2.5px var(--bg), 0 0 0 4.5px ${c.bar}` : 'none',
                  }}
                  aria-label={key}
                />
              )
            })}
          </div>
        </div>

        {!isNew && (
          <button onClick={remove} className="bg-surface rounded-2xl py-3 text-[15px] font-medium text-red active:bg-surface-2">
            Unpin
          </button>
        )}

        <div className="h-8" />
      </div>
    </div>
  )
}
