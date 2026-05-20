'use client'

import { useState, useRef } from 'react'
import { ulid } from 'ulid'
import { createTripIdea, updateTripIdea, toggleTripIdea, deleteTripIdea } from './actions'
import { SwipeRow } from '@/components/ui/swipe-row'

type TripIdea = {
  id: string
  title: string
  body: string | null
  status: string
}

export function PlansView({ initialItems }: { initialItems: TripIdea[] }) {
  const [active, setActive] = useState(initialItems.filter(i => i.status !== 'completed'))
  const [done, setDone] = useState(initialItems.filter(i => i.status === 'completed'))
  const [newTitle, setNewTitle] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({})
  const [showDone, setShowDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function addItem() {
    const t = newTitle.trim()
    if (!t) return
    const tempId = ulid()
    setActive(prev => [...prev, { id: tempId, title: t, body: null, status: 'active' }])
    setNewTitle('')
    inputRef.current?.focus()
    createTripIdea(t).then(res => {
      if (res?.id) setActive(prev => prev.map(i => i.id === tempId ? { ...i, id: res.id } : i))
    })
  }

  function complete(item: TripIdea) {
    setActive(prev => prev.filter(x => x.id !== item.id))
    setDone(prev => [{ ...item, status: 'completed' }, ...prev])
    setExpandedId(null)
    toggleTripIdea(item.id)
  }

  function uncomplete(item: TripIdea) {
    setDone(prev => prev.filter(x => x.id !== item.id))
    setActive(prev => [...prev, { ...item, status: 'active' }])
    toggleTripIdea(item.id)
  }

  function remove(item: TripIdea, from: 'active' | 'done') {
    if (from === 'active') setActive(prev => prev.filter(x => x.id !== item.id))
    else setDone(prev => prev.filter(x => x.id !== item.id))
    deleteTripIdea(item.id)
  }

  function saveNotes(item: TripIdea) {
    const body = editingNotes[item.id] ?? item.body ?? ''
    setActive(prev => prev.map(i => i.id === item.id ? { ...i, body: body || null } : i))
    updateTripIdea(item.id, { body: body || '' })
  }

  function renderRow(item: TripIdea, i: number, section: 'active' | 'done') {
    const isExpanded = expandedId === item.id && section === 'active'
    const notes = editingNotes[item.id] ?? item.body ?? ''
    return (
      <div key={item.id} className={i > 0 ? 'border-t border-border' : ''}>
       <SwipeRow onDelete={() => remove(item, section)}>
        <div className="flex items-center gap-3 px-4 py-3">
          {section === 'active' ? (
            <button
              onClick={() => complete(item)}
              className="w-[22px] h-[22px] rounded-full border-2 border-border shrink-0 active:scale-90 transition-transform"
              aria-label="Mark done"
            />
          ) : (
            <button
              onClick={() => uncomplete(item)}
              className="w-[22px] h-[22px] rounded-full bg-accent shrink-0 flex items-center justify-center active:scale-90 transition-transform"
              aria-label="Mark undone"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                <path d="M4 10.5l4 4 8-9" />
              </svg>
            </button>
          )}
          <button
            className="flex-1 min-w-0 text-left"
            onClick={() => section === 'active' && setExpandedId(isExpanded ? null : item.id)}
          >
            <p className={`text-[16px] ${section === 'done' ? 'text-text-2 line-through' : 'text-text-1'} truncate`}>
              {item.title}
            </p>
            {item.body && !isExpanded && (
              <p className="text-[12.5px] text-text-2 truncate mt-0.5">{item.body}</p>
            )}
          </button>
        </div>
       </SwipeRow>

        {isExpanded && (
          <div className="px-4 pb-3 pl-[49px]">
            <textarea
              rows={3}
              value={notes}
              onChange={e => setEditingNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
              onBlur={() => saveNotes(item)}
              placeholder="Notes, links, ideas…"
              className="w-full bg-surface-2 rounded-xl px-3 py-2 text-[14px] text-text-1 placeholder:text-text-3 outline-none resize-none"
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {active.length === 0 && done.length === 0 ? (
        <div className="mx-4 bg-surface rounded-2xl px-4 py-8 text-center">
          <p className="text-[14px] text-text-2">No plans yet — add your first idea below</p>
        </div>
      ) : (
        <div className="mx-4 bg-surface rounded-2xl overflow-hidden">
          {active.map((item, i) => renderRow(item, i, 'active'))}
          {active.length === 0 && (
            <div className="px-4 py-6 text-center">
              <p className="text-[14px] text-text-2">All done — time to plan something new!</p>
            </div>
          )}
        </div>
      )}

      {/* Add new */}
      <div className="mx-4 mt-2 flex items-center gap-3 px-4 py-2.5 bg-surface rounded-2xl">
        <div className="w-[22px] h-[22px] rounded-full border-2 border-border shrink-0 opacity-40" />
        <input
          ref={inputRef}
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addItem() }}
          placeholder="Add a trip or plan idea"
          className="flex-1 bg-transparent text-[16px] text-text-1 placeholder:text-text-3 outline-none"
        />
      </div>

      {/* Done / past trips */}
      {done.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowDone(s => !s)}
            className="px-5 mb-2 flex items-center gap-1.5 text-text-2 active:opacity-60"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
              className={`w-3.5 h-3.5 transition-transform ${showDone ? 'rotate-90' : ''}`}>
              <path d="M6 4l4 4-4 4" />
            </svg>
            <span className="text-[14px] font-medium">{done.length} Done</span>
          </button>
          {showDone && (
            <div className="mx-4 bg-surface rounded-2xl overflow-hidden">
              {done.map((item, i) => renderRow(item, i, 'done'))}
            </div>
          )}
        </div>
      )}

      <div className="h-4" />
    </>
  )
}
