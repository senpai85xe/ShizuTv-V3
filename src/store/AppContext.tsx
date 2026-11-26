import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdultContentMode,
  BookmarkedMediaItem,
  CommentEntry,
  DownloadTask,
  ExtensionRepo,
  HistoryEntry,
  HomeSection,
  LibraryEntry,
  LogEntry,
  MediaType,
  SourceInfo,
  TitlePreference,
  TrackedStatus,
  TrackerProfile,
  TrackerType,
  UnifiedMedia,
} from '../types/media';
import {
  createDefaultCardStylePrefs,
  resolveContinueCardStyle,
  resolveMediaCardStyle,
  selectMediaCardStyle,
} from '../utils/mediaCard';
import { resolveHeroBannerStyle } from '../utils/heroBanner';
import { resolveNavBarStyle } from '../utils/navBarStyles';
import {
  applyGlobalUiScaleToDocument,
  clampBorderRoundness,
  clampFontScale,
  clampWidgetScale,
  DEFAULT_FONT_SCALE,
  DEFAULT_WIDGET_SCALE,
  resolveHomeHeaderStyle,
} from '../utils/uiLayoutCustomization';
import {
  DEFAULT_GENRE_CARD_STYLE,
  resolveGenreCardStyle,
} from '../utils/genreMetadata';
import {
  AudioLanguageCode,
  DEFAULT_AMBIENT_ENABLED,
  DEFAULT_AUTO_PIP_ENABLED,
  DEFAULT_SUBTITLE_ANIMATION,
  DEFAULT_SUBTITLE_BACKGROUND,
  DEFAULT_SUBTITLE_SIZE,
  sanitizeAudioLanguageCode,
  SubtitleEdgeStylePref,
  SubtitleFontFamilyPref,
  SubtitleFontWeightPref,
} from '../utils/inlinePlayer';
import {
  buildMediaItemKey,
  buildMediaScopeKey,
  DEFAULT_EPISODE_CHAPTER_STYLE,
  resolveEpisodeChapterStyle,
} from '../utils/episodeChapterStyle';
import {
  applyThemeToDocument,
  createDefaultThemePrefs,
  ThemePrefs,
} from '../utils/themeDefaults';
import { resolveEffectiveBatterySaver } from '../utils/batterySaver';
import {
  HOME_SECTIONS_VERSION,
  migrateDefaultHomeSectionsOrder,
} from '../utils/heroBanner';
import {
  AppThemePreset,
  BUILT_IN_PRESETS,
  ContinueCardStyle,
  EpisodeChapterStyle,
  GenreCardStyle,
  HeroBannerStyle,
  HomeHeaderStyle,
  MediaCardStyle,
  NavBarStyle,
} from '../data/themePresets';
import { INBUILT_SOURCES } from '../services/sourceEngine';
import { sortSourcesByOrder } from '../utils/extensionsManager';
import {
  APP_STATE_STORAGE_KEY,
  LEGACY_STATE_STORAGE_KEY,
  loadPersistedRepoCatalog,
  migrateExtensionRepoRecord,
  migratePersistedExtensionRecords,
  persistStateAndCatalog,
  PersistResult,
  REPO_CATALOG_STORAGE_KEY,
} from '../utils/extensionPersistence';
import { deriveRepoBaseUrl } from '../utils/extensionRepoParser';
import { isAniyomiPackageSource } from '../utils/extensionDiagnostics';
import {
  isAndroidNativeBridgeAvailable,
  removeStagedAniyomiExtension,
} from '../native/aniyomiPlugin';
import {
  parseJsonResponseSafely,
  resolveApiUrl,
} from '../utils/backendConfig';
import { fetchAniListViewer, saveAniListMediaEntry } from '../services/anilist';
import {
  clearAniListServerCookieSession,
  getStoredAniListToken,
  loginWithAniListOAuth,
  persistAniListServerCookieSession,
  persistAniListSession,
  resolveAniListInputToToken,
  restoreAniListSessionFromServer,
  type AniListAuthUrlResponse,
} from '../services/anilistAuth';

export type { ThemePrefs };

export interface UiPrefs {
  cardStyle: MediaCardStyle;
  continueWatchingStyle: ContinueCardStyle;
  continueReadingStyle: ContinueCardStyle;
  genreCardStyle: GenreCardStyle;
  wideCardMode: boolean;
  navBarStyle: NavBarStyle;
  homeHeaderStyle: HomeHeaderStyle;
  heroBannerStyle: HeroBannerStyle;
  episodeChapterStyle: EpisodeChapterStyle;
  useNewUi: boolean; // TV / Big-Screen Mode
  hapticFeedback: boolean;
  fontScale: number;
  widgetScale: number;
}

export interface ContentPrefs {
  titlePreference: TitlePreference;
  adultContentMode: AdultContentMode;
  language: string;
  incognitoMode?: boolean;
}

export interface DiscoveryPrefs {
  mode: 'tracker' | 'source';
  metadataTrackerId: TrackerType | null; // null = Auto
  activeSources: string[];
  preferredAnimeSourceId?: string;
  preferredMangaSourceId?: string;
}

export type VideoFitMode = 'contain' | 'cover' | 'fill';
export type VideoQualityPref = 'auto' | '1080p' | '720p' | '480p' | '360p';
export type SubtitlePosition = 'bottom' | 'top';

export interface PlayerPrefs {
  defaultQuality: VideoQualityPref;
  autoPlay: boolean;
  autoSkipOp: boolean;
  autoSkipEd: boolean;
  autoNextEpisode: boolean;
  autoPip: boolean;
  ambientGlow: boolean;
  batterySaver: boolean;
  audioLanguage: AudioLanguageCode;
  subtitleLanguage?: string;
  preferredServerBySource?: Record<string, string>;
  defaultSpeed: number;
  videoFit: VideoFitMode;
  subtitleEnabled: boolean;
  subtitleSize: number;
  subtitleBackground: boolean;
  subtitleColor: string;
  subtitleOffsetSeconds: number;
  subtitlePosition: SubtitlePosition;
  subtitleFontFamily: SubtitleFontFamilyPref;
  subtitleFontWeight: SubtitleFontWeightPref;
  subtitleEdgeStyle: SubtitleEdgeStylePref;
  subtitleBgOpacity: number;
  subtitleBottomOffset: number;
  subtitleAnimation: boolean;
  playerPrefsV?: number;
}

export interface ReaderPrefs {
  mode: 'webtoon' | 'single' | 'double';
  direction: 'ltr' | 'rtl';
  fit: 'width' | 'height' | 'original';
  background: 'black' | 'dark' | 'white' | 'sepia';
}

export interface DiscordRpcPrefs {
  enabled: boolean;
  showMediaTitle: boolean;
  showEpisodeProgress: boolean;
  customState: string;
}

export interface SecurityPrefs {
  pinEnabled: boolean;
  pinCode: string;
}

export const DEFAULT_HOME_SECTIONS: HomeSection[] = [
  {
    id: 'continue-watching',
    title: 'Continue Watching',
    type: 'continueMedia',
    disabled: false,
    targetMediaType: 'ANIME',
  },
  {
    id: 'popular-anime',
    title: 'Popular Anime',
    type: 'discovery',
    disabled: false,
    targetMediaType: 'ANIME',
    trackerCategory: 'popular',
  },
  {
    id: 'trending-anime',
    title: 'Trending Anime',
    type: 'discovery',
    disabled: false,
    targetMediaType: 'ANIME',
    trackerCategory: 'trending',
  },
  {
    id: 'top-rated-anime',
    title: 'Top Rated Anime',
    type: 'discovery',
    disabled: false,
    targetMediaType: 'ANIME',
    trackerCategory: 'topRated',
  },
  {
    id: 'browse-genres-anime',
    title: 'Browse by Genre',
    type: 'browseGenres',
    disabled: false,
    targetMediaType: 'ANIME',
  },
  {
    id: 'continue-reading',
    title: 'Continue Reading',
    type: 'continueMedia',
    disabled: false,
    targetMediaType: 'MANGA',
  },
  {
    id: 'popular-manga',
    title: 'Popular Manga',
    type: 'discovery',
    disabled: false,
    targetMediaType: 'MANGA',
    trackerCategory: 'popular',
  },
  {
    id: 'trending-manga',
    title: 'Trending Manga',
    type: 'discovery',
    disabled: false,
    targetMediaType: 'MANGA',
    trackerCategory: 'trending',
  },
  {
    id: 'top-rated-manga',
    title: 'Top Rated Manga',
    type: 'discovery',
    disabled: false,
    targetMediaType: 'MANGA',
    trackerCategory: 'topRated',
  },
  {
    id: 'browse-genres-manga',
    title: 'Browse by Genre',
    type: 'browseGenres',
    disabled: false,
    targetMediaType: 'MANGA',
  },
];

const STORAGE_KEY = APP_STATE_STORAGE_KEY;
const LEGACY_STORAGE_KEY = LEGACY_STATE_STORAGE_KEY;

let lastSyncPersistResult: PersistResult | null = null;

function persistStateSync(next: PersistedState): PersistedState {
  lastSyncPersistResult = persistStateAndCatalog(
    next as unknown as Record<string, unknown> & { repoCatalog?: SourceInfo[] },
  );
  return next;
}

interface PersistedState {
  themePrefs: ThemePrefs;
  uiPrefs: UiPrefs;
  contentPrefs: ContentPrefs;
  discoveryPrefs: DiscoveryPrefs;
  homeSections: HomeSection[];
  homeSectionsVersion?: number;
  playerPrefs: PlayerPrefs;
  readerPrefs: ReaderPrefs;
  discordPrefs: DiscordRpcPrefs;
  securityPrefs: SecurityPrefs;
  primaryTracker: TrackerType;
  anilistToken: string | null;
  profiles: Partial<Record<TrackerType, TrackerProfile>>;
  library: LibraryEntry[];
  history: HistoryEntry[];
  watchedItems: Record<string, number[]>;
  bookmarkedItems: BookmarkedMediaItem[];
  downloads: DownloadTask[];
  repos: ExtensionRepo[];
  repoCatalog: SourceInfo[];
  customSources: SourceInfo[];
  sourceOrder: string[];
  comments: Record<string, CommentEntry[]>;
  batterySaver: boolean;
  onboardingDone: boolean;
}

const DEFAULT_STATE: PersistedState = {
  themePrefs: createDefaultThemePrefs(),
  uiPrefs: {
    ...createDefaultCardStylePrefs(),
    genreCardStyle: DEFAULT_GENRE_CARD_STYLE,
    wideCardMode: false,
    navBarStyle: 'glassLabeled',
    homeHeaderStyle: 'cleanWave',
    heroBannerStyle: 'classic',
    episodeChapterStyle: DEFAULT_EPISODE_CHAPTER_STYLE,
    useNewUi: false,
    hapticFeedback: true,
    fontScale: DEFAULT_FONT_SCALE,
    widgetScale: DEFAULT_WIDGET_SCALE,
  },
  contentPrefs: {
    titlePreference: 'english',
    adultContentMode: 'safe',
    language: 'en',
    incognitoMode: false,
  },
  discoveryPrefs: {
    mode: 'tracker',
    metadataTrackerId: null,
    activeSources: INBUILT_SOURCES.map((s) => s.id),
    preferredAnimeSourceId: 'shonenx-hls-inbuilt',
    preferredMangaSourceId: 'shonenx-manga-inbuilt',
  },
  homeSections: DEFAULT_HOME_SECTIONS,
  homeSectionsVersion: HOME_SECTIONS_VERSION,
  playerPrefs: {
    defaultQuality: '1080p',
    autoPlay: true,
    autoSkipOp: false,
    autoSkipEd: false,
    autoNextEpisode: true,
    autoPip: DEFAULT_AUTO_PIP_ENABLED,
    ambientGlow: DEFAULT_AMBIENT_ENABLED,
    batterySaver: false,
    audioLanguage: 'ja',
    subtitleLanguage: 'en',
    preferredServerBySource: {},
    defaultSpeed: 1.0,
    videoFit: 'contain',
    subtitleEnabled: true,
    subtitleSize: DEFAULT_SUBTITLE_SIZE,
    subtitleBackground: DEFAULT_SUBTITLE_BACKGROUND,
    subtitleColor: '#ffffff',
    subtitleOffsetSeconds: 0,
    subtitlePosition: 'bottom',
    subtitleFontFamily: 'sans',
    subtitleFontWeight: 'bold',
    subtitleEdgeStyle: 'shadow',
    subtitleBgOpacity: 75,
    subtitleBottomOffset: 0,
    subtitleAnimation: DEFAULT_SUBTITLE_ANIMATION,
    playerPrefsV: 2,
  },
  readerPrefs: {
    mode: 'webtoon',
    direction: 'ltr',
    fit: 'width',
    background: 'dark',
  },
  discordPrefs: {
    enabled: false,
    showMediaTitle: true,
    showEpisodeProgress: true,
    customState: 'Watching on ShizuTv',
  },
  securityPrefs: {
    pinEnabled: false,
    pinCode: '',
  },
  primaryTracker: 'local',
  anilistToken: null,
  profiles: {
    local: {
      tracker: 'local',
      username: 'Guest',
      bio: 'Local ShizuTv offline tracker profile',
    },
  },
  library: [],
  history: [],
  watchedItems: {},
  bookmarkedItems: [],
  downloads: [],
  repos: [],
  repoCatalog: [],
  customSources: [],
  sourceOrder: [],
  comments: {},
  batterySaver: false,
  onboardingDone: true,
};

function loadInitialState(): PersistedState {
  const storedOAuthToken = getStoredAniListToken();
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_STATE,
        anilistToken: storedOAuthToken,
      };
    }
    const parsed = JSON.parse(raw);
    const resolvedAnilistToken =
      typeof parsed.anilistToken === 'string' && parsed.anilistToken.trim()
        ? parsed.anilistToken.trim()
        : storedOAuthToken;
    const parsedRepos = Array.isArray(parsed.repos)
      ? (parsed.repos as unknown[])
          .map((r) => migrateExtensionRepoRecord(r))
          .filter(
            (r): r is ExtensionRepo =>
              Boolean(
                r &&
                  r.id !== 'repo-shizutv-official' &&
                  !String(r.url || '').endsWith('.dart'),
              ),
          )
      : DEFAULT_STATE.repos;
    const parsedCustomSources = Array.isArray(parsed.customSources)
      ? migratePersistedExtensionRecords(parsed.customSources)
      : DEFAULT_STATE.customSources;
    const parsedRepoCatalog = loadPersistedRepoCatalog(parsed.repoCatalog);
    const parsedSourceOrder = Array.isArray(parsed.sourceOrder)
      ? (parsed.sourceOrder as string[])
      : DEFAULT_STATE.sourceOrder;
    const isNonNovelRecord = (entry: { mediaType?: string; media?: { type?: string; format?: string | null } }) =>
      String(entry?.mediaType || '').toUpperCase() !== 'NOVEL' &&
      String(entry?.media?.type || '').toUpperCase() !== 'NOVEL' &&
      String(entry?.media?.format || '').toUpperCase() !== 'NOVEL';
    const sanitizedLibrary = Array.isArray(parsed.library)
      ? (parsed.library as LibraryEntry[]).filter(isNonNovelRecord)
      : DEFAULT_STATE.library;
    const sanitizedHistory = Array.isArray(parsed.history)
      ? (parsed.history as HistoryEntry[]).filter(isNonNovelRecord)
      : DEFAULT_STATE.history;
    const sanitizedDownloads = Array.isArray(parsed.downloads)
      ? (parsed.downloads as DownloadTask[]).filter(isNonNovelRecord)
      : DEFAULT_STATE.downloads;
    const sanitizedHomeSections = Array.isArray(parsed.homeSections)
      ? migrateDefaultHomeSectionsOrder(
          (parsed.homeSections as HomeSection[]).filter(
            (s) => String(s?.targetMediaType || '').toUpperCase() !== 'NOVEL',
          ),
          DEFAULT_HOME_SECTIONS,
          typeof parsed.homeSectionsVersion === 'number' ? parsed.homeSectionsVersion : null,
        )
      : DEFAULT_STATE.homeSections;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      homeSections: sanitizedHomeSections,
      homeSectionsVersion: HOME_SECTIONS_VERSION,
      library: sanitizedLibrary,
      history: sanitizedHistory,
      downloads: sanitizedDownloads,
      watchedItems:
        parsed.watchedItems && typeof parsed.watchedItems === 'object'
          ? (parsed.watchedItems as Record<string, number[]>)
          : DEFAULT_STATE.watchedItems,
      bookmarkedItems: Array.isArray(parsed.bookmarkedItems)
        ? (parsed.bookmarkedItems as BookmarkedMediaItem[]).filter(isNonNovelRecord)
        : DEFAULT_STATE.bookmarkedItems,
      repos: parsedRepos,
      repoCatalog: parsedRepoCatalog,
      customSources: parsedCustomSources,
      sourceOrder: parsedSourceOrder,
      anilistToken: resolvedAnilistToken ?? null,
      themePrefs: {
        ...DEFAULT_STATE.themePrefs,
        ...(parsed.themePrefs || {}),
        uiRoundness: clampBorderRoundness(parsed.themePrefs?.uiRoundness),
      },
      uiPrefs: {
        ...DEFAULT_STATE.uiPrefs,
        ...(parsed.uiPrefs || {}),
        cardStyle: resolveMediaCardStyle(parsed.uiPrefs?.cardStyle),
        continueWatchingStyle: resolveContinueCardStyle(parsed.uiPrefs?.continueWatchingStyle),
        continueReadingStyle: resolveContinueCardStyle(parsed.uiPrefs?.continueReadingStyle),
        genreCardStyle: resolveGenreCardStyle(parsed.uiPrefs?.genreCardStyle),
        navBarStyle: resolveNavBarStyle(parsed.uiPrefs?.navBarStyle),
        homeHeaderStyle: resolveHomeHeaderStyle(parsed.uiPrefs?.homeHeaderStyle),
        heroBannerStyle: resolveHeroBannerStyle(parsed.uiPrefs?.heroBannerStyle),
        episodeChapterStyle: resolveEpisodeChapterStyle(parsed.uiPrefs?.episodeChapterStyle),
        fontScale: clampFontScale(parsed.uiPrefs?.fontScale),
        widgetScale: clampWidgetScale(parsed.uiPrefs?.widgetScale),
      },
      contentPrefs: { ...DEFAULT_STATE.contentPrefs, ...(parsed.contentPrefs || {}) },
      discoveryPrefs: {
        ...DEFAULT_STATE.discoveryPrefs,
        ...(parsed.discoveryPrefs || {}),
        preferredAnimeSourceId:
          typeof parsed.discoveryPrefs?.preferredAnimeSourceId === 'string' &&
          parsed.discoveryPrefs.preferredAnimeSourceId.trim()
            ? parsed.discoveryPrefs.preferredAnimeSourceId.trim()
            : DEFAULT_STATE.discoveryPrefs.preferredAnimeSourceId,
        preferredMangaSourceId:
          typeof parsed.discoveryPrefs?.preferredMangaSourceId === 'string' &&
          parsed.discoveryPrefs.preferredMangaSourceId.trim()
            ? parsed.discoveryPrefs.preferredMangaSourceId.trim()
            : DEFAULT_STATE.discoveryPrefs.preferredMangaSourceId,
      },
      playerPrefs: (() => {
        const stored = parsed.playerPrefs || {};
        const effectiveBatterySaver = resolveEffectiveBatterySaver({
          topLevelBatterySaver: parsed.batterySaver,
          playerBatterySaver: stored.batterySaver,
        });
        const merged: PlayerPrefs = {
          ...DEFAULT_STATE.playerPrefs,
          ...stored,
          batterySaver: effectiveBatterySaver,
          audioLanguage: sanitizeAudioLanguageCode(stored.audioLanguage),
          subtitleLanguage:
            typeof stored.subtitleLanguage === 'string' && stored.subtitleLanguage.trim()
              ? stored.subtitleLanguage.trim()
              : DEFAULT_STATE.playerPrefs.subtitleLanguage,
          preferredServerBySource:
            stored.preferredServerBySource &&
            typeof stored.preferredServerBySource === 'object' &&
            !Array.isArray(stored.preferredServerBySource)
              ? (stored.preferredServerBySource as Record<string, string>)
              : {},
        };
        if (stored.playerPrefsV !== 2) {
          return {
            ...merged,
            autoPip: DEFAULT_AUTO_PIP_ENABLED,
            subtitleSize:
              stored.subtitleSize === 18 || typeof stored.subtitleSize !== 'number'
                ? DEFAULT_SUBTITLE_SIZE
                : stored.subtitleSize,
            subtitleBackground:
              stored.subtitleBackground === true || typeof stored.subtitleBackground !== 'boolean'
                ? DEFAULT_SUBTITLE_BACKGROUND
                : stored.subtitleBackground,
            subtitleAnimation: DEFAULT_SUBTITLE_ANIMATION,
            playerPrefsV: 2,
          };
        }
        return merged;
      })(),
      batterySaver: resolveEffectiveBatterySaver({
        topLevelBatterySaver: parsed.batterySaver,
        playerBatterySaver: parsed.playerPrefs?.batterySaver,
      }),
      readerPrefs: { ...DEFAULT_STATE.readerPrefs, ...(parsed.readerPrefs || {}) },
      discordPrefs: { ...DEFAULT_STATE.discordPrefs, ...(parsed.discordPrefs || {}) },
      securityPrefs: { ...DEFAULT_STATE.securityPrefs, ...(parsed.securityPrefs || {}) },
    };
  } catch {
    return {
      ...DEFAULT_STATE,
      anilistToken: getStoredAniListToken(),
    };
  }
}

export interface BackupManifest {
  app: 'ShizuTv' | 'ShonenX';
  version: string;
  exportedAt: string;
  data: Partial<PersistedState>;
}

interface AppContextValue {
  state: PersistedState;
  isLocked: boolean;
  unlockApp: (pin: string) => boolean;
  lockApp: () => void;
  logs: LogEntry[];
  addLog: (level: LogEntry['level'], scope: string, message: string) => void;
  clearLogs: () => void;
  storageError: string | null;
  clearStorageError: () => void;

  // Theme, Power & UI
  batterySaver: boolean;
  setBatterySaver: (enabled: boolean) => void;
  updateThemePrefs: (patch: Partial<ThemePrefs>) => void;
  applyPreset: (preset: AppThemePreset) => void;
  updateUiPrefs: (patch: Partial<UiPrefs>) => void;
  updateContentPrefs: (patch: Partial<ContentPrefs>) => void;
  updateDiscoveryPrefs: (patch: Partial<DiscoveryPrefs>) => void;
  setHomeSections: (sections: HomeSection[]) => void;
  updatePlayerPrefs: (patch: Partial<PlayerPrefs>) => void;
  updateReaderPrefs: (patch: Partial<ReaderPrefs>) => void;
  updateDiscordPrefs: (patch: Partial<DiscordRpcPrefs>) => void;
  updateSecurityPrefs: (patch: Partial<SecurityPrefs>) => void;

  // Trackers & Library
  setPrimaryTracker: (tracker: TrackerType) => void;
  connectAniListToken: (token: string, expiresIn?: number | null) => Promise<TrackerProfile>;
  loginWithAniList: (preloadedAuth?: AniListAuthUrlResponse | null) => Promise<TrackerProfile>;
  logoutAniList: () => Promise<void>;
  disconnectTracker: (tracker: TrackerType) => void;
  upsertLibraryEntry: (
    media: UnifiedMedia,
    status: TrackedStatus,
    progress: number,
    score?: number,
    notes?: string,
  ) => Promise<void>;
  removeLibraryEntry: (mediaId: string) => void;
  getLibraryEntry: (mediaId: string) => LibraryEntry | undefined;

  // History & Watched / Bookmarks
  recordHistory: (entry: Omit<HistoryEntry, 'id' | 'updatedAt'>) => void;
  markItemWatched: (mediaId: string, mediaType: MediaType, itemNumber: number) => void;
  toggleItemBookmark: (
    media: UnifiedMedia,
    itemNumber: number,
    itemTitle: string,
    thumbnail?: string | null,
  ) => void;
  removeHistoryItem: (id: string) => void;
  clearHistoryForMedia: (mediaId: string) => void;

  // Downloads
  enqueueDownload: (
    media: UnifiedMedia,
    itemNumber: number,
    itemTitle: string,
    quality?: string,
  ) => string;
  updateDownloadTask: (
    id: string,
    patch: Partial<Pick<DownloadTask, 'progress' | 'downloadedBytes' | 'totalBytes' | 'status'>>,
  ) => void;
  setRealDownloadActive: (id: string, active: boolean) => void;
  toggleDownloadPause: (id: string) => void;
  removeDownload: (id: string) => void;
  clearCompletedDownloads: () => void;

  // Extensions & Sources
  allSources: SourceInfo[];
  toggleSourceActive: (sourceId: string) => void;
  setPreferredSource: (mediaCategory: 'ANIME' | 'MANGA', sourceId: string) => void;
  setPreferredServerForSource: (sourceId: string, serverId: string) => void;
  setSourceOrder: (order: string[]) => void;
  installCatalogExtension: (source: SourceInfo) => void;
  installAllCatalogExtensions: (sources: SourceInfo[]) => number;
  uninstallExtension: (sourceId: string) => void;
  addExtensionRepo: (
    url: string,
    manager: ExtensionRepo['manager'],
    name?: string,
    options?: { autoInstall?: boolean; mediaType?: 'ANIME' | 'MANGA' },
  ) => Promise<{ repo: ExtensionRepo; addedCount: number }>;
  refreshExtensionRepo: (repoId: string) => Promise<{ addedCount: number }>;
  removeExtensionRepo: (id: string) => void;

  // Comments
  addComment: (mediaId: string, body: string, spoiler?: boolean) => void;
  likeComment: (mediaId: string, commentId: string) => void;

  // Backup
  exportBackup: () => BackupManifest;
  importBackup: (manifest: BackupManifest) => void;
  resetAllData: () => void;

  // Effective resolved metadata tracker
  effectiveMetadataTracker: Exclude<TrackerType, 'local'>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PersistedState>(loadInitialState);
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    const init = loadInitialState();
    return Boolean(init.securityPrefs.pinEnabled && init.securityPrefs.pinCode);
  });
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'boot-1',
      level: 'INFO',
      scope: 'AppInit',
      message: 'ShizuTv Web Engine initialized (v2.1.5)',
      timestamp: new Date().toISOString(),
    },
  ]);

  const addLog = useCallback((level: LogEntry['level'], scope: string, message: string) => {
    setLogs((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        level,
        scope,
        message,
        timestamp: new Date().toISOString(),
      },
      ...prev.slice(0, 199),
    ]);
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);
  const [storageError, setStorageError] = useState<string | null>(null);
  const clearStorageError = useCallback(() => setStorageError(null), []);
  const lastLoggedPersistErrRef = useRef<string | null>(null);

  // Persist to localStorage cleanly (core state isolated from large repoCatalog + quota recovery)
  useEffect(() => {
    const result = persistStateAndCatalog(
      state as unknown as Record<string, unknown> & { repoCatalog?: SourceInfo[] },
    );
    lastSyncPersistResult = result;
    if (!result.ok && result.error) {
      setStorageError(result.error);
      if (lastLoggedPersistErrRef.current !== result.error) {
        lastLoggedPersistErrRef.current = result.error;
        addLog('ERROR', 'Storage', result.error);
      }
    } else {
      lastLoggedPersistErrRef.current = null;
      setStorageError((prev) => (prev ? null : prev));
    }
  }, [state, addLog]);

  // Restore AniList session from server HTTP-only cookie if local token is absent, or refresh viewer profile
  useEffect(() => {
    let active = true;
    const syncSession = async () => {
      let token = state.anilistToken || getStoredAniListToken();
      if (!token) {
        const restored = await restoreAniListSessionFromServer();
        token = restored?.accessToken ?? null;
      }
      if (!active || !token) return;
      if (!state.profiles.anilist || !state.anilistToken) {
        try {
          const profile = await fetchAniListViewer(token);
          if (!active) return;
          persistAniListSession({ accessToken: token });
          setState((prev) => ({
            ...prev,
            anilistToken: token,
            primaryTracker: prev.primaryTracker === 'local' ? 'anilist' : prev.primaryTracker,
            profiles: { ...prev.profiles, anilist: profile },
          }));
        } catch {
          // Ignore transient offline errors on startup
        }
      }
    };
    void syncSession();
    return () => {
      active = false;
    };
  }, []);

  // Apply active theme scheme & dark/AMOLED CSS variables to document root
  useEffect(() => {
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyThemeToDocument(document.documentElement, state.themePrefs, prefersDark);
  }, [state.themePrefs]);

  // Apply Global UI Customization scales (fontScale & widgetScale) to document root
  useEffect(() => {
    applyGlobalUiScaleToDocument(
      document.documentElement,
      state.uiPrefs.fontScale,
      state.uiPrefs.widgetScale,
    );
  }, [state.uiPrefs.fontScale, state.uiPrefs.widgetScale]);

  const realDownloadActiveRef = useRef<Set<string>>(new Set());
  const [workerWakeNonce, setWorkerWakeNonce] = useState(0);

  const setRealDownloadActive = useCallback((id: string, active: boolean) => {
    if (active) {
      realDownloadActiveRef.current.add(id);
    } else {
      realDownloadActiveRef.current.delete(id);
      setWorkerWakeNonce((n) => n + 1);
    }
  }, []);

  // Simulated fallback worker for queued download tasks not driven by an active live stream fetch
  useEffect(() => {
    const hasActive = state.downloads.some(
      (d) =>
        (d.status === 'downloading' || d.status === 'pending') &&
        !realDownloadActiveRef.current.has(d.id),
    );
    if (!hasActive) return;

    const timer = setInterval(() => {
      setState((prev) => {
        let changed = false;
        const nextDownloads = prev.downloads.map((task) => {
          if (realDownloadActiveRef.current.has(task.id)) return task;
          if (task.status === 'pending') {
            changed = true;
            return { ...task, status: 'downloading' as const };
          }
          if (task.status === 'downloading') {
            changed = true;
            const nextProgress = Math.min(1, task.progress + 0.14);
            const nextBytes = Math.round(task.totalBytes * nextProgress);
            return {
              ...task,
              progress: nextProgress,
              downloadedBytes: nextBytes,
              status: nextProgress >= 1 ? ('completed' as const) : ('downloading' as const),
            };
          }
          return task;
        });
        return changed ? { ...prev, downloads: nextDownloads } : prev;
      });
    }, 650);

    return () => clearInterval(timer);
  }, [state.downloads, workerWakeNonce]);

  const updateThemePrefs = useCallback((patch: Partial<ThemePrefs>) => {
    setState((prev) => ({
      ...prev,
      themePrefs: {
        ...prev.themePrefs,
        ...patch,
        ...(patch.uiRoundness !== undefined
          ? { uiRoundness: clampBorderRoundness(patch.uiRoundness) }
          : {}),
        activePresetId: patch.activePresetId ?? null,
      },
    }));
  }, []);

  const applyPreset = useCallback(
    (preset: AppThemePreset) => {
      setState((prev) => ({
        ...prev,
        themePrefs: {
          ...prev.themePrefs,
          themeMode: preset.themeMode,
          exclusiveScheme: preset.exclusiveScheme,
          activePresetId: preset.id,
          useAmoled: preset.useAmoled,
          useGradients: preset.useGradients,
          gradientStyle: preset.gradientStyle,
          gradientIntensity: preset.gradientIntensity,
          useNoiseOverlay: preset.useNoiseOverlay,
          noiseOpacity: preset.noiseOpacity,
          uiRoundness: clampBorderRoundness(preset.uiRoundness),
        },
        uiPrefs: {
          ...selectMediaCardStyle(prev.uiPrefs, preset.cardStyle),
          navBarStyle: resolveNavBarStyle(preset.navBarStyle),
          homeHeaderStyle: resolveHomeHeaderStyle(preset.homeHeaderStyle),
        },
      }));
      addLog('INFO', 'Theme', `Applied preset "${preset.name}"`);
    },
    [addLog],
  );

  const updateUiPrefs = useCallback((patch: Partial<UiPrefs>) => {
    setState((prev) => ({
      ...prev,
      uiPrefs: {
        ...prev.uiPrefs,
        ...patch,
        ...(patch.cardStyle !== undefined
          ? { cardStyle: resolveMediaCardStyle(patch.cardStyle) }
          : {}),
        ...(patch.continueWatchingStyle !== undefined
          ? { continueWatchingStyle: resolveContinueCardStyle(patch.continueWatchingStyle) }
          : {}),
        ...(patch.continueReadingStyle !== undefined
          ? { continueReadingStyle: resolveContinueCardStyle(patch.continueReadingStyle) }
          : {}),
        ...(patch.navBarStyle !== undefined
          ? { navBarStyle: resolveNavBarStyle(patch.navBarStyle) }
          : {}),
        ...(patch.homeHeaderStyle !== undefined
          ? { homeHeaderStyle: resolveHomeHeaderStyle(patch.homeHeaderStyle) }
          : {}),
        ...(patch.heroBannerStyle !== undefined
          ? { heroBannerStyle: resolveHeroBannerStyle(patch.heroBannerStyle) }
          : {}),
        ...(patch.fontScale !== undefined
          ? { fontScale: clampFontScale(patch.fontScale) }
          : {}),
        ...(patch.widgetScale !== undefined
          ? { widgetScale: clampWidgetScale(patch.widgetScale) }
          : {}),
      },
    }));
  }, []);

  const updateContentPrefs = useCallback((patch: Partial<ContentPrefs>) => {
    setState((prev) => ({ ...prev, contentPrefs: { ...prev.contentPrefs, ...patch } }));
  }, []);

  const updateDiscoveryPrefs = useCallback((patch: Partial<DiscoveryPrefs>) => {
    setState((prev) =>
      persistStateSync({
        ...prev,
        discoveryPrefs: { ...prev.discoveryPrefs, ...patch },
      }),
    );
  }, []);

  const setHomeSections = useCallback((homeSections: HomeSection[]) => {
    setState((prev) => ({
      ...prev,
      homeSections,
      homeSectionsVersion: HOME_SECTIONS_VERSION,
    }));
  }, []);

  const setBatterySaver = useCallback(
    (enabled: boolean) => {
      const nextValue = Boolean(enabled);
      setState((prev) => {
        const next: PersistedState = {
          ...prev,
          batterySaver: nextValue,
          playerPrefs: {
            ...prev.playerPrefs,
            batterySaver: nextValue,
          },
        };
        return persistStateSync(next);
      });
      addLog('INFO', 'System', `Battery Saver ${nextValue ? 'enabled' : 'disabled'}`);
    },
    [addLog],
  );

  const updatePlayerPrefs = useCallback((patch: Partial<PlayerPrefs>) => {
    setState((prev) => {
      const nextBatterySaver =
        patch.batterySaver !== undefined ? Boolean(patch.batterySaver) : prev.batterySaver;
      const next: PersistedState = {
        ...prev,
        batterySaver: nextBatterySaver,
        playerPrefs: {
          ...prev.playerPrefs,
          ...patch,
          batterySaver: nextBatterySaver,
          ...(patch.audioLanguage !== undefined
            ? { audioLanguage: sanitizeAudioLanguageCode(patch.audioLanguage) }
            : {}),
        },
      };
      return persistStateSync(next);
    });
  }, []);

  const updateReaderPrefs = useCallback((patch: Partial<ReaderPrefs>) => {
    setState((prev) => ({ ...prev, readerPrefs: { ...prev.readerPrefs, ...patch } }));
  }, []);

  const updateDiscordPrefs = useCallback((patch: Partial<DiscordRpcPrefs>) => {
    setState((prev) => ({ ...prev, discordPrefs: { ...prev.discordPrefs, ...patch } }));
  }, []);

  const updateSecurityPrefs = useCallback((patch: Partial<SecurityPrefs>) => {
    setState((prev) => ({ ...prev, securityPrefs: { ...prev.securityPrefs, ...patch } }));
  }, []);

  const unlockApp = useCallback(
    (pin: string) => {
      if (pin === state.securityPrefs.pinCode) {
        setIsLocked(false);
        return true;
      }
      return false;
    },
    [state.securityPrefs.pinCode],
  );

  const lockApp = useCallback(() => {
    if (state.securityPrefs.pinEnabled && state.securityPrefs.pinCode) {
      setIsLocked(true);
    }
  }, [state.securityPrefs]);

  const setPrimaryTracker = useCallback(
    (primaryTracker: TrackerType) => {
      setState((prev) => ({ ...prev, primaryTracker }));
      addLog('INFO', 'Tracking', `Primary tracker set to ${primaryTracker}`);
    },
    [addLog],
  );

  const connectAniListToken = useCallback(
    async (rawInput: string, expiresIn?: number | null) => {
      const resolved = await resolveAniListInputToToken(rawInput, expiresIn);
      const profile = await fetchAniListViewer(resolved.accessToken);
      persistAniListSession({
        accessToken: resolved.accessToken,
        expiresIn: resolved.expiresIn,
      });
      void persistAniListServerCookieSession(resolved.accessToken, resolved.expiresIn);
      setState((prev) => ({
        ...prev,
        anilistToken: resolved.accessToken,
        primaryTracker: 'anilist',
        profiles: { ...prev.profiles, anilist: profile },
      }));
      addLog('INFO', 'AniList', `Connected AniList account @${profile.username}`);
      return profile;
    },
    [addLog],
  );

  const loginWithAniList = useCallback(
    async (preloadedAuth?: AniListAuthUrlResponse | null) => {
      const session = await loginWithAniListOAuth(preloadedAuth);
      const profile = await fetchAniListViewer(session.accessToken);
      setState((prev) => ({
        ...prev,
        anilistToken: session.accessToken,
        primaryTracker: 'anilist',
        profiles: { ...prev.profiles, anilist: profile },
      }));
      addLog('INFO', 'AniList', `Signed in via AniList OAuth2 as @${profile.username}`);
      return profile;
    },
    [addLog],
  );

  const disconnectTracker = useCallback(
    (tracker: TrackerType) => {
      if (tracker === 'anilist') {
        void clearAniListServerCookieSession();
      }
      setState((prev) => {
        const nextProfiles = { ...prev.profiles };
        delete nextProfiles[tracker];
        return {
          ...prev,
          anilistToken: tracker === 'anilist' ? null : prev.anilistToken,
          primaryTracker: prev.primaryTracker === tracker ? 'local' : prev.primaryTracker,
          profiles: nextProfiles,
        };
      });
      addLog('INFO', 'Tracking', `Disconnected ${tracker}`);
    },
    [addLog],
  );

  const logoutAniList = useCallback(async () => {
    await clearAniListServerCookieSession();
    setState((prev) => {
      const nextProfiles = { ...prev.profiles };
      delete nextProfiles.anilist;
      return {
        ...prev,
        anilistToken: null,
        primaryTracker: prev.primaryTracker === 'anilist' ? 'local' : prev.primaryTracker,
        profiles: nextProfiles,
      };
    });
    addLog('INFO', 'AniList', 'Logged out of AniList session');
  }, [addLog]);

  const upsertLibraryEntry = useCallback(
    async (
      media: UnifiedMedia,
      status: TrackedStatus,
      progress: number,
      score = 0,
      notes = '',
    ) => {
      const entry: LibraryEntry = {
        mediaId: media.id,
        mediaType: media.type,
        media,
        status,
        progress,
        score,
        notes,
        updatedAt: new Date().toISOString(),
        trackerType: state.primaryTracker,
      };

      setState((prev) => {
        const filtered = prev.library.filter((l) => l.mediaId !== media.id);
        return { ...prev, library: [entry, ...filtered] };
      });

      if (state.primaryTracker === 'anilist' && state.anilistToken) {
        try {
          await saveAniListMediaEntry(state.anilistToken, media.id, status, progress, score);
          addLog('INFO', 'AniListSync', `Synced ${media.title.english || media.id} -> ${status}`);
        } catch (e) {
          addLog('WARN', 'AniListSync', `Saved locally; cloud sync error: ${String(e)}`);
        }
      }
    },
    [state.primaryTracker, state.anilistToken, addLog],
  );

  const removeLibraryEntry = useCallback((mediaId: string) => {
    setState((prev) => ({
      ...prev,
      library: prev.library.filter((l) => l.mediaId !== mediaId),
    }));
  }, []);

  const getLibraryEntry = useCallback(
    (mediaId: string) => state.library.find((l) => l.mediaId === mediaId),
    [state.library],
  );

  const recordHistory = useCallback((entry: Omit<HistoryEntry, 'id' | 'updatedAt'>) => {
    const id = `${entry.mediaId}-${entry.mediaType}-${entry.episodeNumber ?? entry.chapterNumber ?? 0}`;
    const fullEntry: HistoryEntry = {
      ...entry,
      id,
      updatedAt: new Date().toISOString(),
    };
    setState((prev) => {
      if (prev.contentPrefs.incognitoMode) {
        return prev;
      }
      const prevSameMedia = prev.history.find(
        (h) => h.mediaId === entry.mediaId && h.mediaType === entry.mediaType,
      );
      const withoutSameMedia = prev.history.filter(
        (h) => !(h.mediaId === entry.mediaId && h.mediaType === entry.mediaType),
      );

      const scopeKey = buildMediaScopeKey(entry.mediaId, entry.mediaType);
      const currentWatchedSet = new Set(prev.watchedItems[scopeKey] || []);
      let watchedChanged = false;

      if (
        typeof entry.chapterNumber === 'number' &&
        Number.isFinite(entry.chapterNumber) &&
        !currentWatchedSet.has(entry.chapterNumber)
      ) {
        currentWatchedSet.add(entry.chapterNumber);
        watchedChanged = true;
      }
      if (typeof entry.episodeNumber === 'number' && Number.isFinite(entry.episodeNumber)) {
        if (
          prevSameMedia?.episodeNumber &&
          prevSameMedia.episodeNumber !== entry.episodeNumber &&
          !currentWatchedSet.has(prevSameMedia.episodeNumber)
        ) {
          currentWatchedSet.add(prevSameMedia.episodeNumber);
          watchedChanged = true;
        }
        const pos = entry.positionSeconds ?? 0;
        const dur = entry.durationSeconds ?? 0;
        const reachedThreshold = pos >= 8 || (dur > 0 && pos / dur >= 0.75);
        if (reachedThreshold && !currentWatchedSet.has(entry.episodeNumber)) {
          currentWatchedSet.add(entry.episodeNumber);
          watchedChanged = true;
        }
      }

      return {
        ...prev,
        history: [fullEntry, ...withoutSameMedia].slice(0, 100),
        watchedItems: watchedChanged
          ? {
              ...prev.watchedItems,
              [scopeKey]: Array.from(currentWatchedSet),
            }
          : prev.watchedItems,
      };
    });
  }, []);

  const markItemWatched = useCallback(
    (mediaId: string, mediaType: MediaType, itemNumber: number) => {
      if (!Number.isFinite(itemNumber)) return;
      const scopeKey = buildMediaScopeKey(mediaId, mediaType);
      setState((prev) => {
        if (prev.contentPrefs.incognitoMode) return prev;
        const existing = prev.watchedItems[scopeKey] || [];
        if (existing.includes(itemNumber)) return prev;
        return {
          ...prev,
          watchedItems: {
            ...prev.watchedItems,
            [scopeKey]: [...existing, itemNumber],
          },
        };
      });
    },
    [],
  );

  const toggleItemBookmark = useCallback(
    (
      media: UnifiedMedia,
      itemNumber: number,
      itemTitle: string,
      thumbnail?: string | null,
    ) => {
      const id = buildMediaItemKey(media.id, media.type, itemNumber);
      setState((prev) => {
        const exists = prev.bookmarkedItems.some((b) => b.id === id);
        if (exists) {
          return {
            ...prev,
            bookmarkedItems: prev.bookmarkedItems.filter((b) => b.id !== id),
          };
        }
        const nextItem: BookmarkedMediaItem = {
          id,
          mediaId: media.id,
          mediaType: media.type,
          media,
          itemNumber,
          itemTitle,
          thumbnail: thumbnail ?? media.banner ?? media.cover ?? null,
          addedAt: new Date().toISOString(),
        };
        return {
          ...prev,
          bookmarkedItems: [nextItem, ...prev.bookmarkedItems],
        };
      });
    },
    [],
  );

  const removeHistoryItem = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      history: prev.history.filter((h) => h.id !== id),
    }));
  }, []);

  const clearHistoryForMedia = useCallback((mediaId: string) => {
    setState((prev) => ({
      ...prev,
      history: prev.history.filter((h) => h.mediaId !== mediaId),
    }));
  }, []);

  const enqueueDownload = useCallback(
    (media: UnifiedMedia, itemNumber: number, itemTitle: string, quality = '1080p') => {
      const id = `dl-${media.id}-${itemNumber}`;
      const title = media.title.english || media.title.romaji || 'Media';
      const totalBytes = media.type === 'MANGA' ? 18 * 1024 * 1024 : 265 * 1024 * 1024;
      setState((prev) => {
        if (prev.downloads.some((d) => d.id === id)) return prev;
        const task: DownloadTask = {
          id,
          mediaId: media.id,
          mediaTitle: title,
          mediaType: media.type,
          cover: media.cover,
          itemNumber,
          itemTitle,
          quality,
          progress: 0.05,
          totalBytes,
          downloadedBytes: Math.round(totalBytes * 0.05),
          status: 'downloading',
          createdAt: new Date().toISOString(),
        };
        return { ...prev, downloads: [task, ...prev.downloads] };
      });
      addLog('INFO', 'Downloads', `Downloading ${title} #${itemNumber}`);
      return id;
    },
    [addLog],
  );

  const updateDownloadTask = useCallback(
    (
      id: string,
      patch: Partial<Pick<DownloadTask, 'progress' | 'downloadedBytes' | 'totalBytes' | 'status'>>,
    ) => {
      setState((prev) => ({
        ...prev,
        downloads: prev.downloads.map((d) => (d.id === id ? { ...d, ...patch } : d)),
      }));
    },
    [],
  );

  const toggleDownloadPause = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      downloads: prev.downloads.map((d) => {
        if (d.id !== id) return d;
        if (d.status === 'downloading' || d.status === 'pending') {
          return { ...d, status: 'paused' as const };
        }
        if (d.status === 'paused' || d.status === 'failed') {
          return { ...d, status: 'downloading' as const };
        }
        return d;
      }),
    }));
  }, []);

  const removeDownload = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      downloads: prev.downloads.filter((d) => d.id !== id),
    }));
  }, []);

  const clearCompletedDownloads = useCallback(() => {
    setState((prev) => ({
      ...prev,
      downloads: prev.downloads.filter((d) => d.status !== 'completed'),
    }));
  }, []);

  const allSources = useMemo(
    () => sortSourcesByOrder([...INBUILT_SOURCES, ...state.customSources], state.sourceOrder),
    [state.customSources, state.sourceOrder],
  );

  const toggleSourceActive = useCallback((sourceId: string) => {
    setState((prev) => {
      const exists = prev.discoveryPrefs.activeSources.includes(sourceId);
      const next = exists
        ? prev.discoveryPrefs.activeSources.filter((s) => s !== sourceId)
        : [...prev.discoveryPrefs.activeSources, sourceId];
      const nextPrefAnime =
        exists && prev.discoveryPrefs.preferredAnimeSourceId === sourceId
          ? 'shonenx-hls-inbuilt'
          : prev.discoveryPrefs.preferredAnimeSourceId;
      const nextPrefManga =
        exists && prev.discoveryPrefs.preferredMangaSourceId === sourceId
          ? 'shonenx-manga-inbuilt'
          : prev.discoveryPrefs.preferredMangaSourceId;
      return persistStateSync({
        ...prev,
        discoveryPrefs: {
          ...prev.discoveryPrefs,
          activeSources: next,
          preferredAnimeSourceId: nextPrefAnime,
          preferredMangaSourceId: nextPrefManga,
        },
      });
    });
  }, []);

  const setPreferredSource = useCallback((mediaCategory: 'ANIME' | 'MANGA', sourceId: string) => {
    const cleanId = sourceId.trim();
    if (!cleanId) return;
    setState((prev) =>
      persistStateSync({
        ...prev,
        discoveryPrefs: {
          ...prev.discoveryPrefs,
          ...(mediaCategory === 'MANGA'
            ? { preferredMangaSourceId: cleanId }
            : { preferredAnimeSourceId: cleanId }),
        },
      }),
    );
  }, []);

  const setPreferredServerForSource = useCallback((sourceId: string, serverId: string) => {
    const cleanSource = sourceId.trim();
    const cleanServer = serverId.trim();
    if (!cleanSource || !cleanServer) return;
    setState((prev) =>
      persistStateSync({
        ...prev,
        playerPrefs: {
          ...prev.playerPrefs,
          preferredServerBySource: {
            ...(prev.playerPrefs.preferredServerBySource || {}),
            [cleanSource]: cleanServer,
          },
        },
      }),
    );
  }, []);

  const setSourceOrder = useCallback((order: string[]) => {
    setState((prev) =>
      persistStateSync({
        ...prev,
        sourceOrder: order,
      }),
    );
  }, []);

  const installCatalogExtension = useCallback(
    (source: SourceInfo) => {
      setState((prev) => {
        const existsInbuilt = INBUILT_SOURCES.some((s) => s.id === source.id);
        const existsCustom = prev.customSources.some((s) => s.id === source.id);
        const nextCustom =
          existsInbuilt || existsCustom
            ? prev.customSources
            : [...prev.customSources, source];
        const nextActive = prev.discoveryPrefs.activeSources.includes(source.id)
          ? prev.discoveryPrefs.activeSources
          : [...prev.discoveryPrefs.activeSources, source.id];
        return persistStateSync({
          ...prev,
          customSources: nextCustom,
          discoveryPrefs: { ...prev.discoveryPrefs, activeSources: nextActive },
        });
      });
      if (lastSyncPersistResult && !lastSyncPersistResult.ok && lastSyncPersistResult.error) {
        setStorageError(lastSyncPersistResult.error);
      }
      const actionVerb = isAniyomiPackageSource(source) ? 'Saved metadata for' : 'Installed extension';
      addLog('INFO', 'Extensions', `${actionVerb} "${source.name}" (${source.lang.toUpperCase()})`);
    },
    [addLog],
  );

  const installAllCatalogExtensions = useCallback(
    (sources: SourceInfo[]): number => {
      if (sources.length === 0) return 0;
      const existingIdsNow = new Set([
        ...INBUILT_SOURCES.map((s) => s.id),
        ...state.customSources.map((s) => s.id),
      ]);
      const newSources = sources.filter((s) => !existingIdsNow.has(s.id));
      const expectedCount = newSources.length;
      setState((prev) => {
        const existingIds = new Set([
          ...INBUILT_SOURCES.map((s) => s.id),
          ...prev.customSources.map((s) => s.id),
        ]);
        const newItems = sources.filter((s) => !existingIds.has(s.id));
        const allowNsfw = prev.contentPrefs.adultContentMode !== 'safe';
        const autoEnable = newItems
          .filter((s) => allowNsfw || !s.isNsfw)
          .map((s) => s.id);
        return persistStateSync({
          ...prev,
          customSources: [...prev.customSources, ...newItems],
          discoveryPrefs: {
            ...prev.discoveryPrefs,
            activeSources: Array.from(
              new Set([...prev.discoveryPrefs.activeSources, ...autoEnable]),
            ),
          },
        });
      });
      if (lastSyncPersistResult && !lastSyncPersistResult.ok && lastSyncPersistResult.error) {
        setStorageError(lastSyncPersistResult.error);
      }
      const hasNativeOnly = newSources.some((s) => isAniyomiPackageSource(s));
      addLog(
        'INFO',
        'Extensions',
        hasNativeOnly
          ? `Batch saved metadata for ${expectedCount} catalog entries`
          : `Batch installed ${expectedCount} catalog extensions`,
      );
      return expectedCount;
    },
    [addLog, state.customSources],
  );

  const uninstallExtension = useCallback(
    (sourceId: string) => {
      const isInbuilt = INBUILT_SOURCES.some((s) => s.id === sourceId);
      const removedSource = state.customSources.find((s) => s.id === sourceId);
      const removedPkg =
        removedSource && isAniyomiPackageSource(removedSource) ? removedSource.pkg?.trim() : undefined;
      const stillReferencedByOtherSource = Boolean(
        removedPkg &&
          state.customSources.some((s) => s.id !== sourceId && s.pkg?.trim() === removedPkg),
      );
      setState((prev) => {
        const nextPrefAnime =
          prev.discoveryPrefs.preferredAnimeSourceId === sourceId
            ? 'shonenx-hls-inbuilt'
            : prev.discoveryPrefs.preferredAnimeSourceId;
        const nextPrefManga =
          prev.discoveryPrefs.preferredMangaSourceId === sourceId
            ? 'shonenx-manga-inbuilt'
            : prev.discoveryPrefs.preferredMangaSourceId;
        if (isInbuilt) {
          return persistStateSync({
            ...prev,
            discoveryPrefs: {
              ...prev.discoveryPrefs,
              activeSources: prev.discoveryPrefs.activeSources.filter((id) => id !== sourceId),
              preferredAnimeSourceId: nextPrefAnime,
              preferredMangaSourceId: nextPrefManga,
            },
          });
        }
        const nextServerMap = { ...(prev.playerPrefs.preferredServerBySource || {}) };
        delete nextServerMap[sourceId];
        return persistStateSync({
          ...prev,
          customSources: prev.customSources.filter((s) => s.id !== sourceId),
          sourceOrder: prev.sourceOrder.filter((id) => id !== sourceId),
          playerPrefs: {
            ...prev.playerPrefs,
            preferredServerBySource: nextServerMap,
          },
          discoveryPrefs: {
            ...prev.discoveryPrefs,
            activeSources: prev.discoveryPrefs.activeSources.filter((id) => id !== sourceId),
            preferredAnimeSourceId: nextPrefAnime,
            preferredMangaSourceId: nextPrefManga,
          },
        });
      });
      if (!isInbuilt && removedPkg && !stillReferencedByOtherSource && isAndroidNativeBridgeAvailable()) {
        void removeStagedAniyomiExtension(removedPkg)
          .then((removed) => {
            if (removed) {
              addLog('INFO', 'Extensions', `Removed staged Android APK for ${removedPkg}`);
            }
          })
          .catch((err) => {
            addLog(
              'WARN',
              'Extensions',
              `Native APK cleanup skipped for ${removedPkg}: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
      }
      addLog(
        'INFO',
        'Extensions',
        isInbuilt
          ? `Disabled inbuilt source "${sourceId}"`
          : `Uninstalled extension "${sourceId}"`,
      );
    },
    [addLog, state.customSources],
  );

  const addExtensionRepo = useCallback(
    async (
      url: string,
      manager: ExtensionRepo['manager'],
      name?: string,
      options?: { autoInstall?: boolean; mediaType?: 'ANIME' | 'MANGA' },
    ): Promise<{ repo: ExtensionRepo; addedCount: number }> => {
      const cleanUrl = url.trim();
      if (!cleanUrl) {
        throw new Error('Please enter a repository manifest URL.');
      }

      const response = await fetch(resolveApiUrl('/api/extensions/fetch-repo'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: cleanUrl,
          manager,
          name: name?.trim() || undefined,
        }),
      });

      const payload = await parseJsonResponseSafely<{
        repoName?: string;
        format?: string;
        sources?: SourceInfo[];
        message?: string;
      }>(response, 'extension repository manifest');

      if (!response.ok || !Array.isArray(payload.sources) || payload.sources.length === 0) {
        throw new Error(payload.message || 'Failed to fetch extension repository manifest.');
      }

      const resolvedName =
        name?.trim() || payload.repoName?.trim() || cleanUrl.split('/').pop() || 'Extension Repo';
      const resolvedManager: ExtensionRepo['manager'] =
        payload.format === 'aniyomi' ||
        payload.format === 'mangayomi' ||
        payload.format === 'cloudstream'
          ? payload.format
          : manager;

      const importedSources = migratePersistedExtensionRecords(payload.sources);
      const shouldAutoInstall = options?.autoInstall === true;
      const repoBaseUrl = deriveRepoBaseUrl(cleanUrl);
      const newRepo: ExtensionRepo = {
        id: `repo-${Date.now()}`,
        name: resolvedName,
        url: cleanUrl,
        ...(repoBaseUrl ? { repoBaseUrl } : {}),
        manager: resolvedManager,
        mediaType: options?.mediaType,
        addedAt: new Date().toISOString(),
      };

      const persistBox: { current: PersistResult | null } = { current: null };
      setState((prev) => {
        const allowNsfw = prev.contentPrefs.adultContentMode !== 'safe';
        const existingRepo = prev.repos.find((r) => r.url === cleanUrl);
        const upsertedRepo: ExtensionRepo = existingRepo
          ? {
              ...existingRepo,
              name: resolvedName,
              ...(repoBaseUrl ? { repoBaseUrl } : {}),
              manager: resolvedManager,
              mediaType: options?.mediaType ?? existingRepo.mediaType,
            }
          : newRepo;

        const remainingCatalog = prev.repoCatalog.filter((s) => s.repoUrl !== cleanUrl);
        const importedById = new Map(importedSources.map((s) => [s.id, s]));

        // Update any already-installed custom sources from this repo with refreshed metadata
        const updatedCustom = prev.customSources.map((src) =>
          src.repoUrl === cleanUrl && importedById.has(src.id)
            ? importedById.get(src.id)!
            : src,
        );

        let nextCustom = updatedCustom;
        let nextActiveSources = prev.discoveryPrefs.activeSources;

        if (shouldAutoInstall) {
          const existingIds = new Set([
            ...INBUILT_SOURCES.map((s) => s.id),
            ...updatedCustom.map((s) => s.id),
          ]);
          const newInstall = importedSources.filter((s) => !existingIds.has(s.id));
          nextCustom = [...updatedCustom, ...newInstall];
          const autoEnabledIds = newInstall
            .filter((s) => allowNsfw || !s.isNsfw)
            .map((s) => s.id);
          nextActiveSources = Array.from(new Set([...nextActiveSources, ...autoEnabledIds]));
        }

        const nextState: PersistedState = {
          ...prev,
          repos: existingRepo
            ? prev.repos.map((r) => (r.url === cleanUrl ? upsertedRepo : r))
            : [upsertedRepo, ...prev.repos],
          repoCatalog: [...remainingCatalog, ...importedSources],
          customSources: nextCustom,
          discoveryPrefs: {
            ...prev.discoveryPrefs,
            activeSources: nextActiveSources,
          },
        };
        persistStateSync(nextState);
        persistBox.current = lastSyncPersistResult;
        return nextState;
      });

      const persistOutcome = persistBox.current;
      if (persistOutcome && !persistOutcome.ok && persistOutcome.error) {
        setStorageError(persistOutcome.error);
        addLog('ERROR', 'Storage', persistOutcome.error);
        if (!persistOutcome.compactedCatalog) {
          throw new Error(persistOutcome.error);
        }
      }

      addLog(
        'INFO',
        'Extensions',
        `Loaded ${importedSources.length} catalog sources from ${resolvedName} (${resolvedManager})`,
      );
      return { repo: newRepo, addedCount: importedSources.length };
    },
    [addLog],
  );

  const refreshExtensionRepo = useCallback(
    async (repoId: string): Promise<{ addedCount: number }> => {
      const target = state.repos.find((r) => r.id === repoId);
      if (!target) {
        throw new Error('Repository not found.');
      }
      const result = await addExtensionRepo(target.url, target.manager, target.name, {
        mediaType: target.mediaType,
      });
      return { addedCount: result.addedCount };
    },
    [addExtensionRepo, state.repos],
  );

  const removeExtensionRepo = useCallback((id: string) => {
    const targetRepo = state.repos.find((r) => r.id === id);
    const orphanedPkgs = targetRepo
      ? Array.from(
          new Set(
            state.customSources
              .filter(
                (s) =>
                  s.repoUrl === targetRepo.url &&
                  isAniyomiPackageSource(s) &&
                  typeof s.pkg === 'string' &&
                  s.pkg.trim().length > 0,
              )
              .map((s) => s.pkg!.trim())
              .filter(
                (pkg) =>
                  !state.customSources.some(
                    (other) => other.repoUrl !== targetRepo.url && other.pkg?.trim() === pkg,
                  ),
              ),
          ),
        )
      : [];
    setState((prev) => {
      const target = prev.repos.find((r) => r.id === id);
      const removedSourceIds = target
        ? new Set(prev.customSources.filter((s) => s.repoUrl === target.url).map((s) => s.id))
        : new Set<string>();
      return persistStateSync({
        ...prev,
        repos: prev.repos.filter((r) => r.id !== id),
        repoCatalog: target
          ? prev.repoCatalog.filter((s) => s.repoUrl !== target.url)
          : prev.repoCatalog,
        customSources: target
          ? prev.customSources.filter((s) => s.repoUrl !== target.url)
          : prev.customSources,
        discoveryPrefs: {
          ...prev.discoveryPrefs,
          activeSources: prev.discoveryPrefs.activeSources.filter(
            (srcId) => !removedSourceIds.has(srcId),
          ),
          preferredAnimeSourceId:
            prev.discoveryPrefs.preferredAnimeSourceId &&
            removedSourceIds.has(prev.discoveryPrefs.preferredAnimeSourceId)
              ? 'shonenx-hls-inbuilt'
              : prev.discoveryPrefs.preferredAnimeSourceId,
          preferredMangaSourceId:
            prev.discoveryPrefs.preferredMangaSourceId &&
            removedSourceIds.has(prev.discoveryPrefs.preferredMangaSourceId)
              ? 'shonenx-manga-inbuilt'
              : prev.discoveryPrefs.preferredMangaSourceId,
        },
      });
    });
    if (orphanedPkgs.length > 0 && isAndroidNativeBridgeAvailable()) {
      for (const pkg of orphanedPkgs) {
        void removeStagedAniyomiExtension(pkg).catch(() => {
          // Best-effort APK cleanup on repo removal
        });
      }
    }
  }, [state.customSources, state.repos]);

  const addComment = useCallback(
    (mediaId: string, body: string, spoiler = false) => {
      const text = body.trim();
      if (!text) return;
      const username =
        state.profiles[state.primaryTracker]?.username ||
        state.profiles.local?.username ||
        'Guest';
      const comment: CommentEntry = {
        id: `c-${Date.now()}`,
        mediaId,
        author: username,
        avatar: state.profiles[state.primaryTracker]?.avatarUrl,
        body: text,
        createdAt: new Date().toISOString(),
        likes: 0,
        spoiler,
      };
      setState((prev) => ({
        ...prev,
        comments: {
          ...prev.comments,
          [mediaId]: [comment, ...(prev.comments[mediaId] || [])],
        },
      }));
    },
    [state.profiles, state.primaryTracker],
  );

  const likeComment = useCallback((mediaId: string, commentId: string) => {
    setState((prev) => ({
      ...prev,
      comments: {
        ...prev.comments,
        [mediaId]: (prev.comments[mediaId] || []).map((c) =>
          c.id === commentId ? { ...c, likes: c.likes + 1 } : c,
        ),
      },
    }));
  }, []);

  const exportBackup = useCallback((): BackupManifest => {
    return {
      app: 'ShizuTv',
      version: '2.1.5',
      exportedAt: new Date().toISOString(),
      data: {
        themePrefs: state.themePrefs,
        uiPrefs: state.uiPrefs,
        contentPrefs: state.contentPrefs,
        discoveryPrefs: state.discoveryPrefs,
        homeSections: state.homeSections,
        playerPrefs: state.playerPrefs,
        batterySaver: state.batterySaver,
        readerPrefs: state.readerPrefs,
        library: state.library,
        history: state.history,
        watchedItems: state.watchedItems,
        bookmarkedItems: state.bookmarkedItems,
        repos: state.repos,
        customSources: state.customSources,
      },
    };
  }, [state]);

  const importBackup = useCallback(
    (manifest: BackupManifest) => {
      if ((manifest.app !== 'ShizuTv' && manifest.app !== 'ShonenX') || !manifest.data) {
        throw new Error('Invalid ShizuTv backup manifest');
      }
      setState((prev) => {
        const importedBatterySaver = resolveEffectiveBatterySaver({
          topLevelBatterySaver:
            manifest.data.batterySaver !== undefined
              ? manifest.data.batterySaver
              : manifest.data.playerPrefs?.batterySaver,
          playerBatterySaver: prev.batterySaver,
        });
        const isNonNovelEntry = (entry: { mediaType?: string; media?: { type?: string; format?: string | null } }) =>
          String(entry?.mediaType || '').toUpperCase() !== 'NOVEL' &&
          String(entry?.media?.type || '').toUpperCase() !== 'NOVEL' &&
          String(entry?.media?.format || '').toUpperCase() !== 'NOVEL';
        return persistStateSync({
          ...prev,
          ...manifest.data,
          batterySaver: importedBatterySaver,
          homeSections: Array.isArray(manifest.data.homeSections)
            ? migrateDefaultHomeSectionsOrder(
                manifest.data.homeSections.filter(
                  (s) => String(s?.targetMediaType || '').toUpperCase() !== 'NOVEL',
                ),
                DEFAULT_HOME_SECTIONS,
                null,
              )
            : prev.homeSections,
          homeSectionsVersion: HOME_SECTIONS_VERSION,
          library: Array.isArray(manifest.data.library)
            ? manifest.data.library.filter(isNonNovelEntry)
            : prev.library,
          history: Array.isArray(manifest.data.history)
            ? manifest.data.history.filter(isNonNovelEntry)
            : prev.history,
          bookmarkedItems: Array.isArray(manifest.data.bookmarkedItems)
            ? manifest.data.bookmarkedItems.filter(isNonNovelEntry)
            : prev.bookmarkedItems,
          repos: Array.isArray(manifest.data.repos)
            ? manifest.data.repos
                .map((r) => migrateExtensionRepoRecord(r))
                .filter((r): r is ExtensionRepo => Boolean(r))
            : prev.repos,
          customSources: Array.isArray(manifest.data.customSources)
            ? migratePersistedExtensionRecords(manifest.data.customSources)
            : prev.customSources,
          repoCatalog: Array.isArray(manifest.data.repoCatalog)
            ? migratePersistedExtensionRecords(manifest.data.repoCatalog)
            : prev.repoCatalog,
          themePrefs: { ...prev.themePrefs, ...(manifest.data.themePrefs || {}) },
          uiPrefs: { ...prev.uiPrefs, ...(manifest.data.uiPrefs || {}) },
          contentPrefs: { ...prev.contentPrefs, ...(manifest.data.contentPrefs || {}) },
          discoveryPrefs: { ...prev.discoveryPrefs, ...(manifest.data.discoveryPrefs || {}) },
          playerPrefs: {
            ...prev.playerPrefs,
            ...(manifest.data.playerPrefs || {}),
            batterySaver: importedBatterySaver,
            audioLanguage: sanitizeAudioLanguageCode(
              manifest.data.playerPrefs?.audioLanguage ?? prev.playerPrefs.audioLanguage,
            ),
          },
        });
      });
      addLog('INFO', 'Backup', `Restored backup from ${manifest.exportedAt}`);
    },
    [addLog],
  );

  const resetAllData = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.removeItem(REPO_CATALOG_STORAGE_KEY);
    } catch {
      // Ignore storage removal errors
    }
    setStorageError(null);
    setState(DEFAULT_STATE);
    addLog('WARN', 'System', 'Reset all preferences and local library');
  }, [addLog]);

  const effectiveMetadataTracker = useMemo((): Exclude<TrackerType, 'local'> => {
    const explicit = state.discoveryPrefs.metadataTrackerId;
    if (explicit && explicit !== 'local') return explicit;
    if (state.primaryTracker !== 'local') return state.primaryTracker;
    return 'anilist';
  }, [state.discoveryPrefs.metadataTrackerId, state.primaryTracker]);

  const value: AppContextValue = {
    state,
    isLocked,
    unlockApp,
    lockApp,
    logs,
    addLog,
    clearLogs,
    storageError,
    clearStorageError,
    batterySaver: state.batterySaver,
    setBatterySaver,
    updateThemePrefs,
    applyPreset,
    updateUiPrefs,
    updateContentPrefs,
    updateDiscoveryPrefs,
    setHomeSections,
    updatePlayerPrefs,
    updateReaderPrefs,
    updateDiscordPrefs,
    updateSecurityPrefs,
    setPrimaryTracker,
    connectAniListToken,
    loginWithAniList,
    logoutAniList,
    disconnectTracker,
    upsertLibraryEntry,
    removeLibraryEntry,
    getLibraryEntry,
    recordHistory,
    markItemWatched,
    toggleItemBookmark,
    removeHistoryItem,
    clearHistoryForMedia,
    enqueueDownload,
    updateDownloadTask,
    setRealDownloadActive,
    toggleDownloadPause,
    removeDownload,
    clearCompletedDownloads,
    allSources,
    toggleSourceActive,
    setPreferredSource,
    setPreferredServerForSource,
    setSourceOrder,
    installCatalogExtension,
    installAllCatalogExtensions,
    uninstallExtension,
    addExtensionRepo,
    refreshExtensionRepo,
    removeExtensionRepo,
    addComment,
    likeComment,
    exportBackup,
    importBackup,
    resetAllData,
    effectiveMetadataTracker,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
