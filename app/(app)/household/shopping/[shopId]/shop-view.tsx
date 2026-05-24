'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ulid } from 'ulid'
import { renameShop, deleteShop, moveShoppingItem } from '../actions'
import { LIST_COLORS } from '../../tasks/colors'
import { SwipeRow } from '@/components/ui/swipe-row'
import { useSyncQueue } from '@/lib/hooks/use-sync-queue'
import { SyncBanner } from '@/components/features/offline/sync-banner'

type ListItem = { id: string; title: string; checked: boolean; checkedAt: Date | null }
type Shop = { id: string; name: string; color: string; isGeneral: boolean; items: ListItem[] }
type OtherShop = { id: string; name: string; color: string }

const SYNC_URL = '/api/sync/shopping'

export function ShopView({ shop, otherShops }: { shop: Shop; otherShops: OtherShop[] }) {
  const router = useRouter()
  const [items, setItems] = useState(shop.items)
  const [text, setText] = useState('')
  // useTransition only for shop-level ops (rename/delete) that need a server round-trip
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(shop.name)
  const [color, setColor] = useState(shop.color)
  const [movingItemId, setMovingItemId] = useState<string | null>(null)

  // ── Offline sync ──────────────────────────────────────────────────────────
  const { pending, isSyncing, enqueue } = useSyncQueue()

  // After a full sync completes, refresh to pull in any changes from the other user
  useEffect(() => {
    const handler = () => router.refresh()
    window.addEventListener('homeos:sync-complete', handler)
    return () => window.removeEventListener('homeos:sync-complete', handler)
  }, [router])

  // ── Item mutations — optimistic-first, queued for offline ─────────────────
  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const title = text.trim()
    if (!title) return
    const id = ulid()   // permanent ID generated client-side
    setText('')
    setItems(prev => [...prev, { id, title, checked: false, checkedAt: null }])
    enqueue(SYNC_URL, { op: 'add', id, listId: shop.id, title })
    inputRef.current?.focus()
  }

  function handleToggle(id: string) {
    // Compute the intended next state locally first, then send that exact value.
    // Sending the final state (not a blind "flip") means two users checking the
    // same item offline both enqueue { checked: true } — the second sync is a no-op.
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i
      const nextChecked = !i.checked
      enqueue(SYNC_URL, { op: 'set_checked', id, checked: nextChecked })
      return { ...i, checked: nextChecked, checkedAt: nextChecked ? new Date() : null }
    }))
  }

  function handleDeleteItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    enqueue(SYNC_URL, { op: 'delete', id })
  }

  function handleClearChecked() {
    setItems(prev => prev.filter(i => !i.checked))
    enqueue(SYNC_URL, { op: 'clear_checked', listId: shop.id })
  }

  // ── Shop-level ops — still use server actions (need server response) ───────
  function handleMove(itemId: string, targetListId: string) {
    setMovingItemId(null)
    setItems(prev => prev.filter(i => i.id !== itemId))
    startTransition(() => moveShoppingItem(itemId, targetListId))
  }

  function saveEdit() {
    if (!name.trim()) return
    startTransition(async () => {
      await renameShop(shop.id, name.trim(), color)
      setEditing(false)
      router.refresh()
    })
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteShop(shop.id)
      router.push('/household/shopping')
      router.refresh()
    })
  }

  const unchecked = items.filter(i => !i.checked)
  const checked   = items.filter(i => i.checked)

  return (
    <div className="flex flex-col max-w-lg mx-auto">
      {/* Nav bar */}
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <Link href="/household/shopping" className="flex items-center gap-1 text-accent active:opacity-60 -ml-1">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M10 3L5 8l5 5" />
          </svg>
          <span className="text-[16px]">Shopping</span>
        </Link>
        <button onClick={() => { setEditing(e => !e); setName(shop.name); setColor(shop.color) }} className="text-accent text-[16px] font-medium active:opacity-60 px-1">
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      {editing ? (
        <div className="mx-4 mt-2 bg-surface rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-full shrink-0" style={{ background: color }} />
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveEdit() }}
              placeholder="Shop name"
              className="flex-1 bg-transparent text-[17px] font-semibold text-text-1 placeholder:text-text-3 outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2.5 mb-4">
            {LIST_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-8 h-8 rounded-full transition-transform active:scale-90"
                style={{ background: c, boxShadow: color === c ? `0 0 0 2.5px var(--surface), 0 0 0 4.5px ${c}` : 'none' }}
                aria-label={`Colour ${c}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={saveEdit} disabled={!name.trim() || isPending} className="flex-1 h-10 rounded-xl bg-accent text-white text-[15px] font-semibold active:opacity-80 disabled:opacity-40">
              Save
            </button>
          </div>
          {!shop.isGeneral && (
            <button onClick={handleDelete} className="mt-3 w-full h-10 rounded-xl text-[15px] font-medium text-red active:bg-surface-2">
              Delete Shop
            </button>
          )}
        </div>
      ) : (
        <header className="px-5 pt-1 pb-3 flex items-center justify-between">
          <h1 className="text-[28px] font-bold tracking-tight" style={{ color: shop.color }}>{shop.name}</h1>
          {checked.length > 0 && (
            <button onClick={handleClearChecked} className="text-[12px] font-semibold text-text-2 active:opacity-60">
              Clear {checked.length} done
            </button>
          )}
        </header>
      )}

      {/* Offline / sync status */}
      {!editing && <SyncBanner pending={pending} isSyncing={isSyncing} />}

      {/* Quick add */}
      {!editing && (
        <div className="mx-4 mb-4">
          <form onSubmit={handleAdd} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Add item…"
              autoComplete="off"
              className="flex-1 h-12 bg-surface border border-border rounded-xl px-4 text-[14px] text-text-1 placeholder:text-text-3 font-medium outline-none focus:border-accent transition-colors"
            />
            <button
              type="submit"
              disabled={!text.trim()}
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
      )}

      {/* Items */}
      {!editing && (
        unchecked.length === 0 && checked.length === 0 ? (
          <div className="mx-4 bg-surface border border-border rounded-2xl px-5 py-8 text-center">
            <p className="text-[15px] font-semibold text-text-1 mb-1">Nothing here yet</p>
            <p className="text-[13px] text-text-2">Add items above to get started</p>
          </div>
        ) : (
          <>
            {unchecked.length > 0 && (
              <div className="mx-4 mb-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-3 mb-2 px-1">To get · {unchecked.length}</p>
                <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                  {unchecked.map((item, i) => (
                    <SwipeRow key={item.id} onDelete={() => handleDeleteItem(item.id)} className={i > 0 ? 'border-t border-border' : ''}>
                      <div className="flex items-center">
                        <button
                          onClick={() => handleToggle(item.id)}
                          className="flex-1 flex items-center gap-3 px-4 py-[13px] active:bg-surface-2 transition-colors text-left min-w-0"
                        >
                          <div className="w-5 h-5 rounded-[6px] border-[1.5px] border-border shrink-0" />
                          <span className="text-[14.5px] font-medium text-text-1 truncate">{item.title}</span>
                        </button>
                        {otherShops.length > 0 && (
                          <button
                            onClick={() => setMovingItemId(item.id)}
                            className="shrink-0 px-3 py-[13px] text-text-3 active:text-text-1"
                            aria-label="Move to another list"
                          >
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                              <path d="M4 10h12M10 4l6 6-6 6" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </SwipeRow>
                  ))}
                </div>
              </div>
            )}

            {checked.length > 0 && (
              <div className="mx-4 mb-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-3 mb-2 px-1">Got it · {checked.length}</p>
                <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                  {checked.map((item, i) => (
                    <SwipeRow key={item.id} onDelete={() => handleDeleteItem(item.id)} className={i > 0 ? 'border-t border-border' : ''}>
                      <div className="flex items-center">
                        <button
                          onClick={() => handleToggle(item.id)}
                          className="flex-1 flex items-center gap-3 px-4 py-[13px] active:bg-surface-2 transition-colors text-left min-w-0"
                        >
                          <div className="w-5 h-5 rounded-[6px] bg-sage flex items-center justify-center shrink-0">
                            <svg viewBox="0 0 10 10" fill="none" className="w-[10px] h-[10px]">
                              <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                          <span className="text-[14.5px] font-medium text-text-3 line-through truncate">{item.title}</span>
                        </button>
                        {otherShops.length > 0 && (
                          <button
                            onClick={() => setMovingItemId(item.id)}
                            className="shrink-0 px-3 py-[13px] text-text-3 active:text-text-1"
                            aria-label="Move to another list"
                          >
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                              <path d="M4 10h12M10 4l6 6-6 6" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </SwipeRow>
                  ))}
                </div>
              </div>
            )}
          </>
        )
      )}

      <div className="h-4" />

      {/* Move to list — bottom sheet */}
      {movingItemId && (
        <div
          className="fixed inset-0 z-[60] flex flex-col justify-end max-w-lg mx-auto"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setMovingItemId(null)}
        >
          <div
            className="bg-surface rounded-t-2xl shadow-xl flex flex-col max-h-[75vh] pb-[calc(env(safe-area-inset-bottom)+16px)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>
            <p className="text-[13px] font-semibold text-text-3 px-5 pt-2 pb-1 shrink-0">Move to</p>
            <div className="flex flex-col overflow-y-auto">
              {otherShops.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => handleMove(movingItemId, s.id)}
                  className={`flex items-center gap-3 px-5 py-4 active:bg-surface-2 transition-colors text-left ${i > 0 ? 'border-t border-border' : ''}`}
                >
                  <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="text-[16px] font-medium text-text-1">{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
