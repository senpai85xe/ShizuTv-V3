export type MediaType = 'ANIME' | 'MANGA' | 'TV' | 'MOVIE';

export type TitlePreference = 'english' | 'romaji' | 'native';
export type AdultContentMode = 'safe' | 'mixed' | 'adultOnly';

export interface MediaTitle {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
}

export interface MediaTag {
  id: string;
  name: string;
  category: string;
  rank?: number | null;
}

export interface MediaExternalLink {
  id: string;
  url: string;
  site: string;
  icon?: string | null;
}

export interface MediaCharacter {
  id: string;
  name: string;
  nativeName?: string | null;
  role?: string | null;
  image?: string | null;
  description?: string | null;
  voiceActorName?: string | null;
  voiceActorImage?: string | null;
}

export interface MediaStaff {
  id: string;
  name: string;
  role?: string | null;
  image?: string | null;
}

export interface MediaExternalIds {
  anilist?: string;
  mal?: string;
  simkl?: string;
  tmdb?: string;
  kitsu?: string;
}

export interface UnifiedMedia {
  id: string;
  type: MediaType;
  sourceId?: string | null;
  sourceName?: string | null;
  providerId?: string | null;
  externalIds?: MediaExternalIds;
  idMal?: string | null;
  url?: string | null;
  title: MediaTitle;
  format?: string | null;
  cover?: string | null;
  score?: number | null;
  banner?: string | null;
  description?: string | null;
  tags?: MediaTag[];
  genres?: string[];
  isAdult?: boolean | null;
  status?: string | null;
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  duration?: number | null;
  source?: string | null;
  popularity?: number | null;
  favourites?: number | null;
  studios?: string[];
  synonyms?: string[];
  externalLinks?: MediaExternalLink[];
  characters?: MediaCharacter[];
  staff?: MediaStaff[];
  season?: string | null;
  year?: number | null;
  trailer?: string | null;
  airingAt?: string | null;
  nextEpisode?: number | null;
  relationType?: string | null;
  relations?: UnifiedMedia[];
  recommendations?: UnifiedMedia[];
  streamingEpisodes?: MediaStreamingEpisode[];
}

export interface UnifiedEpisode {
  id: string;
  number: number;
  title: string;
  description?: string | null;
  thumbnail?: string | null;
  airDate?: string | null;
  isFiller?: boolean;
  durationSeconds?: number;
  externalUrl?: string | null;
  sourceId?: string | null;
  sourceEpisodeId?: string | null;
  episodeUrl?: string | null;
  sourceAnimeHref?: string | null;
  sourceAnimeSlug?: string | null;
}

export interface ExtensionEpisodesResponse {
  compatible: boolean;
  reason?: string;
  sourceLabel?: string;
  episodes: UnifiedEpisode[];
}

export interface MediaStreamingEpisode {
  title: string;
  thumbnail?: string | null;
  url?: string | null;
  site?: string | null;
}

export interface UnifiedChapter {
  id: string;
  number: number;
  title: string;
  scanlator?: string | null;
  releaseDate?: string | null;
  pageCount?: number;
  pages?: string[];
  sourceChapterId?: string;
  chapterUrl?: string;
  externalUrl?: string | null;
}

export interface VideoServer {
  id: string;
  name: string;
  category: 'sub' | 'dub' | 'raw';
}

export interface AvailableAudioTrack {
  code: 'ja' | 'en' | 'hi' | 'es';
  shortLabel: string;
  label: string;
  serverCategory: 'sub' | 'dub';
}

export interface VideoStream {
  url: string;
  quality: string;
  isHls: boolean;
  serverName: string;
  sourceId?: string;
  provider?: string;
  matchedTitle?: string;
  matchedEpisode?: number;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
  availableAudios?: AvailableAudioTrack[];
  mirrors?: Array<{
    url: string;
    quality: string;
    isHls: boolean;
    serverName: string;
  }>;
  subtitles?: Array<{
    lang: string;
    label: string;
    url?: string;
    cues?: Array<{ start: number; end: number; text: string }>;
  }>;
}

export type TrackedStatus =
  | 'CURRENT'
  | 'PLANNING'
  | 'COMPLETED'
  | 'PAUSED'
  | 'DROPPED'
  | 'REPEATING';

export type TrackerType = 'anilist' | 'myanimelist' | 'kitsu' | 'local';
export type TrackerCategory = 'trending' | 'popular' | 'topRated' | 'recentlyUpdated';

export interface LibraryEntry {
  mediaId: string;
  mediaType: MediaType;
  media: UnifiedMedia;
  status: TrackedStatus;
  progress: number;
  score: number;
  notes?: string;
  updatedAt: string;
  trackerType: TrackerType;
}

export interface HistoryEntry {
  id: string;
  mediaId: string;
  mediaType: MediaType;
  media: UnifiedMedia;
  episodeNumber?: number;
  chapterNumber?: number;
  episodeTitle?: string;
  positionSeconds?: number;
  durationSeconds?: number;
  pageIndex?: number;
  totalPages?: number;
  sourceId?: string;
  updatedAt: string;
}

export type DownloadStatus = 'pending' | 'downloading' | 'paused' | 'completed' | 'failed';

export interface DownloadTask {
  id: string;
  mediaId: string;
  mediaTitle: string;
  mediaType: MediaType;
  cover?: string | null;
  itemNumber: number;
  itemTitle: string;
  quality: string;
  progress: number; // 0 to 1
  totalBytes: number;
  downloadedBytes: number;
  status: DownloadStatus;
  createdAt: string;
}

export interface BookmarkedMediaItem {
  id: string;
  mediaId: string;
  mediaType: MediaType;
  media: UnifiedMedia;
  itemNumber: number;
  itemTitle: string;
  thumbnail?: string | null;
  addedAt: string;
}

export interface CalendarEntry {
  id: string;
  episode: number;
  airingAt: string; // ISO
  media: UnifiedMedia;
}

export type HomeSectionType = 'discovery' | 'continueMedia' | 'libraryStatus' | 'browseGenres';

export interface HomeSection {
  id: string;
  title: string;
  type: HomeSectionType;
  disabled: boolean;
  libraryStatus?: TrackedStatus;
  targetTracker?: TrackerType;
  targetMediaType?: MediaType;
  trackerCategory?: TrackerCategory;
}

export type SearchSort =
  | 'POPULARITY_DESC'
  | 'TRENDING_DESC'
  | 'SCORE_DESC'
  | 'FAVOURITES_DESC'
  | 'START_DATE_DESC'
  | 'SEARCH_MATCH';

export type SearchStatusFilter = 'ALL' | 'RELEASING' | 'FINISHED' | 'NOT_YET_RELEASED' | 'CANCELLED';
export type SearchFormatFilter = 'ALL' | 'TV' | 'MOVIE' | 'OVA' | 'ONA' | 'SPECIAL' | 'MANGA' | 'ONE_SHOT';

export type ExtensionRuntimeRequirement =
  | 'web-compatible'
  | 'android-native'
  | 'unsupported'
  | 'unverified';

export interface SourceInfo {
  id: string;
  name: string;
  type: 'inbuilt' | 'extension';
  mediaTypes: MediaType[];
  lang: string;
  version: string;
  repoUrl?: string;
  repoBaseUrl?: string;
  baseUrl?: string;
  pkg?: string;
  apkName?: string;
  apkUrl?: string;
  apkSha256?: string;
  versionCode?: number;
  libVersion?: string;
  iconUrl?: string;
  description?: string;
  isNsfw?: boolean;
  runtimeRequirement?: ExtensionRuntimeRequirement;
  metadataOnlyStorage?: boolean;
}

export type NativeExtensionVerificationStatus =
  | 'not_staged'
  | 'staged_verified'
  | 'incompatible_lib'
  | 'cert_mismatch'
  | 'error';

export type NativeExtensionIntegrityModel =
  | 'manifest_sha256_verified'
  | 'local_integrity_tofu';

export interface NativeExtensionStagingState {
  staged: boolean;
  packageName: string;
  versionName: string;
  versionCode: number;
  libVersion: string;
  libCompatible: boolean;
  extensionClass: string;
  isNsfw: boolean;
  hasAniyomiFeature: boolean;
  apkSha256: string;
  expectedSha256Verified: boolean;
  signingCertSha256: string;
  trustedCertPinned: boolean;
  readOnlyLocked: boolean;
  apkSizeBytes: number;
  stagedAt: string | null;
  sourceUrl: string | null;
  codeExecutionEnabled: false;
  verificationStatus: NativeExtensionVerificationStatus;
  integrityModel: NativeExtensionIntegrityModel;
  integrityNote: string;
  integrityIntact?: boolean;
  lastError?: string | null;
  previousCertSha256?: string | null;
  pendingCertSha256?: string | null;
}

export interface NativeApkInspectResult {
  packageName: string;
  versionName: string;
  versionCode: number;
  libVersion: string;
  libCompatible: boolean;
  extensionClass: string;
  isNsfw: boolean;
  hasAniyomiFeature: boolean;
  signingCertSha256: string;
  apkSha256: string;
  apkSizeBytes: number;
  readOnlyLocked: boolean;
  codeExecutionEnabled: false;
}

export interface NativeSigningCertChangeDetails {
  packageName: string;
  previousCertSha256: string;
  newCertSha256: string;
}

export interface MatchedSourceEntry {
  sourceId: string;
  title: string;
  href: string;
  slug: string;
  cover?: string | null;
}

export interface ExtensionTitleSearchResponse {
  compatible: boolean;
  reason?: string;
  sourceLabel?: string;
  items: MatchedSourceEntry[];
}

export type ExtensionCapabilityName = 'search' | 'episodes' | 'stream';

export type ExtensionCapabilitySupportState =
  | 'verified'
  | 'supported'
  | 'unsupported'
  | 'unverified'
  | 'unavailable';

export type ExtensionCapabilityErrorCode =
  | 'UNSUPPORTED_CAPABILITY'
  | 'UNVERIFIED_CAPABILITY'
  | 'METADATA_ONLY_SOURCE'
  | 'PROTECTED_SOURCE'
  | 'MISSING_BASE_URL'
  | 'INVALID_INPUT'
  | 'EXECUTION_FAILED';

export interface ExtensionCapabilityDescriptor {
  state: ExtensionCapabilitySupportState;
  verified: boolean;
  reason?: string;
}

export interface ExtensionAdapterCapabilities {
  search: ExtensionCapabilityDescriptor;
  episodes: ExtensionCapabilityDescriptor;
  stream: ExtensionCapabilityDescriptor;
}

export type ExtensionAdapterCompatibilityLevel =
  | 'full'
  | 'partial'
  | 'unsupported'
  | 'unverified';

export interface ExtensionSourceCompatibilityReport {
  adapterId: string;
  sourceId: string;
  sourceLabel: string;
  providerKind: string;
  isMetadataOnly: boolean;
  fullyCompatible: boolean;
  compatibility: ExtensionAdapterCompatibilityLevel;
  reason?: string;
  capabilities: ExtensionAdapterCapabilities;
}

export interface ExtensionRepo {
  id: string;
  name: string;
  url: string;
  repoBaseUrl?: string;
  manager: 'aniyomi' | 'mangayomi' | 'cloudstream' | 'shonenx';
  mediaType?: 'ANIME' | 'MANGA';
  addedAt: string;
}

export interface CommentEntry {
  id: string;
  mediaId: string;
  author: string;
  avatar?: string;
  body: string;
  createdAt: string;
  likes: number;
  spoiler?: boolean;
}

export interface TrackerProfile {
  tracker: TrackerType;
  id?: string;
  username: string;
  avatarUrl?: string;
  bannerUrl?: string;
  bio?: string;
  siteUrl?: string;
  episodesWatched?: number;
  chaptersRead?: number;
  animeCount?: number;
  mangaCount?: number;
  meanScore?: number;
}

export interface LogEntry {
  id: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  scope: string;
  message: string;
  timestamp: string;
}

export function getPreferredTitle(title: MediaTitle | undefined, pref: TitlePreference): string {
  if (!title) return 'Unknown';
  const e = title.english?.trim() || null;
  const r = title.romaji?.trim() || null;
  const n = title.native?.trim() || null;
  switch (pref) {
    case 'english':
      return e ?? r ?? n ?? 'Unknown';
    case 'romaji':
      return r ?? e ?? n ?? 'Unknown';
    case 'native':
      return n ?? r ?? e ?? 'Unknown';
  }
}

export function getStatusLabel(status: TrackedStatus, mediaType: MediaType): string {
  const isReading = mediaType === 'MANGA';
  switch (status) {
    case 'CURRENT':
      return isReading ? 'Reading' : 'Watching';
    case 'PLANNING':
      return isReading ? 'Plan to Read' : 'Plan to Watch';
    case 'COMPLETED':
      return 'Completed';
    case 'PAUSED':
      return 'Paused';
    case 'DROPPED':
      return 'Dropped';
    case 'REPEATING':
      return isReading ? 'Rereading' : 'Rewatching';
  }
}
