'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { HouseholdEntity, RecordsOverviewData } from '@/lib/entities/records'

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
      className="bg-surface border border-border rounded-2xl px-4 py-3.5 active:bg-surface-2 transition-colors"
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

export function RecordsOverview({ data }: { data: RecordsOverviewData }) {
  const [query, setQuery] = useState('')
  const trimmed = query.trim().toLowerCase()

  const filteredEntities = useMemo(() => {
    if (!trimmed) return data.entities
    return data.entities.filter(entity => entity.searchText.includes(trimmed))
  }, [data.entities, trimmed])

  return (
    <div className="flex flex-col max-w-lg mx-auto pb-4">
      <div className="px-3 pt-3 pb-2">
        <Link href="/life" className="flex items-center gap-1 text-accent active:opacity-60 -ml-1 w-fit">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M10 3L5 8l5 5" />
          </svg>
          <span className="text-[16px]">Life</span>
        </Link>
      </div>

      <header className="px-5 pt-1 pb-5">
        <h1 className="text-[40px] leading-[0.95] font-extrabold text-text-1 tracking-tight">Records</h1>
        <p className="text-[18px] text-text-2 mt-2">The important bits of home, connected.</p>
      </header>

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
            <div className="bg-surface border border-border rounded-2xl px-5 py-8 text-center">
              <p className="text-[15px] font-semibold text-text-1">Nothing found</p>
              <p className="text-[13px] text-text-2 mt-1">Try a provider, account, person or place.</p>
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="mx-4 mb-5">
            <div className="bg-surface border border-border rounded-[26px] shadow-[0_12px_28px_rgba(0,0,0,0.04)] p-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-3.5 h-3.5 rounded-full bg-amber shadow-[0_0_0_6px_rgba(255,149,0,0.14)]" />
                <h2 className="text-[21px] font-extrabold text-text-1">Needs attention</h2>
              </div>

              {data.attention.length > 0 ? (
                <div>
                  {data.attention.map((item, index) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={`grid grid-cols-[1fr_auto] gap-3 py-3 active:bg-bg ${index > 0 ? 'border-t border-border' : ''}`}
                    >
                      <div className="min-w-0">
                        <p className="text-[16px] font-semibold text-text-1 truncate">{item.title}</p>
                        <p className="text-[13px] text-text-2 mt-0.5 truncate">{item.subtitle}</p>
                      </div>
                      <span className={`text-[12px] font-bold px-2.5 py-1 rounded-full self-start ${
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
              ) : (
                <div className="py-3">
                  <p className="text-[15px] font-semibold text-text-1">All calm</p>
                  <p className="text-[13px] text-text-2 mt-0.5">No renewals or due dates need attention right now.</p>
                </div>
              )}
            </div>
          </section>

          <section className="mx-4 mb-6">
            <p className="text-[12px] font-bold uppercase tracking-wide text-text-3 mb-2">Useful views</p>
            <div className="bg-surface border border-border rounded-2xl overflow-hidden mb-3">
              {data.lenses.map((lens, index) => (
                <Link
                  key={lens.key}
                  href={lens.href}
                  className={`flex items-center gap-3 px-4 py-3 active:bg-surface-2 ${index > 0 ? 'border-t border-border' : ''}`}
                >
                  <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[18px]" style={{ background: `${lens.color}1F` }}>
                    {lens.icon}
                  </div>
                  <p className="flex-1 text-[15px] font-semibold text-text-1">{lens.label}</p>
                  <span className="text-[12px] font-bold text-text-2">{lens.count}</span>
                  <span className="text-text-3"><Chevron /></span>
                </Link>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {data.viewCards.map(card => (
                  <Link
                    key={card.title}
                    href={card.href}
                    className="bg-surface border border-border rounded-2xl p-3.5 min-h-[112px] active:bg-surface-2 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[24px] leading-none">{card.icon}</span>
                      <span className="text-[11px] font-bold text-text-2 bg-surface-2 rounded-full px-2 py-0.5">
                        {card.countLabel}
                      </span>
                    </div>
                    <p className="text-[14.5px] font-bold text-text-1 mt-3 leading-tight">{card.title}</p>
                    <p className="text-[11.5px] text-text-2 mt-1 leading-snug">{card.subtitle}</p>
                  </Link>
                ))}
            </div>
          </section>
        </>
      )}

      {data.entities.length === 0 && !trimmed && (
        <div className="mx-4 bg-surface border border-border rounded-2xl px-5 py-8 text-center">
          <p className="text-[15px] font-semibold text-text-1">Start with one household thing</p>
          <p className="text-[13px] text-text-2 mt-1">Add a policy, provider, boiler, car, pet or important contact.</p>
          <Link href="/life/home" className="inline-flex mt-4 text-[15px] font-semibold text-accent active:opacity-60">
            Add from a lens
          </Link>
        </div>
      )}
    </div>
  )
}
