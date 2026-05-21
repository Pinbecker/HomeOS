'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import type { CategoryMeta } from '../categories'

type EditableCategoryMeta = Omit<CategoryMeta, 'key'> & {
  key: string
  isCustom?: boolean
}

const PRESET_COLORS = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759',
  '#007AFF', '#5856D6', '#AF52DE', '#FF2D55',
  '#00C7BE', '#8E8E93',
]

function AddCategoryModal({ onClose, onAdded }: {
  onClose: () => void
  onAdded: (cat: EditableCategoryMeta) => void
}) {
  const [label, setLabel] = useState('')
  const [icon, setIcon] = useState('📁')
  const [color, setColor] = useState('#007AFF')
  const [desc, setDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!label.trim()) return
    setSaving(true)
    const key = `custom_${label.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`
    setError('')
    onAdded({ key, label: label.trim(), icon, color, desc: desc.trim(), defaultFields: ['Detail', 'Value'], isCustom: true })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg bg-surface rounded-t-3xl pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 bg-border rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <button onClick={onClose} className="text-[15px] text-text-2 active:opacity-60">Cancel</button>
          <p className="text-[15px] font-semibold text-text-1">New Section</p>
          <button
            onClick={save}
            disabled={!label.trim() || saving}
            className="text-[15px] font-semibold text-accent disabled:opacity-40 active:opacity-60"
          >
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {/* Icon + name row */}
          <div className="flex items-center gap-3">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
              style={{ background: `${color}1F` }}
            >
              {icon}
            </div>
            <div className="flex-1 bg-surface-2 rounded-2xl overflow-hidden">
              <input
                autoFocus
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Section name"
                className="w-full px-4 py-3 text-[16px] font-semibold text-text-1 placeholder:text-text-3 bg-transparent outline-none"
              />
            </div>
          </div>

          {/* Emoji */}
          <div className="bg-surface-2 rounded-2xl overflow-hidden">
            <input
              value={icon}
              onChange={e => setIcon(e.target.value)}
              placeholder="Icon (emoji)"
              className="w-full px-4 py-3 text-[22px] bg-transparent outline-none text-center"
            />
          </div>

          {/* Desc */}
          <div className="bg-surface-2 rounded-2xl overflow-hidden">
            <input
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Short description (optional)"
              className="w-full px-4 py-3 text-[14px] text-text-1 placeholder:text-text-3 bg-transparent outline-none"
            />
          </div>

          {/* Color */}
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
                />
              ))}
            </div>
          </div>

          {error && <p className="text-[13px] text-red px-1">{error}</p>}
          <div className="h-2" />
        </div>
      </div>
    </div>
  )
}

export function AdminClient({
  categories,
  counts,
  hiddenCategories: initialHidden,
}: {
  categories: CategoryMeta[]
  counts: Record<string, number>
  hiddenCategories: string[]
}) {
  const [cats, setCats] = useState<EditableCategoryMeta[]>(categories)
  const [hidden, setHidden] = useState(initialHidden)
  const [managing, setManaging] = useState(false)
  const [addingNew, setAddingNew] = useState(false)
  const [, startTransition] = useTransition()

  const visible = cats.filter(c => !hidden.includes(c.key))
  const hiddenCats = cats.filter(c => hidden.includes(c.key))

  function handleHide(cat: EditableCategoryMeta) {
    setHidden(prev => [...prev, cat.key])
    startTransition(() => {})
  }

  function handleUnhide(key: string) {
    setHidden(prev => prev.filter(k => k !== key))
    startTransition(() => {})
  }

  function handleAdded(newCat: EditableCategoryMeta) {
    setCats(prev => [...prev, newCat])
  }

  return (
    <>
      <div className="flex flex-col max-w-lg mx-auto">
        <div className="px-3 pt-3 pb-1">
          <Link href="/life" className="flex items-center gap-1 text-accent active:opacity-60 -ml-1 w-fit">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M10 3L5 8l5 5" />
            </svg>
            <span className="text-[16px]">Life</span>
          </Link>
        </div>

        <header className="px-5 pt-1 pb-3 flex items-center justify-between">
          <div>
            <h1 className="text-[28px] font-bold text-text-1 tracking-tight">Records & Admin</h1>
            <p className="text-[13px] text-text-2 mt-0.5">Everything important, in its place</p>
          </div>
          <button
            onClick={() => setManaging(m => !m)}
            className="text-[14px] font-semibold text-text-2 active:opacity-60 px-3 py-1.5 bg-surface-2 rounded-xl"
          >
            {managing ? 'Done' : 'Edit'}
          </button>
        </header>

        {/* Visible categories */}
        <div className="mx-4 bg-surface rounded-2xl overflow-hidden">
          {visible.map((c, i) => {
            const cnt = counts[c.key] ?? 0
            return (
              <div key={c.key} className={`flex items-center ${i > 0 ? 'border-t border-border' : ''}`}>
                {managing && (
                  <button
                    onClick={() => handleHide(c)}
                    className="pl-4 pr-2 py-3 text-red active:opacity-60 shrink-0"
                    aria-label={`Remove ${c.label}`}
                  >
                    <div className="w-6 h-6 bg-red rounded-full flex items-center justify-center">
                      <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" className="w-3.5 h-3.5">
                        <path d="M4 8h8" />
                      </svg>
                    </div>
                  </button>
                )}
                <Link
                  href={managing ? '#' : `/life/${c.key}`}
                  onClick={e => { if (managing) e.preventDefault() }}
                  className="flex-1 flex items-center gap-3.5 px-4 py-3 active:bg-surface-2"
                >
                  <div className="w-9 h-9 rounded-[9px] flex items-center justify-center text-[18px] shrink-0" style={{ background: `${c.color}1F` }}>
                    {c.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-text-1">{c.label}</p>
                    <p className="text-[12px] text-text-2 truncate">{c.desc}</p>
                  </div>
                  {cnt > 0 && (
                    <span
                      className="text-[12px] font-bold px-2 py-0.5 rounded-lg shrink-0"
                      style={{ background: `${c.color}1F`, color: c.color }}
                    >
                      {cnt}
                    </span>
                  )}
                  {!managing && (
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-text-3 shrink-0">
                      <path d="M6 4l4 4-4 4" />
                    </svg>
                  )}
                </Link>
              </div>
            )
          })}
        </div>

        {/* Hidden categories (shown in manage mode) */}
        {managing && hiddenCats.length > 0 && (
          <div className="mx-4 mt-4">
            <p className="px-1 mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-3">Hidden</p>
            <div className="bg-surface rounded-2xl overflow-hidden">
              {hiddenCats.map((c, i) => (
                <div key={c.key} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <div className="w-9 h-9 rounded-[9px] flex items-center justify-center text-[18px] shrink-0 opacity-40" style={{ background: `${c.color}1F` }}>
                    {c.icon}
                  </div>
                  <p className="flex-1 text-[15px] text-text-3">{c.label}</p>
                  <button
                    onClick={() => handleUnhide(c.key)}
                    className="text-[13px] font-semibold text-accent active:opacity-60"
                  >
                    Show
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add section button */}
        <button
          onClick={() => setAddingNew(true)}
          className="mx-4 mt-4 flex items-center gap-3 px-4 py-3 bg-surface border border-dashed border-border rounded-2xl active:bg-surface-2"
        >
          <div className="w-9 h-9 rounded-[9px] bg-accent/10 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="w-4 h-4 text-accent">
              <path d="M8 3.5v9M3.5 8h9" />
            </svg>
          </div>
          <p className="text-[15px] font-medium text-accent">Add section</p>
        </button>

        <div className="h-6" />
      </div>

      {addingNew && (
        <AddCategoryModal
          onClose={() => setAddingNew(false)}
          onAdded={cat => { handleAdded(cat); setAddingNew(false) }}
        />
      )}
    </>
  )
}
