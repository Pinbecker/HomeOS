import { Check, CheckCircle2, ChevronDown, Clapperboard, Film, Play, Star, ThumbsDown, ThumbsUp, Tv } from 'lucide-react'
import type { ReactNode } from 'react'
import { BottomNav } from './bottom-nav'

const sample = {
  title: 'Slow Horses',
  type: 'TV',
  year: '2022',
  rating: '8.4',
  runtime: '45m',
  cast: 'Gary Oldman, Jack Lowden',
  poster: 'https://image.tmdb.org/t/p/w500/vJIhztLbxZer8FjM6F9usVFMO8T.jpg',
  backdrop: 'https://image.tmdb.org/t/p/w780/5DUMPBSnHOZsbBv81GFXZXvDpo6.jpg',
  genres: ['Drama', 'Thriller', 'Comedy'],
  providers: [
    { name: 'Apple TV+', logo: 'https://image.tmdb.org/t/p/w92/2E03IAZsX4ZaUqM7tXlctEPMGWS.jpg' },
    { name: 'Prime Video', logo: 'https://image.tmdb.org/t/p/w92/pvske1MyAoymrs5bguRfVqYiM9a.jpg' },
    { name: 'Netflix', logo: 'https://image.tmdb.org/t/p/w92/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg' },
  ],
}

export function MediaCardDesignsPage() {
  return (
    <div className="media-page min-h-dvh bg-[var(--media-bg)] pb-[calc(88px+env(safe-area-inset-bottom))] text-[var(--media-ink)]">
      <header className="safe-top sticky top-0 z-30 border-b border-[var(--media-line)] bg-[var(--media-bg)]/92 px-4 pb-3 pt-3 backdrop-blur-xl">
        <p className="text-[11px] font-bold uppercase text-[var(--media-faint)]">Media cards</p>
        <h1 className="text-[24px] font-bold leading-tight">Design options</h1>
        <p className="mt-1 text-[13px] font-medium leading-5 text-[var(--media-muted)]">Four alternate card treatments for choosing the next pass.</p>
      </header>

      <main className="mx-auto grid w-full max-w-5xl gap-5 px-4 py-5 sm:grid-cols-2">
        <DesignFrame title="Option 1 - Current direction">
          <PosterFeatureCard />
        </DesignFrame>
        <DesignFrame title="Option 2 - Cinematic footer">
          <CinematicFooterCard />
        </DesignFrame>
        <DesignFrame title="Option 3 - Library row">
          <LibraryRowCard />
        </DesignFrame>
        <DesignFrame title="Option 4 - Compact ticket">
          <CompactTicketCard />
        </DesignFrame>
      </main>
      <BottomNav />
    </div>
  )
}

function DesignFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[13px] font-bold text-[var(--media-muted)]">{title}</h2>
      {children}
    </section>
  )
}

function PosterFeatureCard() {
  return (
    <article className="overflow-hidden rounded-[18px] border border-[var(--media-line)] bg-[var(--media-panel)] shadow-[var(--media-shadow)]">
      <div className="relative aspect-[3/4] bg-black">
        <img src={sample.poster} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/88 via-black/44 to-transparent px-4 pb-4 pt-20 text-white">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase text-white/82">
            <span>{sample.type}</span>
            <span className="text-white/42">/</span>
            <span>{sample.year}</span>
            <span className="text-white/42">/</span>
            <span>{sample.rating}</span>
          </div>
          <h3 className="mt-2 text-[25px] font-bold leading-[1.05]">{sample.title}</h3>
        </div>
      </div>
      <div className="space-y-2.5 p-4">
        <ProviderSection />
        <GenreRow />
      </div>
    </article>
  )
}

function CinematicFooterCard() {
  return (
    <article className="overflow-hidden rounded-[18px] border border-[var(--media-line)] bg-[var(--media-panel)] shadow-[var(--media-shadow)]">
      <div className="relative aspect-[16/10] bg-black">
        <img src={sample.backdrop} alt="" className="h-full w-full object-cover" />
        <div className="absolute left-3 top-3 text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          <CheckCircle2 className="h-7 w-7" strokeWidth={2.4} />
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase text-[var(--media-faint)]">{sample.type} - {sample.year}</p>
            <h3 className="mt-1 text-[22px] font-bold leading-tight">{sample.title}</h3>
          </div>
          <div className="flex items-center gap-1 border-l border-[var(--media-line)] pl-3 text-[12px] font-bold text-[var(--media-ink)]">
            <Star className="h-3.5 w-3.5 fill-current" />
            {sample.rating}
          </div>
        </div>
        <div className="mt-3">
          <ProviderSection />
        </div>
      </div>
    </article>
  )
}

function LibraryRowCard() {
  return (
    <article className="flex gap-3 rounded-[14px] border border-[var(--media-line)] bg-[var(--media-panel)] p-2 shadow-sm">
      <div className="relative h-[142px] w-[96px] shrink-0 overflow-hidden rounded-[10px] bg-[var(--media-panel-2)]">
        <img src={sample.poster} alt="" className="h-full w-full object-cover" />
        <span className="absolute left-1.5 top-1.5 text-[9px] font-bold uppercase text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">TV</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col py-1 pr-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[17px] font-bold leading-tight">{sample.title}</h3>
            <MetaLine thumbs />
            <div className="mt-1 flex items-center text-[11.5px] font-semibold text-[var(--media-muted)]">
              <span>{sample.runtime}</span>
              <span className="mx-2 h-3.5 w-px bg-[var(--media-line)]" />
              <span className="font-bold text-[#32ADE6] dark:text-[#64D2FF]">Watching</span>
            </div>
          </div>
        </div>
        <p className="mt-1 truncate text-[11.5px] font-semibold text-[var(--media-muted)]">{sample.cast}</p>
        <div className="mt-auto">
          <ProviderSection compact trailing={<ChevronDown className="h-4 w-4 text-[var(--media-muted)]" strokeWidth={2.3} />} />
        </div>
      </div>
    </article>
  )
}

function CompactTicketCard() {
  return (
    <article className="rounded-[16px] border border-[var(--media-line)] bg-[var(--media-panel)] p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center border-r border-[var(--media-line)] pr-3 text-accent">
          <Clapperboard className="h-6 w-6" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-[var(--media-faint)]">
            <Tv className="h-3.5 w-3.5" />
            {sample.type} - {sample.year}
          </div>
          <h3 className="mt-0.5 truncate text-[18px] font-bold">{sample.title}</h3>
        </div>
        <button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center text-accent" aria-label="Watched">
          <Check className="h-[18px] w-[18px]" strokeWidth={3} />
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--media-line)] pt-3">
        <ProviderPlainText />
        <div className="flex items-center gap-1 text-[12px] font-bold text-[var(--media-muted)]">
          <Film className="h-4 w-4" />
          <Play className="h-4 w-4" />
        </div>
      </div>
    </article>
  )
}

function ProviderSection({ compact = false, trailing }: { compact?: boolean; trailing?: ReactNode }) {
  return (
    <div className={`${compact ? 'py-1.5' : 'py-2.5'} border-y border-[var(--media-line)]`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 text-[9.5px] font-bold uppercase text-[var(--media-faint)]">Streaming</span>
        <ProviderPlainText />
        {trailing ? <span className="shrink-0">{trailing}</span> : null}
      </div>
    </div>
  )
}

function ProviderPlainText() {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
      {sample.providers.map(provider => (
        <img key={provider.name} src={provider.logo} alt={provider.name} className="h-5 w-5 shrink-0 rounded-[5px] object-cover" />
      ))}
    </div>
  )
}

function MetaLine({ thumbs = false }: { thumbs?: boolean }) {
  return (
    <div className="mt-1 flex items-center text-[12px] font-semibold text-[var(--media-muted)]">
      <span>{sample.year}</span>
      <span className="mx-2 h-3.5 w-px bg-[var(--media-line)]" />
      <span className="flex items-center gap-1 text-[var(--media-ink)]">
        <Star className="h-3.5 w-3.5 fill-current" />
        {sample.rating}
      </span>
      {thumbs ? (
        <>
          <span className="mx-2 h-3.5 w-px bg-[var(--media-line)]" />
          <span className="inline-flex items-center gap-1 text-[var(--media-muted)]">
            <ThumbsUp className="h-3.5 w-3.5" strokeWidth={2.2} />
            <ThumbsDown className="h-3.5 w-3.5" strokeWidth={2.2} />
          </span>
        </>
      ) : (
        <>
          <span className="mx-2 h-3.5 w-px bg-[var(--media-line)]" />
          <span>{sample.runtime}</span>
        </>
      )}
    </div>
  )
}

function GenreRow() {
  return (
    <p className="truncate text-[11px] font-semibold uppercase text-[var(--media-faint)]">{sample.genres.join(' / ')}</p>
  )
}
