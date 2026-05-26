import { useMemo, useState } from 'react'
import { AiCapture } from '../components/ai-capture'
import { enqueueMutation, refreshAppState, makeId, useAppState } from '../lib/app-store'
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
  const [triageItemId, setTriageItemId] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [panelError, setPanelError] = useState<string | null>(null)
  const [panelMessage, setPanelMessage] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  const firstName = useMemo(() => users[0]?.name?.split(' ')[0] ?? 'You', [users])
  const triageItem = triageItemId ? items.find(item => item.id === triageItemId) ?? null : null

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

  function aiMeta(item: { metadata?: Record<string, unknown> | null }) {
    const ai = item.metadata && typeof item.metadata === 'object' ? (item.metadata as { ai?: unknown }).ai : null
    return ai && typeof ai === 'object' ? ai as {
      jobId?: string
      conversationId?: string
      response?: string
      originalWording?: string
      inferredTags?: string[]
      clarificationQuestion?: string | null
      clarificationOptions?: string[]
      confirmationSummary?: string | null
    } : null
  }

  async function runTriage(itemId: string, message?: string) {
    const item = items.find(entry => entry.id === itemId)
    if (!item || working) return
    setTriageItemId(itemId)
    setPanelError(null)
    setPanelMessage(null)
    setWorking(true)
    try {
      const response = await fetch(`/api/ai/inbox/${item.id}/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversationId: aiMeta(item)?.conversationId ?? null }),
      })
      const payload = await response.json()
      if (!response.ok) {
        setPanelError(payload.error || 'I could not sort that just now.')
        return
      }
      setPanelMessage(payload.plan?.clarificationQuestion || payload.finalResponse || payload.plan?.response || 'Done.')
      if (payload.appliedActions?.length > 0 && payload.plan?.result === 'apply_actions') {
        setTriageItemId(null)
      }
    } catch {
      setPanelError('I could not sort that just now.')
    } finally {
      setWorking(false)
    }
  }

  async function sendReply(event: React.FormEvent) {
    event.preventDefault()
    if (!triageItem || !reply.trim()) return
    const value = reply.trim()
    setReply('')
    await runTriage(triageItem.id, value)
  }

  async function confirmSuggestion() {
    const jobId = triageItem ? aiMeta(triageItem)?.jobId : null
    if (!jobId || working) return
    setPanelError(null)
    setWorking(true)
    try {
      const response = await fetch(`/api/ai/jobs/${jobId}/confirm`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) {
        setPanelError(payload.error || 'I could not confirm that just now.')
        return
      }
      setPanelMessage(payload.finalResponse || 'Done. I saved that now.')
    } catch {
      setPanelError('I could not confirm that just now.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <ScreenShell title="Inbox">
      <div className="mx-auto flex max-w-lg flex-col">
        <div className="px-5 pb-3">
          <p className="mt-0.5 text-[13px] text-text-2">Brain dump, memory layer, and things to sort later</p>
        </div>

        <AiCapture surface="inbox" placeholder="Capture a thought, fragment, or thing to sort" />

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
                  {aiMeta(item)?.inferredTags?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {aiMeta(item)!.inferredTags!.slice(0, 3).map(tag => (
                        <span key={tag} className="rounded-lg bg-accent-bg px-2 py-0.5 text-[10.5px] font-semibold text-accent">{tag}</span>
                      ))}
                    </div>
                  ) : null}
                  {aiMeta(item)?.response ? <p className="mt-2 text-[12px] leading-snug text-text-2">{aiMeta(item)?.response}</p> : null}
                  <p className="mt-1 text-[11px] text-text-3">
                    {firstName} · {formatRelativeTime(item.createdAt)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => { void runTriage(item.id) }} className="rounded-lg bg-accent-bg px-2.5 py-1.5 text-[12px] font-bold text-accent active:opacity-70">
                      {aiMeta(item)?.conversationId ? 'Continue with AI' : 'AI Triage'}
                    </button>
                    <button onClick={() => { void runTriage(item.id) }} className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px] font-bold text-text-2 active:opacity-70">
                      Help me sort this
                    </button>
                  </div>
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

        {triageItem ? (
          <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45">
            <div className="flex max-h-[78dvh] w-full max-w-lg flex-col rounded-t-3xl border-t border-border bg-bg">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div className="min-w-0">
                  <p className="text-[16px] font-extrabold text-text-1">Help me sort this</p>
                  <p className="truncate text-[12px] text-text-2">{triageItem.title}</p>
                </div>
                <button onClick={() => setTriageItemId(null)} className="text-[14px] font-semibold text-accent">Done</button>
              </div>
              <div className="overflow-y-auto px-5 py-4">
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <p className="text-[13px] font-semibold leading-snug text-text-1">{aiMeta(triageItem)?.originalWording ?? triageItem.title}</p>
                </div>
                {(panelMessage || aiMeta(triageItem)?.clarificationQuestion || aiMeta(triageItem)?.response) ? (
                  <div className="mt-3 rounded-2xl bg-surface-2 px-4 py-3">
                    <p className="text-[13px] leading-relaxed text-text-1">
                      {working ? 'Thinking...' : panelMessage ?? aiMeta(triageItem)?.clarificationQuestion ?? aiMeta(triageItem)?.response}
                    </p>
                    {aiMeta(triageItem)?.clarificationOptions?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {aiMeta(triageItem)!.clarificationOptions!.map(option => (
                          <button key={option} onClick={() => { void runTriage(triageItem.id, option) }} className="rounded-lg bg-accent-bg px-2.5 py-1.5 text-[12px] font-bold text-accent">
                            {option}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {aiMeta(triageItem)?.confirmationSummary ? (
                  <div className="mt-3 rounded-2xl border border-amber-border bg-amber-bg px-4 py-3">
                    <p className="text-[13px] font-semibold text-text-1">{aiMeta(triageItem)?.confirmationSummary}</p>
                    <button onClick={confirmSuggestion} className="mt-3 rounded-xl bg-accent px-3 py-2 text-[13px] font-bold text-white">Confirm and save</button>
                  </div>
                ) : null}
                {panelError ? <p className="mt-3 text-[12px] text-red">{panelError}</p> : null}
              </div>
              <form onSubmit={sendReply} className="flex gap-2 border-t border-border px-4 py-3">
                <input value={reply} onChange={event => setReply(event.target.value)} placeholder="Reply naturally..." className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-[14px] text-text-1 outline-none placeholder:text-text-3" />
                <button type="submit" disabled={!reply.trim() || working} className="h-11 rounded-xl bg-accent px-4 text-[13px] font-bold text-white disabled:opacity-40">Send</button>
              </form>
            </div>
          </div>
        ) : null}

        <div className="h-6" />
      </div>
    </ScreenShell>
  )
}

export function InboxCapturePage() {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    const title = text.trim()
    if (!title || saving) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/ai/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: title, sourceType: 'typed_capture', sourceContext: { surface: 'capture_page' } }),
      })
      const payload = await response.json()
      if (!response.ok) {
        setError(payload.error || 'I could not save that just now.')
        return
      }
      await refreshAppState().catch(() => undefined)
      window.location.href = '/inbox'
    } catch {
      setError('I could not save that just now.')
    } finally {
      setSaving(false)
    }
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
            {error ? <p className="mr-auto self-center text-[12px] text-red">{error}</p> : null}
            <button
              onClick={() => { void save() }}
              disabled={!text.trim() || saving}
              className="rounded-xl bg-accent px-4 py-2 text-[13px] font-semibold text-white active:opacity-80 disabled:opacity-40"
            >
              {saving ? 'Thinking...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </ScreenShell>
  )
}
