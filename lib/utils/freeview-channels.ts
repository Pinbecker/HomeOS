// UK Freeview channel registry.
//
// The XMLTV feed (dp247/Freeview-EPG) carries 260+ channels including radio,
// foreign stations, +1 timeshifts and per-region variants. This registry is the
// source of truth for which channels we surface, their canonical names, and the
// order they appear in the guide. The four regionalised channels (BBC One,
// ITV1, Channel 4 — BBC Two/Five are effectively national here) resolve to a
// single feed id based on TV_REGION.

export type TvRegion =
  | 'london'
  | 'south'
  | 'south_west'
  | 'north_west'
  | 'midlands'
  | 'wales'
  | 'scotland'

const REGION = (process.env.TV_REGION as TvRegion) ?? 'south_west'

// Regional feed ids per channel. Falls back to London if a region is missing.
const BBC_ONE_BY_REGION: Record<TvRegion, string> = {
  london: 'BBCOneLondonHD.uk',
  south: 'BBCOneSouth.uk',
  south_west: 'BBCOneSouthWest.uk',
  north_west: 'BBCOneNorthWest.uk',
  midlands: 'BBCOneWestMidlands.uk',
  wales: 'BBCOneWalesHD.uk',
  scotland: 'BBCOneScotHD.uk',
}

const ITV1_BY_REGION: Record<TvRegion, string> = {
  london: 'ITV1London.uk',
  south: 'ITV1MeridianS.uk',
  south_west: 'ITV1WestCountry.uk',
  north_west: 'ITV1Granada.uk',
  midlands: 'ITV1CentralW.uk',
  wales: 'ITV1Wales.uk',
  scotland: 'STVCentral.uk',
}

const CHANNEL4_BY_REGION: Record<TvRegion, string> = {
  london: 'Channel4London.uk',
  south: 'Channel4South.uk',
  south_west: 'Channel4South.uk',
  north_west: 'Channel4North.uk',
  midlands: 'Channel4Midlands.uk',
  wales: 'Channel4London.uk',
  scotland: 'Channel4Scotland.uk',
}

function regional(map: Record<TvRegion, string>): string {
  return map[REGION] ?? map.london
}

export type ChannelDef = {
  feedId: string
  name: string   // canonical display name
}

// Ordered roughly by Freeview channel number, then grouped by genre.
export const CHANNELS: ChannelDef[] = [
  // Main five
  { feedId: regional(BBC_ONE_BY_REGION), name: 'BBC One' },
  { feedId: 'BBCTwoHD.uk', name: 'BBC Two' },
  { feedId: regional(ITV1_BY_REGION), name: 'ITV1' },
  { feedId: regional(CHANNEL4_BY_REGION), name: 'Channel 4' },
  { feedId: '5.uk', name: 'Channel 5' },

  // Main entertainment
  { feedId: 'ITV2.uk', name: 'ITV2' },
  { feedId: 'BBCThreeHD.uk', name: 'BBC Three' },
  { feedId: 'BBCFourHD.uk', name: 'BBC Four' },
  { feedId: 'ITV3.uk', name: 'ITV3' },
  { feedId: 'ITV4.uk', name: 'ITV4' },
  { feedId: 'E4.uk', name: 'E4' },
  { feedId: 'E4Extra.uk', name: 'E4 Extra' },
  { feedId: 'More4.uk', name: 'More4' },
  { feedId: '4seven.uk', name: '4seven' },
  { feedId: 'Film4.uk', name: 'Film4' },
  { feedId: 'SkyMix.uk', name: 'Sky Mix' },
  { feedId: 'SkyArts.uk', name: 'Sky Arts' },

  // U& (UKTV) family
  { feedId: 'UAndDave.uk', name: 'U&Dave' },
  { feedId: 'UAndDrama.uk', name: 'U&Drama' },
  { feedId: 'UAndYesterday.uk', name: 'U&Yesterday' },
  { feedId: 'UAndW.uk', name: 'U&W' },
  { feedId: 'UAndEden.uk', name: 'U&Eden' },

  // Channel 5 family
  { feedId: '5USA.uk', name: '5USA' },
  { feedId: '5Star.uk', name: '5Star' },
  { feedId: '5Action.uk', name: '5Action' },
  { feedId: '5Select.uk', name: '5Select' },

  // Factual / lifestyle / movies
  { feedId: 'Quest.uk', name: 'Quest' },
  { feedId: 'QuestRed.uk', name: 'Quest Red' },
  { feedId: 'DMAX.uk', name: 'DMAX' },
  { feedId: 'TLC.uk', name: 'TLC' },
  { feedId: 'FoodNetwork.uk', name: 'Food Network' },
  { feedId: 'Blaze.uk', name: 'Blaze' },
  { feedId: 'Legend.uk', name: 'Legend' },
  { feedId: 'Really.uk', name: 'Really' },
  { feedId: 'TrueCrime.uk', name: 'True Crime' },
  { feedId: 'GreatTV.uk', name: 'GREAT! TV' },
  { feedId: 'GreatMovies.uk', name: 'GREAT! Movies' },
  { feedId: 'GreatAction.uk', name: 'GREAT! Action' },
  { feedId: 'GreatMystery.uk', name: 'GREAT! Mystery' },
  { feedId: 'Movies24.uk', name: 'Movies24' },
  { feedId: 'TalkingPicturesTV.uk', name: 'Talking Pictures TV' },
  { feedId: 'RewindTV.uk', name: 'Rewind TV' },
  { feedId: 'ThatsTV.uk', name: "That's TV" },
  { feedId: 'TogetherTV.uk', name: 'Together TV' },
  { feedId: 'PBSAmerica.uk', name: 'PBS America' },
  { feedId: 'CourtTV.uk', name: 'Court TV' },
  { feedId: 'LondonLive.uk', name: 'London Live' },

  // Kids
  { feedId: 'CBBC.uk', name: 'CBBC' },
  { feedId: 'CBeebies.uk', name: 'CBeebies' },

  // News
  { feedId: 'BBCNews.uk', name: 'BBC News' },
  { feedId: 'SkyNews.uk', name: 'Sky News' },
  { feedId: 'GBNews.uk', name: 'GB News' },
  { feedId: 'CNNInternational.uk', name: 'CNN' },
  { feedId: 'AlJazeeraEnglish.qa', name: 'Al Jazeera' },
  { feedId: 'CNBCEurope.uk', name: 'CNBC' },
  { feedId: 'BloombergTVEurope.uk', name: 'Bloomberg' },
  { feedId: 'NewsmaxTV.uk', name: 'Newsmax' },
  { feedId: 'LBCNews.uk', name: 'LBC News' },
  { feedId: 'BBCParliament.uk', name: 'BBC Parliament' },

  // Nations
  { feedId: 'BBCScotland.uk', name: 'BBC Scotland' },
  { feedId: 'BBCAlba.uk', name: 'BBC Alba' },
  { feedId: 'S4C.uk', name: 'S4C' },
  { feedId: 'STVCentral.uk', name: 'STV' },
  { feedId: 'UTV.uk', name: 'UTV' },

  // Shopping
  { feedId: 'QVCUK.uk', name: 'QVC' },
  { feedId: 'QVCBeautyUK.uk', name: 'QVC Beauty' },
  { feedId: 'QVCStyleUK.uk', name: 'QVC Style' },
  { feedId: 'IdealWorld.uk', name: 'Ideal World' },
  { feedId: 'GemsTV.uk', name: 'Gemporia' },
  { feedId: 'HighStreetTV1.uk', name: 'High Street TV' },
  { feedId: 'MustHaveIdeas.uk', name: 'Must Have Ideas' },
  { feedId: 'TJC.uk', name: 'TJC' },
]

// Fast lookups, with sort order derived from array position.
const CHANNEL_BY_ID = new Map(CHANNELS.map((c, i) => [c.feedId, { ...c, sort: i }]))

export const CHANNEL_FEED_IDS: string[] = CHANNELS.map(c => c.feedId)

export function channelName(feedId: string): string {
  return CHANNEL_BY_ID.get(feedId)?.name ?? feedId
}

export function channelSortValue(feedId: string): number {
  return CHANNEL_BY_ID.get(feedId)?.sort ?? 9999
}

export function isKnownChannel(feedId: string): boolean {
  return CHANNEL_BY_ID.has(feedId)
}

export function formatAirtime(date: Date): string {
  let h = date.getHours()
  const m = date.getMinutes()
  const period = h < 12 ? 'am' : 'pm'
  h = h % 12 === 0 ? 12 : h % 12
  if (m === 0) return `${h}${period}`
  return `${h}:${String(m).padStart(2, '0')}${period}`
}
