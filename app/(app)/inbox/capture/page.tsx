'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CapturePage() {
  const router = useRouter()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!text.trim()) return
    setSaving(true)
    await fetch('/api/ai/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text.trim(),
        sourceType: 'typed_capture',
        sourceContext: { surface: 'capture_page' },
      }),
    })
    router.back()
  }

  return (
    <div className="min-h-dvh bg-bg flex flex-col p-5">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.back()} className="text-[14px] font-semibold text-accent">
          Cancel
        </button>
        <h1 className="text-[16px] font-bold text-text-1">Capture</h1>
        <button
          onClick={handleSave}
          disabled={!text.trim() || saving}
          className="text-[14px] font-bold text-accent disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <textarea
        autoFocus
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="What's on your mind?&#10;&#10;Add anything — a task, a film, a shopping item, a place, an idea. It goes to your inbox and you can sort it later."
        className="flex-1 bg-transparent text-[16px] text-text-1 placeholder:text-text-3 font-medium outline-none resize-none leading-relaxed"
      />
    </div>
  )
}
