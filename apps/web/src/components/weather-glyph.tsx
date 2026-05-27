export function WeatherGlyph({ icon, className = 'h-6 w-6', eager = false }: { icon: string; className?: string; eager?: boolean }) {
  return <img src={weatherIconAsset(icon)} alt="" className={`${className} object-contain`} loading={eager ? 'eager' : 'lazy'} decoding={eager ? 'sync' : 'async'} draggable={false} />
}

function weatherIconAsset(icon: string) {
  const name = icon === 'sun'
    ? 'clear-day'
    : icon === 'moon'
      ? 'clear-night'
      : icon === 'partly'
        ? 'partly-cloudy-day'
        : icon === 'partly-night'
          ? 'partly-cloudy-night'
          : icon === 'rain'
            ? 'rain'
            : icon === 'storm'
              ? 'thunderstorms-rain'
              : icon === 'snow'
                ? 'snow'
                : icon === 'fog'
                  ? 'fog'
                  : 'overcast'
  return `/weather-icons/${name}.svg`
}
