export type TvFollowMetadata = {
  metadataVersion?: number
  followKey?: string
  canonicalTitle?: string
  showName?: string
  titleAliases?: string[]
  channel?: string
  channelId?: string
  channelMode?: 'any_channel' | 'selected_channel'
  posterUrl?: string | null
  following?: boolean
  matchMode?: 'new_only' | 'all_airings'
  tvmazeId?: number | null
}

export function normalizeTvFollowTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/^(?:brand\s+new|new)\s*:\s*/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function tvFollowMetadata(value: Record<string, unknown> | null | undefined): TvFollowMetadata {
  return (value ?? {}) as TvFollowMetadata
}

export function tvFollowKey(show: { title: string; metadata?: Record<string, unknown> | null }) {
  const metadata = tvFollowMetadata(show.metadata)
  return normalizeTvFollowTitle(metadata.followKey || metadata.canonicalTitle || metadata.showName || show.title)
}

export function tvFollowChannel(show: { metadata?: Record<string, unknown> | null }) {
  const metadata = tvFollowMetadata(show.metadata)
  if (metadata.channelMode !== 'selected_channel') return null
  return typeof metadata.channel === 'string' ? metadata.channel : null
}
