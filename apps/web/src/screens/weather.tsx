import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { WeatherGlyph } from '../components/weather-glyph'
import { useAppState } from '../lib/app-store'
import { useSessionState } from '../lib/session-store'
import {
  dailyWeatherIcon,
  defaultWeatherLocationRef,
  fetchWeatherSnapshot,
  loadCachedWeather,
  locationRefForSaved,
  readSharedWeatherSettings,
  readUserWeatherSettings,
  saveSharedWeatherSettings,
  saveUserWeatherSettings,
  searchWeatherLocations,
  temperature,
  weatherIcon,
  type WeatherLocation,
  type WeatherSnapshot,
} from '../lib/weather'
import { ScreenShell } from './shell'

type WeatherLoadState = {
  snapshot: WeatherSnapshot | null
  loading: boolean
  error: string | null
}

export function WeatherHomeWidget() {
  const settings = useAppState(state => state.data.household[0]?.settings ?? null)
  const shared = readSharedWeatherSettings(settings)
  const [state, setState] = useState<WeatherLoadState>(() => ({
    snapshot: loadCachedWeather('home'),
    loading: false,
    error: null,
  }))

  useEffect(() => {
    if (!shared.home) return undefined
    let cancelled = false
    const cached = loadCachedWeather('home')
    if (cached) setState({ snapshot: cached, loading: false, error: null })
    setState(prev => ({ ...prev, loading: !prev.snapshot, error: null }))
    fetchWeatherSnapshot('home', { allowCache: true })
      .then(snapshot => {
        if (!cancelled) setState({ snapshot, loading: false, error: null })
      })
      .catch(() => {
        if (!cancelled) setState(prev => ({ ...prev, loading: false, error: prev.snapshot ? null : 'Weather unavailable' }))
      })
    return () => {
      cancelled = true
    }
  }, [shared.home?.latitude, shared.home?.longitude])

  if (!shared.home) {
    return (
      <a href="/weather" className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-accent/15 bg-accent-bg/45 px-2 text-[11px] font-semibold text-accent active:opacity-70">
        <WeatherGlyph icon="partly" className="h-4 w-4" />
        <span>Set</span>
      </a>
    )
  }

  const snapshot = state.snapshot
  const current = snapshot?.current
  const today = snapshot?.daily10[0]
  const rain = snapshot?.hourly24[0]?.rainChance ?? null
  const icon = current ? weatherIcon(current.conditionCode, current.isDay) : 'partly'

  return (
    <a href="/weather" className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] font-semibold active:opacity-75" style={tinyWeatherStyle(current?.conditionTone)}>
      <WeatherGlyph icon={icon} className="h-4 w-4" />
      <span>{current ? temperature(current.temperature) : '--'}</span>
      {rain != null ? <span className="font-medium opacity-65">{rain}%</span> : today ? <span className="font-medium opacity-65">{temperature(today.temperatureMax)}</span> : null}
    </a>
  )
}

export function WeatherPage() {
  const user = useSessionState(state => state.user)
  const settings = useAppState(state => state.data.household[0]?.settings ?? null)
  const shared = readSharedWeatherSettings(settings)
  const personal = readUserWeatherSettings(settings, user?.id)
  const locations = useMemo(() => [
    ...(shared.home ? [{ ref: 'home', label: 'Home', location: shared.home }] : []),
    ...personal.savedLocations.map(location => ({ ref: locationRefForSaved(location.id), label: location.name, location })),
  ], [personal.savedLocations, shared.home])
  const [selectedRef, setSelectedRef] = useState<string | null>(() => defaultWeatherLocationRef(shared, personal))
  const [load, setLoad] = useState<WeatherLoadState>(() => ({
    snapshot: selectedRef ? loadCachedWeather(selectedRef) : null,
    loading: false,
    error: null,
  }))
  const [settingsOpen, setSettingsOpen] = useState(!shared.home)
  const [locationsOpen, setLocationsOpen] = useState(false)

  useEffect(() => {
    const fallback = defaultWeatherLocationRef(shared, personal)
    if (!selectedRef || !locations.some(location => location.ref === selectedRef)) {
      setSelectedRef(fallback)
    }
  }, [locations, personal, selectedRef, shared])

  useEffect(() => {
    if (!selectedRef) return undefined
    let cancelled = false
    const cached = loadCachedWeather(selectedRef)
    setLoad({ snapshot: cached, loading: !cached, error: null })
    fetchWeatherSnapshot(selectedRef, { allowCache: true })
      .then(snapshot => {
        if (!cancelled) setLoad({ snapshot, loading: false, error: null })
      })
      .catch(error => {
        if (!cancelled) setLoad(prev => ({ ...prev, loading: false, error: prev.snapshot ? null : error instanceof Error ? error.message : 'Weather unavailable' }))
      })
    return () => {
      cancelled = true
    }
  }, [selectedRef])

  useEffect(() => {
    if (!user || !selectedRef?.startsWith('saved:')) return undefined
    const id = selectedRef.slice('saved:'.length)
    if (personal.lastViewedLocationId === id) return undefined
    void saveUserWeatherSettings(user.id, current => ({ ...current, lastViewedLocationId: id }))
    return undefined
  }, [personal.lastViewedLocationId, selectedRef, user])

  useEffect(() => {
    if (!settingsOpen) return undefined
    const scrollY = window.scrollY
    const previousOverflow = document.body.style.overflow
    const previousPosition = document.body.style.position
    const previousTop = document.body.style.top
    const previousWidth = document.body.style.width
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.position = previousPosition
      document.body.style.top = previousTop
      document.body.style.width = previousWidth
      window.scrollTo(0, scrollY)
    }
  }, [settingsOpen])

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    const previousTheme = meta?.getAttribute('content') ?? null
    const previousHtmlBg = document.documentElement.style.backgroundColor
    const previousBodyBg = document.body.style.backgroundColor
    const appBg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()

    if (appBg) {
      meta?.setAttribute('content', appBg)
      document.documentElement.style.backgroundColor = appBg
      document.body.style.backgroundColor = appBg
    }

    return () => {
      if (previousTheme != null) meta?.setAttribute('content', previousTheme)
      document.documentElement.style.backgroundColor = previousHtmlBg
      document.body.style.backgroundColor = previousBodyBg
    }
  }, [])

  function refresh() {
    if (!selectedRef) return
    setLoad(prev => ({ ...prev, loading: true, error: null }))
    fetchWeatherSnapshot(selectedRef)
      .then(snapshot => setLoad({ snapshot, loading: false, error: null }))
      .catch(error => setLoad(prev => ({ ...prev, loading: false, error: error instanceof Error ? error.message : 'Weather unavailable' })))
  }

  const snapshot = load.snapshot

  return (
    <ScreenShell title="Weather" showHeader={false} contentClassName="flex-1 pb-0">
      <div className="bg-bg text-text-1">
        <div className="sticky top-0 z-30 border-b border-border bg-bg px-4 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between pb-2 pt-[calc(env(safe-area-inset-top)+8px)]">
              <a href="/" className="flex h-10 w-10 items-center justify-center rounded-full text-text-1 active:bg-surface-2" aria-label="Back">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M10 3L5 8l5 5" /></svg>
              </a>
              <div className="min-w-0 px-3 text-center">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-1">Weather</p>
                <p className="mt-0.5 truncate text-[12px] font-semibold text-text-2">{snapshot?.location.name ?? 'Forecast'}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={refresh} className="flex h-10 w-10 items-center justify-center rounded-full text-text-1 active:bg-surface-2" aria-label="Refresh">
                  <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`h-5 w-5 ${load.loading ? 'animate-spin' : ''}`}><path d="M15 6a6 6 0 1 0 1 4" /><path d="M15 2v4h-4" /></svg>
                </button>
                <button onClick={() => setLocationsOpen(open => !open)} className="flex h-10 w-10 items-center justify-center rounded-full text-text-1 active:bg-surface-2" aria-label="Locations" aria-expanded={locationsOpen}>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M10 18s6-5.2 6-10A6 6 0 1 0 4 8c0 4.8 6 10 6 10Z" /><circle cx="10" cy="8" r="2" /></svg>
                </button>
                <button onClick={() => setSettingsOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-full text-text-1 active:bg-surface-2" aria-label="Settings">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.04.04a2 2 0 0 1-2.83 2.83l-.04-.04A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.05a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.04.04a2 2 0 0 1-2.83-2.83l.04-.04A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.05A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.04-.04a2 2 0 0 1 2.83-2.83l.04.04A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.05A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.04-.04a2 2 0 0 1 2.83 2.83l-.04.04A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.05A1.7 1.7 0 0 0 19.4 15Z" /></svg>
                </button>
              </div>
          </div>

          {locationsOpen && locations.length > 0 ? (
            <div className="absolute right-3 top-[calc(env(safe-area-inset-top)+52px)] z-40 w-[220px] overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_14px_36px_rgba(0,0,0,0.14)]">
              {locations.map((row, index) => (
                <button
                  key={row.ref}
                  onClick={() => {
                    setSelectedRef(row.ref)
                    setLocationsOpen(false)
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-3 text-left active:bg-accent-bg ${index > 0 ? 'border-t border-border' : ''}`}
                >
                  <span className="min-w-0 truncate text-[14px] font-semibold text-text-1">{row.ref === 'home' ? 'Home' : row.label}</span>
                  {selectedRef === row.ref ? <span className="text-[13px] font-bold text-accent">Selected</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {!shared.home ? (
          <EmptyWeatherSetup onOpenSettings={() => setSettingsOpen(true)} />
        ) : snapshot ? (
          <WeatherForecastView snapshot={snapshot} loading={load.loading} error={load.error} />
        ) : (
          <div className="px-5 pt-20 text-center text-text-1">
            <WeatherGlyph icon="partly" className="mx-auto h-16 w-16 opacity-80" />
            <p className="mt-5 text-[18px] font-bold">Weather unavailable</p>
            <p className="mt-2 text-[13px] text-text-2">{load.error ?? 'Open settings to check the home location.'}</p>
          </div>
        )}

        {settingsOpen ? (
          <WeatherSettingsSheet
            userId={user?.id ?? null}
            shared={shared}
            personal={personal}
            onClose={() => setSettingsOpen(false)}
            onSelect={ref => setSelectedRef(ref)}
          />
        ) : null}
      </div>
    </ScreenShell>
  )
}

function WeatherForecastView({ snapshot, loading, error }: { snapshot: WeatherSnapshot; loading: boolean; error: string | null }) {
  const current = snapshot.current
  const today = snapshot.daily10[0]
  const icon = weatherIcon(current.conditionCode, current.isDay)
  const [selectedDay, setSelectedDay] = useState(0)
  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const hourlyScrollRef = useRef<HTMLDivElement>(null)
  const pickedDay = snapshot.daily10[selectedDay] ?? today
  const selectedHours = useMemo(() => pickedDay ? weatherDayHours(snapshot, selectedDay, pickedDay.date) : snapshot.hourly24, [pickedDay, selectedDay, snapshot])
  const nextRain = selectedHours.find(hour => (hour.rainChance ?? 0) >= 35)
  const primaryRain = pickedDay?.rainChance ?? selectedHours[0]?.rainChance ?? null
  const rainSummary = nextRain ? `Rain from ${timeLabel24(nextRain.time)}` : primaryRain != null ? `Rain risk ${formatPercent(primaryRain)}` : 'No notable rain'

  useEffect(() => {
    setSelectedHour(null)
    const scroller = hourlyScrollRef.current
    if (!scroller) return

    window.requestAnimationFrame(() => {
      scroller.scrollTo({ left: 0, behavior: 'smooth' })
    })
  }, [selectedDay, selectedHours])

  return (
    <>
      <section className="relative h-[176px] overflow-hidden border-b border-accent-border px-5 pt-3 text-text-1" style={{ background: 'linear-gradient(145deg, color-mix(in srgb, var(--accent) 16%, var(--surface) 84%) 0%, color-mix(in srgb, var(--accent) 8%, var(--surface) 92%) 58%, var(--surface) 100%)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-bold leading-tight">{snapshot.location.name}</h1>
            <p className="mt-1 text-[13px] font-semibold text-text-2">{loading ? 'Updating forecast...' : error || snapshot.stale ? 'Using saved forecast' : `Updated ${relativeTime(snapshot.updatedAt)}`}</p>
          </div>
        </div>

        <div className="absolute right-5 top-10 flex h-[70px] w-[70px] items-center justify-center">
          <WeatherGlyph icon={icon} className="h-[68px] w-[68px]" eager />
        </div>

        <div className="mt-2.5">
          <div className="min-w-0">
            <div className="flex items-end gap-3 pr-[96px]">
              <p className="text-[58px] font-bold leading-[0.86] text-text-1">{temperature(current.temperature)}</p>
              {today ? <p className="pb-1 text-[13px] font-bold text-text-2">H {temperature(today.temperatureMax)} L {temperature(today.temperatureMin)}</p> : null}
            </div>
            <p className="mt-1.5 text-[16px] font-bold leading-tight text-text-1">{current.condition}</p>
            {today ? (
              <p className="mt-1 h-5 truncate text-[13px] font-semibold leading-5 text-text-2">
                Feels like {temperature(current.apparentTemperature)}. {rainSummary}. Wind {current.windMph ?? '--'} mph.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <main className="px-0 pb-0 text-text-1">
        <section className="border-b border-border bg-surface">
          <div className="px-5 pb-1.5 pt-3">
            <h2 className="text-[19px] font-bold">10 day forecast</h2>
          </div>
          <div className="no-scrollbar flex overflow-x-auto px-4">
            {snapshot.daily10.map((day, index) => (
              <button
                key={day.date}
                type="button"
                onClick={() => {
                  setSelectedDay(index)
                }}
                className={`relative flex min-h-[104px] w-[78px] shrink-0 flex-col items-center justify-start border-b-4 px-2 pb-2 pt-1.5 active:bg-accent-bg ${selectedDay === index ? 'border-accent bg-accent-bg' : 'border-transparent'}`}
              >
                <span className="text-[13px] font-bold text-text-1">{index === 0 ? 'Today' : weekday(day.date)}</span>
                <span className="mt-0.5 text-[11px] font-semibold text-text-2">{shortDate(day.date)}</span>
                <WeatherGlyph icon={dailyWeatherIcon(snapshot, day, index)} className="mt-1 h-7 w-7" />
                <span className="mt-1 text-[14px] font-bold text-text-1">{temperature(day.temperatureMax)}</span>
                <span className="text-[12px] font-semibold text-text-2">{temperature(day.temperatureMin)}</span>
                <span className="mt-0.5 text-[11px] font-bold text-accent">{formatPercent(day.rainChance)}</span>
              </button>
            ))}
          </div>

          {selectedHours.length > 0 ? (
            <div className="border-t border-accent-border bg-accent-bg">
              <div className="flex items-center justify-between gap-3 px-5 pb-1.5 pt-2.5">
                <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-text-2">Hourly</p>
              </div>
              <div ref={hourlyScrollRef} className="no-scrollbar overflow-x-auto px-4 pb-3">
                <div className="flex min-w-max overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_1px_0_rgba(255,255,255,0.45)_inset]">
                  {selectedHours.map((hour, index) => {
                    const showDayBreak = pickedDay ? dateKey(hour.time) !== pickedDay.date && (index === 0 || dateKey(selectedHours[index - 1]?.time) === pickedDay.date) : false
                    return (
                      <Fragment key={`${hour.time}-${index}`}>
                        {showDayBreak ? <DayBreakMarker label={weekday(dateKey(hour.time))} /> : null}
                        <HourlyColumn
                          hour={hour}
                          label={index === 0 && selectedDay === 0 ? 'Now' : timeLabel24(hour.time)}
                          isDay={selectedDay === 0 ? current.isDay : true}
                          isFirst={index === 0 && !showDayBreak}
                          selected={selectedHour === index}
                          onSelect={element => {
                            setSelectedHour(current => current === index ? null : index)
                            window.requestAnimationFrame(() => {
                              const left = element.offsetLeft
                              const width = element.offsetWidth + 142
                              const visibleLeft = hourlyScrollRef.current?.scrollLeft ?? 0
                              const visibleRight = visibleLeft + (hourlyScrollRef.current?.clientWidth ?? 0)
                              if (left < visibleLeft || left + width > visibleRight) {
                                hourlyScrollRef.current?.scrollTo({ left: Math.max(0, left - 12), behavior: 'smooth' })
                              }
                            })
                          }}
                        />
                      </Fragment>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="px-5 pb-4 pt-3 text-center text-[13px] font-semibold text-text-2">No hourly forecast available for this day.</div>
          )}
        </section>

      </main>
    </>
  )
}

function HourlyColumn({ hour, label, isDay, isFirst, selected, onSelect }: { hour: WeatherSnapshot['hourly24'][number]; label: string; isDay: boolean; isFirst: boolean; selected: boolean; onSelect: (element: HTMLButtonElement) => void }) {
  return (
    <>
      <button
        type="button"
        onClick={event => onSelect(event.currentTarget)}
        className={`flex w-[74px] shrink-0 flex-col items-center px-2 py-2.5 text-center ${isFirst ? '' : 'border-l border-border'} ${selected ? 'bg-accent-bg' : 'bg-surface active:bg-bg'}`}
        aria-pressed={selected}
      >
        <span className="h-5 text-[12px] font-bold text-text-1">{label}</span>
        <WeatherGlyph icon={weatherIcon(hour.conditionCode, isDay)} className="mt-1.5 h-8 w-8" />
        <span className="mt-1.5 text-[17px] font-bold leading-none text-text-1">{temperature(hour.temperature)}</span>
        <span className="mt-1.5 text-[11px] font-bold text-accent">{formatPercent(hour.rainChance)}</span>
        <span className="mt-1.5 text-[11px] font-semibold leading-tight text-text-2">{hour.windMph ?? '--'} mph</span>
        <span className="mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface-2 text-text-2" aria-hidden="true">
          <svg viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3">
            <path d="M6 1.5l3.2 8.2L6 8.2 2.8 9.7 6 1.5Z" />
          </svg>
        </span>
      </button>
      {selected ? <HourlyDetail hour={hour} /> : null}
    </>
  )
}

function DayBreakMarker({ label }: { label: string }) {
  return (
    <div className="flex w-[46px] shrink-0 items-center justify-center border-l border-r border-accent-border bg-accent-bg px-1 text-center">
      <span className="text-[10px] font-bold uppercase leading-3 tracking-[0.06em] text-accent">{label}</span>
    </div>
  )
}

function HourlyDetail({ hour }: { hour: WeatherSnapshot['hourly24'][number] }) {
  const isDay = Number(hour.time.slice(11, 13)) >= 7 && Number(hour.time.slice(11, 13)) <= 20
  return (
    <div className="weather-hour-detail w-[142px] shrink-0 border-l border-accent-border bg-accent-bg px-2.5 py-2.5 text-text-1 shadow-[inset_4px_0_0_var(--accent-border)]">
      <div className="flex items-start gap-2">
        <WeatherGlyph icon={weatherIcon(hour.conditionCode, isDay)} className="h-9 w-9 shrink-0" />
        <div className="min-w-0">
          <p className="text-[12px] font-bold">{timeLabel24(hour.time)}</p>
          <p className="mt-0.5 truncate text-[14px] font-bold">{hour.condition}</p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5 rounded-lg bg-surface px-2 py-2 text-[10.5px] font-semibold text-text-2 shadow-[0_1px_0_rgba(255,255,255,0.5)_inset]">
        <span>Feels</span>
        <span className="text-right text-text-1">{temperature(hour.apparentTemperature)}</span>
        <span>Rain</span>
        <span className="text-right text-text-1">{formatPercent(hour.rainChance)}</span>
        <span>Wind</span>
        <span className="text-right text-text-1">{hour.windMph ?? '--'} mph</span>
        <span>Humidity</span>
        <span className="text-right text-text-1">{hour.humidity ?? '--'}%</span>
        <span>UV</span>
        <span className="text-right text-text-1">{hour.uvIndex ?? '--'}</span>
      </div>
    </div>
  )
}

function WeatherSettingsSheet({ userId, shared, personal, onClose, onSelect }: { userId: string | null; shared: ReturnType<typeof readSharedWeatherSettings>; personal: ReturnType<typeof readUserWeatherSettings>; onClose: () => void; onSelect: (ref: string) => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/30 backdrop-blur-sm">
      <div className="safe-bottom flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-bg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-3">Weather</p>
            <h2 className="text-[24px] font-bold text-text-1">Settings</h2>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-text-2 active:opacity-70" aria-label="Close">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-4 w-4"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <section className="mb-5 rounded-2xl bg-surface p-4">
            <p className="text-[15px] font-bold text-text-1">Family home</p>
            <p className="mt-1 text-[13px] text-text-2">{shared.home ? shared.home.name : 'Used by the Home screen weather tile.'}</p>
            <LocationSearch
              placeholder="Search for the family home location"
              onPick={location => {
                void saveSharedWeatherSettings(current => ({ ...current, home: { ...location, id: 'home' } }))
                onSelect('home')
              }}
            />
          </section>

          <section className="rounded-2xl bg-surface p-4">
            <p className="text-[15px] font-bold text-text-1">My locations</p>
            <p className="mt-1 text-[13px] text-text-2">Saved only for your account.</p>
            {personal.savedLocations.length > 0 ? (
              <div className="mt-3 overflow-hidden rounded-2xl bg-bg">
                {personal.savedLocations.map((location, index) => (
                  <div key={location.id} className={`flex items-center gap-3 px-3 py-3 ${index > 0 ? 'border-t border-border' : ''}`}>
                    <button onClick={() => { onSelect(locationRefForSaved(location.id)); onClose() }} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-[14px] font-semibold text-text-1">{location.name}</p>
                      {location.subtitle ? <p className="truncate text-[12px] text-text-2">{location.subtitle}</p> : null}
                    </button>
                    <button disabled={!userId || index === 0} onClick={() => userId && moveSavedLocation(userId, personal.savedLocations, index, -1)} className="px-2 text-[13px] font-semibold text-accent disabled:text-text-3" aria-label="Move up">Up</button>
                    <button disabled={!userId || index === personal.savedLocations.length - 1} onClick={() => userId && moveSavedLocation(userId, personal.savedLocations, index, 1)} className="px-2 text-[13px] font-semibold text-accent disabled:text-text-3" aria-label="Move down">Down</button>
                    <button disabled={!userId} onClick={() => userId && removeSavedLocation(userId, personal.savedLocations, location.id)} className="px-1 text-[13px] font-semibold text-red disabled:text-text-3">Remove</button>
                  </div>
                ))}
              </div>
            ) : null}
            <LocationSearch
              placeholder="Add another location"
              onPick={location => {
                if (!userId) return
                const exists = personal.savedLocations.some(row => row.id === location.id)
                void saveUserWeatherSettings(userId, current => ({
                  ...current,
                  savedLocations: exists ? current.savedLocations : [...current.savedLocations, location],
                  lastViewedLocationId: location.id,
                }))
                onSelect(locationRefForSaved(location.id))
              }}
            />
          </section>
        </div>
      </div>
    </div>
  )
}

function LocationSearch({ placeholder, onPick }: { placeholder: string; onPick: (location: WeatherLocation) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<WeatherLocation[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return undefined
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      searchWeatherLocations(query)
        .then(next => {
          if (!cancelled) setResults(next)
        })
        .catch(() => {
          if (!cancelled) setResults([])
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 rounded-2xl bg-bg px-3 py-2.5">
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-4 w-4 shrink-0 text-text-3"><circle cx="8" cy="8" r="5" /><path d="M12 12l3 3" /></svg>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-[16px] text-text-1 outline-none placeholder:text-text-3" />
      </div>
      {loading ? <p className="mt-3 px-1 text-[12px] text-text-2">Searching...</p> : null}
      {results.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-2xl bg-bg">
          {results.map((location, index) => (
            <button key={location.id} onClick={() => { onPick(location); setQuery(''); setResults([]) }} className={`flex w-full items-center justify-between gap-3 px-3 py-3 text-left active:bg-surface-2 ${index > 0 ? 'border-t border-border' : ''}`}>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-text-1">{location.name}</span>
                {location.subtitle ? <span className="block truncate text-[12px] text-text-2">{location.subtitle}</span> : null}
              </span>
              <span className="shrink-0 text-[13px] font-semibold text-accent">Add</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function EmptyWeatherSetup({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="px-5 pt-20 text-center text-text-1">
      <WeatherGlyph icon="partly" className="mx-auto h-20 w-20 opacity-90" />
      <h1 className="mt-6 text-[34px] font-bold leading-tight tracking-normal">Set your home weather</h1>
      <p className="mx-auto mt-3 max-w-[280px] text-[14px] leading-6 text-text-2">Choose the family home location once, then add your own saved places from settings.</p>
      <button onClick={onOpenSettings} className="mt-7 rounded-full bg-accent px-5 py-3 text-[15px] font-bold text-white active:opacity-80">Open settings</button>
    </div>
  )
}

function tinyWeatherStyle(tone?: string): CSSProperties {
  const base = toneColors(tone)
  return {
    background: `color-mix(in srgb, ${base[0]} 12%, var(--surface))`,
    borderColor: `color-mix(in srgb, ${base[1]} 18%, transparent)`,
    color: base[1],
  }
}

function toneColors(tone?: string) {
  if (tone === 'rain' || tone === 'storm') return ['#3A7CA5', '#1C4B66', 'rgba(28,75,102,0.25)']
  if (tone === 'snow') return ['#86BBD8', '#4D7EA8', 'rgba(77,126,168,0.22)']
  if (tone === 'fog' || tone === 'cloud') return ['#7D8FA3', '#4E6174', 'rgba(78,97,116,0.24)']
  if (tone === 'clear-night' || tone === 'partly-night') return ['#273469', '#101935', 'rgba(16,25,53,0.28)']
  return ['#2DA8FF', '#0066D9', 'rgba(0,102,217,0.24)']
}

function relativeTime(value: string) {
  const diff = Math.max(0, Date.now() - Date.parse(value))
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
}

function timeLabel24(value: string) {
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function weatherDayHours(snapshot: WeatherSnapshot, selectedDay: number, date: string) {
  if (selectedDay === 0) {
    const nextDate = addDays(date, 1)
    const end = hourBoundary(nextDate, 5)
    return uniqueHours(snapshot.hourly24).filter(hour => {
      const time = Date.parse(hour.time)
      return time <= end
    })
  }

  const currentDay = snapshot.hourlyByDay?.[date] ?? []
  const nextDate = addDays(date, 1)
  const nextDay = snapshot.hourlyByDay?.[nextDate] ?? []
  const combined = uniqueHours([...currentDay, ...nextDay])
  const start = hourBoundary(date, 6)
  const end = hourBoundary(nextDate, 5)
  return combined.filter(hour => {
    const time = Date.parse(hour.time)
    return time >= start && time <= end
  })
}

function uniqueHours(hours: WeatherSnapshot['hourly24']) {
  const seen = new Set<string>()
  return hours.filter(hour => {
    if (seen.has(hour.time)) return false
    seen.add(hour.time)
    return true
  })
}

function hourBoundary(date: string, hour: number) {
  return new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).getTime()
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T12:00:00`)
  next.setDate(next.getDate() + days)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

function dateKey(value: string | undefined) {
  if (!value) return ''
  return value.slice(0, 10)
}

function weekday(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })
}

function shortDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function fullDay(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

function selectedDayLabel(index: number, date?: string) {
  if (!date) return 'Selected day'
  if (index === 0) return 'Today'
  return fullDay(date)
}

function formatPercent(value: number | null | undefined) {
  return value == null ? '--' : `${value}%`
}

function moveSavedLocation(userId: string, locations: WeatherLocation[], index: number, delta: number) {
  const next = [...locations]
  const target = index + delta
  if (target < 0 || target >= next.length) return
  const [item] = next.splice(index, 1)
  if (!item) return
  next.splice(target, 0, item)
  void saveUserWeatherSettings(userId, current => ({ ...current, savedLocations: next }))
}

function removeSavedLocation(userId: string, locations: WeatherLocation[], id: string) {
  void saveUserWeatherSettings(userId, current => ({
    ...current,
    savedLocations: locations.filter(location => location.id !== id),
    lastViewedLocationId: current.lastViewedLocationId === id ? null : current.lastViewedLocationId,
  }))
}
