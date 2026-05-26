import { useMemo, useState } from 'react'
import { enqueueMutation, getCurrentState, makeId, useAppState } from '../lib/app-store'
import { ScreenShell } from './shell'

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

export function InboxPage() {
  const items = useAppState(state => state.data.items
    .filter(item => item.type === 'inbox' && item.status === 'active' && !item.deletedAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
  const users = useAppState(state => state.data.users)
  const [text, setText] = useState('')

  const firstName = useMemo(() => users[0]?.name?.split(' ')[0] ?? 'You', [users])

  async function addItem() {
    const title = text.trim()
    if (!title) return

    const id = makeId('inbox')
    const householdId = getCurrentState().data.household[0]?.id ?? 'default'
    const createdById = users[0]?.id ?? 'system'
    const payload = {
      id,
      householdId,
      createdById,
      type: 'inbox',
      title,
      body: null,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await enqueueMutation({
      id: makeId('mutation'),
      name: 'inbox.upsert',
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

    setText('')
  }

  async function archiveItem(itemId: string) {
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'inbox.archive',
      entityType: 'item',
      entityId: itemId,
      operation: 'upsert',
      payload: { status: 'archived', updatedAt: new Date().toISOString() },
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        items: prev.data.items.map(item => item.id === itemId ? { ...item, status: 'archived', updatedAt: new Date().toISOString() } : item),
      },
    }))
  }

  return (
    <ScreenShell title="Inbox">
      <div className="mx-auto flex max-w-lg flex-col">
        <div className="px-5 pb-3">
          <p className="mt-0.5 text-[13px] text-text-2">Brain dump, memory layer, and things to sort later</p>
        </div>

        <div className="mx-4 mb-4 rounded-2xl border border-border bg-surface px-4 py-4">
          <form onSubmit={event => { event.preventDefault(); void addItem() }} className="flex flex-col gap-3">
            <textarea
              value={text}
              onChange={event => setText(event.target.value)}
              placeholder="Capture a thought, task, shopping item, place, or idea..."
              rows={4}
              className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-text-1 placeholder:text-text-3 outline-none"
            />
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-text-3">Saved locally first, then synced.</p>
              <button
                type="submit"
                disabled={!text.trim()}
                className="rounded-xl bg-accent px-4 py-2 text-[13px] font-semibold text-white active:opacity-80 disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </form>
        </div>

        {items.length === 0 ? (
          <div className="mx-4 rounded-2xl border border-border bg-surface px-5 py-8 text-center">
            <p className="mb-1 text-[15px] font-semibold text-text-1">Inbox is clear</p>
            <p className="text-[13px] text-text-2">Capture anything above and sort it later.</p>
          </div>
        ) : (
          <div className="mx-4 flex flex-col gap-[5px]">
            {items.map(item => (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3"
              >
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-[14px] font-medium leading-snug text-text-1">{item.title}</p>
                  {item.body ? <p className="mt-1 text-[12px] leading-snug text-text-2">{item.body}</p> : null}
                  <p className="mt-1 text-[11px] text-text-3">
                    {firstName} · {formatRelativeTime(item.createdAt)}
                  </p>
                </div>
                <button
                  onClick={() => archiveItem(item.id)}
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-3 transition-colors hover:bg-red-bg hover:text-red active:bg-red-bg"
                  aria-label="Archive"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="h-6" />
      </div>
    </ScreenShell>
  )
}

export function InboxCapturePage() {
  const [text, setText] = useState('')

  async function save() {
    const title = text.trim()
    if (!title) return

    const id = makeId('inbox')
    const householdId = getCurrentState().data.household[0]?.id ?? 'default'
    const createdById = getCurrentState().data.users[0]?.id ?? 'system'
    const payload = {
      id,
      householdId,
      createdById,
      type: 'inbox',
      title,
      body: null,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await enqueueMutation({
      id: makeId('mutation'),
      name: 'inbox.upsert',
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

    window.location.href = '/inbox'
  }

  return (
    <ScreenShell title="Capture">
      <div className="px-5">
        <div className="rounded-2xl border border-border bg-surface px-4 py-4">
          <textarea
            autoFocus
            value={text}
            onChange={event => setText(event.target.value)}
            placeholder="What's on your mind? Add anything and sort it later."
            rows={10}
            className="w-full resize-none bg-transparent text-[16px] leading-relaxed text-text-1 placeholder:text-text-3 outline-none"
          />
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => { void save() }}
              disabled={!text.trim()}
              className="rounded-xl bg-accent px-4 py-2 text-[13px] font-semibold text-white active:opacity-80 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </ScreenShell>
  )
}
