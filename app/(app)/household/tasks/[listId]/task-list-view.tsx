'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ulid } from 'ulid'
import { updateTask, renameTaskList, deleteTaskList } from '../actions'
import { LIST_COLORS } from '../colors'
import { SwipeRow } from '@/components/ui/swipe-row'
import { useSyncQueue } from '@/lib/hooks/use-sync-queue'
import { SyncBanner } from '@/components/features/offline/sync-banner'

type Task = {
  id: string
  title: string
  dueDate: Date | null
  status: string
  listId: string | null
  assigneeId: string | null
}
type User = { id: string; name: string }
type TaskList = { id: string; name: string }
type TaskSource = { id: string; title: string; icon: string | null; href: string }

interface Props {
  listId: string
  isAll: boolean
  isInbox: boolean
  title: string
  color: string
  users: User[]
  lists: TaskList[]
  taskSources: Record<string, TaskSource>
  initialActive: Task[]
  initialCompleted: Task[]
}

const SYNC_URL = '/api/sync/tasks'
const AVATAR_COLORS = ['#007AFF', '#FF2D55', '#34C759', '#AF52DE']

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
function dayDiff(due: Date) {
  return Math.round((startOfDay(due) - startOfDay(new Date())) / 86400000)
}
function toInputDate(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
function toInputTime(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function hasSetTime(d: Date | null): boolean {
  if (!d) return false
  return d.getHours() !== 0 || d.getMinutes() !== 0
}
function toDisplayDate(d: Date): string {
  const days = dayDiff(d)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days > 1 && days < 7) return d.toLocaleDateString('en-GB', { weekday: 'long' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
function formatDue(due: Date): { label: string; overdue: boolean } {
  const days = dayDiff(due)
  const hasTime = due.getHours() !== 0 || due.getMinutes() !== 0
  const timeSuffix = hasTime
    ? ` · ${due.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' })}`
    : ''
  if (days < 0) {
    const label = due.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + timeSuffix
    return { label, overdue: true }
  }
  if (days === 0) return { label: `Today${timeSuffix}`, overdue: false }
  if (days === 1) return { label: `Tomorrow${timeSuffix}`, overdue: false }
  if (days < 7) return { label: due.toLocaleDateString('en-GB', { weekday: 'long' }) + timeSuffix, overdue: false }
  return { label: due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + timeSuffix, overdue: false }
}

export function TaskListView({ listId, isAll, isInbox, title, color, users, lists, taskSources, initialActive, initialCompleted }: Props) {
  const router = useRouter()
  const [active, setActive] = useState<Task[]>(initialActive)
  const [completed, setCompleted] = useState<Task[]>(initialCompleted)
  const [newTitle, setNewTitle] = useState('')
  const [editing, setEditing] = useState(false)
  const [listName, setListName] = useState(title)
  const [listColor, setListColor] = useState(color)
  const [showCompleted, setShowCompleted] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // useTransition only for list-level ops (rename/delete list)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const renameRef = useRef<HTMLInputElement>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const timeInputRef = useRef<HTMLInputElement>(null)

  const canEditList = !isAll && !isInbox

  // ── Offline sync ────────────────────────────────────────────────────────────
  const { pending, isSyncing, enqueue } = useSyncQueue()

  // Refresh server data after a full sync completes
  useEffect(() => {
    const handler = () => router.refresh()
    window.addEventListener('homeos:sync-complete', handler)
    return () => window.removeEventListener('homeos:sync-complete', handler)
  }, [router])

  useEffect(() => {
    if (renamingId) renameRef.current?.focus()
  }, [renamingId])

  const userColor = (id: string | null) => {
    if (!id) return '#8E8E93'
    const i = users.findIndex(u => u.id === id)
    return AVATAR_COLORS[i % AVATAR_COLORS.length] ?? '#8E8E93'
  }
  const userInitial = (id: string | null) => {
    const u = users.find(x => x.id === id)
    return u ? u.name.charAt(0).toUpperCase() : ''
  }

  function patchTask(id: string, patch: Partial<Task>) {
    setActive(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)))
    setCompleted(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)))
  }

  // ── Item mutations — optimistic-first, queued for offline ──────────────────
  // refocus only on Enter/submit — not on blur (blur means the user tapped away)
  function addTask(refocus = true) {
    const t = newTitle.trim()
    if (!t || isAll) return
    const id = ulid()   // permanent client-generated ID
    const targetListId = isInbox ? null : listId
    setActive(prev => [...prev, { id, title: t, dueDate: null, status: 'active', listId: targetListId, assigneeId: null }])
    setNewTitle('')
    enqueue(SYNC_URL, { op: 'add', id, listId: targetListId, title: t })
    if (refocus) inputRef.current?.focus()
  }

  function complete(task: Task) {
    setActive(prev => prev.filter(x => x.id !== task.id))
    setCompleted(prev => [{ ...task, status: 'completed' }, ...prev])
    setExpandedId(null)
    // Send the intended final state, not a blind toggle — conflict-safe
    enqueue(SYNC_URL, { op: 'set_status', id: task.id, status: 'completed' })
  }

  function uncomplete(task: Task) {
    setCompleted(prev => prev.filter(x => x.id !== task.id))
    setActive(prev => [...prev, { ...task, status: 'active' }])
    enqueue(SYNC_URL, { op: 'set_status', id: task.id, status: 'active' })
  }

  function remove(task: Task, from: 'active' | 'completed') {
    if (from === 'active') setActive(prev => prev.filter(x => x.id !== task.id))
    else setCompleted(prev => prev.filter(x => x.id !== task.id))
    enqueue(SYNC_URL, { op: 'delete', id: task.id })
  }

  // ── Detail ops that still use server actions (not offline-critical) ─────────
  function setDueDate(task: Task, dateStr: string) {
    if (!dateStr) { patchTask(task.id, { dueDate: null }); updateTask(task.id, { dueDate: null }); return }
    const [y, m, d] = dateStr.split('-').map(Number)
    const existing = task.dueDate ? new Date(task.dueDate) : null
    const date = new Date(y, m - 1, d, existing?.getHours() ?? 0, existing?.getMinutes() ?? 0)
    patchTask(task.id, { dueDate: date })
    updateTask(task.id, { dueDate: date.getTime() })
  }
  function setDueTime(task: Task, timeStr: string) {
    if (!task.dueDate) return
    const base = new Date(task.dueDate)
    const [h, min] = timeStr ? timeStr.split(':').map(Number) : [0, 0]
    const date = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, min)
    patchTask(task.id, { dueDate: date })
    updateTask(task.id, { dueDate: date.getTime() })
  }
  function clearTime(task: Task) {
    if (!task.dueDate) return
    const d = new Date(task.dueDate)
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0)
    patchTask(task.id, { dueDate: date })
    updateTask(task.id, { dueDate: date.getTime() })
  }
  function setAssignee(task: Task, assigneeId: string | null) {
    patchTask(task.id, { assigneeId })
    updateTask(task.id, { assigneeId })
  }
  function moveToList(task: Task, nextListId: string | null) {
    patchTask(task.id, { listId: nextListId })
    if (isInbox || (!isAll && nextListId !== listId)) {
      setActive(prev => prev.filter(x => x.id !== task.id))
      setExpandedId(null)
    }
    updateTask(task.id, { listId: nextListId })
  }

  function startRename(task: Task) {
    setExpandedId(null)
    setRenamingId(task.id)
    setRenameValue(task.title)
  }

  function commitRename(task: Task) {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== task.title) {
      patchTask(task.id, { title: trimmed })
      updateTask(task.id, { title: trimmed })
    }
    setRenamingId(null)
  }

  // ── List-level ops ──────────────────────────────────────────────────────────
  function toggleEditing() {
    setEditing(e => !e)
    setExpandedId(null)
    setRenamingId(null)
    if (canEditList) { setListName(title); setListColor(color) }
  }

  function saveListEdit() {
    if (!canEditList || !listName.trim()) return
    startTransition(async () => {
      await renameTaskList(listId, listName.trim(), listColor)
      setEditing(false)
      router.refresh()
    })
  }

  function handleDeleteList() {
    if (!canEditList) return
    startTransition(async () => {
      await deleteTaskList(listId)
      router.push('/household/tasks')
      router.refresh()
    })
  }

  function renderRow(task: Task, i: number, section: 'active' | 'completed') {
    const isExpanded = expandedId === task.id
    const isRenaming = renamingId === task.id
    const due = task.dueDate ? formatDue(new Date(task.dueDate)) : null
    const source = taskSources[task.id]
    return (
      <div key={task.id} className={i > 0 ? 'border-t border-border' : ''}>
        <SwipeRow onDelete={() => remove(task, section)}>
          <div className="flex items-center gap-3 px-4 py-2.5">
            {editing ? (
              <button onClick={() => remove(task, section)} className="shrink-0 active:opacity-60" aria-label="Delete">
                <span className="w-[22px] h-[22px] rounded-full bg-red flex items-center justify-center">
                  <span className="block w-[11px] h-[2.5px] bg-white rounded-full" />
                </span>
              </button>
            ) : section === 'active' ? (
              <button
                onClick={() => complete(task)}
                className="w-[22px] h-[22px] rounded-full border-2 border-border shrink-0 active:scale-90 transition-transform"
                aria-label="Complete"
              />
            ) : (
              <button
                onClick={() => uncomplete(task)}
                className="w-[22px] h-[22px] rounded-full shrink-0 flex items-center justify-center active:scale-90 transition-transform"
                style={{ background: color }}
                aria-label="Mark incomplete"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                  <path d="M4 10.5l4 4 8-9" />
                </svg>
              </button>
            )}

            <div className="flex-1 min-w-0">
              {isRenaming ? (
                <input
                  ref={renameRef}
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(task)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitRename(task) }
                    if (e.key === 'Escape') { e.preventDefault(); setRenamingId(null) }
                  }}
                  className="w-full bg-transparent text-[16px] text-text-1 outline-none py-0.5"
                />
              ) : (
                <button
                  onClick={() => { if (editing) return; if (section === 'active') startRename(task) }}
                  className="w-full min-w-0 text-left"
                >
                  <p className={`text-[16px] ${section === 'completed' ? 'text-text-2 line-through' : 'text-text-1'} truncate`}>
                    {task.title}
                  </p>
                  {due && (
                    <p className={`text-[12.5px] mt-0.5 ${due.overdue ? 'text-red' : 'text-text-2'}`}>{due.label}</p>
                  )}
                </button>
              )}
              {source && (
                <Link
                  href={source.href}
                  className="mt-1 inline-flex max-w-full items-center gap-1.5 text-[12px] font-medium text-accent active:opacity-60"
                >
                  <span className="shrink-0">{source.icon || '📋'}</span>
                  <span className="truncate">Linked to {source.title}</span>
                </Link>
              )}
            </div>

            {task.assigneeId && (
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
                style={{ background: userColor(task.assigneeId) }}
              >
                {userInitial(task.assigneeId)}
              </span>
            )}
            {section === 'active' && !editing && !isRenaming && (
              <button
                onClick={() => setExpandedId(isExpanded ? null : task.id)}
                className="shrink-0 text-text-3 active:opacity-60 -mr-1 p-1"
                aria-label="Show details"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                  className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </button>
            )}
          </div>
        </SwipeRow>

        {/* Inline detail editor */}
        {isExpanded && !editing && (
          <div className="px-4 pb-3 pl-[49px] flex flex-col gap-3">
            {/* Due date — iOS style: date first, then optional time */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px] text-text-1 shrink-0">Due Date</span>
                <div className="flex items-center gap-2">
                  {task.dueDate && (
                    <button onClick={() => setDueDate(task, '')} className="text-[13px] text-red active:opacity-60">
                      Clear
                    </button>
                  )}
                  {/* Chip label sits behind; native input sits on top, nearly invisible */}
                  <div className="relative">
                    <div className={`rounded-lg px-2.5 py-1.5 text-[14px] font-medium select-none ${task.dueDate ? 'bg-surface-2 text-accent' : 'bg-surface-2 text-text-2'}`}>
                      {task.dueDate ? toDisplayDate(new Date(task.dueDate)) : 'Add Date'}
                    </div>
                    <input
                      ref={dateInputRef}
                      type="date"
                      value={task.dueDate ? toInputDate(new Date(task.dueDate)) : ''}
                      onChange={e => setDueDate(task, e.target.value)}
                      className="absolute inset-0 w-full h-full cursor-pointer rounded-lg"
                      style={{ opacity: 0.01, colorScheme: 'light dark' }}
                    />
                  </div>
                </div>
              </div>

              {/* Time row — only appears once a date is set */}
              {task.dueDate && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[14px] text-text-1 shrink-0">Time</span>
                  <div className="flex items-center gap-2">
                    {hasSetTime(new Date(task.dueDate)) && (
                      <button onClick={() => clearTime(task)} className="text-[13px] text-red active:opacity-60">
                        Remove
                      </button>
                    )}
                    <div className="relative">
                      <div className={`rounded-lg px-2.5 py-1.5 text-[14px] font-medium select-none ${hasSetTime(new Date(task.dueDate)) ? 'bg-surface-2 text-accent' : 'bg-surface-2 text-text-2'}`}>
                        {hasSetTime(new Date(task.dueDate))
                          ? new Date(task.dueDate).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' })
                          : 'Add Time'}
                      </div>
                      <input
                        ref={timeInputRef}
                        type="time"
                        value={hasSetTime(new Date(task.dueDate)) ? toInputTime(new Date(task.dueDate)) : ''}
                        onChange={e => setDueTime(task, e.target.value)}
                        className="absolute inset-0 w-full h-full cursor-pointer rounded-lg"
                        style={{ opacity: 0.01, colorScheme: 'light dark' }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[14px] text-text-1">Assign to</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setAssignee(task, null)}
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-medium ${task.assigneeId == null ? 'bg-accent text-white' : 'bg-surface-2 text-text-1'}`}
                >
                  None
                </button>
                {users.map(u => (
                  <button
                    key={u.id}
                    onClick={() => setAssignee(task, u.id)}
                    className={`px-3 py-1.5 rounded-lg text-[13px] font-medium ${task.assigneeId === u.id ? 'bg-accent text-white' : 'bg-surface-2 text-text-1'}`}
                  >
                    {u.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[14px] text-text-1">List</span>
              <select
                value={task.listId ?? ''}
                onChange={e => moveToList(task, e.target.value || null)}
                className="bg-surface-2 rounded-lg px-2.5 py-1.5 text-[14px] text-text-1 outline-none max-w-[190px]"
              >
                <option value="">Inbox</option>
                {lists.map(list => (
                  <option key={list.id} value={list.id}>{list.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col max-w-lg mx-auto">
      {/* Nav bar */}
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <Link href="/household/tasks" className="flex items-center gap-1 text-accent active:opacity-60 -ml-1">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M10 3L5 8l5 5" />
          </svg>
          <span className="text-[16px]">Lists</span>
        </Link>
        <button onClick={toggleEditing} className="text-accent text-[16px] font-medium active:opacity-60 px-1">
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      {editing && canEditList ? (
        <div className="mx-4 mt-2 bg-surface rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-full shrink-0" style={{ background: listColor }} />
            <input
              autoFocus
              value={listName}
              onChange={e => setListName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveListEdit() }}
              placeholder="List name"
              className="flex-1 bg-transparent text-[17px] font-semibold text-text-1 placeholder:text-text-3 outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2.5 mb-4">
            {LIST_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setListColor(c)}
                className="w-8 h-8 rounded-full transition-transform active:scale-90"
                style={{ background: c, boxShadow: listColor === c ? `0 0 0 2.5px var(--surface), 0 0 0 4.5px ${c}` : 'none' }}
                aria-label={`Colour ${c}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={saveListEdit} disabled={!listName.trim() || isPending} className="flex-1 h-10 rounded-xl bg-accent text-white text-[15px] font-semibold active:opacity-80 disabled:opacity-40">
              Save
            </button>
          </div>
          <button onClick={handleDeleteList} disabled={isPending} className="mt-3 w-full h-10 rounded-xl text-[15px] font-medium text-red active:bg-surface-2 disabled:opacity-40">
            Delete List
          </button>
        </div>
      ) : (
        <>
          {/* Title */}
          <header className="px-5 pt-1 pb-3">
            <h1 className="text-[28px] font-bold tracking-tight" style={{ color }}>{title}</h1>
          </header>

          {/* Offline / sync status */}
          <SyncBanner pending={pending} isSyncing={isSyncing} />

          {/* Active tasks */}
          <div className="mx-4 bg-surface rounded-2xl overflow-hidden">
            {active.length === 0 && completed.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-[14px] text-text-2">No reminders</p>
              </div>
            )}
            {active.map((task, i) => renderRow(task, i, 'active'))}
          </div>

          {/* Add reminder */}
          {!isAll && (
            <div className="mx-4 mt-2 flex items-center gap-3 px-4 py-2.5 bg-surface rounded-2xl">
              <div className="w-[22px] h-[22px] rounded-full border-2 border-border shrink-0 opacity-40" />
              <input
                ref={inputRef}
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTask() }}
                onBlur={() => addTask(false)}
                placeholder={isInbox ? 'Add a task to inbox' : 'Add a reminder'}
                className="flex-1 bg-transparent text-[16px] text-text-1 placeholder:text-text-3 outline-none"
              />
            </div>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setShowCompleted(s => !s)}
                className="px-5 mb-2 flex items-center gap-1.5 text-text-2 active:opacity-60"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
                  className={`w-3.5 h-3.5 transition-transform ${showCompleted ? 'rotate-90' : ''}`}>
                  <path d="M6 4l4 4-4 4" />
                </svg>
                <span className="text-[14px] font-medium">{completed.length} Completed</span>
              </button>
              {showCompleted && (
                <div className="mx-4 bg-surface rounded-2xl overflow-hidden">
                  {completed.map((task, i) => renderRow(task, i, 'completed'))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="h-4" />
    </div>
  )
}
