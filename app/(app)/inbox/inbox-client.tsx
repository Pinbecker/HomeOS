'use client'

import { useState, useTransition } from 'react'
import { archiveItem } from './actions'
import { formatDistanceToNow } from '@/lib/utils/time'
import { AiCapture } from '@/components/features/ai/ai-capture'

type InboxItem = {
  id: string
  title: string
  body: string | null
  createdAt: Date
  createdBy: { name: string }
  metadata?: {
    ai?: {
      jobId?: string
      conversationId?: string
      result?: string
      response?: string
      originalWording?: string
      planningConfidence?: string
      entityResolutionConfidence?: string
      inferredTags?: string[]
      clarificationQuestion?: string | null
      clarificationOptions?: string[]
      confirmationSummary?: string | null
    }
  } | null
}

interface Props {
  items: InboxItem[]
}

export function InboxClient({ items: initialItems }: Props) {
  const [items, setItems] = useState(initialItems)
  const [triageItem, setTriageItem] = useState<InboxItem | null>(null)
  const [reply, setReply] = useState('')
  const [panelError, setPanelError] = useState<string | null>(null)
  const [panelMessage, setPanelMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleArchive(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    startTransition(() => archiveItem(id))
  }

  function addCapturedItem(item: { id: string; title: string }) {
    setItems(prev => [{
      id: item.id,
      title: item.title,
      body: null,
      createdAt: new Date(),
      createdBy: { name: 'You' },
    }, ...prev])
  }

  async function runTriage(item: InboxItem, message?: string) {
    setTriageItem(item)
    setPanelError(null)
    setPanelMessage(null)
    const response = await fetch(`/api/ai/inbox/${item.id}/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        conversationId: item.metadata?.ai?.conversationId ?? null,
      }),
    })
    const payload = await response.json()
    if (!response.ok) {
      setPanelError(payload.error || 'I could not sort that just now.')
      return
    }

    if (payload.appliedActions?.length > 0 && payload.plan.result === 'apply_actions') {
      setItems(prev => prev.filter(prevItem => prevItem.id !== item.id))
      setPanelMessage(payload.plan.response)
      setTriageItem(null)
      return
    }

    const ai = {
      ...(item.metadata?.ai ?? {}),
      jobId: payload.jobId,
      conversationId: payload.conversationId,
      result: payload.plan.result,
      response: payload.plan.response,
      originalWording: payload.plan.originalWording,
      planningConfidence: payload.plan.planningConfidence,
      entityResolutionConfidence: payload.plan.entityResolutionConfidence,
      inferredTags: payload.plan.inferredTags,
      clarificationQuestion: payload.plan.clarificationQuestion,
      clarificationOptions: payload.plan.clarificationOptions,
      confirmationSummary: payload.plan.confirmationSummary,
    }
    const updated = { ...item, metadata: { ai } }
    setTriageItem(updated)
    setItems(prev => prev.map(prevItem => prevItem.id === item.id ? updated : prevItem))
    setPanelMessage(payload.plan.clarificationQuestion || payload.plan.response)
  }

  function sendReply(e: React.FormEvent) {
    e.preventDefault()
    if (!triageItem || !reply.trim()) return
    const value = reply.trim()
    setReply('')
    startTransition(() => {
      void runTriage(triageItem, value)
    })
  }

  async function confirmSuggestion() {
    const jobId = triageItem?.metadata?.ai?.jobId
    if (!jobId) return
    setPanelError(null)
    const response = await fetch(`/api/ai/jobs/${jobId}/confirm`, { method: 'POST' })
    const payload = await response.json()
    if (!response.ok) {
      setPanelError(payload.error || 'I could not confirm that just now.')
      return
    }
    setPanelMessage('Done. I’ve saved that now.')
  }

  return (
    <div className="flex flex-col max-w-lg mx-auto">

      {/* Header */}
      <header className="px-5 pt-5 pb-3">
        <h1 className="text-[22px] font-extrabold text-text-1 tracking-tight">Inbox</h1>
        <p className="text-[13px] text-text-2 mt-0.5">Brain dump, memory layer, and things to sort later</p>
      </header>

      <AiCapture
        surface="inbox"
        placeholder="Capture a thought, fragment, or thing to sort"
        onInboxItem={addCapturedItem}
      />

      {/* Items */}
      {items.length === 0 ? (
        <div className="mx-4 bg-surface border border-border rounded-2xl px-5 py-8 text-center">
          <p className="text-[15px] font-semibold text-text-1 mb-1">Inbox is clear</p>
          <p className="text-[13px] text-text-2">Type anything above to capture it</p>
        </div>
      ) : (
        <div className="mx-4 flex flex-col gap-[5px]">
          {items.map(item => (
            <div
              key={item.id}
              className="bg-surface border border-border rounded-2xl px-4 py-3 flex items-start gap-3"
            >
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-[14px] font-medium text-text-1 leading-snug">{item.title}</p>
                {item.body && <p className="text-[12px] text-text-2 mt-1 leading-snug">{item.body}</p>}
                {item.metadata?.ai?.inferredTags && item.metadata.ai.inferredTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.metadata.ai.inferredTags.slice(0, 3).map(tag => (
                      <span key={tag} className="text-[10.5px] font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-lg">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {item.metadata?.ai?.response && (
                  <p className="text-[12px] text-text-2 mt-2 leading-snug">{item.metadata.ai.response}</p>
                )}
                <p className="text-[11px] text-text-3 mt-1">
                  {item.createdBy.name} · {formatDistanceToNow(item.createdAt)}
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    onClick={() => { void runTriage(item) }}
                    className="text-[12px] font-bold text-accent bg-accent/10 px-2.5 py-1.5 rounded-lg active:opacity-70"
                  >
                    {item.metadata?.ai?.conversationId ? 'Continue with AI' : 'AI Triage'}
                  </button>
                  <button
                    onClick={() => { void runTriage(item) }}
                    className="text-[12px] font-bold text-text-2 bg-surface-2 px-2.5 py-1.5 rounded-lg active:opacity-70"
                  >
                    Help me sort this
                  </button>
                </div>
              </div>

              {/* Archive (swipe-friendly tap area) */}
              <button
                onClick={() => handleArchive(item.id)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-text-3 hover:text-red hover:bg-red-bg active:bg-red-bg transition-colors shrink-0 mt-0.5"
                aria-label="Dismiss"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {triageItem && (
        <div className="fixed inset-0 z-[70] bg-black/45 flex items-end justify-center">
          <div className="w-full max-w-lg bg-bg rounded-t-3xl border-t border-border max-h-[78dvh] flex flex-col">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[16px] font-extrabold text-text-1">Help me sort this</p>
                <p className="text-[12px] text-text-2 truncate">{triageItem.title}</p>
              </div>
              <button onClick={() => setTriageItem(null)} className="text-[14px] font-semibold text-accent">
                Done
              </button>
            </div>

            <div className="px-5 py-4 overflow-y-auto">
              <div className="bg-surface border border-border rounded-2xl px-4 py-3">
                <p className="text-[13px] font-semibold text-text-1 leading-snug">{triageItem.metadata?.ai?.originalWording ?? triageItem.title}</p>
                {triageItem.metadata?.ai?.inferredTags && triageItem.metadata.ai.inferredTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {triageItem.metadata.ai.inferredTags.map(tag => (
                      <span key={tag} className="text-[10.5px] font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-lg">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {(panelMessage || triageItem.metadata?.ai?.clarificationQuestion || triageItem.metadata?.ai?.response) && (
                <div className="mt-3 bg-surface-2 rounded-2xl px-4 py-3">
                  <p className="text-[13px] text-text-1 leading-relaxed">
                    {panelMessage ?? triageItem.metadata?.ai?.clarificationQuestion ?? triageItem.metadata?.ai?.response}
                  </p>
                  {triageItem.metadata?.ai?.clarificationOptions && triageItem.metadata.ai.clarificationOptions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {triageItem.metadata.ai.clarificationOptions.map(option => (
                        <button
                          key={option}
                          onClick={() => { startTransition(() => { void runTriage(triageItem, option) }) }}
                          className="text-[12px] font-bold text-accent bg-accent/10 px-2.5 py-1.5 rounded-lg"
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {triageItem.metadata?.ai?.confirmationSummary && (
                <div className="mt-3 bg-amber-bg border border-amber/20 rounded-2xl px-4 py-3">
                  <p className="text-[13px] font-semibold text-text-1">{triageItem.metadata.ai.confirmationSummary}</p>
                  <button
                    onClick={confirmSuggestion}
                    className="mt-3 text-[13px] font-bold text-white bg-accent px-3 py-2 rounded-xl"
                  >
                    Confirm and save
                  </button>
                </div>
              )}

              {panelError && <p className="mt-3 text-[12px] text-red">{panelError}</p>}
            </div>

            <form onSubmit={sendReply} className="px-4 py-3 border-t border-border flex gap-2">
              <input
                value={reply}
                onChange={event => setReply(event.target.value)}
                placeholder="Reply naturally..."
                className="min-w-0 flex-1 h-11 bg-surface border border-border rounded-xl px-3 text-[14px] text-text-1 placeholder:text-text-3 outline-none"
              />
              <button
                type="submit"
                disabled={!reply.trim() || isPending}
                className="h-11 px-4 rounded-xl bg-accent text-white text-[13px] font-bold disabled:opacity-40"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="h-4" />
    </div>
  )
}
