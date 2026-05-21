'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type AiCaptureResult = {
  transcript?: string
  inboxItem?: { id: string; title: string } | null
  conversationId?: string | null
  jobId: string
  plan: {
    result: string
    response: string
    clarificationQuestion: string | null
    confirmationSummary: string | null
    inferredTags: string[]
  }
}

type Props = {
  surface: 'home' | 'inbox'
  placeholder?: string
  onInboxItem?: (item: { id: string; title: string }) => void
}

export function AiCapture({ surface, placeholder, onInboxItem }: Props) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const isWorking = isPending || processing

  function handleResult(result: AiCaptureResult) {
    setMessage(result.plan.clarificationQuestion || result.plan.response)
    if (result.inboxItem) onInboxItem?.(result.inboxItem)
    router.refresh()
  }

  function submitText(e?: React.FormEvent) {
    e?.preventDefault()
    const value = text.trim()
    if (!value || isWorking) return
    setText('')
    setError(null)
    setMessage(null)

    startTransition(async () => {
      const response = await fetch('/api/ai/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: value,
          sourceType: 'typed_capture',
          sourceContext: { surface },
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        setError(payload.error || 'I could not save that just now.')
        return
      }
      handleResult(payload)
    })
  }

  async function startRecording() {
    setError(null)
    setMessage(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Voice capture is not available in this browser.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorderRef.current = recorder

      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (!blob.size) return
        setProcessing(true)
        const formData = new FormData()
        formData.set('audio', blob, 'capture.webm')
        try {
          const response = await fetch('/api/ai/voice', { method: 'POST', body: formData })
          const payload = await response.json()
          if (!response.ok) {
            setError(payload.error || 'I could not save that voice note just now.')
            return
          }
          handleResult(payload)
        } catch {
          setError('I could not save that voice note just now.')
        } finally {
          setProcessing(false)
        }
      }

      recorder.start()
      setRecording(true)
    } catch {
      setError('I could not access the microphone.')
    }
  }

  function stopRecording() {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecording(false)
  }

  return (
    <section className="mx-4 mb-4">
      <form onSubmit={submitText} className="bg-surface border border-border rounded-2xl px-3 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={isWorking && !recording}
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              recording ? 'bg-red text-white' : 'bg-accent text-white'
            } disabled:opacity-40`}
            aria-label={recording ? 'Stop recording' : 'Record voice note'}
          >
            {recording ? (
              <span className="w-3.5 h-3.5 bg-white rounded-[3px]" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            )}
          </button>

          <input
            value={text}
            onChange={event => setText(event.target.value)}
            disabled={isWorking || recording}
            placeholder={recording ? 'Listening...' : isWorking ? 'Thinking...' : placeholder ?? 'Say or type anything to remember'}
            className="min-w-0 flex-1 h-11 bg-surface-2 rounded-xl px-3 text-[14px] text-text-1 placeholder:text-text-3 font-medium outline-none disabled:opacity-60"
          />

          <button
            type="submit"
            disabled={!text.trim() || isWorking}
            className="w-11 h-11 rounded-xl bg-accent text-white flex items-center justify-center disabled:opacity-40 shrink-0"
            aria-label="Capture"
          >
            {isWorking ? (
              <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M5 12h14" />
                <path d="M13 6l6 6-6 6" />
              </svg>
            )}
          </button>
        </div>

        {(isWorking || message || error || recording) && (
          <div className="mt-2 px-1 flex items-center gap-2">
            {isWorking && !error && (
              <span className="flex gap-[3px] items-center shrink-0">
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="w-[5px] h-[5px] rounded-full bg-text-3 animate-bounce"
                    style={{ animationDelay: `${i * 0.12}s`, animationDuration: '0.8s' }}
                  />
                ))}
              </span>
            )}
            <p className={`text-[12px] leading-snug ${error ? 'text-red' : 'text-text-2'}`}>
              {error ?? (
                recording
                  ? "Speak naturally — I'll keep the useful bits even if the thought is unfinished."
                  : isWorking
                    ? 'Thinking…'
                    : message
              )}
            </p>
          </div>
        )}
      </form>
    </section>
  )
}
