import { useMemo, useState } from 'react'
import { ScreenShell } from './shell'
import { enqueueMutation, getCurrentState, makeId, useAppState } from '../lib/app-store'

const LIST_COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#8E8E93'] as const
const DEFAULT_LIST_COLOR = '#007AFF'

type TaskItem = {
  id: string
  title: string
  status: string
  listId?: string | null
  createdAt: string | number | Date
  updatedAt: string | number | Date
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
  const { list, items, users } = useAppState(state => {
    const lists = state.data.lists.filter(row => row.type === 'tasks' && !row.archived)
    const target = listId === 'all' || listId === 'inbox' ? null : lists.find(row => row.id === listId) ?? null
    const filtered = state.data.items
      .filter(row => row.type === 'task' && !row.deletedAt)
      .filter(row => listId === 'all' ? true : listId === 'inbox' ? !row.listId : row.listId === listId)
    return {
      list: target,
      items: filtered,
      users: state.data.users,
    }
  })

  const [newTitle, setNewTitle] = useState('')
  const active = useMemo(() => items.filter(item => item.status === 'active'), [items])
  const completed = useMemo(() => items.filter(item => item.status !== 'active'), [items])
  const title = listId === 'all' ? 'All' : listId === 'inbox' ? 'Inbox' : list?.name ?? 'Tasks'
  const color = list?.color ?? '#007AFF'

  async function addTask() {
    const trimmed = newTitle.trim()
    if (!trimmed || listId === 'all') return
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
      listId: listId === 'inbox' ? null : listId,
      assigneeId: null,
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
        items: [...prev.data.items, payload as TaskItem & typeof payload],
      },
    }))

    setNewTitle('')
  }

  async function setStatus(task: TaskItem, status: 'active' | 'completed') {
    const payload = {
      ...task,
      status,
      updatedAt: new Date().toISOString(),
      completedAt: status === 'completed' ? new Date().toISOString() : null,
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

  async function deleteTask(task: TaskItem) {
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

  return (
    <ScreenShell title={title}>
      <div className="px-4">
        <div className="mb-4 rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="h-3 w-3 rounded-full" style={{ background: color }} />
            <p className="text-[14px] font-semibold text-text-2">{title}</p>
          </div>
          {listId !== 'all' && (
            <div className="flex gap-2">
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTask() }}
                placeholder="Add task…"
                className="flex-1 h-12 bg-surface border border-border rounded-xl px-4 text-[14px] text-text-1 placeholder:text-text-3 font-medium outline-none focus:border-accent transition-colors"
              />
              <button onClick={addTask} disabled={!newTitle.trim()} className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center disabled:opacity-40">
                <span className="text-white text-xl leading-none">+</span>
              </button>
            </div>
          )}
        </div>

        {active.length > 0 && (
          <div className="mb-3">
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-text-3">To do · {active.length}</p>
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              {active.map((task, i) => (
                <div key={task.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <button onClick={() => setStatus(task, 'completed')} className="h-5 w-5 rounded-[6px] border-[1.5px] border-border shrink-0" />
                  <span className="flex-1 text-[14.5px] font-medium text-text-1">{task.title}</span>
                  <button onClick={() => deleteTask(task)} className="text-[13px] font-medium text-red">Delete</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {completed.length > 0 && (
          <div className="mb-3">
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-text-3">Done · {completed.length}</p>
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              {completed.map((task, i) => (
                <div key={task.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <button onClick={() => setStatus(task, 'active')} className="h-5 w-5 rounded-[6px] border-[1.5px] border-accent bg-accent shrink-0" />
                  <span className="flex-1 text-[14.5px] font-medium text-text-2 line-through">{task.title}</span>
                  <button onClick={() => deleteTask(task)} className="text-[13px] font-medium text-red">Delete</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ScreenShell>
  )
}
