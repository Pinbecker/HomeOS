export type ThemeMode = 'light' | 'auto' | 'dark'

const DEFAULT_ACCENT = '#007AFF'
let activeUserId: string | null = null
const LEGACY_ACCENTS: Record<string, string> = {
  blue: '#007AFF',
  purple: '#AF52DE',
  pink: '#FF2D55',
  green: '#34C759',
  orange: '#FF9500',
  teal: '#32ADE6',
  indigo: '#5856D6',
}

function normalizeHex(value: string | null | undefined) {
  const raw = (value ?? '').trim()
  const expanded = /^#[0-9a-fA-F]{3}$/.test(raw)
    ? `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`
    : raw
  return /^#[0-9a-fA-F]{6}$/.test(expanded) ? expanded.toUpperCase() : null
}

function hexToRgb(hex: string) {
  const clean = hex.slice(1)
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  }
}

export function currentAccent() {
  if (typeof window === 'undefined') return DEFAULT_ACCENT
  return normalizeHex(localStorage.getItem(appearanceKey('accentHex')))
    ?? normalizeHex(localStorage.getItem('accentHex'))
    ?? LEGACY_ACCENTS[localStorage.getItem(appearanceKey('accent')) ?? '']
    ?? LEGACY_ACCENTS[localStorage.getItem('accent') ?? '']
    ?? DEFAULT_ACCENT
}

export function applyAccent(hex: string) {
  const normalized = normalizeHex(hex) ?? DEFAULT_ACCENT
  const { r, g, b } = hexToRgb(normalized)
  const root = document.documentElement

  root.style.setProperty('--accent', normalized)
  root.style.setProperty('--accent-bg', `rgba(${r},${g},${b},0.12)`)
  root.style.setProperty('--accent-border', `rgba(${r},${g},${b},0.24)`)
  root.removeAttribute('data-accent')
  localStorage.setItem(appearanceKey('accentHex'), normalized)
  localStorage.setItem(appearanceKey('accent'), 'custom')
}

export function applyThemeMode(mode: ThemeMode) {
  const root = document.documentElement
  localStorage.setItem(appearanceKey('theme'), mode)

  if (mode === 'dark') {
    root.classList.add('dark')
  } else if (mode === 'light') {
    root.classList.remove('dark')
  } else {
    root.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches)
  }
}

export function currentThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'auto'
  return (localStorage.getItem(appearanceKey('theme')) as ThemeMode | null)
    ?? (localStorage.getItem('theme') as ThemeMode | null)
    ?? 'auto'
}

export function applyStoredAppearance() {
  if (typeof window === 'undefined') return
  applyThemeMode(currentThemeMode())
  applyAccent(currentAccent())
}

export function applySyncedAppearance(value: unknown) {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const theme = source.theme
  const accentHex = normalizeHex(typeof source.accentHex === 'string' ? source.accentHex : null)

  if (theme === 'light' || theme === 'auto' || theme === 'dark') {
    applyThemeMode(theme)
  }
  if (accentHex) applyAccent(accentHex)
}

export function setAppearanceUserContext(userId: string | null) {
  activeUserId = userId
  applyStoredAppearance()
}

export function watchAutoTheme(onChange?: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const handle = () => {
    if (currentThemeMode() === 'auto') {
      document.documentElement.classList.toggle('dark', media.matches)
      onChange?.()
    }
  }
  media.addEventListener('change', handle)
  return () => media.removeEventListener('change', handle)
}

export function actualThemeIsDark() {
  return document.documentElement.classList.contains('dark')
}

function appearanceKey(key: string) {
  return activeUserId ? `homeos:user:${activeUserId}:${key}` : key
}
