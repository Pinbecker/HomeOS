import { useEffect, useState } from 'react'

export const DEFAULT_COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#8E8E93']

export function normalizeHex(value: string | null | undefined) {
  const raw = (value ?? '').trim()
  const expanded = /^#[0-9a-fA-F]{3}$/.test(raw)
    ? `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`
    : raw
  return /^#[0-9a-fA-F]{6}$/.test(expanded) ? expanded.toUpperCase() : null
}

function ColorWheelIcon({ color }: { color: string }) {
  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: 'conic-gradient(#ff3b30, #ff9500, #ffcc00, #34c759, #00c7be, #007aff, #5856d6, #af52de, #ff2d55, #ff3b30)' }}>
      <span className="h-5 w-5 rounded-full border-2 border-white shadow-sm" style={{ background: color }} />
    </span>
  )
}

export function ColorWheelButton({ color, onClick, label = 'Choose colour' }: { color: string; onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="transition-transform active:scale-90" aria-label={label}>
      <ColorWheelIcon color={normalizeHex(color) ?? '#007AFF'} />
    </button>
  )
}

export function ColorPickerPanel({ value, onChange, presets = DEFAULT_COLORS }: { value: string; onChange: (color: string) => void; presets?: readonly string[] }) {
  const normalized = normalizeHex(value) ?? '#007AFF'
  const [draft, setDraft] = useState(normalized)
  const [copied, setCopied] = useState(false)

  useEffect(() => setDraft(normalized), [normalized])

  function pick(next: string) {
    const hex = normalizeHex(next)
    if (!hex) {
      setDraft(next.toUpperCase())
      return
    }
    setDraft(hex)
    onChange(hex)
  }

  async function copyHex() {
    await navigator.clipboard?.writeText(normalized).catch(() => undefined)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  async function pasteHex() {
    const text = await navigator.clipboard?.readText().catch(() => '')
    const hex = normalizeHex(text)
    if (hex) pick(hex)
  }

  return (
    <div className="border-t border-border px-4 py-3.5">
      <div className="mb-3 flex flex-wrap gap-2.5">
        {presets.map(color => {
          const selected = normalizeHex(color) === normalized
          return (
            <button
              key={color}
              type="button"
              onClick={() => pick(color)}
              className="h-8 w-8 rounded-full transition-transform active:scale-90"
              style={{
                background: color,
                boxShadow: selected ? `0 0 0 2.5px var(--surface), 0 0 0 4.5px ${color}` : 'none',
              }}
              aria-label={`Colour ${color}`}
            />
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <input type="color" value={normalized} onChange={event => pick(event.target.value)} className="h-10 w-12 shrink-0 rounded-xl border border-border bg-transparent p-1" aria-label="Colour wheel" />
        <input
          value={draft}
          onChange={event => {
            const next = event.target.value.startsWith('#') ? event.target.value : `#${event.target.value}`
            pick(next)
          }}
          onBlur={() => setDraft(normalized)}
          className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 font-mono text-[14px] font-semibold uppercase text-text-1 outline-none focus:border-accent"
          aria-label="Hex colour"
        />
        <button type="button" onClick={copyHex} className="h-10 rounded-xl bg-surface-2 px-3 text-[12px] font-semibold text-text-1 active:opacity-70">{copied ? 'Copied' : 'Copy'}</button>
        <button type="button" onClick={() => { void pasteHex() }} className="h-10 rounded-xl bg-surface-2 px-3 text-[12px] font-semibold text-text-1 active:opacity-70">Paste</button>
      </div>
    </div>
  )
}

export function ColorField({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <div className="flex items-center gap-3">
        <ColorWheelButton color={value} onClick={() => setOpen(prev => !prev)} />
        <button type="button" onClick={() => setOpen(prev => !prev)} className="font-mono text-[13px] font-semibold uppercase text-text-2 active:opacity-70">{normalizeHex(value) ?? value}</button>
      </div>
      {open ? <ColorPickerPanel value={value} onChange={onChange} /> : null}
    </div>
  )
}
