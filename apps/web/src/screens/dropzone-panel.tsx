import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Camera, Copy, Download, ExternalLink, FileUp, FolderUp, Image, Link as LinkIcon, Trash2, Upload } from 'lucide-react'

type DropEntry = {
  id: string
  kind: 'text' | 'link' | 'file'
  text: string | null
  originalUrl: string | null
  fileId: string | null
  fileName: string | null
  mimeType: string | null
  sizeBytes: number | null
  createdAt: string
  expiresAt: string
}

type DropPayload = {
  entries: DropEntry[]
  maxFileBytes: number
  chunkSizeBytes: number
}

type UploadTask = {
  id: string
  file: File
  sessionId: string | null
  progress: number
  status: 'uploading' | 'done' | 'error'
  error: string | null
}

const UPLOAD_CONCURRENCY = 3

function fileDisplayName(file: File) {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath
  return relativePath || file.name
}

function formatBytes(value: number | null | undefined) {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`
}

function formatRelative(value: string) {
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function isImage(entry: DropEntry) {
  return entry.mimeType?.startsWith('image/') ?? false
}

function downloadUrl(fileId: string, inline = false) {
  return `/api/dropzone/files/${encodeURIComponent(fileId)}/download${inline ? '?inline=1' : ''}`
}

async function readError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { error?: string } | null
  return payload?.error ?? fallback
}

export function DropzonePanel() {
  const [entries, setEntries] = useState<DropEntry[]>([])
  const [maxFileBytes, setMaxFileBytes] = useState(5 * 1024 * 1024 * 1024)
  const [chunkSizeBytes, setChunkSizeBytes] = useState(8 * 1024 * 1024)
  const [text, setText] = useState('')
  const [savingText, setSavingText] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [tasks, setTasks] = useState<UploadTask[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const sortedEntries = useMemo(() => entries, [entries])

  async function load() {
    const response = await fetch('/api/dropzone', { cache: 'no-store' })
    if (!response.ok) {
      setError(await readError(response, 'Could not load Drop.'))
      return
    }
    const payload = await response.json() as DropPayload
    setEntries(payload.entries)
    setMaxFileBytes(payload.maxFileBytes)
    setChunkSizeBytes(payload.chunkSizeBytes)
    setError(null)
  }

  useEffect(() => {
    void load()
    const onFocus = () => { void load() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  async function saveText() {
    const value = text.trim()
    if (!value || savingText) return
    setSavingText(true)
    setError(null)
    try {
      const response = await fetch('/api/dropzone/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value }),
      })
      if (!response.ok) {
        setError(await readError(response, 'Could not save that.'))
        return
      }
      const payload = await response.json() as { entries: DropEntry[] }
      setEntries(payload.entries)
      setText('')
    } finally {
      setSavingText(false)
    }
  }

  function queueFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    for (const file of files) {
      const id = `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const task: UploadTask = { id, file, sessionId: null, progress: 0, status: 'uploading', error: null }
      setTasks(current => [task, ...current])
      void uploadFile(task)
    }
  }

  function updateTask(id: string, patch: Partial<UploadTask>) {
    setTasks(current => current.map(task => task.id === id ? { ...task, ...patch } : task))
  }

  async function uploadFile(task: UploadTask) {
    if (task.file.size > maxFileBytes) {
      updateTask(task.id, { status: 'error', error: `This file is larger than ${formatBytes(maxFileBytes)}.` })
      return
    }

    try {
      setError(null)
      let sessionId = task.sessionId
      let uploadedChunks: number[] = []
      let totalChunks = Math.ceil(task.file.size / chunkSizeBytes)
      let chunkSize = chunkSizeBytes

      if (sessionId) {
        const response = await fetch(`/api/dropzone/uploads/${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
        if (!response.ok) throw new Error(await readError(response, 'Could not resume upload.'))
        const payload = await response.json() as { chunkSizeBytes: number; totalChunks: number; uploadedChunks: number[] }
        chunkSize = payload.chunkSizeBytes
        totalChunks = payload.totalChunks
        uploadedChunks = payload.uploadedChunks
      } else {
        const response = await fetch('/api/dropzone/uploads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: fileDisplayName(task.file), mimeType: task.file.type, sizeBytes: task.file.size }),
        })
        if (!response.ok) throw new Error(await readError(response, 'Could not start upload.'))
        const payload = await response.json() as { id: string; chunkSizeBytes: number; totalChunks: number; uploadedChunks: number[] }
        sessionId = payload.id
        chunkSize = payload.chunkSizeBytes
        totalChunks = payload.totalChunks
        uploadedChunks = payload.uploadedChunks
        updateTask(task.id, { sessionId })
      }

      if (!sessionId) throw new Error('Could not start upload.')
      const activeSessionId = sessionId
      const uploaded = new Set(uploadedChunks)
      const uploadedBytes = () => {
        let total = 0
        for (const chunkIndex of uploaded) {
          const start = chunkIndex * chunkSize
          total += Math.max(0, Math.min(task.file.size, start + chunkSize) - start)
        }
        return total
      }
      updateTask(task.id, { status: 'uploading', error: null, progress: Math.min(task.file.size, uploadedBytes()) / task.file.size })

      const pendingChunks = Array.from({ length: totalChunks }, (_value, index) => index).filter(index => !uploaded.has(index))
      let nextPendingIndex = 0
      async function uploadChunk(index: number) {
        const start = index * chunkSize
        const end = Math.min(task.file.size, start + chunkSize)
        const response = await fetch(`/api/dropzone/uploads/${encodeURIComponent(activeSessionId)}/chunks/${index}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: task.file.slice(start, end),
        })
        if (!response.ok) throw new Error(await readError(response, 'Upload failed.'))
        uploaded.add(index)
        updateTask(task.id, { progress: Math.min(task.file.size, uploadedBytes()) / task.file.size })
      }
      async function worker() {
        while (nextPendingIndex < pendingChunks.length) {
          const index = pendingChunks[nextPendingIndex]
          nextPendingIndex += 1
          await uploadChunk(index)
        }
      }
      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, pendingChunks.length) }, () => worker()))

      const response = await fetch(`/api/dropzone/uploads/${encodeURIComponent(activeSessionId)}/complete`, { method: 'POST' })
      if (!response.ok) throw new Error(await readError(response, 'Could not finish upload.'))
      const payload = await response.json() as { entries: DropEntry[] }
      setEntries(payload.entries)
      updateTask(task.id, { status: 'done', progress: 1, error: null })
      window.setTimeout(() => setTasks(current => current.filter(row => row.id !== task.id)), 1600)
    } catch (uploadError) {
      updateTask(task.id, { status: 'error', error: uploadError instanceof Error ? uploadError.message : 'Upload failed.' })
    }
  }

  async function deleteEntry(entryId: string) {
    const response = await fetch(`/api/dropzone/${encodeURIComponent(entryId)}`, { method: 'DELETE' })
    if (!response.ok) {
      setError(await readError(response, 'Could not delete item.'))
      return
    }
    const payload = await response.json() as { entries: DropEntry[] }
    setEntries(payload.entries)
  }

  async function copyText(value: string | null) {
    if (!value) return
    await navigator.clipboard?.writeText(value).catch(() => undefined)
  }

  async function clearAll() {
    const response = await fetch('/api/dropzone', { method: 'DELETE' })
    if (!response.ok) {
      setError(await readError(response, 'Could not clear Drop.'))
      return
    }
    const payload = await response.json() as { entries: DropEntry[] }
    setEntries(payload.entries)
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-4">
      <div className="rounded-2xl bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[16px] font-bold text-text-1">Clipboard</p>
            <p className="mt-0.5 text-[12px] text-text-2">Temporary text and links for your devices.</p>
          </div>
          <span className="rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-bold text-text-2">7 days</span>
        </div>
        <textarea
          value={text}
          onChange={event => setText(event.target.value)}
          placeholder="Paste text, a code, or a link..."
          rows={4}
          className="w-full resize-none rounded-xl bg-surface-2 px-3 py-2.5 text-[15px] leading-relaxed text-text-1 outline-none placeholder:text-text-3"
        />
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={() => { void saveText() }} disabled={!text.trim() || savingText} className="h-10 rounded-xl bg-accent px-4 text-[14px] font-bold text-white disabled:opacity-40">
            {savingText ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div
        className={`rounded-2xl border border-dashed p-4 transition ${dragging ? 'border-accent bg-accent-bg' : 'border-border bg-surface'}`}
        onDragOver={event => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={event => {
          event.preventDefault()
          setDragging(false)
          queueFiles(event.dataTransfer.files)
        }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[16px] font-bold text-text-1">Files & photos</p>
            <p className="mt-0.5 text-[12px] text-text-2">Up to {formatBytes(maxFileBytes)} per file. Drop files here on desktop.</p>
          </div>
          <Upload className="h-5 w-5 shrink-0 text-accent" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <PickerButton label="Files" icon={<FileUp className="h-4 w-4" />} onClick={() => fileInputRef.current?.click()} />
          <PickerButton label="Folder" icon={<FolderUp className="h-4 w-4" />} onClick={() => folderInputRef.current?.click()} />
          <PickerButton label="Photos" icon={<Image className="h-4 w-4" />} onClick={() => photoInputRef.current?.click()} />
          <PickerButton label="Camera" icon={<Camera className="h-4 w-4" />} onClick={() => cameraInputRef.current?.click()} />
        </div>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={event => { if (event.target.files) queueFiles(event.target.files); event.target.value = '' }} />
        <input ref={folderInputRef} type="file" multiple className="hidden" onChange={event => { if (event.target.files) queueFiles(event.target.files); event.target.value = '' }} {...{ webkitdirectory: '', directory: '' }} />
        <input ref={photoInputRef} type="file" multiple accept="image/*" className="hidden" onChange={event => { if (event.target.files) queueFiles(event.target.files); event.target.value = '' }} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { if (event.target.files) queueFiles(event.target.files); event.target.value = '' }} />
      </div>

      {tasks.length > 0 ? (
        <div className="overflow-hidden rounded-2xl bg-surface">
          {tasks.map((task, index) => (
            <div key={task.id} className={`px-4 py-3 ${index > 0 ? 'border-t border-border' : ''}`}>
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-text-1">{fileDisplayName(task.file)}</p>
                  <p className="mt-0.5 text-[12px] text-text-2">{formatBytes(task.file.size)} · {task.status === 'done' ? 'Done' : task.status === 'error' ? task.error : `${Math.round(task.progress * 100)}%`}</p>
                </div>
                {task.status === 'error' ? (
                  <button type="button" onClick={() => { void uploadFile(task) }} className="rounded-lg bg-accent-bg px-2 py-1 text-[12px] font-bold text-accent">Retry</button>
                ) : null}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className={`h-full rounded-full ${task.status === 'error' ? 'bg-red' : 'bg-accent'}`} style={{ width: `${Math.max(4, Math.round(task.progress * 100))}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[12px] font-bold uppercase tracking-wide text-text-3">Recent Drop</p>
          {sortedEntries.length > 0 ? <button type="button" onClick={() => { void clearAll() }} className="text-[12px] font-bold text-red">Clear all</button> : null}
        </div>
        <div className="overflow-hidden rounded-2xl bg-surface">
          {sortedEntries.length > 0 ? sortedEntries.map((entry, index) => (
            <DropRow key={entry.id} entry={entry} index={index} onCopy={copyText} onDelete={deleteEntry} />
          )) : (
            <div className="px-5 py-8 text-center">
              <p className="text-[14px] font-semibold text-text-1">Drop is empty</p>
              <p className="mt-1 text-[12px] text-text-2">Save text or upload files here, then pick them up from another device.</p>
            </div>
          )}
        </div>
      </div>

      {error ? <p className="px-1 text-[12px] font-semibold text-red">{error}</p> : null}
      <div className="h-6" />
    </div>
  )
}

function PickerButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-surface-2 text-[13px] font-bold text-text-1 active:opacity-70">
      {icon}
      {label}
    </button>
  )
}

function DropRow({ entry, index, onCopy, onDelete }: { entry: DropEntry; index: number; onCopy: (value: string | null) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const textValue = entry.originalUrl ?? entry.text
  const fileUrl = entry.fileId ? downloadUrl(entry.fileId) : null
  const inlineUrl = entry.fileId ? downloadUrl(entry.fileId, true) : null

  return (
    <div className={`px-4 py-3 ${index > 0 ? 'border-t border-border' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-surface-2 text-accent">
          {entry.kind === 'link' ? <LinkIcon className="h-4 w-4" /> : entry.kind === 'file' ? <FileUp className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold text-text-1">{entry.kind === 'file' ? entry.fileName : textValue}</p>
          {entry.kind !== 'file' && entry.text && entry.text !== textValue ? <p className="mt-0.5 line-clamp-2 text-[12px] text-text-2">{entry.text}</p> : null}
          {entry.kind === 'file' ? <p className="mt-0.5 text-[12px] text-text-2">{formatBytes(entry.sizeBytes)} · {entry.mimeType || 'file'} · {formatRelative(entry.createdAt)}</p> : <p className="mt-0.5 text-[12px] text-text-2">{entry.kind === 'link' ? 'Link' : 'Text'} · {formatRelative(entry.createdAt)}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {entry.kind === 'file' && inlineUrl ? (
          <a href={inlineUrl} target="_blank" rel="noreferrer" className="flex h-8 items-center gap-1 rounded-lg bg-surface-2 px-2.5 text-[12px] font-bold text-text-2">
            <ExternalLink className="h-3.5 w-3.5" /> {isImage(entry) ? 'Preview' : 'Open'}
          </a>
        ) : null}
        {entry.kind === 'file' && fileUrl ? (
          <a href={fileUrl} download className="flex h-8 items-center gap-1 rounded-lg bg-accent-bg px-2.5 text-[12px] font-bold text-accent">
            <Download className="h-3.5 w-3.5" /> Download
          </a>
        ) : null}
        {entry.kind !== 'file' ? (
          <>
            <button type="button" onClick={() => { void onCopy(textValue) }} className="flex h-8 items-center gap-1 rounded-lg bg-accent-bg px-2.5 text-[12px] font-bold text-accent"><Copy className="h-3.5 w-3.5" /> Copy</button>
            {entry.originalUrl ? <a href={entry.originalUrl} target="_blank" rel="noreferrer" className="flex h-8 items-center gap-1 rounded-lg bg-surface-2 px-2.5 text-[12px] font-bold text-text-2"><ExternalLink className="h-3.5 w-3.5" /> Open</a> : null}
          </>
        ) : null}
        <button type="button" onClick={() => { void onDelete(entry.id) }} className="flex h-8 items-center gap-1 rounded-lg bg-red-bg px-2.5 text-[12px] font-bold text-red"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
      </div>
    </div>
  )
}
