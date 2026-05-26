import { useMemo, useRef, useState } from 'react'
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
  const textRef = useRef('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [movingItemId, setMovingItemId] = useState<string | null>(null)

  const isAll = shopId === 'all'
  const currentShop = isAll ? null : shops.find(shop => shop.id === shopId) ?? null
  const visibleItems = useMemo(() => isAll ? items : items.filter(item => item.listId === shopId), [isAll, items, shopId])
  const unchecked = visibleItems.filter(item => !item.checked)
  const checked = visibleItems.filter(item => item.checked)
  const [name, setName] = useState(currentShop?.name ?? '')
  const [color, setColor] = useState(currentShop?.color ?? DEFAULT_LIST_COLOR)
  const otherShops = isAll ? [] : shops.filter(shop => shop.id !== shopId)
  const canEdit = Boolean(currentShop && currentShop.icon !== GENERAL_SHOPPING_ICON)

  async function addItem(refocus = false) {
    const title = textRef.current.trim()
    const targetListId = isAll ? shops[0]?.id : shopId
    if (!title || !targetListId) return
    textRef.current = ''
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
    if (refocus) inputRef.current?.focus()
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

  async function moveItem(itemId: string, targetListId: string) {
    const current = visibleItems.find(item => item.id === itemId)
    if (!current) return
    setMovingItemId(null)

    const payload = {
      ...current,
      listId: targetListId,
      sortOrder: items.filter(item => item.listId === targetListId).length,
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
      data: {
        ...prev.data,
        listItems: prev.data.listItems.map(row => row.id === itemId ? { ...row, ...payload } : row),
      },
    }))
  }

  async function clearChecked() {
    for (const item of checked) {
      await deleteItem(item.id)
    }
  }

  async function saveShop() {
    if (!currentShop || !name.trim()) return
    const payload = {
      ...currentShop,
      name: name.trim(),
      color,
      updatedAt: new Date().toISOString(),
    }

    await enqueueMutation({
      id: makeId('mutation'),
      name: 'list.upsert',
      entityType: 'list',
      entityId: currentShop.id,
      operation: 'upsert',
      payload,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        lists: prev.data.lists.map(row => row.id === currentShop.id ? { ...row, ...payload } : row),
      },
    }))

    setEditing(false)
  }

  async function deleteShop() {
    if (!currentShop || !canEdit) return
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'list.delete',
      entityType: 'list',
      entityId: currentShop.id,
      operation: 'delete',
      payload: null,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        lists: prev.data.lists.map(row => row.id === currentShop.id ? { ...row, archived: true, updatedAt: new Date().toISOString() } : row),
      },
    }))

    window.location.href = '/household/shopping'
  }

  function startEditing() {
    setName(currentShop?.name ?? '')
    setColor(currentShop?.color ?? DEFAULT_LIST_COLOR)
    setEditing(true)
  }

  function ItemRow({ item, checkedRow, index }: { item: typeof visibleItems[number]; checkedRow: boolean; index: number }) {
    return (
      <div className={`flex items-center ${index > 0 ? 'border-t border-border' : ''}`}>
        <button
          onClick={() => toggleItem(item.id)}
          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-[13px] text-left active:bg-surface-2"
        >
          {checkedRow ? (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-sage">
              <svg viewBox="0 0 10 10" fill="none" className="h-[10px] w-[10px]">
                <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          ) : (
            <span className="h-5 w-5 shrink-0 rounded-[6px] border-[1.5px] border-border" />
          )}
          <span className={`truncate text-[14.5px] font-medium ${checkedRow ? 'text-text-3 line-through' : 'text-text-1'}`}>
            {item.title}
          </span>
        </button>
        {otherShops.length > 0 ? (
          <button
            onClick={() => setMovingItemId(item.id)}
            className="shrink-0 px-3 py-[13px] text-text-3 active:text-text-1"
            aria-label="Move to another shop"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M4 10h12M10 4l6 6-6 6" />
            </svg>
          </button>
        ) : null}
        <button onClick={() => deleteItem(item.id)} className="shrink-0 px-3 py-[13px] text-[13px] font-medium text-red active:opacity-60">
          Delete
        </button>
      </div>
    )
  }

  return (
    <ScreenShell title={isAll ? 'All Items' : (currentShop?.name ?? 'Shopping')} showHeader={false}>
      <div className="safe-top flex flex-col">
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          <a href="/household/shopping" className="-ml-1 flex items-center gap-1 text-accent active:opacity-60">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M10 3L5 8l5 5" />
            </svg>
            <span className="text-[16px]">Shopping</span>
          </a>
          {!isAll ? (
            <button
              onClick={() => { editing ? setEditing(false) : startEditing() }}
              className="px-1 text-[16px] font-medium text-accent active:opacity-60"
            >
              {editing ? 'Done' : 'Edit'}
            </button>
          ) : <span />}
        </div>

        {editing && currentShop ? (
          <div className="mx-4 mt-2 rounded-2xl bg-surface p-4">
            <div className="mb-4 flex items-center gap-3">
              <div className="h-9 w-9 shrink-0 rounded-full" style={{ background: color }} />
              <input
                autoFocus
                value={name}
                onChange={event => setName(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') saveShop() }}
                placeholder="Shop name"
                className="flex-1 bg-transparent text-[17px] font-semibold text-text-1 placeholder:text-text-3 outline-none"
              />
            </div>
            <div className="mb-4 flex flex-wrap gap-2.5">
              {LIST_COLORS.map(nextColor => (
                <button
                  key={nextColor}
                  onClick={() => setColor(nextColor)}
                  className="h-8 w-8 rounded-full transition-transform active:scale-90"
                  style={{ background: nextColor, boxShadow: color === nextColor ? `0 0 0 2.5px var(--surface), 0 0 0 4.5px ${nextColor}` : 'none' }}
                  aria-label={`Colour ${nextColor}`}
                />
              ))}
            </div>
            <button onClick={saveShop} disabled={!name.trim()} className="h-10 w-full rounded-xl bg-accent text-[15px] font-semibold text-white active:opacity-80 disabled:opacity-40">
              Save
            </button>
            {canEdit ? (
              <button onClick={deleteShop} className="mt-3 h-10 w-full rounded-xl text-[15px] font-medium text-red active:bg-surface-2">
                Delete Shop
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between px-5 pt-1 pb-3">
              <h1 className="text-[28px] font-bold tracking-tight" style={{ color: currentShop?.color ?? 'var(--text-1)' }}>
                {isAll ? 'All Items' : currentShop?.name ?? 'Shopping'}
              </h1>
              {checked.length > 0 ? (
                <button onClick={clearChecked} className="text-[12px] font-semibold text-text-2 active:opacity-60">
                  Clear {checked.length} done
                </button>
              ) : null}
            </header>

            <div className="mx-4 mb-4">
              <form onSubmit={event => { event.preventDefault(); addItem(true).catch(() => undefined) }} className="flex gap-2">
                <input
                  ref={inputRef}
                  value={text}
                  onChange={event => {
                    setText(event.target.value)
                    textRef.current = event.target.value
                  }}
                  onBlur={() => { addItem(false).catch(() => undefined) }}
                  placeholder={isAll ? 'Add item…' : `Add to ${currentShop?.name ?? 'shop'}…`}
                  autoComplete="off"
                  className="h-12 flex-1 rounded-xl border border-border bg-surface px-4 text-[14px] font-medium text-text-1 outline-none transition-colors placeholder:text-text-3 focus:border-accent"
                />
                <button type="submit" disabled={!text.trim()} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent active:opacity-80 disabled:opacity-40">
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </form>
            </div>

            {unchecked.length === 0 && checked.length === 0 ? (
              <div className="mx-4 rounded-2xl border border-border bg-surface px-5 py-8 text-center">
                <p className="mb-1 text-[15px] font-semibold text-text-1">Nothing here yet</p>
                <p className="text-[13px] text-text-2">Add items above to get started</p>
              </div>
            ) : (
              <>
                {unchecked.length > 0 ? (
                  <div className="mx-4 mb-3">
                    <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-text-3">To get · {unchecked.length}</p>
                    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                      {unchecked.map((item, index) => <ItemRow key={item.id} item={item} checkedRow={false} index={index} />)}
                    </div>
                  </div>
                ) : null}

                {checked.length > 0 ? (
                  <div className="mx-4 mb-3">
                    <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-text-3">Got it · {checked.length}</p>
                    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                      {checked.map((item, index) => <ItemRow key={item.id} item={item} checkedRow index={index} />)}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </>
        )}

        <div className="h-4" />

        {movingItemId ? (
          <div
            className="fixed inset-0 z-[60] mx-auto flex max-w-lg flex-col justify-end bg-black/40"
            onClick={() => setMovingItemId(null)}
          >
            <div
              className="flex max-h-[75vh] flex-col rounded-t-2xl bg-surface pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-xl"
              onClick={event => event.stopPropagation()}
            >
              <div className="flex shrink-0 justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-border" />
              </div>
              <p className="shrink-0 px-5 pt-2 pb-1 text-[13px] font-semibold text-text-3">Move to</p>
              <div className="flex flex-col overflow-y-auto">
                {otherShops.map((shop, index) => (
                  <button
                    key={shop.id}
                    onClick={() => moveItem(movingItemId, shop.id)}
                    className={`flex items-center gap-3 px-5 py-4 text-left active:bg-surface-2 ${index > 0 ? 'border-t border-border' : ''}`}
                  >
                    <div className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: shop.color ?? DEFAULT_LIST_COLOR }} />
                    <span className="text-[16px] font-medium text-text-1">{shop.icon === GENERAL_SHOPPING_ICON ? 'General' : shop.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ScreenShell>
  )
}
