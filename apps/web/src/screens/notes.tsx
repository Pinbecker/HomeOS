import { useEffect, useMemo, useRef, useState } from 'react'
import { enqueueMutation, getCurrentState, makeId, useAppState } from '../lib/app-store'
import { ScreenShell } from './shell'

type NoteDraft = {
  id?: string
  title?: string
  body?: string | null
  pinned?: boolean
}

function PinGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-[#34C759] shrink-0" aria-label="Pinned">
      <path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.6l1.4 3.5a2 2 0 0 1 .15.76V11a1 1 0 0 1-1 1h-3v6.5a1 1 0 0 1-2 0V12H7.5a1 1 0 0 1-1-1V9.86a2 2 0 0 1 .14-.76L8 5.6V4z" />
    </svg>
  )
}

function formatRelativeTime(value: string | number | Date) {
  const date = new Date(value)
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.round(diffMs / 60000)

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function NoteModal({
  note,
  onClose,
  onSave,
}: {
  note: NoteDraft | null
  onClose: () => void
  onSave: (draft: { id: string | null; title: string; body: string }) => void
}) {
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  function handleSave() {
    if (!title.trim()) return
    onSave({ id: note?.id ?? null, title, body })
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onClick={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl bg-surface pb-[env(safe-area-inset-bottom)]"
        style={{ maxHeight: '80dvh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="shrink-0 pb-1 pt-3 flex justify-center">
          <div className="h-1 w-9 rounded-full bg-border" />
        </div>

        <div className="flex items-center justify-between border-b border-border px-5 py-3 shrink-0">
          <button onClick={onClose} className="text-[15px] text-text-2 active:opacity-60">Cancel</button>
          <p className="text-[15px] font-semibold text-text-1">{note?.id ? 'Edit Note' : 'New Note'}</p>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="text-[15px] font-semibold text-accent active:opacity-60 disabled:opacity-40"
          >
            Save
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 pb-4 pt-4">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="Title"
            className="w-full bg-transparent text-[20px] font-bold text-text-1 placeholder:text-text-3 outline-none"
          />
          <textarea
            value={body}
            onChange={event => setBody(event.target.value)}
            placeholder="Start writing…"
            rows={10}
            className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-text-1 placeholder:text-text-3 outline-none"
          />
        </div>
      </div>
    </div>
  )
}

export function NotesPage() {
  const notes = useAppState(state => state.data.items
    .filter(item => item.type === 'note' && item.status === 'active' && !item.deletedAt)
    .sort((a, b) => {
      if ((a.pinned ?? false) !== (b.pinned ?? false)) return a.pinned ? -1 : 1
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    }))
  const users = useAppState(state => state.data.users)
  const [modal, setModal] = useState<NoteDraft | false>(false)
  const orderedNotes = useMemo(() => notes, [notes])

  async function saveNote(draft: { id: string | null; title: string; body: string }) {
    const householdId = getCurrentState().data.household[0]?.id ?? 'default'
    const createdById = users[0]?.id ?? 'system'
    const now = new Date().toISOString()
    const title = draft.title.trim()
    const body = draft.body.trim() || null

    if (draft.id) {
      const existing = orderedNotes.find(note => note.id === draft.id)
      if (!existing) {
        setModal(false)
        return
      }

      const payload = {
        ...existing,
        title,
        body,
        updatedAt: now,
      }

      await enqueueMutation({
        id: makeId('mutation'),
        name: 'note.upsert',
        entityType: 'item',
        entityId: draft.id,
        operation: 'upsert',
        payload,
      }, prev => ({
        ...prev,
        data: {
          ...prev.data,
          items: prev.data.items.map(item => item.id === draft.id ? { ...item, ...payload } : item),
        },
      }))
    } else {
      const id = makeId('note')
      const payload = {
        id,
        householdId,
        createdById,
        type: 'note',
        title,
        body,
        status: 'active',
        pinned: false,
        pinnedAt: null,
        createdAt: now,
        updatedAt: now,
      }

      await enqueueMutation({
        id: makeId('mutation'),
        name: 'note.upsert',
        entityType: 'item',
        entityId: id,
        operation: 'upsert',
        payload,
      }, prev => ({
        ...prev,
        data: {
          ...prev.data,
          items: [payload, ...prev.data.items],
        },
      }))
    }

    setModal(false)
  }

  async function setPinned(noteId: string, pinned: boolean) {
    const existing = orderedNotes.find(note => note.id === noteId)
    if (!existing) return

    const payload = {
      pinned,
      updatedAt: new Date().toISOString(),
    }

    await enqueueMutation({
      id: makeId('mutation'),
      name: 'note.pin',
      entityType: 'item',
      entityId: noteId,
      operation: 'upsert',
      payload,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        items: prev.data.items.map(item => item.id === noteId
          ? { ...item, pinned, pinnedAt: pinned ? payload.updatedAt : null, updatedAt: payload.updatedAt }
          : item),
      },
    }))
  }

  async function deleteNote(noteId: string) {
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'note.delete',
      entityType: 'item',
      entityId: noteId,
      operation: 'delete',
      payload: null,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        items: prev.data.items.filter(item => item.id !== noteId),
      },
    }))
  }

  return (
    <ScreenShell title="Notes">
      <div className="mx-auto flex max-w-lg flex-col">
        <div className="flex items-center justify-end px-5 pb-3">
          <button
            onClick={() => setModal({})}
            className="flex h-8 w-8 items-center justify-center text-accent active:opacity-60 transition-opacity"
            aria-label="New note"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        {orderedNotes.length === 0 ? (
          <div className="mx-4 rounded-2xl bg-surface px-5 py-10 text-center">
            <p className="mb-1 text-[15px] font-semibold text-text-1">No notes yet</p>
            <p className="text-[13px] text-text-2">Tap + to write your first note</p>
          </div>
        ) : (
          <div className="mx-4 overflow-hidden rounded-2xl bg-surface">
            {orderedNotes.map((note, index) => (
              <div key={note.id} className={index > 0 ? 'border-t border-border' : ''}>
                <button
                  onClick={() => setModal(note)}
                  className="w-full px-4 py-3.5 text-left active:bg-surface-2 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    {note.pinned ? <PinGlyph /> : null}
                    <p className="truncate text-[14px] font-semibold leading-snug text-text-1">{note.title}</p>
                  </div>
                  {note.body ? (
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-text-2">{note.body}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-text-3">{formatRelativeTime(note.updatedAt)}</p>
                </button>
                <div className="flex items-center justify-end gap-4 px-4 pb-3">
                  <button
                    onClick={() => setPinned(note.id, !note.pinned)}
                    className="text-[12px] font-semibold text-[#34C759] active:opacity-60"
                  >
                    {note.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="text-[12px] font-semibold text-red active:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="h-6" />
      </div>

      {modal !== false ? (
        <NoteModal
          note={modal}
          onClose={() => setModal(false)}
          onSave={saveNote}
        />
      ) : null}
    </ScreenShell>
  )
}
