'use client'

import { useState, useRef, useTransition } from 'react'
import { createInboxItem, archiveItem } from './actions'
import { formatDistanceToNow } from '@/lib/utils/time'

type InboxItem = {
  id: string
  title: string
  body: string | null
  createdAt: Date
  createdBy: { name: string }
}

interface Props {
  items: InboxItem[]
  userId: string
}

export function InboxClient({ items: initialItems, userId }: Props) {
  const [items, setItems] = useState(initialItems)
  const [text, setText] = useState('')
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return

    const title = text.trim()
    setText('')

    startTransition(async () => {
      const result = await createInboxItem(title)
      if (result.item) {
        setItems(prev => [result.item!, ...prev])
      }
    })
  }

  function handleArchive(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    startTransition(() => archiveItem(id))
  }

  return (
    <div className="flex flex-col max-w-lg mx-auto">

      {/* Header */}
      <header className="px-5 pt-5 pb-3">
        <h1 className="text-[22px] font-extrabold text-text-1 tracking-tight">Inbox</h1>
        <p className="text-[13px] text-text-2 mt-0.5">Dump anything here — sort it later</p>
      </header>

      {/* Quick capture */}
      <div className="mx-4 mb-5">
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="What's on your mind?"
            className="flex-1 h-12 bg-surface border border-border rounded-xl px-4 text-[14px] text-text-1 placeholder:text-text-3 font-medium outline-none focus:border-accent transition-colors"
          />
          <button
            type="submit"
            disabled={!text.trim() || isPending}
            className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center disabled:opacity-40 active:opacity-80 transition-opacity shrink-0"
            aria-label="Add"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </form>
      </div>

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
                <p className="text-[11px] text-text-3 mt-1">
                  {item.createdBy.name} · {formatDistanceToNow(item.createdAt)}
                </p>
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

      <div className="h-4" />
    </div>
  )
}
