import { enqueueMutation, getCurrentState, makeId } from './app-store'

export type MealPlan = { id: string; name: string; ingredients: string[] }
export type ShoppingPlanner = { regularItems: string[]; regularCategories: Record<string, string>; shopCategories: Record<string, Record<string, string>>; shopCategoryAttempts: Record<string, Record<string, string>>; meals: MealPlan[] }

export const DEFAULT_REGULAR_ITEMS = [
  'Halloumi', 'Brioche burger buns', 'Croissants', 'Black olives', 'Olive oil', 'Almonds', 'Greek yogurt',
  'Plain brioche buns', 'Garlic', 'Jaffa cakes', 'Jumbo pasta shells', 'Jumbo potatoes', 'Stuffed vine leaves',
  'Garlic granules', 'Red split lentils', 'Microwave French lentils', 'Wheat biscuits', 'Haricot beans',
  'Red kidney beans', 'Chopped tomatoes', 'French coffee', 'Guatemalan coffee', 'Microwave wholegrain rice',
  'Wholemeal pitta bread', 'Mixed tropical juice', 'Orange juice', 'Penne pasta', 'Light mayonnaise', 'Orangeade',
  'Salted caramel chocolate', 'Mexican crisps', 'Dates', 'Pistachio yogurt', 'Gnocchi', 'Beef steak', 'Beef mince (1%)',
  'Chicken breast', 'Chicken thigh fillets', 'Babycorn', 'Artichokes', 'Feta cheese', 'Soft cheese', 'Red seedless grapes',
  'Sweet Romano pepper', 'Broccoli', 'Chestnut mushrooms', 'Galia melon', 'Courgettes', 'Fine green beans', 'Sugar snaps',
  'Lettuce', 'Bananas', 'Oranges', 'Spring onions', 'Ginger', 'Fresh cod', 'Large red onions', 'Vine tomatoes',
  'Strawberries', 'Doughnut peaches', 'Large avocado',
]

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map(item => item.trim()) : []
}

function meal(value: unknown): MealPlan | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  return typeof row.id === 'string' && typeof row.name === 'string'
    ? { id: row.id, name: row.name, ingredients: strings(row.ingredients) }
    : null
}

export function readShoppingPlanner(settings: Record<string, unknown> | null | undefined): ShoppingPlanner {
  const raw = settings?.shoppingPlanner
  const planner = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const regularItems = strings(planner.regularItems)
  return {
    regularItems: regularItems.length ? regularItems : DEFAULT_REGULAR_ITEMS,
    regularCategories: Object.fromEntries(Object.entries(planner.regularCategories && typeof planner.regularCategories === 'object' ? planner.regularCategories as Record<string, unknown> : {}).filter(([, category]) => typeof category === 'string' && Boolean(category.trim())).map(([title, category]) => [title, (category as string).trim()])),
    shopCategories: Object.fromEntries(Object.entries(planner.shopCategories && typeof planner.shopCategories === 'object' ? planner.shopCategories as Record<string, unknown> : {}).flatMap(([shopId, rawCategories]) => rawCategories && typeof rawCategories === 'object' ? [[shopId, Object.fromEntries(Object.entries(rawCategories as Record<string, unknown>).filter(([, category]) => typeof category === 'string' && Boolean(category.trim())).map(([itemId, category]) => [itemId, (category as string).trim()]))]] : [])),
    shopCategoryAttempts: Object.fromEntries(Object.entries(planner.shopCategoryAttempts && typeof planner.shopCategoryAttempts === 'object' ? planner.shopCategoryAttempts as Record<string, unknown> : {}).flatMap(([shopId, rawAttempts]) => rawAttempts && typeof rawAttempts === 'object' ? [[shopId, Object.fromEntries(Object.entries(rawAttempts as Record<string, unknown>).filter(([, title]) => typeof title === 'string').map(([itemId, title]) => [itemId, title as string]))]] : [])),
    meals: Array.isArray(planner.meals) ? planner.meals.map(meal).filter((row): row is MealPlan => Boolean(row)) : [],
  }
}

export function shoppingItemKey(title: string) {
  return title.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

export async function categorizeShoppingTitles(items: string[]) {
  const response = await fetch('/api/ai/shopping/categorize', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
  })
  const payload = await response.json().catch(() => null) as { items?: Array<{ title?: string; category?: string }>; error?: string } | null
  if (!response.ok) throw new Error(payload?.error ?? `Categorisation failed (${response.status})`)
  return Object.fromEntries((payload?.items ?? []).filter(row => row.title && row.category).map(row => [shoppingItemKey(row.title!), row.category!]))
}

export async function saveShoppingPlanner(recipe: (current: ShoppingPlanner) => ShoppingPlanner) {
  const state = getCurrentState()
  const household = state.data.household[0] ?? null
  const now = new Date().toISOString()
  const payload = {
    id: household?.id ?? 'default',
    name: household?.name ?? 'Home',
    settings: { ...(household?.settings ?? {}), shoppingPlanner: recipe(readShoppingPlanner(household?.settings)) },
    createdAt: household?.createdAt ?? now,
  }
  await enqueueMutation({
    id: makeId('mutation'), name: 'household.upsert', entityType: 'household', entityId: payload.id, operation: 'upsert', payload,
  }, prev => ({
    ...prev,
    data: {
      ...prev.data,
      household: prev.data.household.some(row => row.id === payload.id)
        ? prev.data.household.map(row => row.id === payload.id ? { ...row, ...payload } : row)
        : [...prev.data.household, payload],
    },
  }))
}
