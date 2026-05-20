'use client'

import { useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { addShoppingItem, toggleShoppingItem, clearChecked, renameShop, deleteShop } from '../actions'
import { LIST_COLORS } from '../../tasks/colors'

type ListItem = { id: string; title: string; checked: boolean; checkedAt: Date | null }
type Shop = { id: string; name: string; color: string; items: ListItem[] }

export function ShopView({ shop }: { shop: Shop }) {
  const router = useRouter()
  const [items, setItems] = useState(shop.items)
  const [text, setText] = useState('')
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(shop.name)
  const [color, setColor] = useState(shop.color)

  const unchecked = items.filter(i => !i.checked)
  const checked   = items.filter(i => i.checked)

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    const title = text.trim()
    setText('')
    const optimistic: ListItem = { id: `tmp-${Date.now()}`, title, checked: false, checkedAt: null }
    setItems(prev => [...prev, optimistic])
    startTransition(async () => {
      const result = await addShoppingItem(shop.id, title)
      if (result.item) setItems(prev => prev.map(i => i.id === optimistic.id ? result.item! : i))
    })
    inputRef.current?.focus()
  }

  function handleToggle(id: string) {
    setItems(prev => prev.map(i =>
      i.id === id ? { ...i, checked: !i.checked, checkedAt: !i.checked ? new Date() : null } : i
    ))
    startTransition(() => toggleShoppingItem(id))
  }

  function handleClearChecked() {
    setItems(prev => prev.filter(i => !i.checked))
    startTransition(() => clearChecked(shop.id))
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
          <button onClick={handleDelete} className="mt-3 w-full h-10 rounded-xl text-[15px] font-medium text-red active:bg-surface-2">
            Delete Shop
          </button>
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
                    <button
                      key={item.id}
                      onClick={() => handleToggle(item.id)}
                      className={`w-full flex items-center gap-3 px-4 py-[13px] active:bg-surface-2 transition-colors text-left ${i > 0 ? 'border-t border-border' : ''}`}
                    >
                      <div className="w-5 h-5 rounded-[6px] border-[1.5px] border-border shrink-0" />
                      <span className="text-[14.5px] font-medium text-text-1">{item.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {checked.length > 0 && (
              <div className="mx-4 mb-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-3 mb-2 px-1">Got it · {checked.length}</p>
                <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                  {checked.map((item, i) => (
                    <button
                      key={item.id}
                      onClick={() => handleToggle(item.id)}
                      className={`w-full flex items-center gap-3 px-4 py-[13px] active:bg-surface-2 transition-colors text-left ${i > 0 ? 'border-t border-border' : ''}`}
                    >
                      <div className="w-5 h-5 rounded-[6px] bg-sage flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 10 10" fill="none" className="w-[10px] h-[10px]">
                          <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <span className="text-[14.5px] font-medium text-text-3 line-through">{item.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )
      )}

      <div className="h-4" />
    </div>
  )
}
