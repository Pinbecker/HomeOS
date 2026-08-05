import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FamilySubHeader, ScreenShell } from './shell'
import { ColorField } from '../components/color-control'
import { enqueueMutation, getCurrentState, makeId, useAppState } from '../lib/app-store'
import { navigateInApp } from '../lib/navigation'
import { SwipeRow } from '../components/swipe-row'
import { SheetGrabber } from '../components/sheet-grabber'
import { readShoppingPlanner, saveShoppingPlanner, type MealPlan } from '../lib/shopping-planner'

const DEFAULT_LIST_COLOR = '#007AFF'
const GENERAL_SHOPPING_ICON = 'general-shopping'

type LastCheckedItem = { id: string; title: string; listId: string }

function sortShoppingItems<T extends { checked: boolean; priority?: 'normal' | 'urgent'; sortOrder: number; createdAt: string | number | Date }>(items: T[]) {
  return [...items].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1
    const priority = (b.priority === 'urgent' ? 1 : 0) - (a.priority === 'urgent' ? 1 : 0)
    if (priority !== 0) return priority
    return a.sortOrder - b.sortOrder || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
}

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
      <div className="shopping-overview">
      <div className="family-summary-card family-summary-shopping">
        <div><small>SHARED SHOPPING</small><strong>{totalActive} {totalActive === 1 ? 'item' : 'items'}</strong><span>Live across the family.</span></div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M8 8a4 4 0 0 1 8 0" /></svg>
      </div>
      <div className="family-content-label"><small>PLAN AHEAD</small><h2>Plan your shop</h2></div>
      <div className="shopping-plan-grid mx-4 mb-5">
        <a href="/household/shopping/big-shop" className="shopping-plan-card is-big-shop">
          <div className="shopping-plan-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M4 7h16M7 3v4m10-4v4M6 12h5m-5 4h8m5-8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8" /></svg>
          </div>
          <span className="shopping-plan-copy"><small>ESSENTIALS</small><strong>Prepare big shop</strong><span>Regular weekly items</span></span>
          <Chevron />
        </a>
        <a href="/household/shopping/meals" className="shopping-plan-card is-meals">
          <div className="shopping-plan-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M4 4h16v5H4zM7 9v11m10-11v11M4 20h16" /></svg>
          </div>
          <span className="shopping-plan-copy"><small>MEAL PLAN</small><strong>Meals</strong><span>Plan this week</span></span>
          <Chevron />
        </a>
      </div>
      <div className="shopping-overview-primary mx-4 mb-5 bg-surface rounded-2xl overflow-hidden">
        <a href="/household/shopping/all" className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
          <div className="w-8 h-8 rounded-full bg-text-2 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px]">
              <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
              <path d="M2.5 3h2l2.2 11.2a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.6L21 6H6" />
            </svg>
          </div>
          <span className="shopping-overview-copy"><small>EVERY SHOP</small><strong>All items</strong></span>
          <span className="shopping-count-badge">{totalActive}</span>
          <Chevron />
        </a>
        {general && (
          <a href={`/household/shopping/${general.id}`} className="flex items-center gap-3 px-4 py-3 border-t border-border active:bg-surface-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: general.color ?? '#34C759' }}>
              <svg viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="w-[14px] h-[14px]">
                <path d="M4 6h12M4 10h12M4 14h8" />
              </svg>
            </div>
            <span className="shopping-overview-copy"><small>SHARED LIST</small><strong>General</strong></span>
            <span className="shopping-count-badge" style={{ '--shop-color': general.color ?? '#34C759' } as CSSProperties}>{countFor(general.id)}</span>
            <Chevron />
          </a>
        )}
      </div>

      <div className="family-content-label"><small>YOUR LISTS</small><h2>Shops</h2></div>
      {shopSpecific.length > 0 && (
        <div className="shopping-overview-shops mx-4 bg-surface rounded-2xl overflow-hidden">
          {shopSpecific.map((shop, i) => (
            <a key={shop.id} href={`/household/shopping/${shop.id}`} className={`flex items-center gap-3 px-4 py-3 active:bg-surface-2 ${i > 0 ? 'border-t border-border' : ''}`}>
              <span className="shopping-shop-rail" style={{ background: shop.color ?? '#34C759' }} />
              <span className="shopping-overview-copy"><strong>{shop.name}</strong></span>
              <span className="shopping-count-badge" style={{ '--shop-color': shop.color ?? '#34C759' } as CSSProperties}>{countFor(shop.id)}</span>
              <Chevron />
            </a>
          ))}
        </div>
      )}

      {adding ? (
        <div className="shopping-overview-new mx-4 mt-3 bg-surface rounded-2xl p-4">
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
          <div className="mb-4">
            <ColorField value={color} onChange={setColor} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setAdding(false); setName('') }} className="flex-1 h-10 rounded-xl bg-surface-2 text-[15px] font-semibold text-text-1 active:opacity-70">Cancel</button>
            <button onClick={createShop} disabled={!name.trim()} className="flex-1 h-10 rounded-xl bg-accent text-white text-[15px] font-semibold active:opacity-80 disabled:opacity-40">Add Shop</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="shopping-new-shop mx-4 mt-3 active:opacity-70">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="w-4 h-4">
            <path d="M8 3v10M3 8h10" />
          </svg>
          <span><small>ADD A LIST</small><strong>New shop</strong></span>
        </button>
      )}
      </div>
    </ScreenShell>
  )
}

function itemKey(title: string) {
  return title.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

async function addPlannerItems(itemsToAdd: string[], listId: string, source?: { type: string; detail?: string }) {
  const state = getCurrentState()
  const alreadyThere = new Set(state.data.listItems.filter(item => item.listId === listId && !item.deletedAt && !item.checked).map(item => itemKey(item.title)))
  let added = 0
  for (const title of itemsToAdd) {
    const clean = title.trim()
    if (!clean || alreadyThere.has(itemKey(clean))) continue
    alreadyThere.add(itemKey(clean))
    const id = makeId('shopping')
    const payload = {
      id, listId, title: clean,
      sortOrder: state.data.listItems.filter(item => item.listId === listId && !item.deletedAt).length + added,
      priority: 'normal' as const, checked: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      source: source?.type ?? null,
      sourceDetail: source?.detail ?? null,
    }
    await enqueueMutation({ id: makeId('mutation'), name: 'shopping.upsert', entityType: 'list_item', entityId: id, operation: 'upsert', payload }, prev => ({
      ...prev,
      data: { ...prev.data, listItems: [...prev.data.listItems, payload] },
    }))
    added += 1
  }
  return added
}

async function categorizeWithAi(items: string[]) {
  const response = await fetch('/api/ai/shopping/categorize', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
  })
  const payload = await response.json().catch(() => null) as { items?: Array<{ title?: string; category?: string }>; error?: string } | null
  if (!response.ok) throw new Error(payload?.error ?? `Categorisation failed (${response.status})`)
  return Object.fromEntries((payload?.items ?? []).filter(row => row.title && row.category).map(row => [itemKey(row.title!), row.category!]))
}

function groupedItems(items: string[], categories: Record<string, string>) {
  const groups = new Map<string, string[]>()
  for (const item of items) {
    const category = categories[itemKey(item)] ?? 'Other'
    groups.set(category, [...(groups.get(category) ?? []), item])
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([category, group]) => ({ category, items: [...group].sort((a, b) => a.localeCompare(b)) }))
}

function groupedShoppingRows<T extends { id: string; title: string }>(items: T[], categories: Record<string, string>) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const category = categories[item.id] ?? 'Other'
    groups.set(category, [...(groups.get(category) ?? []), item])
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([category, rows]) => ({ category, items: [...rows].sort((a, b) => a.title.localeCompare(b.title)) }))
}

function PlannerShopPicker({ shops, targetShop, onChange }: { shops: Array<{ id: string; name: string; icon?: string | null; color?: string | null }>; targetShop: string; onChange: (id: string) => void }) {
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
      {shops.map(shop => (
        <button key={shop.id} onClick={() => onChange(shop.id)} className={`whitespace-nowrap rounded-full px-3 py-2 text-[13px] font-semibold ${targetShop === shop.id ? 'text-white' : 'border border-border bg-surface text-text-2'}`} style={targetShop === shop.id ? { background: shop.color ?? DEFAULT_LIST_COLOR } : undefined}>
          {shop.icon === GENERAL_SHOPPING_ICON ? 'General' : shop.name}
        </button>
      ))}
    </div>
  )
}

export function BigShopPage() {
  const { settings, shops } = useAppState(state => ({
    settings: state.data.household[0]?.settings ?? null,
    shops: state.data.lists.filter(list => list.type === 'shopping' && !list.archived).sort((a, b) => a.sortOrder - b.sortOrder),
  }))
  const planner = readShoppingPlanner(settings)
  const [selected, setSelected] = useState<string[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [newItem, setNewItem] = useState('')
  const [targetShop, setTargetShop] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [categorizing, setCategorizing] = useState(false)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const selectedItems = selected ?? planner.regularItems
  const activeTarget = targetShop || shops[0]?.id || ''

  function toggle(title: string) {
    setSelected(current => {
      const currentItems = current ?? planner.regularItems
      return currentItems.includes(title) ? currentItems.filter(item => item !== title) : [...currentItems, title]
    })
  }

  async function removeFromRegular(title: string) {
    await saveShoppingPlanner(current => ({ ...current, regularItems: current.regularItems.filter(item => item !== title) }))
  }

  async function addRegularItem() {
    const title = newItem.trim()
    if (!title || planner.regularItems.some(item => itemKey(item) === itemKey(title))) return
    await saveShoppingPlanner(current => ({ ...current, regularItems: [...current.regularItems, title] }))
    setNewItem('')
  }

  async function addToShop() {
    if (!activeTarget || !selectedItems.length) return
    const added = await addPlannerItems(selectedItems, activeTarget)
    const shop = shops.find(row => row.id === activeTarget)
    setNotice(added ? `${added} item${added === 1 ? '' : 's'} added to ${shop?.icon === GENERAL_SHOPPING_ICON ? 'General' : shop?.name ?? 'shop'}.` : 'Everything selected is already on that shop list.')
  }

  async function categorizeRegular() {
    setCategorizing(true); setCategoryError(null)
    try {
      const pending = planner.regularItems.filter(item => !planner.regularCategories[itemKey(item)] || planner.regularCategories[itemKey(item)] === 'Other')
      if (!pending.length) return
      const categories = await categorizeWithAi(pending)
      await saveShoppingPlanner(current => ({ ...current, regularCategories: { ...current.regularCategories, ...categories } }))
    } catch (error) { setCategoryError(error instanceof Error ? error.message : 'Could not categorise the regular list.') } finally { setCategorizing(false) }
  }

  return (
    <ScreenShell title="Big Shop" showHeader={false} topContent={<FamilySubHeader title="Prepare big shop" backHref="/household/shopping" backLabel="Shopping" action={<button onClick={() => setEditing(value => !value)}>{editing ? 'Done' : 'Edit'}</button>} />}>
      <div className="pb-28">
        <div className="px-5 pt-3 pb-4">
          <p className="mt-1 text-[13px] leading-5 text-text-2">Start with your regular essentials, then untick what you do not need this week.</p>
          <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => { void categorizeRegular() }} disabled={categorizing} className="rounded-lg border border-accent-border bg-accent-bg px-3 py-2 text-[13px] font-semibold text-accent disabled:opacity-50">{categorizing ? 'Categorising…' : 'Categorise'}</button></div>{categoryError ? <p className="mt-2 text-[13px] text-red">{categoryError}</p> : null}
        </div>
        {editing ? (
          <div className="mx-4 overflow-hidden rounded-2xl border border-border bg-surface">
            {planner.regularItems.map((item, index) => <div key={item} className={`flex items-center gap-3 px-4 py-3 ${index ? 'border-t border-border' : ''}`}><span className="flex-1 text-[15px] font-medium text-text-1">{item}</span><button onClick={() => { void removeFromRegular(item) }} className="text-[13px] font-semibold text-red">Remove</button></div>)}
            <form onSubmit={event => { event.preventDefault(); void addRegularItem() }} className="flex gap-2 border-t border-border p-3"><input value={newItem} onChange={event => setNewItem(event.target.value)} placeholder="Add a regular item" className="h-10 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-[14px] outline-none" /><button disabled={!newItem.trim()} className="h-10 rounded-xl bg-accent px-4 text-[14px] font-semibold text-white disabled:opacity-40">Add</button></form>
          </div>
        ) : (
          <div className="mx-4 overflow-hidden rounded-2xl border border-border bg-surface">
            {groupedItems(selectedItems, planner.regularCategories).flatMap((group, groupIndex) => [<p key={`${group.category}-heading`} className={`bg-surface-2 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-text-3 ${groupIndex ? 'border-t border-border' : ''}`}>{group.category}</p>, ...group.items.map((item, index) => <button key={item} onClick={() => toggle(item)} className={`flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2 ${index ? 'border-t border-border' : ''}`}><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] ${selectedItems.includes(item) ? 'bg-accent' : 'border-[1.5px] border-border'}`}>{selectedItems.includes(item) ? <svg viewBox="0 0 10 10" fill="none" className="h-[10px] w-[10px]"><path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg> : null}</span><span className="text-[15px] font-medium text-text-1">{item}</span></button>)])}
          </div>
        )}
        {!editing ? <div className="mx-4 mt-5 rounded-2xl bg-surface p-4"><p className="mb-3 text-[13px] font-semibold text-text-2">Add {selectedItems.length} selected item{selectedItems.length === 1 ? '' : 's'} to</p>{shops.length ? <><PlannerShopPicker shops={shops} targetShop={activeTarget} onChange={setTargetShop} /><button onClick={() => { void addToShop() }} disabled={!selectedItems.length} className="mt-4 h-11 w-full rounded-xl bg-accent text-[15px] font-semibold text-white active:opacity-80 disabled:opacity-40">Add to selected shop</button></> : <p className="text-[14px] text-text-2">Create a shop first, then come back to prepare your big shop.</p>}{notice ? <p className="mt-3 text-center text-[13px] font-medium text-sage">{notice}</p> : null}</div> : null}
      </div>
    </ScreenShell>
  )
}

export function MealsPage() {
  const { settings, shops } = useAppState(state => ({
    settings: state.data.household[0]?.settings ?? null,
    shops: state.data.lists.filter(list => list.type === 'shopping' && !list.archived).sort((a, b) => a.sortOrder - b.sortOrder),
  }))
  const planner = readShoppingPlanner(settings)
  const [selected, setSelected] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [editingMealId, setEditingMealId] = useState<string | null>(null)
  const [mealName, setMealName] = useState('')
  const [ingredient, setIngredient] = useState('')
  const [ingredients, setIngredients] = useState<string[]>([])
  const [targetShop, setTargetShop] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const activeTarget = targetShop || shops[0]?.id || ''
  const plannedMeals = planner.meals.filter(meal => selected.includes(meal.id))
  const neededItems = [...new Map(plannedMeals.flatMap(meal => meal.ingredients).map(item => [itemKey(item), item])).values()]

  function toggleMeal(id: string) { setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]) }
  function addIngredient() { const clean = ingredient.trim(); if (clean && !ingredients.some(item => itemKey(item) === itemKey(clean))) setIngredients(current => [...current, clean]); setIngredient('') }
  async function saveMeal() { const name = mealName.trim(); if (!name) return; await saveShoppingPlanner(current => ({ ...current, meals: editingMealId ? current.meals.map(meal => meal.id === editingMealId ? { ...meal, name, ingredients } : meal) : [...current.meals, { id: makeId('meal'), name, ingredients }] })); setMealName(''); setIngredients([]); setEditingMealId(null); setCreating(false) }
  async function deleteMeal() { if (!editingMealId) return; await saveShoppingPlanner(current => ({ ...current, meals: current.meals.filter(meal => meal.id !== editingMealId) })); setMealName(''); setIngredients([]); setEditingMealId(null); setCreating(false) }
  function startEditingMeal(meal: MealPlan) { setEditingMealId(meal.id); setMealName(meal.name); setIngredients(meal.ingredients); setCreating(true) }
  async function addMealItems() { if (!activeTarget || !neededItems.length) return; const added = await addPlannerItems(neededItems, activeTarget, { type: 'meal', detail: plannedMeals.map(meal => meal.name).join(', ') }); setNotice(added ? `${added} missing ingredient${added === 1 ? '' : 's'} added.` : 'All of those ingredients are already on that shop list.') }

  return (
    <ScreenShell title="Meals" showHeader={false} topContent={<FamilySubHeader title="Meals" backHref="/household/shopping" backLabel="Shopping" action={<button onClick={() => { if (creating) { setCreating(false); setEditingMealId(null); setMealName(''); setIngredients([]) } else { setCreating(true) } }}>{creating ? 'Cancel' : 'New'}</button>} />}>
      <div className="family-scroll-contents"><div className="px-5 pt-3 pb-4"><p className="text-[13px] leading-5 text-text-2">Choose meals for the week and add their missing ingredients to a shopping list.</p></div>
        {creating ? <div className="mx-4 rounded-2xl bg-surface p-4"><p className="mb-3 text-[13px] font-semibold text-text-2">{editingMealId ? 'Edit meal' : 'New meal'}</p><input autoFocus value={mealName} onChange={event => setMealName(event.target.value)} placeholder="Meal name" className="h-11 w-full rounded-xl bg-surface-2 px-3 text-[15px] font-medium outline-none" /><div className="mt-3 flex gap-2"><input value={ingredient} onChange={event => setIngredient(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addIngredient() } }} placeholder="Ingredient" className="h-10 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-[14px] outline-none" /><button onClick={addIngredient} className="h-10 rounded-xl border border-border px-3 text-[14px] font-semibold text-accent">Add</button></div>{ingredients.length ? <div className="mt-3 flex flex-wrap gap-2">{ingredients.map(item => <button key={item} onClick={() => setIngredients(current => current.filter(value => value !== item))} className="rounded-full bg-accent-bg px-3 py-1.5 text-[13px] font-medium text-accent">{item} ×</button>)}</div> : <p className="mt-3 text-[13px] text-text-3">Add the ingredients this meal needs.</p>}<button onClick={() => { void saveMeal() }} disabled={!mealName.trim()} className="mt-4 h-11 w-full rounded-xl bg-accent text-[15px] font-semibold text-white disabled:opacity-40">{editingMealId ? 'Save changes' : 'Save meal'}</button>{editingMealId ? <button onClick={() => { void deleteMeal() }} className="mt-3 h-10 w-full rounded-xl text-[14px] font-semibold text-red">Delete meal</button> : null}</div> : null}
        {planner.meals.length ? <div className="mx-4 overflow-hidden rounded-2xl border border-border bg-surface">{planner.meals.map((meal, index) => <div key={meal.id} className={`flex items-center gap-3 px-4 py-3 ${index ? 'border-t border-border' : ''}`}><button onClick={() => toggleMeal(meal.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-60"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] ${selected.includes(meal.id) ? 'bg-accent' : 'border-[1.5px] border-border'}`}>{selected.includes(meal.id) ? <svg viewBox="0 0 10 10" fill="none" className="h-[10px] w-[10px]"><path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg> : null}</span><span className="min-w-0 flex-1"><span className="block text-[15px] font-medium text-text-1">{meal.name}</span><span className="block truncate text-[12px] text-text-3">{meal.ingredients.length ? meal.ingredients.join(' · ') : 'No ingredients added'}</span></span></button><button onClick={() => startEditingMeal(meal)} className="shrink-0 text-[13px] font-semibold text-accent">Edit</button></div>)}</div> : !creating ? <div className="mx-4 rounded-2xl border border-border bg-surface px-5 py-8 text-center"><p className="text-[15px] font-semibold text-text-1">No meals saved yet</p><p className="mt-1 text-[13px] text-text-2">Create a meal with its ingredients to start planning.</p></div> : null}
        {plannedMeals.length ? <div className="mx-4 mt-5 rounded-2xl bg-surface p-4"><p className="text-[13px] font-semibold text-text-2">{plannedMeals.length} meal{plannedMeals.length === 1 ? '' : 's'} selected · {neededItems.length} ingredient{neededItems.length === 1 ? '' : 's'}</p><div className="mt-3">{shops.length ? <><PlannerShopPicker shops={shops} targetShop={activeTarget} onChange={setTargetShop} /><button onClick={() => { void addMealItems() }} className="mt-4 h-11 w-full rounded-xl bg-accent text-[15px] font-semibold text-white">Add missing ingredients</button></> : <p className="mt-2 text-[14px] text-text-2">Create a shop first, then come back to add ingredients.</p>}</div>{notice ? <p className="mt-3 text-center text-[13px] font-medium text-sage">{notice}</p> : null}</div> : null}
      </div>
    </ScreenShell>
  )
}

export function ShoppingDetailPage() {
  const pathname = typeof window === 'undefined' ? '' : window.location.pathname
  const shopId = pathname.split('/').pop() ?? 'all'
  const { shops, items, settings } = useAppState(state => ({
    shops: state.data.lists.filter(list => list.type === 'shopping' && !list.archived).sort((a, b) => a.sortOrder - b.sortOrder),
    items: state.data.listItems.filter(item => !item.deletedAt),
    settings: state.data.household[0]?.settings ?? null,
  }))
  const [text, setText] = useState('')
  const textRef = useRef('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [movingItemId, setMovingItemId] = useState<string | null>(null)
  const [targetShop, setTargetShop] = useState('')
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [clearingChecked, setClearingChecked] = useState(false)
  const [lastChecked, setLastChecked] = useState<LastCheckedItem | null>(null)
  const [categorizingShop, setCategorizingShop] = useState(false)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  const isAll = shopId === 'all'
  const currentShop = isAll ? null : shops.find(shop => shop.id === shopId) ?? null
  const visibleItems = useMemo(() => sortShoppingItems(isAll ? items : items.filter(item => item.listId === shopId)), [isAll, items, shopId])
  const unchecked = visibleItems.filter(item => !item.checked)
  const checked = visibleItems.filter(item => item.checked)
  const planner = readShoppingPlanner(settings)
  const [name, setName] = useState(currentShop?.name ?? '')
  const [color, setColor] = useState(currentShop?.color ?? DEFAULT_LIST_COLOR)
  const otherShops = isAll ? [] : shops.filter(shop => shop.id !== shopId)
  const canEdit = Boolean(currentShop && currentShop.icon !== GENERAL_SHOPPING_ICON)
  const shopMeta = new Map(shops.map(shop => [shop.id, { name: shop.icon === GENERAL_SHOPPING_ICON ? 'General' : shop.name, color: shop.color ?? DEFAULT_LIST_COLOR }]))
  const activeTargetShop = targetShop || shops[0]?.id || ''
  const shopCategories = isAll ? {} : planner.shopCategories[shopId] ?? {}
  const hasShopCategories = Object.keys(shopCategories).length > 0
  const uncheckedGroups = hasShopCategories ? groupedShoppingRows(unchecked, shopCategories) : []
  const checkedGroups = hasShopCategories ? groupedShoppingRows(checked, shopCategories) : []

  async function addItem(refocus = false) {
    const title = textRef.current.trim()
    const targetListId = isAll ? activeTargetShop : shopId
    if (!title || !targetListId) return
    textRef.current = ''
    const id = makeId('shopping')
    const payload = {
      id,
      listId: targetListId,
      title,
      sortOrder: visibleItems.length,
      priority: 'normal' as const,
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

  async function categorizeShop() {
    if (isAll || !currentShop || !visibleItems.length) return
    setCategorizingShop(true); setCategoryError(null)
    try {
      const rows = visibleItems.filter(item => !shopCategories[item.id] || shopCategories[item.id] === 'Other')
      if (!rows.length) return
      const byTitle = await categorizeWithAi(rows.map(item => item.title))
      const categories = Object.fromEntries(rows.map(item => [item.id, byTitle[itemKey(item.title)] ?? 'Other']))
      await saveShoppingPlanner(current => ({
        ...current,
        shopCategories: { ...current.shopCategories, [currentShop.id]: { ...(current.shopCategories[currentShop.id] ?? {}), ...categories } },
        shopCategoryAttempts: { ...current.shopCategoryAttempts, [currentShop.id]: { ...(current.shopCategoryAttempts[currentShop.id] ?? {}), ...Object.fromEntries(rows.filter(item => categories[item.id] === 'Other').map(item => [item.id, item.title])) } },
      }))
    } catch (error) { setCategoryError(error instanceof Error ? error.message : 'Could not categorise this shop.') } finally { setCategorizingShop(false) }
  }

  async function toggleItem(itemId: string) {
    const current = visibleItems.find(item => item.id === itemId)
    if (!current) return
    const willCheck = !current.checked
    const payload = {
      ...current,
      checked: willCheck,
      checkedAt: willCheck ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    }
    if (willCheck) setLastChecked({ id: current.id, title: current.title, listId: current.listId })
    else if (lastChecked?.id === itemId) setLastChecked(null)

    void enqueueMutation({
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

  async function togglePriority(itemId: string) {
    const current = visibleItems.find(item => item.id === itemId)
    if (!current) return
    const nextPriority: 'normal' | 'urgent' = current.priority === 'urgent' ? 'normal' : 'urgent'
    const payload = {
      ...current,
      priority: nextPriority,
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

  async function confirmClearChecked() {
    if (clearingChecked) return
    setClearingChecked(true)
    try {
      await clearChecked()
      setLastChecked(null)
      setClearConfirmOpen(false)
    } finally {
      setClearingChecked(false)
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

    navigateInApp('/household/shopping')
  }

  function startEditing() {
    setName(currentShop?.name ?? '')
    setColor(currentShop?.color ?? DEFAULT_LIST_COLOR)
    setEditing(true)
  }

  function ItemRow({ item, checkedRow, index, showShopLabel = false }: { item: typeof visibleItems[number]; checkedRow: boolean; index: number; showShopLabel?: boolean }) {
    const isLastChecked = checkedRow && lastChecked?.id === item.id
    const itemColor = shopMeta.get(item.listId)?.color ?? DEFAULT_LIST_COLOR
    return (
      <SwipeRow
        actions={[
          { key: 'priority', label: item.priority === 'urgent' ? 'Normal' : 'Urgent', onClick: () => { void togglePriority(item.id) }, bg: item.priority === 'urgent' ? '#8E8E93' : '#FF9500' },
          { key: 'delete', label: 'Delete', onClick: () => { void deleteItem(item.id) }, className: 'bg-red', closeOnClick: false },
        ]}
        className={index > 0 ? 'border-t border-border' : ''}
      >
        <div className={`shopping-item-row flex items-center ${isLastChecked ? 'shopping-item-row--last-checked' : ''}`} style={{ '--item-color': itemColor } as CSSProperties}>
          <button
            onClick={() => { void toggleItem(item.id) }}
            className="flex min-w-0 flex-1 items-center gap-3 px-4 py-[13px] text-left transition-[background-color,transform] duration-300 active:bg-surface-2"
          >
            {checkedRow ? (
              <span className="shopping-item-check is-checked">
                <svg viewBox="0 0 10 10" fill="none" className="h-[10px] w-[10px]">
                  <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ) : (
              <span className="shopping-item-check" />
            )}
            <span className="min-w-0 flex-1">
              <span className={`block line-clamp-2 break-words text-[14.5px] font-medium leading-5 ${checkedRow ? 'text-text-3 line-through' : 'text-text-1'}`}>{item.title}</span>
              {item.source === 'meal' ? <span className="mt-1 inline-flex max-w-full truncate rounded-md bg-sage-bg px-1.5 py-0.5 text-[10px] font-bold text-sage">Meal{item.sourceDetail ? ` · ${item.sourceDetail}` : ''}</span> : null}
            </span>
            {isLastChecked ? <span className="shopping-last-check-label">Last checked</span> : null}
            {item.priority === 'urgent' && !checkedRow ? <span className="shrink-0 rounded-lg bg-amber-bg px-2 py-0.5 text-[10.5px] font-bold text-amber">Urgent</span> : null}
          </button>
          {showShopLabel ? (
            <span className="shopping-item-shop-label" style={{ '--item-color': itemColor } as CSSProperties}>
              {shopMeta.get(item.listId)?.name}
            </span>
          ) : null}
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
        </div>
      </SwipeRow>
    )
  }

  function CollapsibleSection({ id, label, children, className = '', variant = 'category', sectionColor }: { id: string; label: ReactNode; children: ReactNode; className?: string; variant?: 'shop' | 'category'; sectionColor?: string }) {
    const open = !collapsedSections[id]
    return (
      <section className={`shopping-collapsible is-${variant} ${className}`} style={sectionColor ? { '--shop-color': sectionColor } as CSSProperties : undefined}>
        <button onClick={() => setCollapsedSections(current => ({ ...current, [id]: open }))} className="shopping-collapse-toggle" aria-expanded={open}>
          <span>{label}</span>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 text-text-3 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}><path d="M4 6l4 4 4-4" /></svg>
        </button>
        <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <div className="min-h-0 overflow-hidden">{children}</div>
        </div>
      </section>
    )
  }

  return (
    <ScreenShell
      title={isAll ? 'All Items' : (currentShop?.name ?? 'Shopping')}
      showHeader={false}
      topContent={<FamilySubHeader title={isAll ? 'All items' : (currentShop?.name ?? 'Shopping')} backHref="/household/shopping" backLabel="Shopping" action={!isAll ? <button onClick={() => { editing ? setEditing(false) : startEditing() }}>{editing ? 'Done' : 'Edit'}</button> : undefined} />}
    >
      <div className="shopping-page flex flex-col" style={{ '--shop-color': currentShop?.color ?? '#49A96F' } as CSSProperties}>
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
            <div className="mb-4">
              <ColorField value={color} onChange={setColor} />
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
            <header className="shopping-list-heading">
              <div><small>{isAll ? 'ALL SHOPS' : 'SHOPPING LIST'}</small><h1>{isAll ? 'All items' : currentShop?.name ?? 'Shopping'}</h1><p>{unchecked.length} to get · {checked.length} got it</p></div>
              {checked.length > 0 ? (
                <button onClick={() => setClearConfirmOpen(true)} className="shopping-clear-button active:opacity-75">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 4.5h11M6 2.5h4M5 6.5v4M8 6.5v4M11 6.5v4M4.5 4.5l.6 8.2c.05.75.67 1.3 1.42 1.3h3c.75 0 1.37-.55 1.42-1.3l.6-8.2" /></svg>
                  Clear completed <span>{checked.length}</span>
                </button>
              ) : null}
            </header>

            {!isAll && visibleItems.length > 0 ? <div className="px-4 pb-3"><button onClick={() => { void categorizeShop() }} disabled={categorizingShop} className="shopping-categorize-button">{categorizingShop ? 'Categorising…' : 'Categorise items'}</button>{categoryError ? <p className="mt-2 text-[13px] text-red">{categoryError}</p> : null}</div> : null}

            <div className="shopping-add-card mx-4 mb-4">
              <div className="shopping-add-heading"><small>QUICK ADD</small><span>{isAll ? `Choose a shop for the new item` : `Add something to ${currentShop?.name ?? 'this list'}`}</span></div>
              {isAll && shops.length > 1 ? (
                <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto">
                  {shops.map(shop => (
                    <button
                      key={shop.id}
                      onClick={() => setTargetShop(shop.id)}
                      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                        activeTargetShop === shop.id ? 'text-white' : 'border border-border bg-surface text-text-2'
                      }`}
                      style={activeTargetShop === shop.id ? { background: shop.color ?? DEFAULT_LIST_COLOR } : undefined}
                    >
                      {shop.icon === GENERAL_SHOPPING_ICON ? 'General' : shop.name}
                    </button>
                  ))}
                </div>
              ) : null}
              <form onSubmit={event => { event.preventDefault(); addItem(true).catch(() => undefined) }} className="flex gap-2">
                <input
                  ref={inputRef}
                  value={text}
                  onChange={event => {
                    setText(event.target.value)
                    textRef.current = event.target.value
                  }}
                  onBlur={() => { addItem(false).catch(() => undefined) }}
                  placeholder={isAll ? `Add to ${shopMeta.get(activeTargetShop)?.name ?? 'shop'}…` : `Add to ${currentShop?.name ?? 'shop'}…`}
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

            {isAll ? (
              <>
                {shops.map(shop => {
                  const shopUnchecked = unchecked.filter(item => item.listId === shop.id)
                  const shopChecked = checked.filter(item => item.listId === shop.id)
                  if (shopUnchecked.length === 0 && shopChecked.length === 0) return null
                  const categories = planner.shopCategories[shop.id] ?? {}
                  const groupedUnchecked = Object.keys(categories).length ? groupedShoppingRows(shopUnchecked, categories) : null
                  const groupedChecked = Object.keys(categories).length ? groupedShoppingRows(shopChecked, categories) : null
                  return (
                    <CollapsibleSection key={shop.id} id={`shop:${shop.id}`} variant="shop" sectionColor={shop.color ?? DEFAULT_LIST_COLOR} className="shopping-shop-section mx-4 mb-3" label={<span className="shopping-shop-label"><i style={{ background: shop.color ?? DEFAULT_LIST_COLOR }} /><span>{shop.icon === GENERAL_SHOPPING_ICON ? <small>SHARED LIST</small> : null}<strong>{shop.icon === GENERAL_SHOPPING_ICON ? 'General' : shop.name}</strong></span><b>{shopUnchecked.length + shopChecked.length}</b></span>}>
                      <div className="pt-1">
                        {shopUnchecked.length ? groupedUnchecked ? groupedUnchecked.map(group => <CollapsibleSection key={group.category} id={`shop:${shop.id}:to-get:${group.category}`} className="mb-3" label={<span className="shopping-category-label"><span>{group.category}</span><b>{group.items.length}</b></span>}><div className="pt-1"><div className="shopping-list-card overflow-hidden rounded-2xl border border-border bg-surface">{group.items.map((item, index) => <ItemRow key={item.id} item={item} checkedRow={false} index={index} />)}</div></div></CollapsibleSection>) : <div className="mb-3 shopping-list-card overflow-hidden rounded-2xl border border-border bg-surface">{shopUnchecked.map((item, index) => <ItemRow key={item.id} item={item} checkedRow={false} index={index} />)}</div> : null}
                        {shopChecked.length ? groupedChecked ? groupedChecked.map(group => <CollapsibleSection key={`done-${group.category}`} id={`shop:${shop.id}:done:${group.category}`} className="mb-3" label={<span className="shopping-category-label is-done"><span>{group.category} · got it</span><b>{group.items.length}</b></span>}><div className="pt-1"><div className="shopping-list-card shopping-list-card--done overflow-hidden rounded-2xl border border-border bg-surface">{group.items.map((item, index) => <ItemRow key={item.id} item={item} checkedRow index={index} />)}</div></div></CollapsibleSection>) : <div className="shopping-list-card shopping-list-card--done overflow-hidden rounded-2xl border border-border bg-surface">{shopChecked.map((item, index) => <ItemRow key={item.id} item={item} checkedRow index={index} />)}</div> : null}
                      </div>
                    </CollapsibleSection>
                  )
                })}

                {unchecked.length === 0 ? (
                  <div className="mx-4 rounded-2xl border border-border bg-surface px-5 py-8 text-center">
                    <p className="mb-1 text-[15px] font-semibold text-text-1">Nothing to buy</p>
                    <p className="text-[13px] text-text-2">Add items above or inside a shop</p>
                  </div>
                ) : null}

              </>
            ) : unchecked.length === 0 && checked.length === 0 ? (
              <div className="mx-4 rounded-2xl border border-border bg-surface px-5 py-8 text-center">
                <p className="mb-1 text-[15px] font-semibold text-text-1">Nothing here yet</p>
                <p className="text-[13px] text-text-2">Add items above to get started</p>
              </div>
            ) : (
              <>
                {unchecked.length > 0 ? (
                  hasShopCategories ? uncheckedGroups.map(group => <CollapsibleSection key={group.category} id={`detail:${shopId}:to-get:${group.category}`} className="mx-4 mb-3" label={<span className="shopping-category-label"><span>{group.category}</span><b>{group.items.length}</b></span>}><div className="pt-1 shopping-list-card overflow-hidden rounded-2xl border border-border bg-surface">{group.items.map((item, index) => <ItemRow key={item.id} item={item} checkedRow={false} index={index} />)}</div></CollapsibleSection>) : <div className="mx-4 mb-3">
                    <p className="shopping-flat-label"><span>TO GET</span><b>{unchecked.length}</b></p>
                    <div className="shopping-list-card overflow-hidden rounded-2xl border border-border bg-surface">
                      {unchecked.map((item, index) => <ItemRow key={item.id} item={item} checkedRow={false} index={index} />)}
                    </div>
                  </div>
                ) : null}

                {checked.length > 0 ? (
                  hasShopCategories ? checkedGroups.map(group => <CollapsibleSection key={`checked-${group.category}`} id={`detail:${shopId}:done:${group.category}`} className="mx-4 mb-3" label={<span className="shopping-category-label is-done"><span>{group.category} · got it</span><b>{group.items.length}</b></span>}><div className="pt-1 shopping-list-card shopping-list-card--done overflow-hidden rounded-2xl border border-border bg-surface">{group.items.map((item, index) => <ItemRow key={item.id} item={item} checkedRow index={index} />)}</div></CollapsibleSection>) : <div className="mx-4 mb-3">
                    <p className="shopping-flat-label is-done"><span>GOT IT</span><b>{checked.length}</b></p>
                    <div className="shopping-list-card shopping-list-card--done overflow-hidden rounded-2xl border border-border bg-surface">
                      {checked.map((item, index) => <ItemRow key={item.id} item={item} checkedRow index={index} />)}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </>
        )}

        <div className="h-4" />

        {movingItemId && typeof document !== 'undefined' ? createPortal((
          <div
            className="fixed inset-0 z-[80] flex flex-col items-center justify-end bg-black/40"
            onClick={() => setMovingItemId(null)}
          >
            <div
              data-swipe-sheet
              className="flex min-h-0 max-h-[calc(100dvh-env(safe-area-inset-top)-12px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-surface pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-xl"
              onClick={event => event.stopPropagation()}
            >
              <SheetGrabber onDismiss={() => setMovingItemId(null)} className="flex h-9 shrink-0 items-center justify-center" barClassName="h-1 w-10 rounded-full bg-border" />
              <p className="shrink-0 px-5 pt-2 pb-1 text-[13px] font-semibold text-text-3">Move to</p>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
        ), document.body) : null}
        {clearConfirmOpen && typeof document !== 'undefined' ? createPortal((
          <div className="shopping-clear-dialog fixed inset-0 z-[80] flex flex-col items-center justify-end" role="dialog" aria-modal="true" aria-labelledby="clear-completed-title">
            <button className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" aria-label="Keep completed items" onClick={() => !clearingChecked && setClearConfirmOpen(false)} />
            <div data-swipe-sheet className="shopping-clear-sheet relative max-h-[calc(100dvh-env(safe-area-inset-top)-12px)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-[28px] bg-surface px-5 pt-0 pb-[calc(env(safe-area-inset-bottom)+18px)]">
              <SheetGrabber disabled={clearingChecked} onDismiss={() => setClearConfirmOpen(false)} className="-mx-5 flex h-10 items-center justify-center" barClassName="h-1.5 w-10 rounded-full bg-border" />
              <div className="shopping-clear-icon">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h14M8 3h4M6.3 6l.7 10h6l.7-10M8.5 9v4M11.5 9v4" /></svg>
              </div>
              <h2 id="clear-completed-title">Clear completed items?</h2>
              <p>{checked.length === 1 ? 'This will permanently remove 1 completed item from this list.' : `This will permanently remove ${checked.length} completed items from this list.`}</p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button type="button" disabled={clearingChecked} onClick={() => setClearConfirmOpen(false)} className="shopping-clear-cancel">Keep them</button>
                <button type="button" disabled={clearingChecked} onClick={() => { void confirmClearChecked() }} className="shopping-clear-confirm">{clearingChecked ? 'Clearing…' : 'Clear items'}</button>
              </div>
            </div>
          </div>
        ), document.body) : null}
      </div>
    </ScreenShell>
  )
}
