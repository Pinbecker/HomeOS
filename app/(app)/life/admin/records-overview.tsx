'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import type { HouseholdEntity, RecordsOverviewData } from '@/lib/entities/records'
import { SwipeRow } from '@/components/ui/swipe-row'
import { saveRecordCategory, deleteRecordCategory } from './category-actions'

type CategoryItem = RecordsOverviewData['categories'][number]

const PRESET_COLORS = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759',
  '#007AFF', '#5856D6', '#AF52DE', '#FF2D55',
  '#00C7BE', '#8E8E93',
]

const CATEGORY_EMOJIS = [
  '🏠', '🏡', '🛋️', '🛏️', '🔑', '🛡️', '📄',
  '🧾', '🚗', '🚙', '🏍️', '✈️', '💡', '💧',
  '⚡', '🔥', '🔌', '🌐', '📱', '💳', '💰',
  '🏦', '💼', '📇', '📞', '🏥', '🦷', '🪪',
  '❤️', '👶', '🐾', '🐕', '🐈', '📋', '📦',
  '🎁', '📅', '⏰', '🔒', '🔧', '🌳', '⭐',
]

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-5 h-5">
      <circle cx="9" cy="9" r="6" />
      <path d="M14 14l3.5 3.5" />
    </svg>
  )
}

function EntityCard({ entity }: { entity: HouseholdEntity }) {
  const visibleFields = entity.fields.filter(field => field.value).slice(0, 2)
  const renewalText = entity.renewalDate
    ? new Date(entity.renewalDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null

  return (
    <Link
      href={entity.href}
      className="bg-surface rounded-2xl px-4 py-3.5 active:bg-surface-2 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-[12px] flex items-center justify-center text-[20px] shrink-0"
          style={{ background: `${entity.color}1F` }}
        >
          {entity.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[15.5px] font-semibold text-text-1 truncate">{entity.title}</p>
              <p className="text-[12px] text-text-2 truncate">
                {entity.subtitle || entity.kindLabel}
              </p>
            </div>
            <div className="text-text-3 shrink-0 mt-0.5">
              <Chevron />
            </div>
          </div>

          {(visibleFields.length > 0 || renewalText) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {renewalText && (
                <span className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-amber-bg text-amber">
                  {entity.renewalLabel ?? 'Due'} {renewalText}
                </span>
              )}
              {visibleFields.map(field => (
                <span key={`${field.label}-${field.value}`} className="text-[11px] font-medium px-2 py-1 rounded-lg bg-surface-2 text-text-2 max-w-full truncate">
                  {field.label}: {field.value}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

function CategoryRow({ category, onEdit, onDelete, isFirst }: {
  category: CategoryItem
  onEdit: () => void
  onDelete: () => void
  isFirst?: boolean
}) {
  return (
    <SwipeRow
      onEdit={onEdit}
      onDelete={onDelete}
      wrapClassName={isFirst ? '' : 'border-t border-border'}
      className=""
    >
      <Link
        href={category.href}
        className="flex items-center gap-3.5 px-4 py-3.5 active:bg-surface-2 transition-colors"
      >
        <div
          className="w-11 h-11 rounded-[13px] flex items-center justify-center text-[22px] shrink-0"
          style={{ background: `${category.color}1F` }}
        >
          {category.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-semibold text-text-1 truncate">{category.label}</p>
          <p className="text-[12.5px] text-text-2 truncate">{category.desc}</p>
        </div>
        <span
          className="text-[13px] font-bold min-w-[26px] h-[26px] px-2 rounded-full flex items-center justify-center shrink-0"
          style={{ background: `${category.color}1F`, color: category.color }}
        >
          {category.count}
        </span>
        <span className="text-text-3 shrink-0">
          <Chevron />
        </span>
      </Link>
    </SwipeRow>
  )
}

function CategoryEditor({ initial, onClose, onSaved }: {
  initial: CategoryItem | null
  onClose: () => void
  onSaved: (category: CategoryItem) => void
}) {
  const isNew = !initial
  const [label, setLabel] = useState(initial?.label ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? '📁')
  const [color, setColor] = useState(initial?.color ?? '#007AFF')
  const [desc, setDesc] = useState(initial?.desc ?? '')
  const [saving, setSaving] = useState(false)
  const [pickingIcon, setPickingIcon] = useState(false)

  async function save() {
    if (!label.trim() || saving) return
    setSaving(true)
    const { key } = await saveRecordCategory({
      key: initial?.key,
      label: label.trim(),
      icon: icon.trim() || '📁',
      color,
      desc: desc.trim() || undefined,
    })
    onSaved({
      key,
      label: label.trim(),
      icon: icon.trim() || '📁',
      color,
      desc: desc.trim() || 'Household things',
      href: `/life/${key}`,
      count: initial?.count ?? 0,
    })
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg bg-surface rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 bg-border rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <button onClick={onClose} className="text-[15px] text-text-2 active:opacity-60">Cancel</button>
          <p className="text-[15px] font-semibold text-text-1">{isNew ? 'New category' : 'Edit category'}</p>
          <button
            onClick={save}
            disabled={!label.trim() || saving}
            className="text-[15px] font-semibold text-accent disabled:opacity-40 active:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPickingIcon(v => !v)}
              className="relative w-14 h-14 rounded-2xl flex items-center justify-center text-[30px] shrink-0 active:scale-95 transition-transform"
              style={{ background: `${color}1F` }}
              aria-label="Choose icon"
            >
              {icon || '📁'}
              <span className="absolute -bottom-1 -right-1 w-[22px] h-[22px] rounded-full bg-accent flex items-center justify-center ring-2 ring-surface">
                <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                  <path d={pickingIcon ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'} />
                </svg>
              </span>
            </button>
            <div className="flex-1 bg-surface-2 rounded-2xl overflow-hidden">
              <input
                autoFocus={isNew}
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Category name"
                className="w-full px-4 py-3 text-[16px] font-semibold text-text-1 placeholder:text-text-3 bg-transparent outline-none"
              />
            </div>
          </div>

          {pickingIcon && (
            <div className="bg-surface-2 rounded-2xl p-3">
              <div className="grid grid-cols-7 gap-1.5">
                {CATEGORY_EMOJIS.map(e => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => { setIcon(e); setPickingIcon(false) }}
                    className={`aspect-square rounded-xl flex items-center justify-center text-[22px] active:scale-90 transition-transform ${icon === e ? 'bg-accent-bg ring-1 ring-accent' : 'bg-surface'}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <div className="mt-2.5 flex items-center gap-2 bg-surface rounded-xl px-3">
                <span className="text-[12.5px] text-text-2 shrink-0">Or type your own</span>
                <input
                  onChange={e => { const v = e.target.value.slice(0, 4); if (v) { setIcon(v); setPickingIcon(false) } }}
                  placeholder="🙂"
                  className="flex-1 py-2.5 text-[20px] bg-transparent outline-none text-left placeholder:text-text-3"
                  aria-label="Type any emoji"
                />
              </div>
            </div>
          )}

          <div className="bg-surface-2 rounded-2xl overflow-hidden">
            <input
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Short description (optional)"
              className="w-full px-4 py-3 text-[14px] text-text-1 placeholder:text-text-3 bg-transparent outline-none"
            />
          </div>

          <div>
            <p className="px-1 mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-2">Colour</p>
            <div className="flex flex-wrap gap-3">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-9 h-9 rounded-full transition-transform active:scale-90"
                  style={{
                    background: c,
                    boxShadow: color === c ? `0 0 0 2.5px var(--surface), 0 0 0 4.5px ${c}` : 'none',
                  }}
                  aria-label={`Colour ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="h-2" />
        </div>
      </div>
    </div>
  )
}

function DeleteConfirm({ category, onCancel, onConfirm }: {
  category: CategoryItem
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-8"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="w-full max-w-[300px] bg-surface rounded-3xl overflow-hidden">
        <div className="px-5 pt-5 pb-4 text-center">
          <p className="text-[17px] font-bold text-text-1">Delete “{category.label}”?</p>
          <p className="text-[13.5px] text-text-2 mt-1.5">
            {category.count > 0
              ? `This category has ${category.count} ${category.count === 1 ? 'item' : 'items'}. They will not be deleted, but you will need another category to find them.`
              : 'This category will be removed.'}
          </p>
        </div>
        <div className="grid grid-cols-2 border-t border-border">
          <button onClick={onCancel} className="py-3.5 text-[16px] font-semibold text-accent active:bg-surface-2 border-r border-border">
            Cancel
          </button>
          <button onClick={onConfirm} className="py-3.5 text-[16px] font-semibold text-red active:bg-surface-2">
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export function RecordsOverview({ data }: { data: RecordsOverviewData }) {
  const [query, setQuery] = useState('')
  const trimmed = query.trim().toLowerCase()

  const [categories, setCategories] = useState<CategoryItem[]>(data.categories)
  const [editing, setEditing] = useState<CategoryItem | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<CategoryItem | null>(null)
  const [, startTransition] = useTransition()

  const filteredEntities = useMemo(() => {
    if (!trimmed) return data.entities
    return data.entities.filter(entity => entity.searchText.includes(trimmed))
  }, [data.entities, trimmed])

  function handleSaved(saved: CategoryItem) {
    setCategories(prev => {
      const exists = prev.some(c => c.key === saved.key)
      return exists ? prev.map(c => (c.key === saved.key ? saved : c)) : [...prev, saved]
    })
    setEditing(null)
  }

  function requestDelete(category: CategoryItem) {
    if (category.count > 0) {
      setConfirmDelete(category)
    } else {
      removeCategory(category)
    }
  }

  function removeCategory(category: CategoryItem) {
    setCategories(prev => prev.filter(c => c.key !== category.key))
    setConfirmDelete(null)
    startTransition(async () => {
      await deleteRecordCategory(category.key)
    })
  }

  return (
    <div className="flex flex-col max-w-lg mx-auto pb-4">
      <header className="px-5 pt-5 pb-5">
        <h1 className="text-[34px] leading-tight font-extrabold text-text-1 tracking-tight">Vault</h1>
        <p className="text-[16px] text-text-2 mt-1">The important bits, all in one place.</p>
      </header>

      <section className="mx-4 mb-4">
        <Link href="/life/admin/ai" className="bg-surface rounded-2xl px-4 py-3.5 flex items-center gap-3 active:bg-surface-2">
          <div className="w-10 h-10 rounded-[12px] bg-accent-bg flex items-center justify-center text-[13px] font-bold text-accent shrink-0">AI</div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-text-1">AI Log</p>
            <p className="text-[12px] text-text-2 truncate">Review captures, plans, and actual changes</p>
          </div>
          <span className="text-text-3 shrink-0">
            <Chevron />
          </span>
        </Link>
      </section>

      <div className="mx-4 mb-5 h-12 rounded-[14px] bg-surface-2 flex items-center gap-2.5 px-3.5 text-text-2">
        <SearchIcon />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search people, policies, providers..."
          className="flex-1 bg-transparent outline-none text-[16px] text-text-1 placeholder:text-text-2"
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-[13px] font-semibold text-text-2 px-1 active:opacity-60">
            Clear
          </button>
        )}
      </div>

      {trimmed ? (
        <section className="mx-4 mb-5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-text-3 mb-2">
            {filteredEntities.length === 1 ? '1 result' : `${filteredEntities.length} results`}
          </p>
          {filteredEntities.length > 0 ? (
            <div className="flex flex-col gap-2">
              {filteredEntities.map(entity => <EntityCard key={entity.id} entity={entity} />)}
            </div>
          ) : (
            <div className="bg-surface rounded-2xl px-5 py-8 text-center">
              <p className="text-[15px] font-semibold text-text-1">Nothing found</p>
              <p className="text-[13px] text-text-2 mt-1">Try a provider, account, person or place.</p>
            </div>
          )}
        </section>
      ) : (
        <>
          {data.attention.length > 0 && (
            <section className="mx-4 mb-5">
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="w-2 h-2 rounded-full bg-amber" />
                <p className="text-[12px] font-bold uppercase tracking-wide text-text-3">Needs attention</p>
              </div>
              <div className="bg-surface rounded-2xl overflow-hidden">
                {data.attention.map((item, index) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 active:bg-surface-2 ${index > 0 ? 'border-t border-border' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[14.5px] font-semibold text-text-1 truncate">{item.title}</p>
                      <p className="text-[12px] text-text-2 mt-0.5 truncate">{item.subtitle}</p>
                    </div>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                      item.tone === 'red'
                        ? 'bg-red-bg text-red'
                        : item.tone === 'orange'
                          ? 'bg-amber-bg text-amber'
                          : 'bg-accent-bg text-accent'
                    }`}>
                      {item.label}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="mx-4 mb-6">
            <div className="flex items-center justify-between mb-2.5 px-1">
              <p className="text-[12px] font-bold uppercase tracking-wide text-text-3">Categories</p>
              <button
                onClick={() => setEditing('new')}
                className="flex items-center gap-1 text-[13.5px] font-semibold text-accent active:opacity-60"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="w-3.5 h-3.5">
                  <path d="M8 3.5v9M3.5 8h9" />
                </svg>
                Add
              </button>
            </div>

            <div className="bg-surface rounded-2xl overflow-hidden">
              {categories.map((category, index) => (
                <CategoryRow
                  key={category.key}
                  category={category}
                  onEdit={() => setEditing(category)}
                  onDelete={() => requestDelete(category)}
                  isFirst={index === 0}
                />
              ))}
              {categories.length > 0 && (
                <button
                  onClick={() => setEditing('new')}
                  className="border-t border-border w-full flex items-center gap-3 px-4 py-3.5 active:bg-surface-2"
                >
                  <div className="w-11 h-11 rounded-[13px] bg-accent-bg flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="w-4 h-4 text-accent">
                      <path d="M8 3.5v9M3.5 8h9" />
                    </svg>
                  </div>
                  <p className="text-[15.5px] font-semibold text-accent">Add category</p>
                </button>
              )}
              {categories.length === 0 && (
                <button
                  onClick={() => setEditing('new')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-surface-2"
                >
                  <div className="w-11 h-11 rounded-[13px] bg-accent-bg flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="w-4 h-4 text-accent">
                      <path d="M8 3.5v9M3.5 8h9" />
                    </svg>
                  </div>
                  <p className="text-[15.5px] font-semibold text-accent">Add category</p>
                </button>
              )}
            </div>

            <p className="px-1 mt-2.5 text-[12px] text-text-3">Swipe a category to edit or delete it.</p>
          </section>
        </>
      )}

      {editing && (
        <CategoryEditor
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      {confirmDelete && (
        <DeleteConfirm
          category={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => removeCategory(confirmDelete)}
        />
      )}
    </div>
  )
}
