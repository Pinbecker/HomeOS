'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { SwipeRow } from '@/components/ui/swipe-row'
import { createNote, updateNote, deleteNote, setNotePinned } from './actions'
import { formatDistanceToNow } from '@/lib/utils/time'

type Note = {
  id: string
  title: string
  body: string | null
  pinned: boolean
  createdAt: Date
  updatedAt: Date
  createdBy: { name: string }
}

function PinGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-[#34C759] shrink-0" aria-label="Pinned">
      <path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.6l1.4 3.5a2 2 0 0 1 .15.76V11a1 1 0 0 1-1 1h-3v6.5a1 1 0 0 1-2 0V12H7.5a1 1 0 0 1-1-1V9.86a2 2 0 0 1 .14-.76L8 5.6V4z" />
    </svg>
  )
}

function NoteModal({
  note,
  onClose,
  onSave,
}: {
  note: Partial<Note> | null
  onClose: () => void
  onSave: (id: string | null, title: string, body: string) => void
}) {
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  function handleSave() {
    if (!title.trim()) return
    onSave(note?.id ?? null, title, body)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-lg bg-surface rounded-t-3xl pb-[env(safe-area-inset-bottom)]"
        style={{ maxHeight: '80dvh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-9 h-1 bg-border rounded-full" />
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <button onClick={onClose} className="text-[15px] text-text-2 active:opacity-60">Cancel</button>
          <p className="text-[15px] font-semibold text-text-1">{note?.id ? 'Edit Note' : 'New Note'}</p>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="text-[15px] font-semibold text-accent disabled:opacity-40 active:opacity-60"
          >
            Save
          </button>
        </div>

        {/* Fields */}
        <div className="flex flex-col flex-1 overflow-y-auto px-5 pt-4 pb-4 gap-3">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full bg-transparent text-[20px] font-bold text-text-1 placeholder:text-text-3 outline-none"
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Start writing…"
            rows={10}
            className="w-full bg-transparent text-[15px] text-text-1 placeholder:text-text-3 outline-none resize-none leading-relaxed"
          />
        </div>
      </div>
    </div>
  )
}

export function NotesClient({ notes: initialNotes }: { notes: Note[] }) {
  const [notes, setNotes] = useState(initialNotes)
  const [modal, setModal] = useState<Partial<Note> | null | false>(false)
  const [, startTransition] = useTransition()

  function openNew() {
    setModal({})
  }

  function openEdit(note: Note) {
    setModal(note)
  }

  function handleSave(id: string | null, title: string, body: string) {
    const now = new Date()

    if (id) {
      setNotes(prev => prev.map(n => n.id === id ? { ...n, title, body: body || null, updatedAt: now } : n))
      startTransition(() => updateNote(id, title, body))
    } else {
      const tempId = `temp_${Date.now()}`
      const newNote: Note = {
        id: tempId,
        title,
        body: body || null,
        pinned: false,
        createdAt: now,
        updatedAt: now,
        createdBy: { name: '' },
      }
      setNotes(prev => [newNote, ...prev])
      startTransition(async () => {
        const result = await createNote(title, body)
        if (result.note) {
          setNotes(prev => prev.map(n => n.id === tempId ? result.note : n))
        }
      })
    }

    setModal(false)
  }

  function handleDelete(id: string) {
    setNotes(prev => prev.filter(n => n.id !== id))
    startTransition(() => deleteNote(id))
  }

  function handlePin(id: string, pinned: boolean) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, pinned } : n))
    startTransition(() => setNotePinned(id, pinned))
  }

  return (
    <>
      <div className="flex flex-col max-w-lg mx-auto">
        <header className="px-5 pt-5 pb-3 flex items-center justify-between">
          <h1 className="text-[22px] font-extrabold text-text-1 tracking-tight">Notes</h1>
          <button
            onClick={openNew}
            className="w-8 h-8 flex items-center justify-center text-accent active:opacity-60 transition-opacity"
            aria-label="New note"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </header>

        {notes.length === 0 ? (
          <div className="mx-4 bg-surface border border-border rounded-2xl px-5 py-10 text-center">
            <p className="text-[15px] font-semibold text-text-1 mb-1">No notes yet</p>
            <p className="text-[13px] text-text-2">Tap + to write your first note</p>
          </div>
        ) : (
          <div className="mx-4 bg-surface border border-border rounded-2xl overflow-hidden">
            {notes.map((note, idx) => (
              <SwipeRow
                key={note.id}
                actions={[
                  { key: 'pin', label: note.pinned ? 'Unpin' : 'Pin', onClick: () => handlePin(note.id, !note.pinned), bg: '#34C759' },
                  { key: 'delete', label: 'Delete', onClick: () => handleDelete(note.id), className: 'bg-red', closeOnClick: false },
                ]}
                className={idx > 0 ? 'border-t border-border' : ''}
              >
                <button
                  onClick={() => openEdit(note)}
                  className="w-full text-left px-4 py-3.5 active:bg-surface-2 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    {note.pinned && <PinGlyph />}
                    <p className="text-[14px] font-semibold text-text-1 leading-snug truncate">{note.title}</p>
                  </div>
                  {note.body ? (
                    <p className="text-[12px] text-text-2 mt-0.5 line-clamp-2 leading-snug">{note.body}</p>
                  ) : null}
                  <p className="text-[11px] text-text-3 mt-1">{formatDistanceToNow(note.updatedAt)}</p>
                </button>
              </SwipeRow>
            ))}
          </div>
        )}

        <div className="h-6" />
      </div>

      {modal !== false && (
        <NoteModal
          note={modal}
          onClose={() => setModal(false)}
          onSave={handleSave}
        />
      )}
    </>
  )
}
