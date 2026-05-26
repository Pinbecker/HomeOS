import { useMemo, useState } from 'react'
import { ScreenShell } from './shell'
import { enqueueMutation, getCurrentState, makeId, useAppState } from '../lib/app-store'

const LIST_COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#8E8E93'] as const
const DEFAULT_LIST_COLOR = '#007AFF'
const GENERAL_SHOPPING_ICON = 'general-shopping'

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-text-3 shrink-0">
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}

export function ShoppingOverviewPage() {
  const shops = useAppState(state => state.data.lists.filter(list => list.type === 'shopping' && !list.archived).sort((a, b) => a.sortOrder - b.sortOrder))
  const items = useAppState(state => state.data.listItems.filter(item => !item.deletedAt))
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(DEFAULT_LIST_COLOR)

  const general = shops.find(shop => shop.icon === GENERAL_SHOPPING_ICON)
  const shopSpecific = shops.filter(shop => shop.icon !== GENERAL_SHOPPING_ICON)
  const countFor = (id: string) => items.filter(item => item.listId === id && !item.checked).length
  const totalActive = items.filter(item => !item.checked).length

  async function createShop() {
    const trimmed = name.trim()
    if (!trimmed) return
    const id = makeId('shop')
    const householdId = getCurrentState().data.household[0]?.id ?? 'default'
    const payload = {
      id,
      householdId,
      name: trimmed,
      type: 'shopping',
      color,
      archived: false,
      sortOrder: shops.length,
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
      data: { ...prev.data, lists: [...prev.data.lists, payload] },
    }))

    setAdding(false)
    setName('')
    setColor(DEFAULT_LIST_COLOR)
  }

  return (
    <ScreenShell title="Shopping">
      <div className="mx-4 mb-5 bg-surface rounded-2xl overflow-hidden">
        <a href="/household/shopping/all" className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
          <div className="w-8 h-8 rounded-full bg-text-2 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px]">
              <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
              <path d="M2.5 3h2l2.2 11.2a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.6L21 6H6" />
            </svg>
          </div>
          <span className="flex-1 text-[16px] font-medium text-text-1">All Items</span>
          <span className="text-[15px] font-semibold text-text-2 mr-1">{totalActive}</span>
          <Chevron />
        </a>
        {general && (
          <a href={`/household/shopping/${general.id}`} className="flex items-center gap-3 px-4 py-3 border-t border-border active:bg-surface-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: general.color ?? '#34C759' }}>
              <svg viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="w-[14px] h-[14px]">
                <path d="M4 6h12M4 10h12M4 14h8" />
              </svg>
            </div>
            <span className="flex-1 text-[16px] font-medium text-text-1">General</span>
            <span className="text-[15px] font-semibold text-text-2 mr-1">{countFor(general.id)}</span>
            <Chevron />
          </a>
        )}
      </div>

      <p className="px-5 mb-2 text-[12px] font-bold uppercase tracking-wide text-text-3">Shops</p>
      {shopSpecific.length > 0 && (
        <div className="mx-4 bg-surface rounded-2xl overflow-hidden">
          {shopSpecific.map((shop, i) => (
            <a key={shop.id} href={`/household/shopping/${shop.id}`} className={`flex items-center gap-3 px-4 py-3 active:bg-surface-2 ${i > 0 ? 'border-t border-border' : ''}`}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: shop.color ?? '#34C759' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-[14px] h-[14px]">
                  <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
                  <path d="M2.5 3h2l2.2 11.2a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.6L21 6H6" />
                </svg>
              </div>
              <span className="flex-1 text-[16px] font-medium text-text-1 truncate">{shop.name}</span>
              <span className="text-[15px] font-semibold text-text-2 mr-1">{countFor(shop.id)}</span>
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
              onKeyDown={e => { if (e.key === 'Enter') createShop() }}
              placeholder="Shop name"
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
            <button onClick={createShop} disabled={!name.trim()} className="flex-1 h-10 rounded-xl bg-accent text-white text-[15px] font-semibold active:opacity-80 disabled:opacity-40">Add Shop</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mx-5 mt-3 flex items-center gap-2 text-accent active:opacity-60">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="w-4 h-4">
            <path d="M8 3v10M3 8h10" />
          </svg>
          <span className="text-[15px] font-medium">New Shop</span>
        </button>
      )}
    </ScreenShell>
  )
}

export function ShoppingDetailPage() {
  const pathname = typeof window === 'undefined' ? '' : window.location.pathname
  const shopId = pathname.split('/').pop() ?? 'all'
  const { shops, items } = useAppState(state => ({
    shops: state.data.lists.filter(list => list.type === 'shopping' && !list.archived).sort((a, b) => a.sortOrder - b.sortOrder),
    items: state.data.listItems.filter(item => !item.deletedAt),
  }))
  const [text, setText] = useState('')

  const isAll = shopId === 'all'
  const currentShop = isAll ? null : shops.find(shop => shop.id === shopId) ?? null
  const visibleItems = useMemo(() => isAll ? items : items.filter(item => item.listId === shopId), [isAll, items, shopId])
  const unchecked = visibleItems.filter(item => !item.checked)
  const checked = visibleItems.filter(item => item.checked)

  async function addItem() {
    const title = text.trim()
    const targetListId = isAll ? shops[0]?.id : shopId
    if (!title || !targetListId) return
    const id = makeId('shopping')
    const payload = {
      id,
      listId: targetListId,
      title,
      sortOrder: visibleItems.length,
      checked: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await enqueueMutation({
      id: makeId('mutation'),
      name: 'shopping.upsert',
      entityType: 'list_item',
      entityId: id,
      operation: 'upsert',
      payload,
    }, prev => ({
      ...prev,
      data: { ...prev.data, listItems: [...prev.data.listItems, payload] },
    }))

    setText('')
  }

  async function toggleItem(itemId: string) {
    const current = visibleItems.find(item => item.id === itemId)
    if (!current) return
    const payload = {
      ...current,
      checked: !current.checked,
      checkedAt: !current.checked ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    }
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'shopping.upsert',
      entityType: 'list_item',
      entityId: itemId,
      operation: 'upsert',
      payload,
    }, prev => ({
      ...prev,
      data: { ...prev.data, listItems: prev.data.listItems.map(row => row.id === itemId ? { ...row, ...payload } : row) },
    }))
  }

  async function deleteItem(itemId: string) {
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'shopping.delete',
      entityType: 'list_item',
      entityId: itemId,
      operation: 'delete',
      payload: null,
    }, prev => ({
      ...prev,
      data: { ...prev.data, listItems: prev.data.listItems.filter(row => row.id !== itemId) },
    }))
  }

  return (
    <ScreenShell title={isAll ? 'All Items' : (currentShop?.name ?? 'Shopping')}>
      <div className="px-4">
        <div className="mb-4">
          <form onSubmit={e => { e.preventDefault(); addItem().catch(() => undefined) }} className="flex gap-2">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={isAll ? 'Add item…' : `Add to ${currentShop?.name ?? 'shop'}…`}
              autoComplete="off"
              className="flex-1 h-12 bg-surface border border-border rounded-xl px-4 text-[14px] text-text-1 placeholder:text-text-3 font-medium outline-none focus:border-accent transition-colors"
            />
            <button type="submit" disabled={!text.trim()} className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center disabled:opacity-40">
              <span className="text-white text-xl leading-none">+</span>
            </button>
          </form>
        </div>

        {unchecked.length > 0 && (
          <div className="mb-3">
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-text-3">To get · {unchecked.length}</p>
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              {unchecked.map((item, i) => (
                <div key={item.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <button onClick={() => toggleItem(item.id)} className="h-5 w-5 rounded-[6px] border-[1.5px] border-border shrink-0" />
                  <span className="flex-1 text-[14.5px] font-medium text-text-1">{item.title}</span>
                  <button onClick={() => deleteItem(item.id)} className="text-[13px] font-medium text-red">Delete</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {checked.length > 0 && (
          <div className="mb-3">
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-text-3">Got it · {checked.length}</p>
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              {checked.map((item, i) => (
                <div key={item.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <button onClick={() => toggleItem(item.id)} className="h-5 w-5 rounded-[6px] border-[1.5px] border-accent bg-accent shrink-0" />
                  <span className="flex-1 text-[14.5px] font-medium text-text-2 line-through">{item.title}</span>
                  <button onClick={() => deleteItem(item.id)} className="text-[13px] font-medium text-red">Delete</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ScreenShell>
  )
}
