'use client'

import { useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import { addShoppingItem, toggleShoppingItem, clearAllChecked, deleteShoppingItem } from '../actions'
import { SwipeRow } from '@/components/ui/swipe-row'

type Item = { id: string; title: string; checked: boolean; shopId: string }
type Shop = { id: string; name: string; color: string; items: Item[] }

export function AllShopsView({ shops }: { shops: Shop[] }) {
  const [items, setItems] = useState<Item[]>(shops.flatMap(s => s.items))
  const [text, setText] = useState('')
  const [targetShop, setTargetShop] = useState(shops[0]?.id ?? '')
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const shopMeta = new Map(shops.map(s => [s.id, { name: s.name, color: s.color }]))
  const checked = items.filter(i => i.checked)

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const title = text.trim()
    if (!title || !targetShop) return
    setText('')
    const optimistic: Item = { id: `tmp-${Date.now()}`, title, checked: false, shopId: targetShop }
    setItems(prev => [...prev, optimistic])
    startTransition(async () => {
      const result = await addShoppingItem(targetShop, title)
      if (result.item) setItems(prev => prev.map(i => i.id === optimistic.id ? { ...result.item!, shopId: targetShop } : i))
    })
    inputRef.current?.focus()
  }

  function handleToggle(id: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, checked: !i.checked } : i))
    startTransition(() => toggleShoppingItem(id))
  }

  function handleClearAll() {
    setItems(prev => prev.filter(i => !i.checked))
    startTransition(() => clearAllChecked())
  }

  function handleDelete(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    startTransition(() => deleteShoppingItem(id))
  }

  return (
    <div className="flex flex-col max-w-lg mx-auto">
      <div className="px-3 pt-3 pb-1">
        <Link href="/household/shopping" className="flex items-center gap-1 text-accent active:opacity-60 -ml-1 w-fit">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M10 3L5 8l5 5" />
          </svg>
          <span className="text-[16px]">Shopping</span>
        </Link>
      </div>

      <header className="px-5 pt-1 pb-3 flex items-center justify-between">
        <h1 className="text-[28px] font-bold text-text-1 tracking-tight">All Items</h1>
        {checked.length > 0 && (
          <button onClick={handleClearAll} className="text-[12px] font-semibold text-text-2 active:opacity-60">
            Clear {checked.length} done
          </button>
        )}
      </header>

      {/* Quick add with shop picker */}
      <div className="mx-4 mb-4">
        {shops.length > 1 && (
          <div className="flex gap-1.5 mb-2 overflow-x-auto no-scrollbar">
            {shops.map(s => (
              <button
                key={s.id}
                onClick={() => setTargetShop(s.id)}
                className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap transition-colors ${
                  targetShop === s.id ? 'text-white' : 'bg-surface text-text-2 border border-border'
                }`}
                style={targetShop === s.id ? { background: s.color } : undefined}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={targetShop ? `Add to ${shopMeta.get(targetShop)?.name ?? 'shop'}…` : 'Add item…'}
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

      {/* Unchecked grouped by shop */}
      {shops.map(shop => {
        const shopUnchecked = items.filter(i => i.shopId === shop.id && !i.checked)
        if (shopUnchecked.length === 0) return null
        return (
          <div key={shop.id} className="mx-4 mb-3">
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: shop.color }} />
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-3">{shop.name} · {shopUnchecked.length}</p>
            </div>
            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
              {shopUnchecked.map((item, i) => (
                <SwipeRow key={item.id} onDelete={() => handleDelete(item.id)} className={i > 0 ? 'border-t border-border' : ''}>
                  <button
                    onClick={() => handleToggle(item.id)}
                    className="w-full flex items-center gap-3 px-4 py-[13px] active:bg-surface-2 transition-colors text-left"
                  >
                    <div className="w-5 h-5 rounded-[6px] border-[1.5px] border-border shrink-0" />
                    <span className="text-[14.5px] font-medium text-text-1">{item.title}</span>
                  </button>
                </SwipeRow>
              ))}
            </div>
          </div>
        )
      })}

      {/* Empty state */}
      {items.filter(i => !i.checked).length === 0 && (
        <div className="mx-4 bg-surface border border-border rounded-2xl px-5 py-8 text-center">
          <p className="text-[15px] font-semibold text-text-1 mb-1">Nothing to buy</p>
          <p className="text-[13px] text-text-2">Add items above or inside a shop</p>
        </div>
      )}

      {/* Checked across all shops */}
      {checked.length > 0 && (
        <div className="mx-4 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-3 mb-2 px-1">Got it · {checked.length}</p>
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            {checked.map((item, i) => (
              <SwipeRow key={item.id} onDelete={() => handleDelete(item.id)} className={i > 0 ? 'border-t border-border' : ''}>
                <button
                  onClick={() => handleToggle(item.id)}
                  className="w-full flex items-center gap-3 px-4 py-[13px] active:bg-surface-2 transition-colors text-left"
                >
                  <div className="w-5 h-5 rounded-[6px] bg-sage flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 10 10" fill="none" className="w-[10px] h-[10px]">
                      <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="flex-1 text-[14.5px] font-medium text-text-3 line-through">{item.title}</span>
                  <span className="text-[11px] font-medium shrink-0" style={{ color: shopMeta.get(item.shopId)?.color }}>
                    {shopMeta.get(item.shopId)?.name}
                  </span>
                </button>
              </SwipeRow>
            ))}
          </div>
        </div>
      )}

      <div className="h-4" />
    </div>
  )
}
