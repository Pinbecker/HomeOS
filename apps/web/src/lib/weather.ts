import { enqueueMutation, getCurrentState, makeId } from './app-store'
import { readUserSettings, saveUserSettings, settingObject } from './user-preferences'

export type WeatherLocation = {
  id: string
  name: string
  subtitle?: string | null
  latitude: number
  longitude: number
  timezone?: string | null
  countryCode?: string | null
}

export type WeatherHourlyPoint = {
  time: string
  temperature: number | null
  apparentTemperature: number | null
  rainChance: number | null
  precipitationMm: number | null
  conditionCode: number
  condition: string
  windMph: number | null
  humidity: number | null
  visibilityKm: number | null
  uvIndex: number | null
}

export type WeatherSnapshot = {
  provider: string
  location: WeatherLocation
  current: {
    time: string
    temperature: number | null
    apparentTemperature: number | null
    conditionCode: number
    condition: string
    conditionTone: string
    isDay: boolean
    windMph: number | null
    windDirection: number | null
    humidity: number | null
    precipitationMm: number | null
    pressureHpa: number | null
  }
  hourly24: WeatherHourlyPoint[]
  hourlyByDay?: Record<string, WeatherHourlyPoint[]>
  daily10: Array<{
    date: string
    conditionCode: number
    condition: string
    temperatureMax: number | null
    temperatureMin: number | null
    apparentMax: number | null
    apparentMin: number | null
    rainChance: number | null
    precipitationMm: number | null
    windMph: number | null
    uvIndex: number | null
    sunrise: string | null
    sunset: string | null
  }>
  airQuality: {
    europeanAqi: number | null
    pm25: number | null
    uvIndex: number | null
    pollen: {
      grass: number | null
      birch: number | null
      alder: number | null
      ragweed: number | null
    }
  }
  updatedAt: string
  staleAt: string
  stale?: boolean
}

export type WeatherSharedSettings = {
  provider: 'open-meteo'
  home: WeatherLocation | null
  units: {
    temperature: 'celsius'
    wind: 'mph'
    precipitation: 'mm'
  }
}

export type WeatherUserSettings = {
  savedLocations: WeatherLocation[]
  lastViewedLocationId: string | null
}

const DEFAULT_SHARED: WeatherSharedSettings = {
  provider: 'open-meteo',
  home: null,
  units: { temperature: 'celsius', wind: 'mph', precipitation: 'mm' },
}

const WEATHER_CACHE_KEY = 'homeos:weather-cache:v2'

export function readSharedWeatherSettings(settings: Record<string, unknown> | null | undefined): WeatherSharedSettings {
  const raw = settingObject(settings?.weather)
  return {
    provider: 'open-meteo',
    home: weatherLocation(raw.home),
    units: {
      temperature: 'celsius',
      wind: 'mph',
      precipitation: 'mm',
    },
  }
}

export function readUserWeatherSettings(settings: Record<string, unknown> | null | undefined, userId: string | null | undefined): WeatherUserSettings {
  const personal = readUserSettings(settings, userId)
  const weather = settingObject(personal.weather)
  const savedLocations = Array.isArray(weather.savedLocations)
    ? weather.savedLocations.map(weatherLocation).filter((row): row is WeatherLocation => Boolean(row))
    : []
  return {
    savedLocations,
    lastViewedLocationId: typeof weather.lastViewedLocationId === 'string' ? weather.lastViewedLocationId : null,
  }
}

export async function saveSharedWeatherSettings(recipe: (current: WeatherSharedSettings) => WeatherSharedSettings) {
  const state = getCurrentState()
  const householdRow = state.data.household[0] ?? null
  const householdId = householdRow?.id ?? 'default'
  const currentSettings = householdRow?.settings ?? {}
  const nextWeather = recipe(readSharedWeatherSettings(currentSettings))
  const now = new Date().toISOString()
  const payload = {
    id: householdId,
    name: householdRow?.name ?? 'Home',
    settings: {
      ...currentSettings,
      weather: nextWeather,
    },
    createdAt: householdRow?.createdAt ?? now,
  }

  await enqueueMutation({
    id: makeId('mutation'),
    name: 'household.upsert',
    entityType: 'household',
    entityId: householdId,
    operation: 'upsert',
    payload,
  }, prev => ({
    ...prev,
    data: {
      ...prev.data,
      household: prev.data.household.some(row => row.id === householdId)
        ? prev.data.household.map(row => row.id === householdId ? { ...row, ...payload } : row)
        : [...prev.data.household, payload],
    },
  }))
}

export async function saveUserWeatherSettings(userId: string, recipe: (current: WeatherUserSettings) => WeatherUserSettings) {
  await saveUserSettings(userId, current => ({
    ...current,
    weather: recipe(readUserWeatherSettings({ userSettings: { [userId]: current } }, userId)),
  }))
}

export function locationRefForSaved(id: string) {
  return `saved:${id}`
}

export function defaultWeatherLocationRef(shared: WeatherSharedSettings, personal: WeatherUserSettings) {
  if (personal.lastViewedLocationId && personal.savedLocations.some(location => location.id === personal.lastViewedLocationId)) {
    return locationRefForSaved(personal.lastViewedLocationId)
  }
  return shared.home ? 'home' : null
}

export async function fetchWeatherSnapshot(locationRef: string, options: { allowCache?: boolean } = {}) {
  const cached = loadCachedWeather(locationRef)
  if (options.allowCache && cached && typeof navigator !== 'undefined' && !navigator.onLine) return cached

  try {
    const response = await fetch(`/api/weather/forecast?location=${encodeURIComponent(locationRef)}`, {
      credentials: 'include',
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`Weather failed with ${response.status}`)
    const snapshot = await response.json() as WeatherSnapshot
    saveCachedWeather(locationRef, snapshot)
    return snapshot
  } catch (error) {
    if (cached) return { ...cached, stale: true }
    throw error
  }
}

export async function searchWeatherLocations(query: string) {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  const response = await fetch(`/api/weather/search?q=${encodeURIComponent(trimmed)}`, {
    credentials: 'include',
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Weather search failed with ${response.status}`)
  const payload = await response.json() as { results?: WeatherLocation[] }
  return Array.isArray(payload.results) ? payload.results.map(location => ({ ...location, id: location.id || makeWeatherLocationId(location) })) : []
}

export function loadCachedWeather(locationRef: string) {
  if (typeof window === 'undefined') return null
  try {
    const parsed = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) ?? '{}') as Record<string, WeatherSnapshot>
    return parsed[locationRef] ?? null
  } catch {
    return null
  }
}

export function saveCachedWeather(locationRef: string, snapshot: WeatherSnapshot) {
  if (typeof window === 'undefined') return
  try {
    const parsed = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) ?? '{}') as Record<string, WeatherSnapshot>
    parsed[locationRef] = snapshot
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(parsed))
  } catch {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ [locationRef]: snapshot }))
  }
}

export function weatherLocation(value: unknown): WeatherLocation | null {
  const source = settingObject(value)
  const latitude = Number(source.latitude)
  const longitude = Number(source.longitude)
  const name = typeof source.name === 'string' ? source.name.trim() : ''
  if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return {
    id: typeof source.id === 'string' && source.id ? source.id : makeWeatherLocationId({ name, latitude, longitude }),
    name,
    subtitle: typeof source.subtitle === 'string' ? source.subtitle : null,
    latitude,
    longitude,
    timezone: typeof source.timezone === 'string' ? source.timezone : null,
    countryCode: typeof source.countryCode === 'string' ? source.countryCode : null,
  }
}

export function makeWeatherLocationId(location: Pick<WeatherLocation, 'name' | 'latitude' | 'longitude'>) {
  return `weather-${location.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'place'}-${Math.round(location.latitude * 1000)}-${Math.round(location.longitude * 1000)}`
}

export function temperature(value: number | null | undefined) {
  return typeof value === 'number' ? `${Math.round(value)}°` : '--'
}

export function weatherIcon(code: number, isDay = true) {
  if (code === 0) return isDay ? 'sun' : 'moon'
  if ([1, 2].includes(code)) return isDay ? 'partly' : 'partly-night'
  if (code === 3) return 'cloud'
  if ([45, 48].includes(code)) return 'fog'
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow'
  if ([95, 96, 99].includes(code)) return 'storm'
  return 'cloud'
}
