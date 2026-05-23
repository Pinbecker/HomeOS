'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createShop } from './actions'
import { LIST_COLORS, DEFAULT_LIST_COLOR } from '../tasks/colors'

type ShopCard = { id: string; name: string; color: string; count: number; isGeneral: boolean }

export function ShoppingOverview({ shops, totalActive }: { shops: ShopCard[]; totalActive: number }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(DEFAULT_LIST_COLOR)
  const [pending, startTransition] = useTransition()
  const general = shops.find(shop => shop.isGeneral)
  const shopSpecific = shops.filter(shop => !shop.isGeneral)

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    startTransition(async () => {
      await createShop(trimmed, color)
      setName('')
      setColor(DEFAULT_LIST_COLOR)
      setAdding(false)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col max-w-lg mx-auto">
      <header className="px-5 pt-5 pb-3">
        <h1 className="text-[28px] font-bold text-text-1 tracking-tight">Shopping</h1>
      </header>

      {/* Smart lists */}
      <div className="mx-4 mb-5 flex flex-col gap-2">
        <Link
          href="/household/shopping/all"
          className="bg-surface rounded-xl px-3.5 py-3 flex items-center gap-3 active:opacity-60 transition-opacity"
        >
          <div className="w-8 h-8 rounded-full bg-text-2 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px]">
              <circle cx="8" cy="21" r="1" />
              <circle cx="19" cy="21" r="1" />
              <path d="M2.5 3h2l2.2 11.2a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.6L21 6H6" />
            </svg>
          </div>
          <span className="flex-1 text-[16px] font-medium text-text-1">All Items</span>
          <span className="text-[16px] font-medium text-text-2">{totalActive}</span>
        </Link>

        {general && (
          <Link
            href={`/household/shopping/${general.id}`}
            className="bg-surface rounded-xl px-3.5 py-3 flex items-center gap-3 active:opacity-60 transition-opacity"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: general.color }}>
              <svg viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px]">
                <path d="M4 6h12M4 10h12M4 14h8" />
              </svg>
            </div>
            <span className="flex-1 text-[16px] font-medium text-text-1">General</span>
            <span className="text-[16px] font-medium text-text-2">{general.count}</span>
          </Link>
        )}
      </div>

      <p className="px-5 mb-2 text-[13px] font-semibold text-text-2">Shops</p>

      <div className="mx-4 grid grid-cols-2 gap-3">
        {shopSpecific.map(s => (
          <Link
            key={s.id}
            href={`/household/shopping/${s.id}`}
            className="bg-surface rounded-2xl p-3.5 active:opacity-60 transition-opacity"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: s.color }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px]">
                  <circle cx="8" cy="21" r="1" />
                  <circle cx="19" cy="21" r="1" />
                  <path d="M2.5 3h2l2.2 11.2a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.6L21 6H6" />
                </svg>
              </div>
              <span className="text-[20px] font-bold text-text-1 leading-none">{s.count}</span>
            </div>
            <p className="text-[15px] font-semibold text-text-1 truncate">{s.name}</p>
          </Link>
        ))}
      </div>

      {shopSpecific.length === 0 && (
        <div className="mx-4 bg-surface rounded-2xl px-4 py-6 text-center">
          <p className="text-[14px] text-text-2">Add shops when you want specific lists.</p>
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
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
              placeholder="Shop name (e.g. Tesco)"
              className="flex-1 bg-transparent text-[17px] font-semibold text-text-1 placeholder:text-text-3 outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2.5 mb-4">
            {LIST_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-8 h-8 rounded-full transition-transform active:scale-90"
                style={{
                  background: c,
                  boxShadow: color === c ? `0 0 0 2.5px var(--surface), 0 0 0 4.5px ${c}` : 'none',
                }}
                aria-label={`Colour ${c}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setAdding(false); setName('') }}
              className="flex-1 h-10 rounded-xl bg-surface-2 text-[15px] font-semibold text-text-1 active:opacity-70"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!name.trim() || pending}
              className="flex-1 h-10 rounded-xl bg-accent text-white text-[15px] font-semibold active:opacity-80 disabled:opacity-40"
            >
              {pending ? 'Adding…' : 'Add Shop'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mx-5 mt-4 flex items-center gap-2 text-accent active:opacity-60"
        >
          <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center">
            <svg viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" className="w-3.5 h-3.5">
              <path d="M8 3.5v9M3.5 8h9" />
            </svg>
          </div>
          <span className="text-[16px] font-medium">Add Shop</span>
        </button>
      )}

      <div className="h-4" />
    </div>
  )
}
