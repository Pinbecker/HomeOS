import { useMemo, useRef, useState } from 'react'
import { ScreenShell } from './shell'
import { enqueueMutation, getCurrentState, makeId, useAppState } from '../lib/app-store'

const LIST_COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#8E8E93'] as const
const DEFAULT_LIST_COLOR = '#007AFF'

type TaskItem = {
  id: string
  householdId: string
  createdById: string
  title: string
  status: string
  listId?: string | null
  assigneeId?: string | null
  dueDate?: string | number | Date | null
  completedAt?: string | number | Date | null
  deletedAt?: string | number | Date | null
  createdAt: string | number | Date
  updatedAt: string | number | Date
}

const AVATAR_COLORS = ['#007AFF', '#FF2D55', '#34C759', '#AF52DE']

function toDate(value: string | number | Date | null | undefined) {
  if (!value) return null
  return value instanceof Date ? value : new Date(value)
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function dayDiff(due: Date) {
  return Math.round((startOfDay(due) - startOfDay(new Date())) / 86400000)
}

function toInputDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function toInputTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function hasSetTime(date: Date | null) {
  return Boolean(date && (date.getHours() !== 0 || date.getMinutes() !== 0))
}

function toDisplayDate(date: Date) {
  const days = dayDiff(date)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days > 1 && days < 7) return date.toLocaleDateString('en-GB', { weekday: 'long' })
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function formatDue(date: Date) {
  const days = dayDiff(date)
  const timeSuffix = hasSetTime(date)
    ? ` · ${date.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' })}`
    : ''
  if (days < 0) {
    return {
      label: date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + timeSuffix,
      overdue: true,
    }
  }
  if (days === 0) return { label: `Today${timeSuffix}`, overdue: false }
  if (days === 1) return { label: `Tomorrow${timeSuffix}`, overdue: false }
  if (days < 7) return { label: date.toLocaleDateString('en-GB', { weekday: 'long' }) + timeSuffix, overdue: false }
  return { label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + timeSuffix, overdue: false }
}

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-text-3 shrink-0">
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}

export function TasksOverviewPage() {
  const { lists, items } = useAppState(state => ({
    lists: state.data.lists.filter(list => list.type === 'tasks' && !list.archived).sort((a, b) => a.sortOrder - b.sortOrder),
    items: state.data.items.filter(item => item.type === 'task' && item.status === 'active' && !item.deletedAt),
  }))

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(DEFAULT_LIST_COLOR)

  const counts = new Map<string, number>()
  let inboxCount = 0
  for (const task of items) {
    if (task.listId) counts.set(task.listId, (counts.get(task.listId) ?? 0) + 1)
    else inboxCount += 1
  }

  async function createList() {
    const trimmed = name.trim()
    if (!trimmed) return
    const id = makeId('list')
    const householdId = getCurrentState().data.household[0]?.id ?? 'default'
    const payload = {
      id,
      householdId,
      name: trimmed,
      type: 'tasks',
      color,
      archived: false,
      sortOrder: lists.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await enqueueMutation({
      id: makeId('mutation'),
      name: 'list.upsert',
      entityType: 'list',
      entityId: id,
      operation: 'upsert',
      payload,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        lists: [...prev.data.lists, payload],
      },
    }))

    setAdding(false)
    setName('')
    setColor(DEFAULT_LIST_COLOR)
  }

  return (
    <ScreenShell title="Tasks">
      <div className="mx-4 mb-5 bg-surface rounded-2xl overflow-hidden">
        <a href="/household/tasks/all" className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
          <div className="w-8 h-8 rounded-full bg-text-2 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="w-[14px] h-[14px]">
              <path d="M4 6h12M4 10h12M4 14h12" />
            </svg>
          </div>
          <span className="flex-1 text-[16px] font-medium text-text-1">All</span>
          <span className="text-[15px] font-semibold text-text-2 mr-1">{items.length}</span>
          <Chevron />
        </a>
        <a href="/household/tasks/inbox" className="flex items-center gap-3 px-4 py-3 border-t border-border active:bg-surface-2">
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0">
            <svg viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" className="w-[14px] h-[14px]">
              <polyline points="2 12 6 12 8 15 12 15 14 12 18 12" />
              <path d="M5.5 5H3l1.5 7h11L17 5h-2.5" />
            </svg>
          </div>
          <span className="flex-1 text-[16px] font-medium text-text-1">Inbox</span>
          <span className="text-[15px] font-semibold text-text-2 mr-1">{inboxCount}</span>
          <Chevron />
        </a>
      </div>

      <p className="px-5 mb-2 text-[12px] font-bold uppercase tracking-wide text-text-3">My Lists</p>

      {lists.length > 0 && (
        <div className="mx-4 bg-surface rounded-2xl overflow-hidden">
          {lists.map((list, i) => (
            <a key={list.id} href={`/household/tasks/${list.id}`} className={`flex items-center gap-3 px-4 py-3 active:bg-surface-2 ${i > 0 ? 'border-t border-border' : ''}`}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: list.color ?? DEFAULT_LIST_COLOR }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="w-[13px] h-[13px]">
                  <path d="M4 10.5l4 4 8-9" />
                </svg>
              </div>
              <span className="flex-1 text-[16px] font-medium text-text-1 truncate">{list.name}</span>
              <span className="text-[15px] font-semibold text-text-2 mr-1">{counts.get(list.id) ?? 0}</span>
              <Chevron />
            </a>
          ))}
        </div>
      )}

      {adding ? (
        <div className="mx-4 mt-3 bg-surface rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-full shrink-0" style={{ background: color }} />
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createList() }}
              placeholder="List name"
              className="flex-1 bg-transparent text-[17px] font-semibold text-text-1 placeholder:text-text-3 outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2.5 mb-4">
            {LIST_COLORS.map(nextColor => (
              <button
                key={nextColor}
                onClick={() => setColor(nextColor)}
                className="w-8 h-8 rounded-full transition-transform active:scale-90"
                style={{ background: nextColor, boxShadow: color === nextColor ? `0 0 0 2.5px var(--surface), 0 0 0 4.5px ${nextColor}` : 'none' }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setAdding(false); setName('') }} className="flex-1 h-10 rounded-xl bg-surface-2 text-[15px] font-semibold text-text-1 active:opacity-70">Cancel</button>
            <button onClick={createList} disabled={!name.trim()} className="flex-1 h-10 rounded-xl bg-accent text-white text-[15px] font-semibold active:opacity-80 disabled:opacity-40">Add List</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mx-5 mt-3 flex items-center gap-2 text-accent active:opacity-60">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="w-4 h-4">
            <path d="M8 3v10M3 8h10" />
          </svg>
          <span className="text-[15px] font-medium">New List</span>
        </button>
      )}
    </ScreenShell>
  )
}

export function TaskDetailPage() {
  const pathname = typeof window === 'undefined' ? '' : window.location.pathname
  const listId = pathname.split('/').pop() ?? 'all'
  const { list, lists, items, users } = useAppState(state => {
    const lists = state.data.lists.filter(row => row.type === 'tasks' && !row.archived)
    const target = listId === 'all' || listId === 'inbox' ? null : lists.find(row => row.id === listId) ?? null
    const filtered = state.data.items
      .filter(row => row.type === 'task' && !row.deletedAt)
      .filter(row => listId === 'all' ? true : listId === 'inbox' ? !row.listId : row.listId === listId)
    return {
      list: target,
      lists: lists.sort((a, b) => a.sortOrder - b.sortOrder),
      items: filtered as TaskItem[],
      users: state.data.users,
    }
  })

  const [newTitle, setNewTitle] = useState('')
  const newTitleRef = useRef('')
  const inputRef = useRef<HTMLInputElement>(null)
  const renameRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [listName, setListName] = useState(list?.name ?? '')
  const [listColor, setListColor] = useState(list?.color ?? DEFAULT_LIST_COLOR)
  const [showCompleted, setShowCompleted] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const active = useMemo(() => items.filter(item => item.status === 'active'), [items])
  const completed = useMemo(() => items.filter(item => item.status !== 'active'), [items])
  const title = listId === 'all' ? 'All' : listId === 'inbox' ? 'Inbox' : list?.name ?? 'Tasks'
  const color = list?.color ?? DEFAULT_LIST_COLOR
  const isAll = listId === 'all'
  const isInbox = listId === 'inbox'
  const canEditList = Boolean(list && !isAll && !isInbox)

  function userColor(id: string | null | undefined) {
    if (!id) return '#8E8E93'
    const index = users.findIndex(user => user.id === id)
    return AVATAR_COLORS[index % AVATAR_COLORS.length] ?? '#8E8E93'
  }

  function userInitial(id: string | null | undefined) {
    const user = users.find(row => row.id === id)
    return user ? user.name.charAt(0).toUpperCase() : ''
  }

  async function addTask(refocus = false) {
    const trimmed = newTitleRef.current.trim()
    if (!trimmed || isAll) return
    newTitleRef.current = ''
    const id = makeId('task')
    const householdId = getCurrentState().data.household[0]?.id ?? 'default'
    const createdById = users[0]?.id ?? 'system'
    const payload = {
      id,
      householdId,
      createdById,
      type: 'task',
      title: trimmed,
      status: 'active',
      listId: isInbox ? null : listId,
      assigneeId: null,
      dueDate: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await enqueueMutation({
      id: makeId('mutation'),
      name: 'task.upsert',
      entityType: 'item',
      entityId: id,
      operation: 'upsert',
      payload,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        items: [...prev.data.items, payload],
      },
    }))

    setNewTitle('')
    if (refocus) inputRef.current?.focus()
  }

  async function updateTask(task: TaskItem, patch: Partial<TaskItem>) {
    const payload = {
      ...task,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'task.upsert',
      entityType: 'item',
      entityId: task.id,
      operation: 'upsert',
      payload,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        items: prev.data.items.map(row => row.id === task.id ? { ...row, ...payload } : row),
      },
    }))
  }

  async function setStatus(task: TaskItem, status: 'active' | 'completed') {
    setExpandedId(null)
    await updateTask(task, {
      status,
      completedAt: status === 'completed' ? new Date().toISOString() : null,
    })
  }

  async function deleteTask(task: TaskItem) {
    setExpandedId(null)
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'task.delete',
      entityType: 'item',
      entityId: task.id,
      operation: 'delete',
      payload: null,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        items: prev.data.items.filter(row => row.id !== task.id),
      },
    }))
  }

  async function setDueDate(task: TaskItem, dateString: string) {
    if (!dateString) {
      await updateTask(task, { dueDate: null })
      return
    }
    const [year, month, day] = dateString.split('-').map(Number)
    const existing = toDate(task.dueDate)
    const date = new Date(year, month - 1, day, existing?.getHours() ?? 0, existing?.getMinutes() ?? 0)
    await updateTask(task, { dueDate: date.toISOString() })
  }

  async function setDueTime(task: TaskItem, timeString: string) {
    const existing = toDate(task.dueDate)
    if (!existing) return
    const [hour, minute] = timeString ? timeString.split(':').map(Number) : [0, 0]
    const date = new Date(existing.getFullYear(), existing.getMonth(), existing.getDate(), hour, minute)
    await updateTask(task, { dueDate: date.toISOString() })
  }

  async function clearTime(task: TaskItem) {
    const existing = toDate(task.dueDate)
    if (!existing) return
    const date = new Date(existing.getFullYear(), existing.getMonth(), existing.getDate(), 0, 0)
    await updateTask(task, { dueDate: date.toISOString() })
  }

  async function setAssignee(task: TaskItem, assigneeId: string | null) {
    await updateTask(task, { assigneeId })
  }

  async function moveToList(task: TaskItem, nextListId: string | null) {
    await updateTask(task, { listId: nextListId })
    if (isInbox || (!isAll && nextListId !== listId)) {
      setExpandedId(null)
    }
  }

  function startRename(task: TaskItem) {
    setExpandedId(null)
    setRenamingId(task.id)
    setRenameValue(task.title)
    window.setTimeout(() => renameRef.current?.focus(), 0)
  }

  async function commitRename(task: TaskItem) {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== task.title) {
      await updateTask(task, { title: trimmed })
    }
    setRenamingId(null)
  }

  function toggleEditing() {
    setEditing(prev => !prev)
    setExpandedId(null)
    setRenamingId(null)
    if (canEditList) {
      setListName(list?.name ?? '')
      setListColor(list?.color ?? DEFAULT_LIST_COLOR)
    }
  }

  async function saveListEdit() {
    if (!list || !listName.trim()) return
    const payload = {
      ...list,
      name: listName.trim(),
      color: listColor,
      updatedAt: new Date().toISOString(),
    }

    await enqueueMutation({
      id: makeId('mutation'),
      name: 'list.upsert',
      entityType: 'list',
      entityId: list.id,
      operation: 'upsert',
      payload,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        lists: prev.data.lists.map(row => row.id === list.id ? { ...row, ...payload } : row),
      },
    }))

    setEditing(false)
  }

  async function deleteList() {
    if (!list) return
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'list.delete',
      entityType: 'list',
      entityId: list.id,
      operation: 'delete',
      payload: null,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        lists: prev.data.lists.map(row => row.id === list.id ? { ...row, archived: true, updatedAt: new Date().toISOString() } : row),
      },
    }))

    window.location.href = '/household/tasks'
  }

  function TaskRow({ task, index, section }: { task: TaskItem; index: number; section: 'active' | 'completed' }) {
    const isExpanded = expandedId === task.id
    const isRenaming = renamingId === task.id
    const dueDate = toDate(task.dueDate)
    const due = dueDate ? formatDue(dueDate) : null

    return (
      <div className={index > 0 ? 'border-t border-border' : ''}>
        <div className="flex items-center gap-3 px-4 py-2.5">
          {editing ? (
            <button onClick={() => deleteTask(task)} className="shrink-0 active:opacity-60" aria-label="Delete">
              <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-red">
                <span className="block h-[2.5px] w-[11px] rounded-full bg-white" />
              </span>
            </button>
          ) : section === 'active' ? (
            <button
              onClick={() => setStatus(task, 'completed')}
              className="h-[22px] w-[22px] shrink-0 rounded-full border-2 border-border transition-transform active:scale-90"
              aria-label="Complete"
            />
          ) : (
            <button
              onClick={() => setStatus(task, 'active')}
              className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full transition-transform active:scale-90"
              style={{ background: color }}
              aria-label="Mark incomplete"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                <path d="M4 10.5l4 4 8-9" />
              </svg>
            </button>
          )}

          <div className="min-w-0 flex-1">
            {isRenaming ? (
              <input
                ref={renameRef}
                value={renameValue}
                onChange={event => setRenameValue(event.target.value)}
                onBlur={() => { commitRename(task).catch(() => undefined) }}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitRename(task).catch(() => undefined)
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setRenamingId(null)
                  }
                }}
                className="w-full bg-transparent py-0.5 text-[16px] text-text-1 outline-none"
              />
            ) : (
              <button
                onClick={() => { if (!editing && section === 'active') startRename(task) }}
                className="w-full min-w-0 text-left"
              >
                <p className={`truncate text-[16px] ${section === 'completed' ? 'text-text-2 line-through' : 'text-text-1'}`}>{task.title}</p>
                {due ? (
                  <p className={`mt-0.5 text-[12.5px] ${due.overdue ? 'text-red' : 'text-text-2'}`}>{due.label}</p>
                ) : null}
              </button>
            )}
          </div>

          {task.assigneeId ? (
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
              style={{ background: userColor(task.assigneeId) }}
            >
              {userInitial(task.assigneeId)}
            </span>
          ) : null}

          {section === 'active' && !editing && !isRenaming ? (
            <button
              onClick={() => setExpandedId(isExpanded ? null : task.id)}
              className="-mr-1 shrink-0 p-1 text-text-3 active:opacity-60"
              aria-label="Show details"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                <path d="M6 4l4 4-4 4" />
              </svg>
            </button>
          ) : null}
        </div>

        {isExpanded && !editing ? (
          <div className="px-3 pb-3">
            <div className="overflow-hidden rounded-2xl bg-surface-2">
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="shrink-0 text-[13px] text-text-2">Due Date</span>
                <div className="flex items-center gap-2">
                  {dueDate ? <button onClick={() => setDueDate(task, '')} className="text-[13px] text-red active:opacity-60">Clear</button> : null}
                  <div className="relative">
                    <div className={`select-none rounded-lg px-2.5 py-1.5 text-[13px] font-medium ${dueDate ? 'bg-surface text-accent' : 'bg-surface text-text-3'}`}>
                      {dueDate ? toDisplayDate(dueDate) : 'Add Date'}
                    </div>
                    <input
                      type="date"
                      key={`date-${task.id}-${dueDate ? toInputDate(dueDate) : 'none'}`}
                      defaultValue={dueDate ? toInputDate(dueDate) : ''}
                      onBlur={event => {
                        const next = event.currentTarget.value
                        if (next !== (dueDate ? toInputDate(dueDate) : '')) {
                          setDueDate(task, next)
                        }
                      }}
                      className="absolute inset-0 h-full w-full cursor-pointer rounded-lg"
                      style={{ opacity: 0.01, colorScheme: 'light dark' }}
                    />
                  </div>
                </div>
              </div>

              {dueDate ? (
                <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
                  <span className="shrink-0 text-[13px] text-text-2">Time</span>
                  <div className="flex items-center gap-2">
                    {hasSetTime(dueDate) ? <button onClick={() => clearTime(task)} className="text-[13px] text-red active:opacity-60">Remove</button> : null}
                    <div className="relative">
                      <div className={`select-none rounded-lg px-2.5 py-1.5 text-[13px] font-medium ${hasSetTime(dueDate) ? 'bg-surface text-accent' : 'bg-surface text-text-3'}`}>
                        {hasSetTime(dueDate) ? dueDate.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' }) : 'Add Time'}
                      </div>
                      <input
                        type="time"
                        key={`time-${task.id}-${hasSetTime(dueDate) ? toInputTime(dueDate) : 'none'}`}
                        defaultValue={hasSetTime(dueDate) ? toInputTime(dueDate) : ''}
                        onBlur={event => {
                          const next = event.currentTarget.value
                          if (next !== (hasSetTime(dueDate) ? toInputTime(dueDate) : '')) {
                            setDueTime(task, next)
                          }
                        }}
                        className="absolute inset-0 h-full w-full cursor-pointer rounded-lg"
                        style={{ opacity: 0.01, colorScheme: 'light dark' }}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
                <span className="shrink-0 text-[13px] text-text-2">Assign to</span>
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  <button
                    onClick={() => setAssignee(task, null)}
                    className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${task.assigneeId == null ? 'bg-accent text-white' : 'bg-surface text-text-1'}`}
                  >
                    None
                  </button>
                  {users.map(user => (
                    <button
                      key={user.id}
                      onClick={() => setAssignee(task, user.id)}
                      className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${task.assigneeId === user.id ? 'bg-accent text-white' : 'bg-surface text-text-1'}`}
                    >
                      {user.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
                <span className="shrink-0 text-[13px] text-text-2">List</span>
                <select
                  value={task.listId ?? ''}
                  onChange={event => moveToList(task, event.target.value || null)}
                  className="max-w-[160px] rounded-lg bg-surface px-2.5 py-1.5 text-[13px] text-text-1 outline-none"
                >
                  <option value="">Inbox</option>
                  {lists.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <ScreenShell title={title} showHeader={false}>
      <div className="safe-top flex flex-col">
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          <a href="/household/tasks" className="-ml-1 flex items-center gap-1 text-accent active:opacity-60">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M10 3L5 8l5 5" />
            </svg>
            <span className="text-[16px]">Lists</span>
          </a>
          <button onClick={toggleEditing} className="px-1 text-[16px] font-medium text-accent active:opacity-60">
            {editing ? 'Done' : 'Edit'}
          </button>
        </div>

        {editing && canEditList ? (
          <div className="mx-4 mt-2 rounded-2xl bg-surface p-4">
            <div className="mb-4 flex items-center gap-3">
              <div className="h-9 w-9 shrink-0 rounded-full" style={{ background: listColor }} />
              <input
                autoFocus
                value={listName}
                onChange={event => setListName(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') saveListEdit() }}
                placeholder="List name"
                className="flex-1 bg-transparent text-[17px] font-semibold text-text-1 placeholder:text-text-3 outline-none"
              />
            </div>
            <div className="mb-4 flex flex-wrap gap-2.5">
              {LIST_COLORS.map(nextColor => (
                <button
                  key={nextColor}
                  onClick={() => setListColor(nextColor)}
                  className="h-8 w-8 rounded-full transition-transform active:scale-90"
                  style={{ background: nextColor, boxShadow: listColor === nextColor ? `0 0 0 2.5px var(--surface), 0 0 0 4.5px ${nextColor}` : 'none' }}
                  aria-label={`Colour ${nextColor}`}
                />
              ))}
            </div>
            <button onClick={saveListEdit} disabled={!listName.trim()} className="h-10 w-full rounded-xl bg-accent text-[15px] font-semibold text-white active:opacity-80 disabled:opacity-40">
              Save
            </button>
            <button onClick={deleteList} className="mt-3 h-10 w-full rounded-xl text-[15px] font-medium text-red active:bg-surface-2">
              Delete List
            </button>
          </div>
        ) : (
          <>
            <header className="px-5 pt-1 pb-3">
              <h1 className="text-[28px] font-bold tracking-tight" style={{ color }}>{title}</h1>
            </header>

            <div className="mx-4 overflow-hidden rounded-2xl bg-surface">
              {active.length === 0 && completed.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-[14px] text-text-2">No reminders</p>
                </div>
              ) : null}
              {active.map((task, index) => <TaskRow key={task.id} task={task} index={index} section="active" />)}
            </div>

            {!isAll ? (
              <div className="mx-4 mt-2 flex items-center gap-3 rounded-2xl bg-surface px-4 py-2.5">
                <div className="h-[22px] w-[22px] shrink-0 rounded-full border-2 border-border opacity-40" />
                <input
                  ref={inputRef}
                  value={newTitle}
                  onChange={event => {
                    setNewTitle(event.target.value)
                    newTitleRef.current = event.target.value
                  }}
                  onKeyDown={event => { if (event.key === 'Enter') addTask(true) }}
                  onBlur={() => { addTask(false).catch(() => undefined) }}
                  placeholder={isInbox ? 'Add a task to inbox' : 'Add a reminder'}
                  className="flex-1 bg-transparent text-[16px] text-text-1 placeholder:text-text-3 outline-none"
                />
              </div>
            ) : null}

            {completed.length > 0 ? (
              <div className="mt-6">
                <button onClick={() => setShowCompleted(prev => !prev)} className="mb-2 flex items-center gap-1.5 px-5 text-text-2 active:opacity-60">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 transition-transform ${showCompleted ? 'rotate-90' : ''}`}>
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                  <span className="text-[14px] font-medium">{completed.length} Completed</span>
                </button>
                {showCompleted ? (
                  <div className="mx-4 overflow-hidden rounded-2xl bg-surface">
                    {completed.map((task, index) => <TaskRow key={task.id} task={task} index={index} section="completed" />)}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}

        <div className="h-4" />
      </div>
    </ScreenShell>
  )
}
