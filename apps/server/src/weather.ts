import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '@homeos/db'
import { household } from '@homeos/db/schema'
import { getSession } from './sync'

type WeatherLocation = {
  id?: string
  name: string
  latitude: number
  longitude: number
  timezone?: string | null
  countryCode?: string | null
}

type CacheEntry = {
  expiresAt: number
  payload: Record<string, unknown>
}

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'
const CACHE_TTL_MS = 15 * 60 * 1000
const cache = new Map<string, CacheEntry>()

export function registerWeatherRoutes(app: FastifyInstance) {
  app.get('/api/weather/search', async (request, reply) => {
    const session = await getSession(request)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const query = ((request.query as { q?: string }).q ?? '').trim()
    if (query.length < 2) return reply.send({ results: [] })

    const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
    url.searchParams.set('name', query)
    url.searchParams.set('count', '8')
    url.searchParams.set('language', 'en')
    url.searchParams.set('format', 'json')

    const response = await fetchWithTimeout(url.toString())
    if (!response.ok) return reply.status(502).send({ error: 'weather_search_failed' })
    const data = await response.json() as { results?: Array<Record<string, unknown>> }
    const results = (data.results ?? []).map(place => {
      const latitude = Number(place.latitude)
      const longitude = Number(place.longitude)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
      const admin = [place.admin1, place.country].filter(value => typeof value === 'string' && value).join(', ')
      return {
        id: `weather-location-${slug(String(place.name ?? 'place'))}-${Math.round(latitude * 1000)}-${Math.round(longitude * 1000)}`,
        name: String(place.name ?? 'Unknown'),
        subtitle: admin || null,
        latitude,
        longitude,
        timezone: typeof place.timezone === 'string' ? place.timezone : null,
        countryCode: typeof place.country_code === 'string' ? place.country_code : null,
      }
    }).filter(Boolean)

    return reply.send({ results })
  })

  app.get('/api/weather/forecast', async (request, reply) => {
    const session = await getSession(request)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const locationKey = ((request.query as { location?: string }).location ?? 'home').trim() || 'home'
    const settings = await loadHouseholdSettings()
    const location = resolveLocation(settings, session.user.id, locationKey)
    if (!location) return reply.status(400).send({ error: 'weather_location_not_configured' })

    const cacheKey = `${Math.round(location.latitude * 1000)}:${Math.round(location.longitude * 1000)}`
    const now = Date.now()
    const cached = cache.get(cacheKey)
    if (cached && cached.expiresAt > now) return reply.send(cached.payload)

    try {
      const payload = await fetchForecast(location)
      cache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, payload })
      return reply.send(payload)
    } catch (error) {
      app.log.error(error)
      if (cached) return reply.send({ ...cached.payload, stale: true })
      return reply.status(502).send({ error: 'weather_forecast_failed' })
    }
  })
}

async function loadHouseholdSettings() {
  const row = await db.query.household.findFirst({ where: eq(household.id, HOUSEHOLD_ID), columns: { settings: true } })
  return settingObject(row?.settings)
}

function resolveLocation(settings: Record<string, unknown>, userId: string, key: string): WeatherLocation | null {
  const weather = settingObject(settings.weather)
  if (key === 'home') return locationFromUnknown(settingObject(weather.home), 'home')

  if (key.startsWith('saved:')) {
    const id = key.slice('saved:'.length)
    const userSettings = settingObject(settingObject(settings.userSettings)[userId])
    const personalWeather = settingObject(userSettings.weather)
    const saved = Array.isArray(personalWeather.savedLocations) ? personalWeather.savedLocations : []
    for (const candidate of saved) {
      const location = locationFromUnknown(candidate, id)
      if (location?.id === id) return location
    }
  }

  return null
}

function locationFromUnknown(value: unknown, fallbackId?: string): WeatherLocation | null {
  const source = settingObject(value)
  const latitude = Number(source.latitude)
  const longitude = Number(source.longitude)
  const name = typeof source.name === 'string' && source.name.trim() ? source.name.trim() : null
  if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return {
    id: typeof source.id === 'string' ? source.id : fallbackId,
    name,
    latitude,
    longitude,
    timezone: typeof source.timezone === 'string' ? source.timezone : null,
    countryCode: typeof source.countryCode === 'string' ? source.countryCode : null,
  }
}

async function fetchForecast(location: WeatherLocation) {
  const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast')
  forecastUrl.searchParams.set('latitude', String(location.latitude))
  forecastUrl.searchParams.set('longitude', String(location.longitude))
  forecastUrl.searchParams.set('timezone', location.timezone || 'auto')
  forecastUrl.searchParams.set('forecast_days', '10')
  forecastUrl.searchParams.set('temperature_unit', 'celsius')
  forecastUrl.searchParams.set('wind_speed_unit', 'mph')
  forecastUrl.searchParams.set('precipitation_unit', 'mm')
  forecastUrl.searchParams.set('current', [
    'temperature_2m',
    'apparent_temperature',
    'is_day',
    'weather_code',
    'wind_speed_10m',
    'wind_direction_10m',
    'relative_humidity_2m',
    'precipitation',
    'surface_pressure',
  ].join(','))
  forecastUrl.searchParams.set('hourly', [
    'temperature_2m',
    'apparent_temperature',
    'precipitation_probability',
    'precipitation',
    'weather_code',
    'wind_speed_10m',
    'relative_humidity_2m',
    'visibility',
    'uv_index',
  ].join(','))
  forecastUrl.searchParams.set('daily', [
    'weather_code',
    'temperature_2m_max',
    'temperature_2m_min',
    'apparent_temperature_max',
    'apparent_temperature_min',
    'precipitation_probability_max',
    'precipitation_sum',
    'wind_speed_10m_max',
    'uv_index_max',
    'sunrise',
    'sunset',
  ].join(','))

  const airUrl = new URL('https://air-quality-api.open-meteo.com/v1/air-quality')
  airUrl.searchParams.set('latitude', String(location.latitude))
  airUrl.searchParams.set('longitude', String(location.longitude))
  airUrl.searchParams.set('timezone', location.timezone || 'auto')
  airUrl.searchParams.set('forecast_days', '2')
  airUrl.searchParams.set('hourly', 'european_aqi,pm2_5,uv_index,grass_pollen,birch_pollen,alder_pollen,ragweed_pollen')

  const [forecastResponse, airResponse] = await Promise.all([
    fetchWithTimeout(forecastUrl.toString()),
    fetchWithTimeout(airUrl.toString()).catch(() => null),
  ])

  if (!forecastResponse.ok) throw new Error(`Open-Meteo forecast failed with ${forecastResponse.status}`)
  const forecast = await forecastResponse.json() as OpenMeteoForecast
  const air = airResponse?.ok ? await airResponse.json() as OpenMeteoAirQuality : null

  return normalizeForecast(location, forecast, air)
}

function normalizeForecast(location: WeatherLocation, forecast: OpenMeteoForecast, air: OpenMeteoAirQuality | null) {
  const current = forecast.current ?? {}
  const nowIso = new Date().toISOString()
  const hourlyTimes = stringValues(forecast.hourly?.time)
  const dailyTimes = stringValues(forecast.daily?.time)
  const currentTime = String(current.time ?? nowIso)
  const hourlyStartIndex = currentHourIndex(hourlyTimes, currentTime)
  const currentHourlyIndex = nearestIndex(hourlyTimes, currentTime)
  const hourlyIndexes = hourlyTimes.slice(hourlyStartIndex, hourlyStartIndex + 23).map((_time, index) => hourlyStartIndex + index)
  const airIndex = nearestIndex(air?.hourly?.time ?? [], String(current.time ?? hourlyTimes[hourlyStartIndex] ?? ''))
  const hourly24 = [null, ...hourlyIndexes].map(hourlyIndex => hourlyPoint(forecast, current, currentTime, currentHourlyIndex, hourlyIndex))
  const forecastDayKeys = new Set(dailyTimes.slice(0, 10))
  const hourlyByDay: Record<string, ReturnType<typeof hourlyPoint>[]> = {}
  hourlyTimes.forEach((time, index) => {
    const dayKey = time.slice(0, 10)
    if (!forecastDayKeys.has(dayKey)) return
    const list = hourlyByDay[dayKey] ?? []
    list.push(hourlyPoint(forecast, current, currentTime, currentHourlyIndex, index))
    hourlyByDay[dayKey] = list
  })
  const todayKey = currentTime.slice(0, 10)
  hourlyByDay[todayKey] = hourly24

  return {
    provider: 'open-meteo',
    location: {
      id: location.id ?? 'home',
      name: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: forecast.timezone ?? location.timezone ?? null,
      countryCode: location.countryCode ?? null,
    },
    current: {
      time: current.time ?? nowIso,
      temperature: round(current.temperature_2m),
      apparentTemperature: round(current.apparent_temperature),
      conditionCode: Number(current.weather_code ?? 0),
      condition: weatherLabel(Number(current.weather_code ?? 0)),
      conditionTone: weatherTone(Number(current.weather_code ?? 0), current.is_day !== 0),
      isDay: current.is_day !== 0,
      windMph: round(current.wind_speed_10m),
      windDirection: round(current.wind_direction_10m),
      humidity: round(current.relative_humidity_2m),
      precipitationMm: round(current.precipitation),
      pressureHpa: round(current.surface_pressure),
    },
    hourly24,
    hourlyByDay,
    daily10: dailyTimes.slice(0, 10).map((time, index) => ({
      date: time,
      conditionCode: Number(forecast.daily?.weather_code?.[index] ?? 0),
      condition: weatherLabel(Number(forecast.daily?.weather_code?.[index] ?? 0)),
      temperatureMax: round(forecast.daily?.temperature_2m_max?.[index]),
      temperatureMin: round(forecast.daily?.temperature_2m_min?.[index]),
      apparentMax: round(forecast.daily?.apparent_temperature_max?.[index]),
      apparentMin: round(forecast.daily?.apparent_temperature_min?.[index]),
      rainChance: round(forecast.daily?.precipitation_probability_max?.[index]),
      precipitationMm: round(forecast.daily?.precipitation_sum?.[index], 1),
      windMph: round(forecast.daily?.wind_speed_10m_max?.[index]),
      uvIndex: round(forecast.daily?.uv_index_max?.[index], 1),
      sunrise: forecast.daily?.sunrise?.[index] ?? null,
      sunset: forecast.daily?.sunset?.[index] ?? null,
    })),
    airQuality: {
      europeanAqi: valueAt(air?.hourly?.european_aqi, airIndex),
      pm25: valueAt(air?.hourly?.pm2_5, airIndex),
      uvIndex: valueAt(air?.hourly?.uv_index, airIndex),
      pollen: {
        grass: valueAt(air?.hourly?.grass_pollen, airIndex),
        birch: valueAt(air?.hourly?.birch_pollen, airIndex),
        alder: valueAt(air?.hourly?.alder_pollen, airIndex),
        ragweed: valueAt(air?.hourly?.ragweed_pollen, airIndex),
      },
    },
    updatedAt: nowIso,
    staleAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
  }
}

function nearestIndex(times: string[], target: string) {
  if (!times.length) return -1
  const targetMs = Date.parse(target)
  if (!Number.isFinite(targetMs)) return 0
  let best = 0
  let bestDelta = Number.POSITIVE_INFINITY
  times.forEach((time, index) => {
    const delta = Math.abs(Date.parse(time) - targetMs)
    if (delta < bestDelta) {
      best = index
      bestDelta = delta
    }
  })
  return best
}

function currentHourIndex(times: string[], currentTime: string) {
  if (!times.length) return 0
  const currentMs = Date.parse(currentTime)
  if (!Number.isFinite(currentMs)) return 0

  const next = times.findIndex(time => Date.parse(time) > currentMs)
  if (next >= 0) return next
  return Math.max(0, times.length - 1)
}

function hourlyPoint(forecast: OpenMeteoForecast, current: Record<string, unknown>, currentTime: string, currentHourlyIndex: number, hourlyIndex: number | null) {
  const sourceIndex = hourlyIndex ?? currentHourlyIndex
  const code = hourlyIndex == null ? Number(current.weather_code ?? 0) : Number(forecast.hourly?.weather_code?.[hourlyIndex] ?? 0)
  return {
    time: hourlyIndex == null ? currentTime : stringValues(forecast.hourly?.time)[hourlyIndex] ?? currentTime,
    temperature: hourlyIndex == null ? round(current.temperature_2m) : round(forecast.hourly?.temperature_2m?.[hourlyIndex]),
    apparentTemperature: hourlyIndex == null ? round(current.apparent_temperature) : round(forecast.hourly?.apparent_temperature?.[hourlyIndex]),
    rainChance: round(forecast.hourly?.precipitation_probability?.[sourceIndex]),
    precipitationMm: hourlyIndex == null ? round(current.precipitation) : round(forecast.hourly?.precipitation?.[hourlyIndex]),
    conditionCode: code,
    condition: weatherLabel(code),
    windMph: hourlyIndex == null ? round(current.wind_speed_10m) : round(forecast.hourly?.wind_speed_10m?.[hourlyIndex]),
    humidity: hourlyIndex == null ? round(current.relative_humidity_2m) : round(forecast.hourly?.relative_humidity_2m?.[hourlyIndex]),
    visibilityKm: hourlyIndex == null || forecast.hourly?.visibility?.[hourlyIndex] == null ? null : round(Number(forecast.hourly.visibility[hourlyIndex]) / 1000, 1),
    uvIndex: hourlyIndex == null ? null : round(forecast.hourly?.uv_index?.[hourlyIndex], 1),
  }
}

function stringValues(values: Array<unknown> | undefined) {
  return Array.isArray(values) ? values.map(value => String(value)).filter(Boolean) : []
}

function valueAt(values: Array<unknown> | undefined, index: number) {
  if (!values || index < 0) return null
  return round(values[index], 1)
}

function round(value: unknown, digits = 0) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  const factor = 10 ** digits
  return Math.round(number * factor) / factor
}

function weatherLabel(code: number) {
  if (code === 0) return 'Clear'
  if ([1, 2].includes(code)) return 'Partly cloudy'
  if (code === 3) return 'Cloudy'
  if ([45, 48].includes(code)) return 'Fog'
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle'
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow'
  if ([95, 96, 99].includes(code)) return 'Thunderstorm'
  return 'Mixed'
}

function weatherTone(code: number, isDay: boolean) {
  if ([61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)) return 'rain'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow'
  if ([45, 48].includes(code)) return 'fog'
  if ([3].includes(code)) return 'cloud'
  if ([1, 2].includes(code)) return isDay ? 'partly-day' : 'partly-night'
  return isDay ? 'clear-day' : 'clear-night'
}

function settingObject(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'place'
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'HomeOS private household weather integration' },
    })
  } finally {
    clearTimeout(timer)
  }
}

type OpenMeteoForecast = {
  timezone?: string
  current?: Record<string, unknown>
  hourly?: Record<string, Array<string | number | null>>
  daily?: Record<string, Array<string | number | null>>
}

type OpenMeteoAirQuality = {
  hourly?: Record<string, Array<string | number | null>>
}
