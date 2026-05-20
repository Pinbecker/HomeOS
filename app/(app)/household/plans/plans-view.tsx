'use client'

import { useState, useRef } from 'react'
import { ulid } from 'ulid'
import { createHousePlan, toggleHousePlan, deleteHousePlan } from './actions'

type Plan = { id: string; title: string; status: string }

export function HousePlansView({ initialActive, initialDone }: { initialActive: Plan[]; initialDone: Plan[] }) {
  const [active, setActive] = useState(initialActive)
  const [done, setDone] = useState(initialDone)
  const [newTitle, setNewTitle] = useState('')
  const [showDone, setShowDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function addPlan() {
    const t = newTitle.trim()
    if (!t) return
    const tempId = ulid()
    setActive(prev => [...prev, { id: tempId, title: t, status: 'active' }])
    setNewTitle('')
    inputRef.current?.focus()
    createHousePlan(t).then(res => {
      if (res?.id) setActive(prev => prev.map(p => p.id === tempId ? { ...p, id: res.id } : p))
    })
  }

  function complete(plan: Plan) {
    setActive(prev => prev.filter(x => x.id !== plan.id))
    setDone(prev => [{ ...plan, status: 'completed' }, ...prev])
    toggleHousePlan(plan.id)
  }

  function uncomplete(plan: Plan) {
    setDone(prev => prev.filter(x => x.id !== plan.id))
    setActive(prev => [...prev, { ...plan, status: 'active' }])
    toggleHousePlan(plan.id)
  }

  function remove(plan: Plan, from: 'active' | 'done') {
    if (from === 'active') setActive(prev => prev.filter(x => x.id !== plan.id))
    else setDone(prev => prev.filter(x => x.id !== plan.id))
    deleteHousePlan(plan.id)
  }

  const color = '#34C759'

  function renderRow(plan: Plan, i: number, section: 'active' | 'done') {
    return (
      <div key={plan.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
        {section === 'active' ? (
          <button
            onClick={() => complete(plan)}
            className="w-[22px] h-[22px] rounded-full border-2 border-border shrink-0 active:scale-90 transition-transform"
            aria-label="Mark done"
          />
        ) : (
          <button
            onClick={() => uncomplete(plan)}
            className="w-[22px] h-[22px] rounded-full shrink-0 flex items-center justify-center active:scale-90 transition-transform"
            style={{ background: color }}
            aria-label="Mark undone"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
              <path d="M4 10.5l4 4 8-9" />
            </svg>
          </button>
        )}
        <p className={`flex-1 text-[16px] ${section === 'done' ? 'text-text-2 line-through' : 'text-text-1'} truncate`}>
          {plan.title}
        </p>
        <button
          onClick={() => remove(plan, section)}
          className="text-text-3 active:opacity-60 px-1 shrink-0"
          aria-label="Delete"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-4 h-4">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="mx-4 bg-surface rounded-2xl overflow-hidden">
        {active.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-[14px] text-text-2">No plans yet</p>
          </div>
        )}
        {active.map((plan, i) => renderRow(plan, i, 'active'))}
      </div>

      <div className="mx-4 mt-2 flex items-center gap-3 px-4 py-2.5 bg-surface rounded-2xl">
        <div className="w-[22px] h-[22px] rounded-full border-2 border-border shrink-0 opacity-40" />
        <input
          ref={inputRef}
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addPlan() }}
          placeholder="Add a plan"
          className="flex-1 bg-transparent text-[16px] text-text-1 placeholder:text-text-3 outline-none"
        />
      </div>

      {done.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowDone(s => !s)}
            className="px-5 mb-2 flex items-center gap-1.5 text-text-2 active:opacity-60"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
              className={`w-3.5 h-3.5 transition-transform ${showDone ? 'rotate-90' : ''}`}>
              <path d="M6 4l4 4-4 4" />
            </svg>
            <span className="text-[14px] font-medium">{done.length} Done</span>
          </button>
          {showDone && (
            <div className="mx-4 bg-surface rounded-2xl overflow-hidden">
              {done.map((plan, i) => renderRow(plan, i, 'done'))}
            </div>
          )}
        </div>
      )}

      <div className="h-4" />
    </>
  )
}
