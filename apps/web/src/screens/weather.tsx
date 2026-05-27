import { useEffect, useMemo, useState } from 'react'
import { useAppState } from '../lib/app-store'
import { useSessionState } from '../lib/session-store'
import {
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
      <a href="/weather" className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-accent-bg px-2 text-[11px] font-bold text-accent active:opacity-70">
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
    <a href="/weather" className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-bold text-white shadow-sm active:opacity-75" style={tinyWeatherStyle(current?.conditionTone)}>
      <WeatherGlyph icon={icon} className="h-4 w-4" />
      <span>{current ? temperature(current.temperature) : '--'}</span>
      {rain != null ? <span className="font-semibold text-white/72">{rain}%</span> : today ? <span className="font-semibold text-white/72">{temperature(today.temperatureMax)}</span> : null}
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

  function refresh() {
    if (!selectedRef) return
    setLoad(prev => ({ ...prev, loading: true, error: null }))
    fetchWeatherSnapshot(selectedRef)
      .then(snapshot => setLoad({ snapshot, loading: false, error: null }))
      .catch(error => setLoad(prev => ({ ...prev, loading: false, error: error instanceof Error ? error.message : 'Weather unavailable' })))
  }

  const snapshot = load.snapshot
  const current = snapshot?.current
  const tone = current?.conditionTone

  return (
    <ScreenShell title="Weather" showHeader={false}>
      <div className="min-h-dvh pb-6" style={pageStyle(tone)}>
        <div className="safe-top px-4 pt-3">
          <div className="mb-3 flex items-center justify-between">
            <a href="/" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/14 text-white backdrop-blur active:opacity-70" aria-label="Back">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M10 3L5 8l5 5" /></svg>
            </a>
            <div className="flex items-center gap-2">
              <button onClick={refresh} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/14 text-white backdrop-blur active:opacity-70" aria-label="Refresh">
                <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`h-5 w-5 ${load.loading ? 'animate-spin' : ''}`}><path d="M15 6a6 6 0 1 0 1 4" /><path d="M15 2v4h-4" /></svg>
              </button>
              <button onClick={() => setSettingsOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/14 text-white backdrop-blur active:opacity-70" aria-label="Settings">
                <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M9 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path d="M14.7 10.5a1 1 0 0 0 .2 1.1l.1.1-1.7 2.9-.2-.1a1 1 0 0 0-1.1.1l-.8.5a1 1 0 0 0-.5.9v.2H7.3V16a1 1 0 0 0-.5-.9l-.8-.5a1 1 0 0 0-1.1-.1l-.2.1L3 11.7l.1-.1a1 1 0 0 0 .2-1.1 6 6 0 0 1 0-1 1 1 0 0 0-.2-1.1L3 8.3l1.7-2.9.2.1A1 1 0 0 0 6 5.4l.8-.5a1 1 0 0 0 .5-.9v-.2h3.4V4a1 1 0 0 0 .5.9l.8.5a1 1 0 0 0 1.1.1l.2-.1L15 8.3l-.1.1a1 1 0 0 0-.2 1.1 6 6 0 0 1 0 1Z" /></svg>
              </button>
            </div>
          </div>

          {locations.length > 0 ? (
            <div className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1">
              {locations.map(row => (
                <button key={row.ref} onClick={() => setSelectedRef(row.ref)} className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold backdrop-blur ${selectedRef === row.ref ? 'bg-white text-black' : 'bg-white/14 text-white'}`}>
                  {row.ref === 'home' ? 'Home' : row.label}
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
          <div className="px-5 pt-20 text-center text-white">
            <WeatherGlyph icon="partly" className="mx-auto h-16 w-16 opacity-80" />
            <p className="mt-5 text-[18px] font-bold">Weather unavailable</p>
            <p className="mt-2 text-[13px] text-white/70">{load.error ?? 'Open settings to check the home location.'}</p>
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
  const nextRain = snapshot.hourly24.find(hour => (hour.rainChance ?? 0) >= 35)
  const icon = weatherIcon(current.conditionCode, current.isDay)
  const [selectedHour, setSelectedHour] = useState(0)
  const [selectedDay, setSelectedDay] = useState(0)
  const pickedHour = snapshot.hourly24[selectedHour] ?? snapshot.hourly24[0]
  const pickedDay = snapshot.daily10[selectedDay] ?? today

  return (
    <>
      <section className="relative overflow-hidden px-5 pb-5 text-white">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] overflow-hidden">
          <div className="weather-drift absolute left-[-12%] top-12 h-28 w-[130%] rounded-full bg-white/10 blur-3xl" />
          <div className="weather-drift-slow absolute right-[-25%] top-32 h-36 w-[90%] rounded-full bg-white/12 blur-3xl" />
        </div>

        <div className="relative pt-2">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-[17px] font-semibold text-white/78">{snapshot.location.name}</p>
              <p className="mt-1 text-[13px] text-white/58">{loading ? 'Updating...' : error ? 'Using saved weather' : `Updated ${relativeTime(snapshot.updatedAt)}`}</p>
            </div>
            <div className="shrink-0 rounded-full bg-white/13 px-3 py-1.5 text-[12px] font-bold text-white/82 backdrop-blur">
              {current.condition}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-[1fr_auto] items-center gap-3">
            <div>
              <p className="text-[92px] font-bold leading-[0.82] tracking-normal">{temperature(current.temperature)}</p>
              {today ? <p className="mt-4 text-[15px] font-semibold text-white/76">Feels {temperature(current.apparentTemperature)} · H {temperature(today.temperatureMax)} L {temperature(today.temperatureMin)}</p> : null}
            </div>
            <button type="button" onClick={() => setSelectedHour(0)} className="weather-float flex h-32 w-32 items-center justify-center rounded-[36px] bg-white/12 text-white shadow-[0_24px_50px_rgba(0,0,0,0.18)] backdrop-blur active:scale-95">
              <WeatherGlyph icon={icon} className="h-24 w-24 drop-shadow-[0_14px_24px_rgba(0,0,0,0.18)]" />
            </button>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2">
            <HeroStat label="Rain" value={`${pickedHour?.rainChance ?? 0}%`} />
            <HeroStat label="Wind" value={`${current.windMph ?? '--'} mph`} />
            <HeroStat label="AQI" value={aqiLabel(snapshot.airQuality.europeanAqi)} />
          </div>
        </div>
      </section>

      <main className="px-4 pt-1 text-text-1">
        <section className="mb-4 overflow-hidden rounded-[24px] border border-white/14 bg-white/16 text-white shadow-[0_18px_48px_rgba(0,0,0,0.18)] backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/12 px-4 py-3">
            <p className="text-[13px] font-bold text-white/82">{nextRain ? `Rain possible around ${timeLabel(nextRain.time)}` : 'Next 24 hours'}</p>
            {pickedHour ? <p className="text-[12px] font-semibold text-white/58">{pickedHour.condition}</p> : null}
          </div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 py-3">
            {snapshot.hourly24.map((hour, index) => (
              <button
                key={`${hour.time}-${index}`}
                type="button"
                onClick={() => setSelectedHour(index)}
                className={`flex w-[60px] shrink-0 flex-col items-center rounded-[18px] px-2 py-2.5 transition-transform active:scale-95 ${selectedHour === index ? 'bg-white text-black shadow-lg' : 'bg-white/10 text-white'}`}
              >
                <span className={`text-[11px] font-bold ${selectedHour === index ? 'text-black/62' : 'text-white/64'}`}>{index === 0 ? 'Now' : timeLabel(hour.time)}</span>
                <WeatherGlyph icon={weatherIcon(hour.conditionCode, current.isDay)} className="mt-2 h-7 w-7" />
                <span className="mt-2 text-[15px] font-bold">{temperature(hour.temperature)}</span>
                <span className={`mt-1 text-[10px] font-bold ${selectedHour === index ? 'text-blue-600' : 'text-white/62'}`}>{hour.rainChance ?? 0}%</span>
              </button>
            ))}
          </div>
          {pickedHour ? (
            <div className="grid grid-cols-3 border-t border-white/12 px-4 py-3 text-center">
              <MiniDetail label="Feels" value={temperature(pickedHour.apparentTemperature)} />
              <MiniDetail label="Humidity" value={`${pickedHour.humidity ?? '--'}%`} />
              <MiniDetail label="Vis." value={pickedHour.visibilityKm == null ? '--' : `${pickedHour.visibilityKm}km`} />
            </div>
          ) : null}
        </section>

        <section className="mb-3 overflow-hidden rounded-[24px] bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-[13px] font-semibold text-text-2">10-day forecast</p>
            {pickedDay ? <p className="text-[12px] font-semibold text-accent">{selectedDay === 0 ? 'Today' : weekday(pickedDay.date)}</p> : null}
          </div>
          {snapshot.daily10.map((day, index) => (
            <button key={day.date} type="button" onClick={() => setSelectedDay(index)} className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-surface-2 ${selectedDay === index ? 'bg-accent-bg shadow-[inset_3px_0_0_var(--accent)]' : ''} ${index > 0 ? 'border-t border-border' : ''}`}>
              <span className="w-20 text-[14px] font-semibold text-text-1">{index === 0 ? 'Today' : weekday(day.date)}</span>
              <WeatherGlyph icon={weatherIcon(day.conditionCode, true)} className="h-6 w-6 shrink-0 text-accent" />
              <span className="w-9 text-right text-[13px] font-semibold text-text-2">{temperature(day.temperatureMin)}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-accent" style={{ width: rangeWidth(day.temperatureMin, day.temperatureMax, snapshot.daily10) }} />
              </div>
              <span className="w-9 text-[13px] font-bold text-text-1">{temperature(day.temperatureMax)}</span>
              <span className="w-9 text-right text-[11px] font-semibold text-accent">{day.rainChance ?? 0}%</span>
            </button>
          ))}
        </section>

        {pickedDay ? <DayDetailPanel day={pickedDay} selectedDay={selectedDay} /> : null}

        <section className="grid grid-cols-2 gap-3 pb-4">
          <Metric title="Wind" value={`${current.windMph ?? '--'} mph`} detail={windLabel(current.windDirection)} />
          <Metric title="Humidity" value={`${current.humidity ?? '--'}%`} detail="Relative humidity" />
          <Metric title="Pressure" value={`${current.pressureHpa ?? '--'} hPa`} detail="Surface pressure" />
          <Metric title="UV Index" value={String(snapshot.airQuality.uvIndex ?? today?.uvIndex ?? '--')} detail={uvLabel(snapshot.airQuality.uvIndex ?? today?.uvIndex)} />
          <Metric title="Air Quality" value={aqiLabel(snapshot.airQuality.europeanAqi)} detail={snapshot.airQuality.pm25 == null ? 'PM2.5 unavailable' : `PM2.5 ${snapshot.airQuality.pm25}`} />
          <Metric title="Sun" value={today?.sunrise ? timeLabel(today.sunrise) : '--'} detail={today?.sunset ? `Sunset ${timeLabel(today.sunset)}` : 'Sunrise / sunset'} />
        </section>
      </main>
    </>
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
    <div className="px-5 pt-20 text-center text-white">
      <WeatherGlyph icon="partly" className="mx-auto h-20 w-20 opacity-90" />
      <h1 className="mt-6 text-[34px] font-bold leading-tight tracking-normal">Set your home weather</h1>
      <p className="mx-auto mt-3 max-w-[280px] text-[14px] leading-6 text-white/72">Choose the family home location once, then add your own saved places from settings.</p>
      <button onClick={onOpenSettings} className="mt-7 rounded-full bg-white px-5 py-3 text-[15px] font-bold text-black active:opacity-80">Open settings</button>
    </div>
  )
}

function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="min-h-[104px] rounded-[22px] bg-surface p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-3">{title}</p>
      <p className="mt-3 text-[23px] font-bold text-text-1 tracking-normal">{value}</p>
      <p className="mt-1 text-[12px] text-text-2">{detail}</p>
    </div>
  )
}

function DayDetailPanel({ day, selectedDay }: { day: WeatherSnapshot['daily10'][number]; selectedDay: number }) {
  return (
    <section className="mb-4 overflow-hidden rounded-[26px] border border-accent-border bg-surface shadow-[0_12px_34px_rgba(0,0,0,0.08)]">
      <div className="relative overflow-hidden p-4">
        <div className="absolute right-[-22px] top-[-28px] h-28 w-28 rounded-full bg-accent-bg" />
        <div className="relative flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] bg-accent-bg text-accent">
            <WeatherGlyph icon={weatherIcon(day.conditionCode, true)} className="h-11 w-11" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-text-3">{selectedDay === 0 ? 'Today' : fullDay(day.date)}</p>
            <p className="mt-1 text-[24px] font-bold tracking-normal text-text-1">{day.condition}</p>
            <p className="mt-1 text-[13px] leading-5 text-text-2">
              {temperature(day.temperatureMin)} to {temperature(day.temperatureMax)}
              {day.apparentMin != null || day.apparentMax != null ? ` · feels ${temperature(day.apparentMin)} to ${temperature(day.apparentMax)}` : ''}
            </p>
          </div>
        </div>

        <div className="relative mt-4 grid grid-cols-4 gap-2">
          <DayChip label="Rain" value={`${day.rainChance ?? 0}%`} />
          <DayChip label="Total" value={`${day.precipitationMm ?? 0}mm`} />
          <DayChip label="Wind" value={`${day.windMph ?? '--'}mph`} />
          <DayChip label="UV" value={String(day.uvIndex ?? '--')} />
        </div>

        <div className="relative mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4">
          <SunLine label="Sunrise" value={day.sunrise ? timeLabel(day.sunrise) : '--'} />
          <SunLine label="Sunset" value={day.sunset ? timeLabel(day.sunset) : '--'} />
        </div>
      </div>
    </section>
  )
}

function DayChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] bg-bg px-2 py-2.5 text-center">
      <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-text-3">{label}</p>
      <p className="mt-1 text-[13px] font-bold tracking-normal text-text-1">{value}</p>
    </div>
  )
}

function SunLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] bg-bg px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-3">{label}</p>
      <p className="mt-1 text-[14px] font-bold tracking-normal text-text-1">{value}</p>
    </div>
  )
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-white/12 bg-white/12 px-3 py-3 text-left backdrop-blur">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/52">{label}</p>
      <p className="mt-1 text-[17px] font-bold text-white tracking-normal">{value}</p>
    </div>
  )
}

function MiniDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] opacity-50">{label}</p>
      <p className="mt-1 text-[13px] font-bold tracking-normal">{value}</p>
    </div>
  )
}

function WeatherGlyph({ icon, className = 'h-6 w-6' }: { icon: string; className?: string }) {
  if (icon === 'moon' || icon === 'partly-night') {
    return <svg viewBox="0 0 64 64" fill="none" className={className}><path d="M46 47.5A24 24 0 0 1 18.5 15 22 22 0 1 0 46 47.5Z" fill="currentColor" opacity=".96" />{icon === 'partly-night' ? <path d="M17 45h27a9 9 0 0 0-1.5-17.9A14 14 0 0 0 16.2 33 6.2 6.2 0 0 0 17 45Z" fill="currentColor" opacity=".45" /> : null}</svg>
  }
  if (icon === 'sun' || icon === 'partly') {
    return <svg viewBox="0 0 64 64" fill="none" className={className}><circle cx="30" cy="27" r="13" fill="currentColor" /><path d="M30 5v7M30 42v7M8 27h7M45 27h7M14.5 11.5l5 5M40.5 37.5l5 5M45.5 11.5l-5 5M19.5 37.5l-5 5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".82" />{icon === 'partly' ? <path d="M22 50h27a9 9 0 0 0-1.5-17.9A14 14 0 0 0 21.2 38 6.2 6.2 0 0 0 22 50Z" fill="currentColor" opacity=".72" /> : null}</svg>
  }
  if (icon === 'rain' || icon === 'storm') {
    return <svg viewBox="0 0 64 64" fill="none" className={className}><path d="M17 38h30a11 11 0 0 0-2-21.8A16 16 0 0 0 15.1 24 7.2 7.2 0 0 0 17 38Z" fill="currentColor" opacity=".9" />{icon === 'storm' ? <path d="M32 39l-7 12h7l-3 8 10-14h-7l5-6h-5Z" fill="currentColor" /> : <path d="M20 46l-3 7M32 46l-3 7M44 46l-3 7" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".85" />}</svg>
  }
  if (icon === 'snow') {
    return <svg viewBox="0 0 64 64" fill="none" className={className}><path d="M17 36h30a11 11 0 0 0-2-21.8A16 16 0 0 0 15.1 22 7.2 7.2 0 0 0 17 36Z" fill="currentColor" opacity=".78" /><path d="M22 47h.1M32 51h.1M43 47h.1" stroke="currentColor" strokeWidth="7" strokeLinecap="round" /></svg>
  }
  if (icon === 'fog') {
    return <svg viewBox="0 0 64 64" fill="none" className={className}><path d="M17 33h30a11 11 0 0 0-2-21.8A16 16 0 0 0 15.1 19 7.2 7.2 0 0 0 17 33Z" fill="currentColor" opacity=".7" /><path d="M12 43h40M18 52h30" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity=".9" /></svg>
  }
  return <svg viewBox="0 0 64 64" fill="none" className={className}><path d="M17 42h30a11 11 0 0 0-2-21.8A16 16 0 0 0 15.1 28 7.2 7.2 0 0 0 17 42Z" fill="currentColor" /></svg>
}

function tileStyle(tone?: string): React.CSSProperties {
  const base = toneColors(tone)
  return {
    background: `linear-gradient(135deg, ${base[0]}, ${base[1]})`,
    boxShadow: `0 16px 34px ${base[2]}`,
  }
}

function tinyWeatherStyle(tone?: string): React.CSSProperties {
  const base = toneColors(tone)
  return {
    background: `linear-gradient(135deg, ${base[0]}, ${base[1]})`,
  }
}

function pageStyle(tone?: string): React.CSSProperties {
  const base = toneColors(tone)
  return {
    background: `radial-gradient(circle at 24% 7%, rgba(255,255,255,0.42), transparent 22%), radial-gradient(circle at 84% 24%, rgba(255,255,255,0.18), transparent 24%), linear-gradient(180deg, ${base[0]} 0%, ${base[1]} 64%, var(--bg) 64%)`,
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

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' })
}

function weekday(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })
}

function fullDay(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

function rangeWidth(min: number | null, max: number | null, days: WeatherSnapshot['daily10']) {
  if (min == null || max == null) return '35%'
  const lows = days.map(day => day.temperatureMin).filter((value): value is number => typeof value === 'number')
  const highs = days.map(day => day.temperatureMax).filter((value): value is number => typeof value === 'number')
  const floor = Math.min(...lows, min)
  const ceiling = Math.max(...highs, max)
  const span = Math.max(1, ceiling - floor)
  return `${Math.max(18, Math.round(((max - min) / span) * 100))}%`
}

function windLabel(degrees: number | null) {
  if (degrees == null) return 'Direction unavailable'
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return `${labels[Math.round(degrees / 45) % 8]} ${degrees}°`
}

function uvLabel(value: number | null | undefined) {
  if (value == null) return 'Unavailable'
  if (value < 3) return 'Low'
  if (value < 6) return 'Moderate'
  if (value < 8) return 'High'
  return 'Very high'
}

function aqiLabel(value: number | null | undefined) {
  if (value == null) return '--'
  if (value <= 20) return 'Good'
  if (value <= 40) return 'Fair'
  if (value <= 60) return 'Moderate'
  if (value <= 80) return 'Poor'
  return 'Very poor'
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
