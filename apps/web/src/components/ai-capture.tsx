import { useRef, useState } from 'react'
import { refreshAppState } from '../lib/app-store'

type AiCaptureResult = {
  transcript?: string
  inboxItem?: { id: string; title: string } | null
  conversationId?: string | null
  jobId: string
  finalResponse?: string
  appliedActions?: Record<string, unknown>[]
  plan: {
    result: string
    response: string
    clarificationQuestion: string | null
    clarificationOptions: string[]
  }
}

type ActiveThread = {
  itemId: string
  conversationId: string
  assistantMessage: string
  clarificationOptions: string[]
  complete: boolean
}

type Props = {
  surface: 'home' | 'inbox'
  placeholder?: string
  onInboxItem?: (item: { id: string; title: string }) => void
}

const RECORDING_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4']
const AUDIO_EXTENSION_BY_MIME: Record<string, string> = {
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
}

function getSupportedRecordingMimeType() {
  return RECORDING_MIME_TYPES.find(type => MediaRecorder.isTypeSupported(type))
}

function extensionForAudioType(type: string) {
  const mimeType = type.split(';')[0]?.trim().toLowerCase()
  return mimeType ? AUDIO_EXTENSION_BY_MIME[mimeType] : null
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      resolve(result.includes(',') ? result.split(',')[1] ?? '' : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read audio.'))
    reader.readAsDataURL(blob)
  })
}

export function AiCapture({ surface, placeholder, onInboxItem }: Props) {
  const [text, setText] = useState('')
  const [reply, setReply] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [activeThread, setActiveThread] = useState<ActiveThread | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const isWorking = processing

  async function handleResult(result: AiCaptureResult) {
    const assistantMessage = result.plan.clarificationQuestion || result.finalResponse || result.plan.response
    if (result.inboxItem) onInboxItem?.(result.inboxItem)
    if (result.inboxItem && result.conversationId) {
      setMessage(null)
      setActiveThread({
        itemId: result.inboxItem.id,
        conversationId: result.conversationId,
        assistantMessage,
        clarificationOptions: result.plan.clarificationOptions,
        complete: false,
      })
    } else {
      setMessage(assistantMessage)
    }
    await refreshAppState().catch(() => undefined)
  }

  async function submitText(event?: React.FormEvent) {
    event?.preventDefault()
    const value = text.trim()
    if (!value || isWorking) return
    setText('')
    setError(null)
    setMessage(null)
    setActiveThread(null)
    setProcessing(true)
    try {
      const response = await fetch('/api/ai/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value, sourceType: 'typed_capture', sourceContext: { surface } }),
      })
      const payload = await response.json()
      if (!response.ok) {
        setError(payload.error || 'I could not save that just now.')
        return
      }
      await handleResult(payload)
    } catch {
      setError('I could not save that just now.')
    } finally {
      setProcessing(false)
    }
  }

  async function submitReply(value: string) {
    const trimmed = value.trim()
    if (!activeThread || !trimmed || isWorking) return
    setReply('')
    setError(null)
    setMessage(null)
    setProcessing(true)
    try {
      const response = await fetch(`/api/ai/inbox/${activeThread.itemId}/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, conversationId: activeThread.conversationId }),
      })
      const payload = await response.json()
      if (!response.ok) {
        setError(payload.error || 'I could not sort that just now.')
        return
      }
      const assistantMessage = payload.plan?.clarificationQuestion || payload.finalResponse || payload.plan?.response || 'Done.'
      const complete = payload.appliedActions?.length > 0 && payload.plan?.result === 'apply_actions'
      setActiveThread(prev => prev && {
        ...prev,
        conversationId: payload.conversationId ?? prev.conversationId,
        assistantMessage,
        clarificationOptions: complete ? [] : payload.plan?.clarificationOptions ?? [],
        complete,
      })
      await refreshAppState().catch(() => undefined)
    } catch {
      setError('I could not sort that just now.')
    } finally {
      setProcessing(false)
    }
  }

  async function startRecording() {
    setError(null)
    setMessage(null)
    setActiveThread(null)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Voice capture is not available in this browser.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getSupportedRecordingMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorderRef.current = recorder
      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop())
        void submitAudio(recorder)
      }
      recorder.start()
      setRecording(true)
    } catch {
      setError('I could not access the microphone.')
    }
  }

  async function submitAudio(recorder: MediaRecorder) {
    const blobType = recorder.mimeType || chunksRef.current[0]?.type || 'audio/webm'
    const blob = new Blob(chunksRef.current, { type: blobType })
    if (!blob.size) return
    setProcessing(true)
    try {
      const audioBase64 = await blobToBase64(blob)
      const response = await fetch('/api/ai/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType: blob.type,
          fileName: `capture.${extensionForAudioType(blob.type) ?? 'webm'}`,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        setError(payload.error || 'I could not save that voice note just now.')
        return
      }
      await handleResult(payload)
    } catch {
      setError('I could not save that voice note just now.')
    } finally {
      setProcessing(false)
    }
  }

  function stopRecording() {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecording(false)
  }

  return (
    <section className="mx-4 mb-4">
      <div className="rounded-2xl border border-border bg-surface px-3 py-3">
        <form onSubmit={submitText}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              disabled={isWorking && !recording}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white transition-colors ${recording ? 'bg-red' : 'bg-accent'} disabled:opacity-40`}
              aria-label={recording ? 'Stop recording' : 'Record voice note'}
            >
              {recording ? (
                <span className="h-3.5 w-3.5 rounded-[3px] bg-white" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
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
              className="h-11 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-[14px] font-medium text-text-1 outline-none placeholder:text-text-3 disabled:opacity-60"
            />
            <button type="submit" disabled={!text.trim() || isWorking} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-white disabled:opacity-40" aria-label="Capture">
              {isWorking ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M5 12h14" />
                  <path d="M13 6l6 6-6 6" />
                </svg>
              )}
            </button>
          </div>
        </form>

        {(isWorking || (!activeThread && message) || error || recording) ? (
          <div className="mt-2 flex items-center gap-2 px-1">
            {isWorking && !error ? (
              <span className="flex shrink-0 items-center gap-[3px]">
                {[0, 1, 2].map(i => <span key={i} className="h-[5px] w-[5px] animate-bounce rounded-full bg-text-3" style={{ animationDelay: `${i * 0.12}s`, animationDuration: '0.8s' }} />)}
              </span>
            ) : null}
            <p className={`text-[12px] leading-snug ${error ? 'text-red' : 'text-text-2'}`}>
              {error ?? (recording ? "Speak naturally - I'll keep the useful bits even if the thought is unfinished." : isWorking ? 'Thinking...' : message)}
            </p>
          </div>
        ) : null}

        {activeThread ? (
          <div className="mt-3 border-t border-border pt-3">
            <div className="rounded-xl bg-surface-2 px-3 py-2.5">
              <p className="text-[13px] leading-relaxed text-text-1">{activeThread.assistantMessage}</p>
              {activeThread.clarificationOptions.length > 0 && !activeThread.complete ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeThread.clarificationOptions.map(option => (
                    <button key={option} type="button" onClick={() => { void submitReply(option) }} disabled={isWorking} className="rounded-lg bg-accent-bg px-2.5 py-1.5 text-[12px] font-bold text-accent disabled:opacity-40">
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {!activeThread.complete ? (
              <form onSubmit={event => { event.preventDefault(); void submitReply(reply) }} className="mt-2 flex gap-2">
                <input value={reply} onChange={event => setReply(event.target.value)} disabled={isWorking} placeholder="Reply naturally..." className="h-10 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-[14px] text-text-1 outline-none placeholder:text-text-3 disabled:opacity-60" />
                <button type="submit" disabled={!reply.trim() || isWorking} className="h-10 rounded-xl bg-accent px-3 text-[13px] font-bold text-white disabled:opacity-40">Send</button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
