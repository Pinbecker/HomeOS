'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { ulid } from 'ulid'
import { createTask, toggleTask, deleteTask, updateTask } from '../actions'
import { SwipeRow } from '@/components/ui/swipe-row'

type Task = {
  id: string
  title: string
  dueDate: Date | null
  status: string
  listId: string | null
  assigneeId: string | null
}
type User = { id: string; name: string }

interface Props {
  listId: string
  isAll: boolean
  title: string
  color: string
  users: User[]
  initialActive: Task[]
  initialCompleted: Task[]
}

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
function formatDue(due: Date): { label: string; overdue: boolean } {
  const days = dayDiff(due)
  if (days < 0) {
    const label = due.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    return { label, overdue: true }
  }
  if (days === 0) return { label: 'Today', overdue: false }
  if (days === 1) return { label: 'Tomorrow', overdue: false }
  if (days < 7) return { label: due.toLocaleDateString('en-GB', { weekday: 'long' }), overdue: false }
  return { label: due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), overdue: false }
}

export function TaskListView({ listId, isAll, title, color, users, initialActive, initialCompleted }: Props) {
  const [active, setActive] = useState<Task[]>(initialActive)
  const [completed, setCompleted] = useState<Task[]>(initialCompleted)
  const [newTitle, setNewTitle] = useState('')
  const [editing, setEditing] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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

  function addTask() {
    const t = newTitle.trim()
    if (!t || isAll) return
    const tempId = ulid()
    setActive(prev => [...prev, { id: tempId, title: t, dueDate: null, status: 'active', listId, assigneeId: null }])
    setNewTitle('')
    inputRef.current?.focus()
    createTask(listId, t).then(res => {
      if (res?.id) patchTask(tempId, { id: res.id } as Partial<Task>)
    })
  }

  function complete(task: Task) {
    setActive(prev => prev.filter(x => x.id !== task.id))
    setCompleted(prev => [{ ...task, status: 'completed' }, ...prev])
    setExpandedId(null)
    toggleTask(task.id)
  }
  function uncomplete(task: Task) {
    setCompleted(prev => prev.filter(x => x.id !== task.id))
    setActive(prev => [...prev, { ...task, status: 'active' }])
    toggleTask(task.id)
  }
  function remove(task: Task, from: 'active' | 'completed') {
    if (from === 'active') setActive(prev => prev.filter(x => x.id !== task.id))
    else setCompleted(prev => prev.filter(x => x.id !== task.id))
    deleteTask(task.id)
  }

  function setDue(task: Task, value: string) {
    if (!value) { patchTask(task.id, { dueDate: null }); updateTask(task.id, { dueDate: null }); return }
    const [y, m, d] = value.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    patchTask(task.id, { dueDate: date })
    updateTask(task.id, { dueDate: date.getTime() })
  }
  function setAssignee(task: Task, assigneeId: string | null) {
    patchTask(task.id, { assigneeId })
    updateTask(task.id, { assigneeId })
  }

  function renderRow(task: Task, i: number, section: 'active' | 'completed') {
    const isExpanded = expandedId === task.id
    const due = task.dueDate ? formatDue(new Date(task.dueDate)) : null
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

          <button
            onClick={() => !editing && section === 'active' && setExpandedId(isExpanded ? null : task.id)}
            className="flex-1 min-w-0 text-left"
          >
            <p className={`text-[16px] ${section === 'completed' ? 'text-text-2 line-through' : 'text-text-1'} truncate`}>
              {task.title}
            </p>
            {due && (
              <p className={`text-[12.5px] mt-0.5 ${due.overdue ? 'text-red' : 'text-text-2'}`}>{due.label}</p>
            )}
          </button>

          {task.assigneeId && (
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
              style={{ background: userColor(task.assigneeId) }}
            >
              {userInitial(task.assigneeId)}
            </span>
          )}
        </div>
       </SwipeRow>

        {/* Inline detail editor */}
        {isExpanded && !editing && (
          <div className="px-4 pb-3 pl-[49px] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-text-1">Due date</span>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={task.dueDate ? toInputDate(new Date(task.dueDate)) : ''}
                  onChange={e => setDue(task, e.target.value)}
                  className="bg-surface-2 rounded-lg px-2.5 py-1.5 text-[14px] text-text-1 outline-none"
                />
                {task.dueDate && (
                  <button onClick={() => setDue(task, '')} className="text-[13px] text-red active:opacity-60">Clear</button>
                )}
              </div>
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
        <button onClick={() => { setEditing(e => !e); setExpandedId(null) }} className="text-accent text-[16px] font-medium active:opacity-60 px-1">
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      {/* Title */}
      <header className="px-5 pt-1 pb-3">
        <h1 className="text-[28px] font-bold tracking-tight" style={{ color }}>{title}</h1>
      </header>

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
            placeholder="Add a reminder"
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

      <div className="h-4" />
    </div>
  )
}
