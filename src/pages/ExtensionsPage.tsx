import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Ban,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  Clapperboard,
  Cloud,
  Cpu,
  Download,
  FlaskConical,
  Github,
  Globe,
  Infinity as InfinityIcon,
  Languages,
  Loader2,
  Play,
  Plug,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { shouldRunAutomaticBackgroundTasks } from '../utils/batterySaver';
import {
  ExtensionRepo,
  NativeExtensionStagingState,
  NativeSigningCertChangeDetails,
  SourceInfo,
} from '../types/media';
import {
  collectAvailableExtensionLanguages,
  ExtensionManagerFilter,
  ExtensionMediaTab,
  filterExtensions,
  formatExtensionLangChip,
  formatExtensionVersion,
  getExtensionManagerType,
  groupExtensionsByLanguage,
  matchesExtensionMediaTab,
  reorderSourceIds,
} from '../utils/extensionsManager';
import { checkSourcesHealthAsync, diagnoseExtensionAsync } from '../services/sourceEngine';
import {
  selectActiveHealthCheckSources,
  type SourceHealthCheckResult,
  summarizeSourceHealthCounts,
} from '../utils/sourceHealthCheck';
import {
  BackendConnectionError,
  BackendNotConfiguredError,
  NonJsonResponseError,
} from '../utils/backendConfig';
import {
  buildExtensionCompatibilitySnapshot,
  classifyDiagnosticFailure,
  DEFAULT_DIAGNOSTIC_PROBE_SCOPE,
  ExtensionDiagnosticReport,
  formatCapabilityBadgeText,
  formatDiagnosticTimestamp,
  isAniyomiPackageSource,
  loadPersistedExtensionDiagnostics,
  savePersistedExtensionDiagnostic,
  summarizeCompatibilityCounts,
} from '../utils/extensionDiagnostics';
import {
  downloadAndStageAniyomiApk,
  isAndroidNativeBridgeAvailable,
  listStagedAniyomiExtensions,
  removeStagedAniyomiExtension,
} from '../native/aniyomiPlugin';
import {
  extractSigningCertMismatchFromError,
  formatShortFingerprint,
} from '../utils/nativeExtensionManager';
import { getSourcePlayabilityStatus } from '../utils/sourcePicker';
import { getBoundedStaggerDelay } from '../utils/appMotion';
import { triggerHaptic } from '../utils/haptics';
import {
  countWebPlayableCandidates,
  resolveSourceLiveStatusBadge,
} from '../utils/sourceStatus';
import {
  ExtensionCompatibilityCardPanel,
  ExtensionCompatibilitySummaryBar,
  getRuntimeRequirementBadgeClasses,
  RuntimeRequirementIcon,
} from '../components/extensions/ExtensionCompatibilityDashboard';
import { SourceLiveStatusChip } from '../components/extensions/SourceLiveStatusBadge';
import {
  SourceHealthCardBadge,
  SourceHealthFailureAlert,
  SourceHealthStatusBar,
} from '../components/extensions/ExtensionHealthIndicator';
import {
  NativeApkCardStrip,
  NativeExtensionSecurityConsentDialog,
  NativeSigningCertMismatchModal,
} from '../components/extensions/NativeApkStagingControls';
import {
  EXT_FROSTED_ACTIVE_BUBBLE,
  EXT_FROSTED_ICON_BTN,
  EXT_FROSTED_PILL,
  EXT_FROSTED_SHEET,
  EXT_FROSTED_SURFACE,
  ExtensionAvatar,
  ExtensionsAmbientBackdrop,
  SegmentedOption,
  SlidingSegmentedBar,
} from '../components/extensions/ExtensionsUiPrimitives';

type ExtensionsSubView = 'main' | 'testing' | 'repos';
type ExtensionSubTab = 'installed' | 'available';
type TestKind = 'ping' | 'basic' | 'full';
type RepoManagerTab = 'mangayomi' | 'aniyomi' | 'cloudstream';

type ExtensionTestResult = ExtensionDiagnosticReport;

const RECOMMENDED_REPOS: Array<{
  id: string;
  label: string;
  name: string;
  manager: ExtensionRepo['manager'];
  mediaType: ExtensionMediaTab;
  url: string;
}> = [
  {
    id: 'yuzono-aniyomi',
    label: 'Yuzono Anime (Aniyomi)',
    name: 'Yuzono Anime Repo',
    manager: 'aniyomi',
    mediaType: 'ANIME',
    url: 'https://raw.githubusercontent.com/yuzono/anime-repo/repo/index.min.json',
  },
  {
    id: 'kodjodevf-mangayomi',
    label: 'Mangayomi Official',
    name: 'Mangayomi Official Extensions',
    manager: 'mangayomi',
    mediaType: 'MANGA',
    url: 'https://raw.githubusercontent.com/kodjodevf/mangayomi-extensions/main/index.json',
  },
];

const REPO_MANAGERS: ReadonlyArray<SegmentedOption<RepoManagerTab>> = [
  { id: 'mangayomi', label: 'Mangayomi', icon: Puzzle, testId: 'repo-manager-tab-mangayomi' },
  { id: 'aniyomi', label: 'Aniyomi', icon: Puzzle, testId: 'repo-manager-tab-aniyomi' },
  { id: 'cloudstream', label: 'CloudStream', icon: Puzzle, testId: 'repo-manager-tab-cloudstream' },
];

const MANAGER_FILTERS: Array<{ id: ExtensionManagerFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'aniyomi', label: 'Aniyomi' },
  { id: 'cloudstream', label: 'CloudStream' },
  { id: 'mangayomi', label: 'Mangayomi' },
  { id: 'inbuilt', label: 'Inbuilt' },
];

const MEDIA_TAB_OPTIONS: ReadonlyArray<SegmentedOption<ExtensionMediaTab>> = [
  { id: 'ANIME', label: 'Anime', icon: Clapperboard, testId: 'extensions-media-tab-anime' },
  { id: 'MANGA', label: 'Manga', icon: BookOpen, testId: 'extensions-media-tab-manga' },
];

const SUBTAB_OPTIONS: ReadonlyArray<SegmentedOption<ExtensionSubTab>> = [
  { id: 'installed', label: 'Saved & Installed', testId: 'extensions-subtab-installed' },
  { id: 'available', label: 'Available', testId: 'extensions-subtab-available' },
];

const TEST_TYPE_OPTIONS: ReadonlyArray<SegmentedOption<ExtensionMediaTab>> = [
  { id: 'ANIME', label: 'Anime', testId: 'testing-type-anime' },
  { id: 'MANGA', label: 'Manga', testId: 'testing-type-manga' },
];

const TEST_KIND_OPTIONS: ReadonlyArray<SegmentedOption<TestKind>> = [
  { id: 'ping', label: 'Ping', testId: 'testing-kind-ping' },
  { id: 'basic', label: 'Basic', testId: 'testing-kind-basic' },
  { id: 'full', label: 'Full', testId: 'testing-kind-full' },
];

const REPO_MEDIA_OPTIONS: ReadonlyArray<SegmentedOption<ExtensionMediaTab>> = [
  { id: 'ANIME', label: 'Anime', icon: Clapperboard, testId: 'repo-media-tab-anime' },
  { id: 'MANGA', label: 'Manga', icon: BookOpen, testId: 'repo-media-tab-manga' },
];

export const ExtensionsPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    state,
    batterySaver,
    storageError,
    clearStorageError,
    allSources,
    toggleSourceActive,
    setSourceOrder,
    installCatalogExtension,
    installAllCatalogExtensions,
    uninstallExtension,
    addExtensionRepo,
    refreshExtensionRepo,
    removeExtensionRepo,
  } = useApp();

  // Sub-views & Main tab state
  const [view, setView] = useState<ExtensionsSubView>('main');
  const [viewAnimClass, setViewAnimClass] = useState<string>('');
  const [mediaTab, setMediaTab] = useState<ExtensionMediaTab>('ANIME');
  const [subTab, setSubTab] = useState<ExtensionSubTab>('installed');
  const [searchQuery, setSearchQuery] = useState('');
  const [managerFilter, setManagerFilter] = useState<ExtensionManagerFilter>('all');
  const [langFilter, setLangFilter] = useState<string>('all');
  const [webPlayableOnly, setWebPlayableOnly] = useState(false);
  const [langPickerOpen, setLangPickerOpen] = useState(false);

  const switchView = (nextView: ExtensionsSubView) => {
    if (nextView === view) return;
    setRepoError(null);
    setRepoNotice(null);
    setViewAnimClass(nextView === 'main' ? 'sx-page-pop-enter' : 'sx-page-push-enter');
    setView(nextView);
  };

  // Drag & Drop Reorder state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Extension Details / Settings Modal
  const [inspectSource, setInspectSource] = useState<SourceInfo | null>(null);

  // Phase 2 — Android Batch 1: Native APK Staging State (strictly inactive on Website)
  const isAndroidNative = useMemo(() => isAndroidNativeBridgeAvailable(), []);
  const [stagedByPkg, setStagedByPkg] = useState<Record<string, NativeExtensionStagingState>>({});
  const [nativeBusyByPkg, setNativeBusyByPkg] = useState<Record<string, boolean>>({});
  const [nativeErrorByPkg, setNativeErrorByPkg] = useState<Record<string, string>>({});
  const [consentStageSource, setConsentStageSource] = useState<SourceInfo | null>(null);
  const [certMismatchPrompt, setCertMismatchPrompt] = useState<{
    source: SourceInfo;
    details: NativeSigningCertChangeDetails;
  } | null>(null);

  useEffect(() => {
    if (!isAndroidNative) return;
    let active = true;
    void listStagedAniyomiExtensions()
      .then((items) => {
        if (!active) return;
        const map: Record<string, NativeExtensionStagingState> = {};
        for (const item of items) {
          if (item.packageName) map[item.packageName] = item;
        }
        setStagedByPkg(map);
      })
      .catch(() => {
        // Ignore initial listing error if plugin not yet ready
      });
    return () => {
      active = false;
    };
  }, [isAndroidNative]);

  const executeNativeStageApk = async (
    source: SourceInfo,
    allowSigningCertChange = false,
  ) => {
    if (!isAndroidNative || !source.apkUrl || !source.pkg) return;
    const pkg = source.pkg.trim();
    setNativeBusyByPkg((prev) => ({ ...prev, [pkg]: true }));
    setNativeErrorByPkg((prev) => {
      const next = { ...prev };
      delete next[pkg];
      return next;
    });
    try {
      const staged = await downloadAndStageAniyomiApk({
        url: source.apkUrl,
        expectedPackageName: pkg,
        ...(source.apkSha256 ? { expectedSha256: source.apkSha256 } : {}),
        allowSigningCertChange,
      });
      setStagedByPkg((prev) => ({ ...prev, [pkg]: staged }));
      setConsentStageSource(null);
      setCertMismatchPrompt(null);
    } catch (err) {
      const certMismatch = extractSigningCertMismatchFromError(err);
      if (certMismatch) {
        setConsentStageSource(null);
        setCertMismatchPrompt({ source, details: certMismatch });
      } else {
        const msg = err instanceof Error ? err.message : 'APK verification and staging failed.';
        setNativeErrorByPkg((prev) => ({ ...prev, [pkg]: msg }));
        setConsentStageSource(null);
      }
    } finally {
      setNativeBusyByPkg((prev) => {
        const next = { ...prev };
        delete next[pkg];
        return next;
      });
    }
  };

  const executeNativeRemoveApk = async (pkg: string) => {
    if (!isAndroidNative || !pkg.trim()) return;
    const cleanPkg = pkg.trim();
    setNativeBusyByPkg((prev) => ({ ...prev, [cleanPkg]: true }));
    setNativeErrorByPkg((prev) => {
      const next = { ...prev };
      delete next[cleanPkg];
      return next;
    });
    try {
      await removeStagedAniyomiExtension(cleanPkg);
      setStagedByPkg((prev) => {
        const next = { ...prev };
        delete next[cleanPkg];
        return next;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to remove staged APK.';
      setNativeErrorByPkg((prev) => ({ ...prev, [cleanPkg]: msg }));
    } finally {
      setNativeBusyByPkg((prev) => {
        const next = { ...prev };
        delete next[cleanPkg];
        return next;
      });
    }
  };

  // Repositories View & Add Repo Modal State
  const [repoManagerTab, setRepoManagerTab] = useState<RepoManagerTab>('mangayomi');
  const [repoMediaTab, setRepoMediaTab] = useState<ExtensionMediaTab>('ANIME');
  const [addRepoOpen, setAddRepoOpen] = useState(false);
  const [repoPresetsOpen, setRepoPresetsOpen] = useState(false);
  const [repoName, setRepoName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [repoManagerInput, setRepoManagerInput] = useState<ExtensionRepo['manager']>('aniyomi');
  const [addingRepo, setAddingRepo] = useState(false);
  const [refreshingRepoId, setRefreshingRepoId] = useState<string | null>(null);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [repoNotice, setRepoNotice] = useState<string | null>(null);

  // Extension Testing & Compatibility Dashboard State
  const [testMediaType, setTestMediaType] = useState<ExtensionMediaTab>('ANIME');
  const [testKind, setTestKind] = useState<TestKind>('basic');
  const [testQuery, setTestQuery] = useState('Chainsaw Man');
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [runningTests, setRunningTests] = useState(false);
  const [testResults, setTestResults] = useState<ExtensionTestResult[]>([]);
  const [diagnosticsBySourceId, setDiagnosticsBySourceId] = useState<
    Record<string, ExtensionDiagnosticReport>
  >(() => loadPersistedExtensionDiagnostics());
  const [runningFullSourceIds, setRunningFullSourceIds] = useState<Record<string, boolean>>({});
  const [runningBatchDiagnostics, setRunningBatchDiagnostics] = useState(false);
  const [diagBannerError, setDiagBannerError] = useState<string | null>(null);

  // Active Source Heartbeat Health Check State
  const [healthBySourceId, setHealthBySourceId] = useState<
    Record<string, SourceHealthCheckResult>
  >({});
  const [checkingHealthIds, setCheckingHealthIds] = useState<Record<string, boolean>>({});
  const [runningBatchHealthCheck, setRunningBatchHealthCheck] = useState(false);
  const attemptedHealthKeysRef = useRef<Set<string>>(new Set());
  const inFlightHealthKeysRef = useRef<Set<string>>(new Set());

  // Escape closes any open modal
  useEffect(() => {
    if (
      !inspectSource &&
      !addRepoOpen &&
      !repoPresetsOpen &&
      !langPickerOpen &&
      !consentStageSource &&
      !certMismatchPrompt
    ) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (certMismatchPrompt) setCertMismatchPrompt(null);
      else if (consentStageSource) setConsentStageSource(null);
      else if (addRepoOpen) setAddRepoOpen(false);
      else if (repoPresetsOpen) setRepoPresetsOpen(false);
      else if (inspectSource) setInspectSource(null);
      else if (langPickerOpen) setLangPickerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    inspectSource,
    addRepoOpen,
    repoPresetsOpen,
    langPickerOpen,
    consentStageSource,
    certMismatchPrompt,
  ]);

  const installedIds = useMemo(() => new Set(allSources.map((s) => s.id)), [allSources]);

  const availableLanguages = useMemo(() => {
    const pool = subTab === 'installed' ? allSources : state.repoCatalog;
    return collectAvailableExtensionLanguages(pool, mediaTab);
  }, [allSources, state.repoCatalog, subTab, mediaTab]);

  const baseFilteredInstalled = useMemo(
    () =>
      filterExtensions(allSources, {
        mediaTab,
        query: searchQuery,
        managerFilter,
        langFilter,
      }),
    [allSources, mediaTab, searchQuery, managerFilter, langFilter],
  );

  const filteredInstalled = useMemo(
    () =>
      webPlayableOnly
        ? filterExtensions(allSources, {
            mediaTab,
            query: searchQuery,
            managerFilter,
            langFilter,
            webPlayableOnly: true,
            diagnosticsBySourceId,
            healthBySourceId,
          })
        : baseFilteredInstalled,
    [
      allSources,
      mediaTab,
      searchQuery,
      managerFilter,
      langFilter,
      webPlayableOnly,
      diagnosticsBySourceId,
      healthBySourceId,
      baseFilteredInstalled,
    ],
  );

  const baseFilteredAvailable = useMemo(
    () =>
      filterExtensions(state.repoCatalog, {
        mediaTab,
        query: searchQuery,
        managerFilter,
        langFilter,
      }),
    [state.repoCatalog, mediaTab, searchQuery, managerFilter, langFilter],
  );

  const filteredAvailable = useMemo(
    () =>
      webPlayableOnly
        ? filterExtensions(state.repoCatalog, {
            mediaTab,
            query: searchQuery,
            managerFilter,
            langFilter,
            webPlayableOnly: true,
            diagnosticsBySourceId,
            healthBySourceId,
          })
        : baseFilteredAvailable,
    [
      state.repoCatalog,
      mediaTab,
      searchQuery,
      managerFilter,
      langFilter,
      webPlayableOnly,
      diagnosticsBySourceId,
      healthBySourceId,
      baseFilteredAvailable,
    ],
  );

  const webPlayableSummary = useMemo(() => {
    const basePool = subTab === 'installed' ? baseFilteredInstalled : baseFilteredAvailable;
    const playableCount = countWebPlayableCandidates(
      basePool,
      diagnosticsBySourceId,
      mediaTab,
      healthBySourceId,
    );
    return {
      playableCount,
      totalCount: basePool.length,
    };
  }, [
    subTab,
    baseFilteredInstalled,
    baseFilteredAvailable,
    diagnosticsBySourceId,
    mediaTab,
    healthBySourceId,
  ]);

  const groupedAvailable = useMemo(
    () => groupExtensionsByLanguage(filteredAvailable),
    [filteredAvailable],
  );

  const testingCandidateSources = useMemo(
    () => allSources.filter((s) => matchesExtensionMediaTab(s, testMediaType)),
    [allSources, testMediaType],
  );

  const installedCompatibilityEntries = useMemo(
    () =>
      filteredInstalled.map((source) => ({
        source,
        snapshot: buildExtensionCompatibilitySnapshot(
          source,
          diagnosticsBySourceId[source.id],
          mediaTab,
        ),
      })),
    [filteredInstalled, diagnosticsBySourceId, mediaTab],
  );

  const playableInstalledEntries = useMemo(
    () => installedCompatibilityEntries.filter((e) => !e.snapshot.isMetadataOnly),
    [installedCompatibilityEntries],
  );

  const metadataOnlyInstalledEntries = useMemo(
    () => installedCompatibilityEntries.filter((e) => e.snapshot.isMetadataOnly),
    [installedCompatibilityEntries],
  );

  const compatibilityCounts = useMemo(
    () => summarizeCompatibilityCounts(installedCompatibilityEntries.map((e) => e.snapshot)),
    [installedCompatibilityEntries],
  );

  const activeHealthSourcesForTab = useMemo(
    () =>
      selectActiveHealthCheckSources(
        playableInstalledEntries.map((e) => e.source),
        state.discoveryPrefs.activeSources,
        mediaTab,
      ),
    [playableInstalledEntries, state.discoveryPrefs.activeSources, mediaTab],
  );

  const healthCounts = useMemo(
    () =>
      summarizeSourceHealthCounts(
        playableInstalledEntries.map((e) => e.source),
        state.discoveryPrefs.activeSources,
        healthBySourceId,
        checkingHealthIds,
      ),
    [
      playableInstalledEntries,
      state.discoveryPrefs.activeSources,
      healthBySourceId,
      checkingHealthIds,
    ],
  );

  const runHealthChecksForSources = useCallback(
    async (
      targets: SourceInfo[],
      targetMediaTab: ExtensionMediaTab,
      options?: { isBatch?: boolean; signal?: AbortSignal },
    ) => {
      if (targets.length === 0) return;
      for (const src of targets) {
        inFlightHealthKeysRef.current.add(`${targetMediaTab}:${src.id}`);
      }
      if (options?.isBatch) {
        setRunningBatchHealthCheck(true);
      }
      setCheckingHealthIds((prev) => {
        const next = { ...prev };
        for (const src of targets) next[src.id] = true;
        return next;
      });
      try {
        const results = await checkSourcesHealthAsync({
          sources: targets,
          mediaContext: targetMediaTab,
          signal: options?.signal,
        });
        if (options?.signal?.aborted) return;
        for (const src of targets) {
          attemptedHealthKeysRef.current.add(`${targetMediaTab}:${src.id}`);
        }
        setHealthBySourceId((prev) => {
          const next = { ...prev };
          for (const res of results) {
            next[res.sourceId] = res;
          }
          return next;
        });
      } catch (err) {
        if (options?.signal?.aborted) {
          return;
        }
        for (const src of targets) {
          attemptedHealthKeysRef.current.add(`${targetMediaTab}:${src.id}`);
        }
        const isConnectivityOutage =
          err instanceof BackendConnectionError ||
          err instanceof BackendNotConfiguredError ||
          err instanceof NonJsonResponseError;
        if (isConnectivityOutage) {
          setDiagBannerError(err instanceof Error ? err.message : 'Health check failed.');
        } else {
          const msg = err instanceof Error ? err.message : 'Heartbeat check failed.';
          const checkedAt = new Date().toISOString();
          setHealthBySourceId((prev) => {
            const next = { ...prev };
            for (const src of targets) {
              next[src.id] = {
                sourceId: src.id,
                sourceName: src.name,
                status: 'unreachable',
                expectedFormat: 'unsupported',
                checkedAt,
                summary: 'Heartbeat request error',
                detail: msg,
              };
            }
            return next;
          });
        }
      } finally {
        for (const src of targets) {
          inFlightHealthKeysRef.current.delete(`${targetMediaTab}:${src.id}`);
        }
        if (!options?.signal?.aborted) {
          setCheckingHealthIds((prev) => {
            const next = { ...prev };
            for (const src of targets) delete next[src.id];
            return next;
          });
          if (options?.isBatch) {
            setRunningBatchHealthCheck(false);
          }
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!shouldRunAutomaticBackgroundTasks(batterySaver)) return;
    if (view !== 'main' || subTab !== 'installed') return;
    const pending = activeHealthSourcesForTab.filter((src) => {
      const key = `${mediaTab}:${src.id}`;
      return !attemptedHealthKeysRef.current.has(key) && !inFlightHealthKeysRef.current.has(key);
    });
    if (pending.length === 0) return;

    const controller = new AbortController();
    void runHealthChecksForSources(pending, mediaTab, {
      isBatch: true,
      signal: controller.signal,
    });
    return () => {
      controller.abort();
      for (const src of pending) {
        inFlightHealthKeysRef.current.delete(`${mediaTab}:${src.id}`);
      }
    };
  }, [batterySaver, view, subTab, mediaTab, activeHealthSourcesForTab, runHealthChecksForSources]);

  const visibleRepos = useMemo(
    () =>
      state.repos.filter(
        (r) =>
          r.manager === repoManagerTab &&
          (!r.mediaType || r.mediaType === repoMediaTab),
      ),
    [state.repos, repoManagerTab, repoMediaTab],
  );

  const handleReorderDrop = (targetId: string) => {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    const currentOrder = allSources.map((s) => s.id);
    const nextOrder = reorderSourceIds(currentOrder, draggingId, targetId);
    setSourceOrder(nextOrder);
    setDraggingId(null);
    setDragOverId(null);
  };

  const moveSourceStep = (sourceId: string, delta: -1 | 1) => {
    const currentOrder = allSources.map((s) => s.id);
    const idx = currentOrder.indexOf(sourceId);
    const targetIdx = idx + delta;
    if (idx === -1 || targetIdx < 0 || targetIdx >= currentOrder.length) return;
    const nextOrder = reorderSourceIds(currentOrder, sourceId, currentOrder[targetIdx]);
    setSourceOrder(nextOrder);
  };

  const handleInstallRepo = async (
    targetUrl: string,
    targetManager: ExtensionRepo['manager'],
    targetName?: string,
    mediaHint?: ExtensionMediaTab,
  ) => {
    setAddingRepo(true);
    setRepoError(null);
    setRepoNotice(null);
    try {
      const result = await addExtensionRepo(targetUrl, targetManager, targetName, {
        autoInstall: false,
        mediaType: mediaHint ?? repoMediaTab,
      });
      setRepoNotice(
        `Loaded ${result.addedCount} extension${result.addedCount === 1 ? '' : 's'} from "${result.repo.name}" into Available.`,
      );
      setRepoName('');
      setRepoUrl('');
      setAddRepoOpen(false);
      setRepoPresetsOpen(false);
      if (
        result.repo.manager === 'mangayomi' ||
        result.repo.manager === 'aniyomi' ||
        result.repo.manager === 'cloudstream'
      ) {
        setRepoManagerTab(result.repo.manager);
      }
    } catch (err) {
      setRepoError(err instanceof Error ? err.message : 'Failed to fetch repository manifest.');
    } finally {
      setAddingRepo(false);
    }
  };

  const handleRefreshRepo = async (repo: ExtensionRepo) => {
    if (refreshingRepoId) return;
    setRefreshingRepoId(repo.id);
    setRepoError(null);
    setRepoNotice(null);
    try {
      const res = await refreshExtensionRepo(repo.id);
      setRepoNotice(`Refreshed "${repo.name}" (${res.addedCount} catalog sources).`);
    } catch (err) {
      setRepoError(err instanceof Error ? err.message : 'Failed to refresh repository.');
    } finally {
      setRefreshingRepoId(null);
    }
  };

  const handleRefreshAllRepos = async () => {
    if (state.repos.length === 0) return;
    for (const r of state.repos) {
      await handleRefreshRepo(r);
    }
  };

  const runSingleFullDiagnostic = async (
    source: SourceInfo,
    overrideMediaTab?: ExtensionMediaTab,
  ) => {
    if (runningFullSourceIds[source.id]) return;
    const targetMedia = overrideMediaTab ?? mediaTab;
    setDiagBannerError(null);
    setRunningFullSourceIds((prev) => ({ ...prev, [source.id]: true }));
    const startedAt = performance.now();
    try {
      const report = await diagnoseExtensionAsync({
        source,
        mediaType: targetMedia,
        mode: 'full',
        query: 'Naruto',
      });
      const enriched: ExtensionDiagnosticReport = {
        ...report,
        mode: report.mode || 'full',
        testedAt: report.testedAt || new Date().toISOString(),
      };
      setDiagnosticsBySourceId(savePersistedExtensionDiagnostic(enriched));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Full diagnostic execution failed.';
      const isConnectivityOutage =
        err instanceof BackendConnectionError ||
        err instanceof BackendNotConfiguredError ||
        err instanceof NonJsonResponseError;
      if (isConnectivityOutage) {
        setDiagBannerError(msg);
      } else {
        const failureKind = classifyDiagnosticFailure(msg);
        const keepDownstreamUntested =
          failureKind === 'blocked_request' ||
          failureKind === 'timeout' ||
          failureKind === 'network_error';
        const failReport: ExtensionDiagnosticReport = {
          sourceId: source.id,
          sourceName: source.name,
          status: 'fail',
          durationMs: Math.round(performance.now() - startedAt),
          testedAt: new Date().toISOString(),
          mode: 'full',
          probeScope: targetMedia === 'ANIME' ? DEFAULT_DIAGNOSTIC_PROBE_SCOPE : undefined,
          failureKind,
          summary: msg,
          detail: msg,
          capabilities: {
            metadataSearch: 'unavailable',
            episodeOrChapterListing: keepDownstreamUntested ? 'untested' : 'unavailable',
            audioLanguage: targetMedia === 'ANIME' ? 'untested' : 'unsupported',
            playbackOrReader: keepDownstreamUntested ? 'untested' : 'unavailable',
            overallCompatibility: 'incompatible',
          },
        };
        setDiagnosticsBySourceId(savePersistedExtensionDiagnostic(failReport));
      }
    } finally {
      setRunningFullSourceIds((prev) => {
        const next = { ...prev };
        delete next[source.id];
        return next;
      });
    }
  };

  const runBatchFullDiagnostics = async () => {
    if (runningBatchDiagnostics || playableInstalledEntries.length === 0) return;
    setRunningBatchDiagnostics(true);
    try {
      for (const { source } of playableInstalledEntries) {
        await runSingleFullDiagnostic(source, mediaTab);
      }
    } finally {
      setRunningBatchDiagnostics(false);
    }
  };

  const runExtensionTests = async () => {
    if (runningTests || selectedTestIds.length === 0) return;
    setRunningTests(true);
    setTestResults([]);
    setDiagBannerError(null);

    const query = testQuery.trim() || 'Naruto';
    const nextResults: ExtensionTestResult[] = [];

    for (const sourceId of selectedTestIds) {
      const source = allSources.find((s) => s.id === sourceId);
      if (!source) continue;
      const startedAt = performance.now();

      try {
        const report = await diagnoseExtensionAsync({
          source,
          mediaType: testMediaType,
          mode: testKind,
          query,
        });
        const enriched: ExtensionDiagnosticReport = {
          ...report,
          mode: report.mode || testKind,
          testedAt: report.testedAt || new Date().toISOString(),
        };
        nextResults.push(enriched);
        setDiagnosticsBySourceId(savePersistedExtensionDiagnostic(enriched));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Test execution failed';
        const isConnectivityOutage =
          err instanceof BackendConnectionError ||
          err instanceof BackendNotConfiguredError ||
          err instanceof NonJsonResponseError;
        if (isConnectivityOutage) {
          setDiagBannerError(msg);
        }
        const failureKind = isConnectivityOutage
          ? err instanceof BackendConnectionError && err.isTimeout
            ? 'timeout'
            : 'network_error'
          : classifyDiagnosticFailure(msg);
        const failReport: ExtensionDiagnosticReport = {
          sourceId: source.id,
          sourceName: source.name,
          status: 'fail',
          durationMs: Math.round(performance.now() - startedAt),
          testedAt: new Date().toISOString(),
          mode: testKind,
          probeScope: testMediaType === 'ANIME' && testKind === 'full' ? DEFAULT_DIAGNOSTIC_PROBE_SCOPE : undefined,
          failureKind,
          summary: msg,
          detail: msg,
          capabilities: {
            metadataSearch: isConnectivityOutage || testKind === 'ping' ? 'untested' : 'unavailable',
            episodeOrChapterListing: 'untested',
            audioLanguage: testMediaType === 'ANIME' ? 'untested' : 'unsupported',
            playbackOrReader: 'untested',
            overallCompatibility: 'incompatible',
          },
        };
        nextResults.push(failReport);
        if (!isConnectivityOutage) {
          setDiagnosticsBySourceId(savePersistedExtensionDiagnostic(failReport));
        }
      }

      setTestResults([...nextResults]);
    }

    setRunningTests(false);
  };

  // ============================================================================
  // SUB-VIEW: EXTENSION TESTING
  // ============================================================================
  if (view === 'testing') {
    const allSelected =
      testingCandidateSources.length > 0 &&
      testingCandidateSources.every((s) => selectedTestIds.includes(s.id));

    return (
      <div
        key="view-testing"
        className={`${viewAnimClass} relative max-w-4xl mx-auto px-4 sm:px-8 py-4 sm:py-7 pb-24 md:pb-10 space-y-4`}
      >
        <ExtensionsAmbientBackdrop />

        {/* Top Frosted Pill Header */}
        <header className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => switchView('main')}
            data-testid="testing-back-btn"
            className={`inline-flex items-center gap-2 h-10 pl-1 pr-3.5 rounded-full ${EXT_FROSTED_PILL} hover:border-[var(--sx-primary)]/45 transition-all duration-200`}
          >
            <span className="w-8 h-8 rounded-full bg-[var(--sx-on-surface)]/7 dark:bg-white/10 flex items-center justify-center">
              <ChevronLeft className="w-4 h-4" />
            </span>
            <span className="text-sm font-extrabold tracking-tight">Extension Testing</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/settings/diagnostics')}
            className={`inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full ${EXT_FROSTED_PILL} text-xs font-extrabold hover:border-[var(--sx-primary)]/45 transition-all duration-200`}
          >
            <Plug className="w-3.5 h-3.5 text-[var(--sx-primary)]" />
            <span>Diagnostics</span>
          </button>
        </header>

        {/* Extension Type */}
        <section className="space-y-1.5">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-[var(--sx-on-surface-muted)] px-1">
            Extension Type
          </h2>
          <SlidingSegmentedBar
            ariaLabel="Extension Type"
            options={TEST_TYPE_OPTIONS}
            value={testMediaType}
            onChange={(next) => {
              setTestMediaType(next);
              setSelectedTestIds([]);
              setTestResults([]);
            }}
          />
        </section>

        {/* Test Type */}
        <section className="space-y-1.5">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-[var(--sx-on-surface-muted)] px-1">
            Test Type
          </h2>
          <SlidingSegmentedBar
            ariaLabel="Test Type"
            options={TEST_KIND_OPTIONS}
            value={testKind}
            onChange={(next) => setTestKind(next)}
          />
        </section>

        {/* Search Query */}
        <section className="space-y-1.5">
          <label
            htmlFor="testing-search-query"
            className="block text-xs font-extrabold uppercase tracking-wider text-[var(--sx-on-surface-muted)] px-1"
          >
            Search Query
          </label>
          <input
            id="testing-search-query"
            type="text"
            data-testid="testing-query-input"
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            placeholder="Chainsaw Man"
            className={`w-full h-10 px-3.5 rounded-2xl ${EXT_FROSTED_SURFACE} text-xs sm:text-sm font-semibold outline-none focus:border-[var(--sx-primary)]/60 transition-colors`}
          />
        </section>

        {/* Select Extensions */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
              Select Extensions
            </h2>
            <button
              type="button"
              data-testid="testing-select-all-btn"
              onClick={() =>
                setSelectedTestIds(
                  allSelected ? [] : testingCandidateSources.map((s) => s.id),
                )
              }
              className="text-xs font-extrabold text-[var(--sx-primary)] hover:opacity-80 px-2 py-0.5 rounded-lg transition-opacity"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {testingCandidateSources.length === 0 ? (
              <div
                className={`sm:col-span-2 p-6 rounded-2xl ${EXT_FROSTED_SURFACE} text-center text-xs text-[var(--sx-on-surface-muted)]`}
              >
                No installed {testMediaType.toLowerCase()} extensions available to test.
              </div>
            ) : (
              testingCandidateSources.map((src, idx) => {
                const checked = selectedTestIds.includes(src.id);
                const delay = getBoundedStaggerDelay(idx, 20, 8);
                return (
                  <button
                    key={src.id}
                    type="button"
                    data-testid={`testing-select-${src.id}`}
                    style={delay > 0 ? { animationDelay: `${delay}ms` } : undefined}
                    onClick={() =>
                      setSelectedTestIds((prev) =>
                        prev.includes(src.id)
                          ? prev.filter((id) => id !== src.id)
                          : [...prev, src.id],
                      )
                    }
                    className={`sx-card-animate w-full p-2.5 px-3 rounded-2xl flex items-center justify-between gap-2.5 text-left transition-all duration-200 ${
                      checked
                        ? EXT_FROSTED_ACTIVE_BUBBLE
                        : `${EXT_FROSTED_SURFACE} hover:border-[var(--sx-primary)]/45`
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ExtensionAvatar source={src} mediaTab={testMediaType} size="sm" />
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-extrabold truncate">{src.name}</div>
                        <div className="text-[11px] text-[var(--sx-on-surface-muted)] truncate">
                          {formatExtensionLangChip(src.lang)} · {formatExtensionVersion(src.version)}
                          {getSourcePlayabilityStatus(src, testMediaType) === 'metadata-only'
                            ? ' · Metadata Only'
                            : ''}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all duration-200 ${
                        checked
                          ? 'bg-[var(--sx-primary)] border-[var(--sx-primary)] text-[var(--sx-on-primary)] scale-105'
                          : 'border-[var(--sx-on-surface-muted)]/35 bg-white/10'
                      }`}
                    >
                      {checked && <Check className="w-3 h-3" />}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Start Test CTA */}
        <button
          type="button"
          data-testid="testing-start-btn"
          disabled={runningTests || selectedTestIds.length === 0}
          onClick={() => void runExtensionTests()}
          className={`w-full h-10 rounded-2xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 backdrop-blur-xl border transition-all duration-200 ${
            selectedTestIds.length > 0
              ? 'bg-[var(--sx-primary)]/90 text-[var(--sx-on-primary)] border-white/25 shadow-[0_10px_24px_-8px_rgba(0,0,0,0.28)] hover:bg-[var(--sx-primary)]'
              : `${EXT_FROSTED_SURFACE} text-[var(--sx-on-surface-muted)] cursor-not-allowed opacity-75`
          }`}
        >
          {runningTests && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{runningTests ? 'Running Tests...' : 'Start Test'}</span>
        </button>

        {diagBannerError && (
          <div
            data-testid="extensions-diag-connection-error"
            className="px-3.5 py-2.5 rounded-2xl bg-red-500/14 backdrop-blur-xl border border-red-500/30 text-xs font-bold text-red-700 dark:text-red-300 flex items-center justify-between gap-3"
          >
            <span className="min-w-0 flex-1">{diagBannerError}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => navigate('/settings/backend')}
                className="px-2.5 py-1 rounded-full bg-red-600/85 hover:bg-red-600 text-white text-[11px] font-extrabold whitespace-nowrap transition-colors"
              >
                Backend Settings
              </button>
              <button
                type="button"
                onClick={() => setDiagBannerError(null)}
                aria-label="Dismiss backend error"
                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-500/20"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Results Panel */}
        <section
          data-testid="testing-results-panel"
          className={`rounded-2xl ${EXT_FROSTED_SURFACE} p-4 min-h-[148px]`}
        >
          {testResults.length === 0 && !runningTests ? (
            <div className="py-7 flex flex-col items-center justify-center gap-2 text-[var(--sx-on-surface-muted)]">
              <FlaskConical className="w-8 h-8 opacity-45" />
              <p className="text-xs font-semibold text-center">
                Select extensions above and tap Start Test to check search, listing, and real playback/reader compatibility.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {testResults.map((res, idx) => {
                const delay = getBoundedStaggerDelay(idx, 24, 8);
                const capBadgeClass = (capStatus: ExtensionDiagnosticReport['capabilities']['metadataSearch']) => {
                  if (capStatus === 'verified') {
                    return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300';
                  }
                  if (capStatus === 'unavailable') {
                    return 'bg-red-500/15 border-red-500/30 text-red-700 dark:text-red-300';
                  }
                  if (capStatus === 'unsupported') {
                    return 'bg-orange-500/15 border-orange-500/30 text-orange-700 dark:text-orange-300';
                  }
                  return 'bg-[var(--sx-on-surface)]/8 dark:bg-white/10 border-white/25 dark:border-white/10 text-[var(--sx-on-surface-muted)]';
                };
                const statusBadgeLabel =
                  res.status === 'pass'
                    ? 'Pass · Verified'
                    : res.status === 'partial'
                      ? 'Partial'
                      : res.status === 'unsupported'
                        ? 'Unsupported'
                        : 'Fail';
                const statusBadgeStyle =
                  res.status === 'pass'
                    ? 'bg-emerald-500/16 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                    : res.status === 'partial'
                      ? 'bg-amber-500/16 border-amber-500/30 text-amber-700 dark:text-amber-300'
                      : res.status === 'unsupported'
                        ? 'bg-orange-500/16 border-orange-500/30 text-orange-700 dark:text-orange-300'
                        : 'bg-red-500/16 border-red-500/30 text-red-700 dark:text-red-300';
                return (
                  <div
                    key={res.sourceId}
                    data-testid={`testing-result-${res.sourceId}`}
                    style={delay > 0 ? { animationDelay: `${delay}ms` } : undefined}
                    className="sx-card-animate p-3 rounded-xl bg-[var(--sx-on-surface)]/5 dark:bg-white/[0.06] backdrop-blur-md border border-white/35 dark:border-white/10 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {res.status === 'pass' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        ) : res.status === 'partial' ? (
                          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        ) : res.status === 'unsupported' ? (
                          <Ban className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                        )}
                        <span className="text-xs sm:text-sm font-extrabold truncate">
                          {res.sourceName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-md border text-[10px] font-extrabold uppercase ${statusBadgeStyle}`}
                        >
                          {statusBadgeLabel}
                        </span>
                        <span className="text-[11px] font-mono-tabular font-bold text-[var(--sx-on-surface-muted)]">
                          {res.durationMs} ms
                        </span>
                      </div>
                    </div>
                    <p className="text-xs font-bold">{res.summary}</p>
                    {res.detail && (
                      <p className="text-[11px] text-[var(--sx-on-surface-muted)]">{res.detail}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[10px] font-extrabold ${capBadgeClass(
                          res.capabilities.metadataSearch,
                        )}`}
                      >
                        {formatCapabilityBadgeText('search', res.capabilities.metadataSearch, testMediaType)}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[10px] font-extrabold ${capBadgeClass(
                          res.capabilities.episodeOrChapterListing,
                        )}`}
                      >
                        {formatCapabilityBadgeText(
                          'listing',
                          res.capabilities.episodeOrChapterListing,
                          testMediaType,
                        )}
                      </span>
                      {testMediaType === 'ANIME' && (
                        <span
                          className={`px-2 py-0.5 rounded-md border text-[10px] font-extrabold ${capBadgeClass(
                            res.capabilities.audioLanguage ?? 'untested',
                          )}`}
                        >
                          {formatCapabilityBadgeText(
                            'audio',
                            res.capabilities.audioLanguage ?? 'untested',
                            testMediaType,
                          )}
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[10px] font-extrabold ${capBadgeClass(
                          res.capabilities.playbackOrReader,
                        )}`}
                      >
                        {formatCapabilityBadgeText(
                          'playback',
                          res.capabilities.playbackOrReader,
                          testMediaType,
                        )}
                      </span>
                    </div>
                    {res.testedAt && (
                      <div className="text-[10px] text-[var(--sx-on-surface-muted)]">
                        Tested: {formatDiagnosticTimestamp(res.testedAt)}
                      </div>
                    )}
                    {res.sampleItems && res.sampleItems.length > 0 && (
                      <div className="pt-1 space-y-0.5 text-[11px] font-mono-tabular text-[var(--sx-on-surface-muted)]">
                        {res.sampleItems.map((line, i) => (
                          <div key={i} className="truncate">
                            {line}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    );
  }

  // ============================================================================
  // SUB-VIEW: REPOSITORIES
  // ============================================================================
  if (view === 'repos') {
    return (
      <div
        key="view-repos"
        className={`${viewAnimClass} relative max-w-4xl mx-auto px-4 sm:px-8 py-4 sm:py-7 pb-28 md:pb-12 space-y-4 min-h-[75vh]`}
      >
        <ExtensionsAmbientBackdrop />

        {/* Header: < Extensions + Settings Gear */}
        <header className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => switchView('main')}
            data-testid="repos-back-btn"
            className={`inline-flex items-center gap-2 h-10 pl-1 pr-3.5 rounded-full ${EXT_FROSTED_PILL} hover:border-[var(--sx-primary)]/45 transition-all duration-200`}
          >
            <span className="w-8 h-8 rounded-full bg-[var(--sx-on-surface)]/7 dark:bg-white/10 flex items-center justify-center">
              <ChevronLeft className="w-4 h-4" />
            </span>
            <span className="text-sm font-extrabold tracking-tight">Extensions</span>
          </button>

          <button
            type="button"
            data-testid="repos-settings-btn"
            onClick={() => setRepoPresetsOpen(true)}
            aria-label="Repository settings and quick presets"
            className={`w-10 h-10 rounded-full ${EXT_FROSTED_PILL} flex items-center justify-center hover:border-[var(--sx-primary)]/45 transition-all duration-200`}
          >
            <Settings className="w-4 h-4" />
          </button>
        </header>

        {/* Manager Selector Bar: Mangayomi | Legado | LNReader | Aniyomi | CloudStream */}
        <SlidingSegmentedBar
          ariaLabel="Repository Manager"
          layout="scroll"
          options={REPO_MANAGERS}
          value={repoManagerTab}
          onChange={(mgr) => {
            setRepoError(null);
            setRepoNotice(null);
            setRepoManagerTab(mgr);
            setRepoManagerInput(mgr);
          }}
        />

        {/* Media Type Selector: Anime | Manga */}
        <SlidingSegmentedBar
          ariaLabel="Repository Media Type"
          options={REPO_MEDIA_OPTIONS}
          value={repoMediaTab}
          onChange={(next) => {
            setRepoError(null);
            setRepoNotice(null);
            setRepoMediaTab(next);
          }}
        />

        {repoNotice && (
          <div
            data-testid="extensions-repo-notice"
            className="sx-mode-enter px-3.5 py-2.5 rounded-2xl bg-emerald-500/14 backdrop-blur-xl border border-emerald-500/28 text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center justify-between gap-3"
          >
            <span>{repoNotice}</span>
            <button
              type="button"
              onClick={() => {
                setSubTab('available');
                setMediaTab(repoMediaTab);
                switchView('main');
              }}
              className="px-3 py-1 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 backdrop-blur-md border border-emerald-500/38 text-emerald-700 dark:text-emerald-200 text-[11px] font-extrabold whitespace-nowrap transition-colors"
            >
              View Available
            </button>
          </div>
        )}

        {repoError && (
          <div
            data-testid="extensions-repo-error"
            className="sx-mode-enter px-3.5 py-2.5 rounded-2xl bg-red-500/14 backdrop-blur-xl border border-red-500/28 text-xs font-bold text-red-700 dark:text-red-300"
          >
            {repoError}
          </div>
        )}

        {/* Repo List or Empty State */}
        <div
          key={`repo-list-${repoManagerTab}-${repoMediaTab}`}
          className="sx-mode-enter"
        >
          {visibleRepos.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
              <div
                className={`w-14 h-14 rounded-2xl ${EXT_FROSTED_SURFACE} flex items-center justify-center text-[var(--sx-primary)]`}
              >
                {repoMediaTab === 'ANIME' ? (
                  <Clapperboard className="w-6 h-6" />
                ) : (
                  <BookOpen className="w-6 h-6" />
                )}
              </div>
              <div className="space-y-1">
                <h2 className="text-sm sm:text-base font-extrabold">No repositories yet</h2>
                <p className="text-xs text-[var(--sx-on-surface-muted)]">
                  Tap + to add a repository URL
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {visibleRepos.map((repo, idx) => {
                const count = state.repoCatalog.filter((s) => s.repoUrl === repo.url).length;
                const isRefreshing = refreshingRepoId === repo.id;
                const delay = getBoundedStaggerDelay(idx, 24, 8);
                return (
                  <div
                    key={repo.id}
                    style={delay > 0 ? { animationDelay: `${delay}ms` } : undefined}
                    className={`sx-card-animate p-3 sm:p-3.5 rounded-2xl ${EXT_FROSTED_SURFACE} flex items-center justify-between gap-3 transition-all duration-200 hover:border-[var(--sx-primary)]/40`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs sm:text-sm font-extrabold truncate">
                          {repo.name}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[var(--sx-primary)]/14 border border-[var(--sx-primary)]/20 text-[var(--sx-primary)] text-[10px] font-extrabold uppercase">
                          {repo.manager}
                        </span>
                        <span className="text-[11px] font-mono-tabular text-[var(--sx-on-surface-muted)]">
                          {count} {count === 1 ? 'source' : 'sources'}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono-tabular text-[var(--sx-on-surface-muted)] truncate">
                        {repo.url}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={isRefreshing}
                        onClick={() => void handleRefreshRepo(repo)}
                        aria-label={`Refresh ${repo.name}`}
                        className={`w-9 h-9 rounded-xl ${EXT_FROSTED_ICON_BTN} flex items-center justify-center disabled:opacity-50`}
                      >
                        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeExtensionRepo(repo.id)}
                        aria-label={`Remove ${repo.name}`}
                        className="w-9 h-9 rounded-xl bg-red-500/14 dark:bg-red-500/18 backdrop-blur-md border border-red-500/28 text-red-600 dark:text-red-400 hover:bg-red-500/24 flex items-center justify-center transition-all duration-200"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* + Add Repo Floating Action Button */}
        <button
          type="button"
          data-testid="open-add-repo-modal-btn"
          onClick={() => {
            setRepoManagerInput(repoManagerTab);
            setRepoError(null);
            setAddRepoOpen(true);
          }}
          className="fixed bottom-24 right-4 md:bottom-8 md:right-8 z-40 inline-flex items-center gap-1.5 h-10 px-4 rounded-full sx-glass-cta text-xs font-extrabold hover:scale-[1.03]"
        >
          <Plus className="w-4 h-4" />
          <span>Add Repo</span>
        </button>

        {/* Add Repo Modal */}
        {addRepoOpen &&
          (() => {
            const modal = (
              <div
                className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-md p-0 sm:p-4 sx-backdrop-enter"
                onClick={() => setAddRepoOpen(false)}
                role="dialog"
                aria-modal="true"
                aria-label="Add Extension Repository"
              >
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!repoUrl.trim() || addingRepo) return;
                    void handleInstallRepo(repoUrl, repoManagerInput, repoName || undefined, repoMediaTab);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className={`w-full sm:max-w-lg ${EXT_FROSTED_SHEET} rounded-t-3xl sm:rounded-3xl p-5 space-y-4 sx-sheet-enter`}
                >
                  <div className="w-10 h-1 rounded-full bg-[var(--sx-on-surface-muted)]/30 mx-auto sm:hidden" />
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-extrabold">Add Repository</h3>
                    <button
                      type="button"
                      onClick={() => setAddRepoOpen(false)}
                      aria-label="Close add repository modal"
                      className={`w-8 h-8 rounded-full ${EXT_FROSTED_ICON_BTN} flex items-center justify-center`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Quick Recommended Presets */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
                      Official JSON Presets
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {RECOMMENDED_REPOS.map((rec) => (
                        <button
                          key={rec.id}
                          type="button"
                          data-testid={`recommended-repo-${rec.id}`}
                          disabled={addingRepo}
                          onClick={() =>
                            void handleInstallRepo(rec.url, rec.manager, rec.name, rec.mediaType)
                          }
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full ${EXT_FROSTED_ICON_BTN} text-[11px] font-bold disabled:opacity-50`}
                        >
                          <Plus className="w-3 h-3" />
                          <span>{rec.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      value={repoName}
                      onChange={(e) => setRepoName(e.target.value)}
                      placeholder="Repo name (optional)"
                      className="h-10 px-3.5 rounded-xl bg-[var(--sx-on-surface)]/6 dark:bg-white/[0.07] border border-white/40 dark:border-white/12 text-xs font-semibold outline-none focus:border-[var(--sx-primary)]"
                    />
                    <select
                      aria-label="Repository manager"
                      value={repoManagerInput}
                      onChange={(e) =>
                        setRepoManagerInput(e.target.value as ExtensionRepo['manager'])
                      }
                      className="h-10 px-3.5 rounded-xl bg-[var(--sx-on-surface)]/6 dark:bg-white/[0.07] border border-white/40 dark:border-white/12 text-xs font-bold outline-none focus:border-[var(--sx-primary)]"
                    >
                      <option value="aniyomi">Aniyomi</option>
                      <option value="mangayomi">Mangayomi</option>
                      <option value="cloudstream">CloudStream</option>
                    </select>
                  </div>

                  <input
                    type="url"
                    required
                    data-testid="extensions-repo-url-input"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://raw.githubusercontent.com/.../index.min.json"
                    className="w-full h-10 px-3.5 rounded-xl bg-[var(--sx-on-surface)]/6 dark:bg-white/[0.07] border border-white/40 dark:border-white/12 text-xs font-semibold outline-none focus:border-[var(--sx-primary)]"
                  />

                  {repoError && (
                    <div className="px-3 py-2 rounded-xl bg-red-500/14 border border-red-500/25 text-red-700 dark:text-red-300 text-xs font-semibold">
                      {repoError}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setAddRepoOpen(false)}
                      className={`px-4 h-9 rounded-full ${EXT_FROSTED_ICON_BTN} text-xs font-bold`}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      data-testid="extensions-add-repo-btn"
                      disabled={addingRepo || !repoUrl.trim()}
                      className="inline-flex items-center gap-1.5 px-4 h-9 rounded-full sx-glass-cta text-xs font-extrabold disabled:opacity-55"
                    >
                      {addingRepo ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      <span>{addingRepo ? 'Fetching...' : 'Add Repository'}</span>
                    </button>
                  </div>
                </form>
              </div>
            );
            return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal;
          })()}

        {/* Quick Repo Settings / Presets Modal */}
        {repoPresetsOpen &&
          (() => {
            const modal = (
              <div
                className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-md p-0 sm:p-4 sx-backdrop-enter"
                onClick={() => setRepoPresetsOpen(false)}
                role="dialog"
                aria-modal="true"
                aria-label="Repository Tools"
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  className={`w-full sm:max-w-md ${EXT_FROSTED_SHEET} rounded-t-3xl sm:rounded-3xl p-5 space-y-4 sx-sheet-enter`}
                >
                  <div className="w-10 h-1 rounded-full bg-[var(--sx-on-surface-muted)]/30 mx-auto sm:hidden" />
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-extrabold">Repository Tools</h3>
                    <button
                      type="button"
                      onClick={() => setRepoPresetsOpen(false)}
                      aria-label="Close repository tools"
                      className={`w-8 h-8 rounded-full ${EXT_FROSTED_ICON_BTN} flex items-center justify-center`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-[var(--sx-on-surface-muted)]">
                    Refresh all connected manifests or quick-load an official JSON repository.
                  </p>
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={state.repos.length === 0 || Boolean(refreshingRepoId)}
                      onClick={() => void handleRefreshAllRepos()}
                      className={`w-full h-10 px-4 rounded-xl ${EXT_FROSTED_ICON_BTN} text-xs font-extrabold flex items-center justify-center gap-2 disabled:opacity-50`}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Refresh All Repositories ({state.repos.length})</span>
                    </button>
                    {RECOMMENDED_REPOS.map((rec) => (
                      <button
                        key={rec.id}
                        type="button"
                        disabled={addingRepo}
                        onClick={() =>
                          void handleInstallRepo(rec.url, rec.manager, rec.name, rec.mediaType)
                        }
                        className={`w-full h-10 px-4 rounded-xl ${EXT_FROSTED_ACTIVE_BUBBLE} text-[var(--sx-primary)] text-xs font-extrabold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Connect {rec.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
            return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal;
          })()}
      </div>
    );
  }

  // ============================================================================
  // MAIN VIEW: EXTENSIONS (Installed & Available)
  // ============================================================================
  return (
    <div
      key="view-main"
      className={`${viewAnimClass} relative max-w-5xl mx-auto px-4 sm:px-8 py-4 sm:py-7 pb-24 md:pb-10 space-y-3.5`}
    >
      <ExtensionsAmbientBackdrop />

      {/* Top Frosted Header Pills */}
      <header className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className={`inline-flex items-center gap-2 h-10 pl-1 pr-3.5 rounded-full ${EXT_FROSTED_PILL} hover:border-[var(--sx-primary)]/45 transition-all duration-200`}
        >
          <span className="w-8 h-8 rounded-full bg-[var(--sx-on-surface)]/7 dark:bg-white/10 flex items-center justify-center">
            <ChevronLeft className="w-4 h-4" />
          </span>
          <span className="text-sm font-extrabold tracking-tight">Extensions</span>
        </button>

        {/* Right 3-action frosted pill: Plug (Diagnostics) | Wrench (Extension Testing) | GitHub (Repos) */}
        <div className={`inline-flex items-center gap-1 h-10 p-1 rounded-full ${EXT_FROSTED_PILL}`}>
          <button
            type="button"
            data-testid="extensions-diagnostics-nav-btn"
            onClick={() => navigate('/settings/diagnostics')}
            aria-label="Episode and Extension Diagnostics"
            title="Episode Diagnostics"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--sx-primary)] hover:bg-[var(--sx-on-surface)]/8 dark:hover:bg-white/12 transition-colors duration-200"
          >
            <Plug className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            data-testid="extensions-testing-nav-btn"
            onClick={() => switchView('testing')}
            aria-label="Extension Testing"
            title="Extension Testing"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--sx-primary)] hover:bg-[var(--sx-on-surface)]/8 dark:hover:bg-white/12 transition-colors duration-200"
          >
            <Wrench className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            data-testid="extensions-repos-nav-btn"
            onClick={() => switchView('repos')}
            aria-label="Extension Repositories"
            title="Extension Repositories"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--sx-primary)] hover:bg-[var(--sx-on-surface)]/8 dark:hover:bg-white/12 transition-colors duration-200"
          >
            <Github className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Storage Persistence Warning / Error Banner */}
      {storageError && (
        <div
          data-testid="extensions-storage-error"
          className="px-3.5 py-2.5 rounded-2xl bg-red-500/14 backdrop-blur-xl border border-red-500/30 text-xs font-bold text-red-700 dark:text-red-300 flex items-center justify-between gap-3"
        >
          <span>{storageError}</span>
          <button
            type="button"
            onClick={clearStorageError}
            aria-label="Dismiss storage warning"
            className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-500/20 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Backend / CORS Connectivity Banner (does not overwrite extension capability snapshots) */}
      {diagBannerError && (
        <div
          data-testid="extensions-diag-connection-error"
          className="px-3.5 py-2.5 rounded-2xl bg-red-500/14 backdrop-blur-xl border border-red-500/30 text-xs font-bold text-red-700 dark:text-red-300 flex items-center justify-between gap-3"
        >
          <span className="min-w-0 flex-1">{diagBannerError}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/settings/backend')}
              className="px-2.5 py-1 rounded-full bg-red-600/85 hover:bg-red-600 text-white text-[11px] font-extrabold whitespace-nowrap transition-colors"
            >
              Backend Settings
            </button>
            <button
              type="button"
              onClick={() => setDiagBannerError(null)}
              aria-label="Dismiss backend error"
              className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-500/20"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Media Type Tabs: Anime | Manga */}
      <SlidingSegmentedBar
        ariaLabel="Media Type"
        options={MEDIA_TAB_OPTIONS}
        value={mediaTab}
        onChange={(next) => {
          setRepoError(null);
          setRepoNotice(null);
          setMediaTab(next);
          setLangFilter('all');
        }}
      />

      {/* Installed vs Available Segmented Bar */}
      <SlidingSegmentedBar
        ariaLabel="Extension Status"
        options={SUBTAB_OPTIONS}
        value={subTab}
        onChange={(next) => {
          setRepoError(null);
          setRepoNotice(null);
          setSubTab(next);
          setLangFilter('all');
        }}
      />

      {/* Search Bar + Compact Language Filter Button */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-[var(--sx-on-surface-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            data-testid="extensions-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search extensions..."
            className={`w-full h-10 pl-9 pr-8 rounded-2xl ${EXT_FROSTED_SURFACE} text-xs sm:text-sm font-semibold outline-none focus:border-[var(--sx-primary)]/55 transition-colors`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          data-testid="extensions-lang-btn"
          onClick={() => setLangPickerOpen((o) => !o)}
          aria-label="Filter extensions by language"
          aria-expanded={langPickerOpen}
          className={`relative w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-200 ${
            langFilter !== 'all' || langPickerOpen
              ? `${EXT_FROSTED_ACTIVE_BUBBLE} text-[var(--sx-primary)]`
              : `${EXT_FROSTED_SURFACE} text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]/45`
          }`}
        >
          <Languages className="w-4 h-4" />
          {langFilter !== 'all' && (
            <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full sx-glass-active text-[9px] font-black uppercase leading-none shadow-sm">
              {langFilter}
            </span>
          )}
        </button>
      </div>

      {/* Expandable Language Filter Bar */}
      {langPickerOpen && (
        <div
          className={`sx-mode-enter p-2 rounded-2xl ${EXT_FROSTED_SURFACE} flex flex-wrap items-center gap-1.5`}
        >
          {availableLanguages.map((code, idx) => {
            const active = langFilter === code;
            const delay = getBoundedStaggerDelay(idx, 18, 8);
            return (
              <button
                key={code}
                type="button"
                style={delay > 0 ? { animationDelay: `${delay}ms` } : undefined}
                onClick={() => {
                  setLangFilter(code);
                  setLangPickerOpen(false);
                }}
                className={`sx-filter-chip-enter px-2.5 h-7 rounded-xl text-[11px] font-extrabold uppercase transition-all duration-200 ${
                  active
                    ? `${EXT_FROSTED_ACTIVE_BUBBLE} text-[var(--sx-primary)]`
                    : 'bg-[var(--sx-on-surface)]/6 dark:bg-white/[0.06] text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                }`}
              >
                {formatExtensionLangChip(code)}
              </button>
            );
          })}
        </div>
      )}

      {/* Manager Filter Chips: All | Aniyomi | CloudStream | Mangayomi | Inbuilt */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {MANAGER_FILTERS.map((chip) => {
          const active = managerFilter === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              data-testid={`extensions-manager-chip-${chip.id}`}
              onClick={() => {
                triggerHaptic('menu-select');
                setManagerFilter(chip.id);
              }}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-extrabold whitespace-nowrap shrink-0 transition-all duration-200 ${
                active
                  ? `${EXT_FROSTED_ACTIVE_BUBBLE} text-[var(--sx-primary)]`
                  : `${EXT_FROSTED_SURFACE} text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]/35`
              }`}
            >
              {chip.id === 'all' && <InfinityIcon className="w-3.5 h-3.5 text-[var(--sx-primary)]" />}
              {chip.id === 'aniyomi' && <Play className="w-3 h-3 text-sky-500 fill-current" />}
              {chip.id === 'cloudstream' && <Cloud className="w-3.5 h-3.5 text-blue-500" />}
              {chip.id === 'mangayomi' && <Puzzle className="w-3.5 h-3.5 text-amber-500" />}
              {chip.id === 'inbuilt' && <Cpu className="w-3.5 h-3.5 text-emerald-500" />}
              <span>{chip.label}</span>
            </button>
          );
        })}
      </div>

      {/* Web Playable Quick Filter Strip (Immediately visible on mobile & desktop) */}
      {(
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            data-testid="extensions-web-playable-filter"
            aria-pressed={webPlayableOnly}
            onClick={() => {
              triggerHaptic('menu-select');
              setWebPlayableOnly((prev) => !prev);
            }}
            className={`inline-flex items-center gap-2 h-8 px-3.5 rounded-full text-xs font-extrabold transition-all duration-200 ${
              webPlayableOnly
                ? 'bg-emerald-500/18 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 shadow-sm'
                : `${EXT_FROSTED_SURFACE} text-[var(--sx-on-surface)] hover:border-emerald-500/40`
            }`}
          >
            <CheckCircle2
              className={`w-3.5 h-3.5 ${
                webPlayableOnly
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-emerald-500/80'
              }`}
            />
            <span>Web Playable Only</span>
            <span
              data-testid="extensions-web-playable-count"
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-black tabular-nums ${
                webPlayableOnly
                  ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                  : 'bg-[var(--sx-on-surface)]/8 dark:bg-white/10 text-[var(--sx-on-surface-muted)]'
              }`}
            >
              {webPlayableSummary.playableCount}/{webPlayableSummary.totalCount}
            </span>
          </button>

          <span className="text-[11px] font-semibold text-[var(--sx-on-surface-muted)] px-1">
            {webPlayableOnly
              ? 'Hiding APK-only stubs & metadata catalogs'
              : 'Tap to hide APK-only & non-playable stubs'}
          </span>
        </div>
      )}

      {/* TAB 1: INSTALLED EXTENSIONS */}
      {subTab === 'installed' ? (
        <section
          key={`tab-installed-${mediaTab}`}
          className="sx-mode-enter space-y-3"
          data-testid="extensions-installed-list"
        >
          {filteredInstalled.length > 0 && (
            <ExtensionCompatibilitySummaryBar
              counts={compatibilityCounts}
              runningBatch={runningBatchDiagnostics}
              hasPlayableSources={playableInstalledEntries.length > 0}
              onRunAllDiagnostics={() => void runBatchFullDiagnostics()}
            />
          )}

          {playableInstalledEntries.length > 0 && (
            <SourceHealthStatusBar
              counts={healthCounts}
              running={runningBatchHealthCheck}
              onRunHealthCheck={() => {
                if (runningBatchHealthCheck || activeHealthSourcesForTab.length === 0) return;
                void runHealthChecksForSources(activeHealthSourcesForTab, mediaTab, {
                  isBatch: true,
                });
              }}
            />
          )}

          <p className="text-[11px] italic text-[var(--sx-on-surface-muted)] px-1">
            Hold and drag any item to reorder
          </p>

          {filteredInstalled.length === 0 ? (
            <div className={`p-7 rounded-2xl ${EXT_FROSTED_SURFACE} text-center space-y-2.5`}>
              <p className="text-sm font-extrabold">
                {webPlayableOnly && baseFilteredInstalled.length > 0
                  ? `No web-playable ${mediaTab.toLowerCase()} extensions in this view`
                  : `No installed ${mediaTab.toLowerCase()} extensions match`}
              </p>
              <p className="text-xs text-[var(--sx-on-surface-muted)]">
                {webPlayableOnly && baseFilteredInstalled.length > 0
                  ? `${baseFilteredInstalled.length} installed source${baseFilteredInstalled.length === 1 ? ' requires' : 's require'} Android APK runtime or are metadata-only.`
                  : 'Switch to Available or connect a repository to download more sources.'}
              </p>
              {webPlayableOnly && baseFilteredInstalled.length > 0 && (
                <button
                  type="button"
                  data-testid="extensions-reset-web-filter"
                  onClick={() => {
                    triggerHaptic('menu-select');
                    setWebPlayableOnly(false);
                  }}
                  className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full bg-[var(--sx-primary)]/14 border border-[var(--sx-primary)]/30 text-[var(--sx-primary)] text-xs font-extrabold hover:bg-[var(--sx-primary)]/22 transition-colors"
                >
                  <span>Show All Installed ({baseFilteredInstalled.length})</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {playableInstalledEntries.length > 0 && (
                <div
                  data-testid="extensions-playable-section"
                  className="grid grid-cols-1 lg:grid-cols-2 gap-2.5"
                >
                  {playableInstalledEntries.map(({ source: src, snapshot }, idx) => {
                    const isActive = state.discoveryPrefs.activeSources.includes(src.id);
                    const isDragging = draggingId === src.id;
                    const isDragTarget = dragOverId === src.id && draggingId !== src.id;
                    const delay = getBoundedStaggerDelay(idx, 22, 10);
                    const healthResult = healthBySourceId[src.id];
                    const isCheckingHealth = Boolean(checkingHealthIds[src.id]);
                    const hasHealthFormatError =
                      isActive && healthResult?.status === 'invalid_format';
                    const hasHealthUnreachable =
                      isActive && healthResult?.status === 'unreachable';

                    return (
                      <div
                        key={src.id}
                        draggable
                        data-testid={`extension-source-${src.id}`}
                        style={delay > 0 ? { animationDelay: `${delay}ms` } : undefined}
                        onDragStart={(e) => {
                          setDraggingId(src.id);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', src.id);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (dragOverId !== src.id) setDragOverId(src.id);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleReorderDrop(src.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOverId(null);
                        }}
                        className={`sx-card-animate p-3 rounded-2xl ${EXT_FROSTED_SURFACE} flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--sx-primary)]/40 cursor-grab active:cursor-grabbing ${
                          isDragTarget ? 'border-[var(--sx-primary)] ring-2 ring-[var(--sx-primary)]/30' : ''
                        } ${hasHealthFormatError ? 'border-red-500/45' : hasHealthUnreachable ? 'border-amber-500/40' : ''} ${
                          isDragging ? 'opacity-50 scale-[0.985]' : ''
                        } ${!isActive ? 'opacity-65' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2.5">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <ExtensionAvatar source={src} mediaTab={mediaTab} />

                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="text-sm font-extrabold truncate">{src.name}</div>
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="px-2 py-0.5 rounded-md bg-[var(--sx-on-surface)]/8 dark:bg-white/10 backdrop-blur-sm border border-white/30 dark:border-white/10 text-[var(--sx-on-surface)] text-[10px] font-extrabold uppercase tracking-wide">
                                  {formatExtensionLangChip(src.lang)}
                                </span>
                                <span className="px-2 py-0.5 rounded-md bg-[var(--sx-primary)]/12 backdrop-blur-sm border border-[var(--sx-primary)]/20 text-[var(--sx-primary)] text-[10px] font-extrabold uppercase">
                                  {formatExtensionVersion(src.version)}
                                </span>
                                {src.isNsfw && (
                                  <span className="px-2 py-0.5 rounded-md bg-red-500/16 border border-red-500/30 text-red-600 dark:text-red-300 text-[10px] font-extrabold uppercase">
                                    18+
                                  </span>
                                )}
                                {(() => {
                                  const playability = getSourcePlayabilityStatus(src, mediaTab);
                                  if (playability === 'missing-host') {
                                    return (
                                      <span className="px-2 py-0.5 rounded-md bg-amber-500/16 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px] font-extrabold uppercase">
                                        No Host URL
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                                {snapshot.isNativePackageMetadataOnly && (
                                  <span
                                    data-testid={`badge-native-metadata-${src.id}`}
                                    className="px-2 py-0.5 rounded-md bg-sky-500/14 border border-sky-500/30 text-sky-700 dark:text-sky-300 text-[10px] font-extrabold uppercase"
                                  >
                                    Metadata Only
                                  </span>
                                )}
                                <SourceLiveStatusChip
                                  badge={resolveSourceLiveStatusBadge({
                                    source: src,
                                    report: diagnosticsBySourceId[src.id],
                                    healthResult,
                                    mediaType: mediaTab,
                                  })}
                                  isInbuilt={src.type === 'inbuilt'}
                                  testId={`installed-live-status-${src.id}`}
                                />
                                {!isActive && (
                                  <span className="px-2 py-0.5 rounded-md bg-amber-500/16 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-[10px] font-extrabold uppercase">
                                    Disabled
                                  </span>
                                )}
                                <SourceHealthCardBadge
                                  sourceId={src.id}
                                  isActive={isActive}
                                  isChecking={isCheckingHealth}
                                  result={healthResult}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Right Action Buttons: Translucent Frosted Trash + Settings */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              data-testid={`uninstall-source-${src.id}`}
                              onClick={() => uninstallExtension(src.id)}
                              aria-label={
                                src.type === 'inbuilt'
                                  ? `Disable ${src.name}`
                                  : isAniyomiPackageSource(src)
                                    ? `Remove saved metadata for ${src.name}`
                                    : `Uninstall ${src.name}`
                              }
                              title={
                                src.type === 'inbuilt'
                                  ? 'Disable inbuilt source'
                                  : isAniyomiPackageSource(src)
                                    ? 'Remove saved metadata'
                                    : 'Uninstall extension'
                              }
                              className="w-9 h-9 rounded-xl bg-red-500/14 dark:bg-red-500/18 backdrop-blur-md border border-red-500/28 text-red-600 dark:text-red-400 hover:bg-red-500/24 flex items-center justify-center transition-all duration-200"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              data-testid={`toggle-source-${src.id}`}
                              onClick={() => setInspectSource(src)}
                              aria-label={`Configure ${src.name}`}
                              title="Configure & Reorder"
                              className={`w-9 h-9 rounded-xl ${EXT_FROSTED_ICON_BTN} text-[var(--sx-on-surface)] flex items-center justify-center`}
                            >
                              <Settings className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {isAndroidNative && isAniyomiPackageSource(src) && (
                          <NativeApkCardStrip
                            source={src}
                            staged={src.pkg ? stagedByPkg[src.pkg.trim()] : undefined}
                            busy={Boolean(src.pkg && nativeBusyByPkg[src.pkg.trim()])}
                            error={src.pkg ? nativeErrorByPkg[src.pkg.trim()] : null}
                            onRequestStage={(target) => setConsentStageSource(target)}
                            onRemoveStaged={(pkg) => void executeNativeRemoveApk(pkg)}
                          />
                        )}

                        <SourceHealthFailureAlert
                          sourceId={src.id}
                          sourceName={src.name}
                          isActive={isActive}
                          isChecking={isCheckingHealth}
                          result={healthResult}
                          onRetry={() => void runHealthChecksForSources([src], mediaTab)}
                        />

                        <ExtensionCompatibilityCardPanel
                          snapshot={snapshot}
                          isRunning={Boolean(runningFullSourceIds[src.id])}
                          onRunFullDiagnostic={() => void runSingleFullDiagnostic(src)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {metadataOnlyInstalledEntries.length > 0 && (
                <div
                  data-testid="extensions-metadata-only-section"
                  className="space-y-2 pt-1"
                >
                  <div className="flex items-center justify-between gap-2 px-1">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-orange-700 dark:text-orange-300">
                      Metadata-Only Catalog Sources (Not Playable)
                    </h3>
                    <span className="text-[10px] font-bold text-[var(--sx-on-surface-muted)]">
                      Excluded from player pickers
                    </span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                    {metadataOnlyInstalledEntries.map(({ source: src, snapshot }, idx) => {
                      const delay = getBoundedStaggerDelay(idx, 20, 8);
                      return (
                        <div
                          key={src.id}
                          data-testid={`extension-source-${src.id}`}
                          style={delay > 0 ? { animationDelay: `${delay}ms` } : undefined}
                          className={`sx-card-animate p-3 rounded-2xl ${EXT_FROSTED_SURFACE} flex flex-col border-orange-500/30`}
                        >
                          <div className="flex items-center justify-between gap-2.5">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <ExtensionAvatar source={src} mediaTab={mediaTab} />
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="text-sm font-extrabold truncate">{src.name}</div>
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="px-2 py-0.5 rounded-md bg-[var(--sx-on-surface)]/8 dark:bg-white/10 backdrop-blur-sm border border-white/30 dark:border-white/10 text-[var(--sx-on-surface)] text-[10px] font-extrabold uppercase tracking-wide">
                                    {formatExtensionLangChip(src.lang)}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-md bg-[var(--sx-primary)]/12 backdrop-blur-sm border border-[var(--sx-primary)]/20 text-[var(--sx-primary)] text-[10px] font-extrabold uppercase">
                                    {formatExtensionVersion(src.version)}
                                  </span>
                                  <span
                                    data-testid={`badge-metadata-only-${src.id}`}
                                    className="px-2 py-0.5 rounded-md bg-orange-500/16 border border-orange-500/30 text-orange-700 dark:text-orange-300 text-[10px] font-extrabold uppercase"
                                  >
                                    Metadata Only · Not Playable
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                data-testid={`uninstall-source-${src.id}`}
                                onClick={() => uninstallExtension(src.id)}
                                aria-label={`Uninstall ${src.name}`}
                                title="Uninstall extension"
                                className="w-9 h-9 rounded-xl bg-red-500/14 dark:bg-red-500/18 backdrop-blur-md border border-red-500/28 text-red-600 dark:text-red-400 hover:bg-red-500/24 flex items-center justify-center transition-all duration-200"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>

                              <button
                                type="button"
                                data-testid={`toggle-source-${src.id}`}
                                onClick={() => setInspectSource(src)}
                                aria-label={`Configure ${src.name}`}
                                title="Configure & Reorder"
                                className={`w-9 h-9 rounded-xl ${EXT_FROSTED_ICON_BTN} text-[var(--sx-on-surface)] flex items-center justify-center`}
                              >
                                <Settings className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <ExtensionCompatibilityCardPanel
                            snapshot={snapshot}
                            isRunning={Boolean(runningFullSourceIds[src.id])}
                            onRunFullDiagnostic={() => void runSingleFullDiagnostic(src)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      ) : (
        /* TAB 2: AVAILABLE EXTENSIONS */
        <section
          key={`tab-available-${mediaTab}`}
          className="sx-mode-enter space-y-4"
          data-testid="extensions-available-list"
        >
          {repoError && (
            <div
              data-testid="extensions-available-repo-error"
              role="alert"
              className="sx-mode-enter px-3.5 py-2.5 rounded-2xl bg-red-500/14 backdrop-blur-xl border border-red-500/28 text-xs font-bold text-red-700 dark:text-red-300 flex items-center justify-between gap-3"
            >
              <span>{repoError}</span>
              <button
                type="button"
                onClick={() => setRepoError(null)}
                aria-label="Dismiss repository error"
                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-500/20 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {groupedAvailable.length === 0 ? (
            <div className={`p-7 rounded-2xl ${EXT_FROSTED_SURFACE} text-center space-y-3`}>
              <div className="w-11 h-11 rounded-2xl bg-[var(--sx-primary)]/14 border border-[var(--sx-primary)]/25 text-[var(--sx-primary)] flex items-center justify-center mx-auto">
                <Download className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-sm sm:text-base font-extrabold">
                  {webPlayableOnly && baseFilteredAvailable.length > 0
                    ? `No web-playable ${mediaTab.toLowerCase()} extensions in these results`
                    : `No available ${mediaTab.toLowerCase()} extensions loaded`}
                </h2>
                <p className="text-xs text-[var(--sx-on-surface-muted)] max-w-md mx-auto">
                  {webPlayableOnly && baseFilteredAvailable.length > 0
                    ? `${baseFilteredAvailable.length} catalog source${baseFilteredAvailable.length === 1 ? ' requires' : 's require'} Android APK runtime or are metadata-only.`
                    : 'Connect an Aniyomi, Mangayomi, or CloudStream JSON repository to browse and download extensions here.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {webPlayableOnly && baseFilteredAvailable.length > 0 ? (
                  <button
                    type="button"
                    data-testid="extensions-reset-web-filter"
                    onClick={() => {
                      triggerHaptic('menu-select');
                      setWebPlayableOnly(false);
                    }}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[var(--sx-primary)]/90 text-[var(--sx-on-primary)] text-xs font-extrabold hover:bg-[var(--sx-primary)] transition-colors"
                  >
                    <span>Show All ({baseFilteredAvailable.length})</span>
                  </button>
                ) : (
                  <>
                    {RECOMMENDED_REPOS.filter((r) => r.mediaType === mediaTab).map((rec) => (
                      <button
                        key={rec.id}
                        type="button"
                        disabled={addingRepo}
                        onClick={() =>
                          void handleInstallRepo(rec.url, rec.manager, rec.name, rec.mediaType)
                        }
                        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[var(--sx-primary)]/90 text-[var(--sx-on-primary)] text-xs font-extrabold disabled:opacity-50 hover:bg-[var(--sx-primary)] transition-colors"
                      >
                        {addingRepo ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        <span>Load {rec.label}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => switchView('repos')}
                      className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-full ${EXT_FROSTED_ICON_BTN} text-xs font-extrabold`}
                    >
                      <Github className="w-3.5 h-3.5" />
                      <span>Manage Repositories</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedAvailable.map(({ group, items }) => {
                const uninstalledInGroup = items.filter((i) => !installedIds.has(i.id));
                const allNativeInGroup =
                  uninstalledInGroup.length > 0 &&
                  uninstalledInGroup.every((i) => isAniyomiPackageSource(i));
                const someNativeInGroup = uninstalledInGroup.some((i) =>
                  isAniyomiPackageSource(i),
                );
                return (
                  <div key={group} className="space-y-2">
                    <div className="flex items-center justify-between gap-2 px-1">
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
                        {group}
                      </h3>
                      {uninstalledInGroup.length > 1 && (
                        <button
                          type="button"
                          onClick={() => installAllCatalogExtensions(uninstalledInGroup)}
                          className="text-xs font-extrabold text-[var(--sx-primary)] hover:opacity-80 transition-opacity"
                        >
                          {allNativeInGroup
                            ? `Save Metadata (${uninstalledInGroup.length})`
                            : someNativeInGroup
                              ? `Save / Add All (${uninstalledInGroup.length})`
                              : `Install All (${uninstalledInGroup.length})`}
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                      {items.map((src, idx) => {
                        const alreadyInstalled = installedIds.has(src.id);
                        const isAniyomiNative = isAniyomiPackageSource(src);
                        const availableSnapshot = buildExtensionCompatibilitySnapshot(
                          src,
                          diagnosticsBySourceId[src.id],
                          mediaTab,
                        );
                        const availableLiveBadge = resolveSourceLiveStatusBadge({
                          source: src,
                          report: diagnosticsBySourceId[src.id],
                          healthResult: healthBySourceId[src.id],
                          mediaType: mediaTab,
                        });
                        const delay = getBoundedStaggerDelay(idx, 18, 10);
                        return (
                          <div
                            key={src.id}
                            data-testid={`available-source-${src.id}`}
                            style={delay > 0 ? { animationDelay: `${delay}ms` } : undefined}
                            className={`sx-card-animate p-3 rounded-2xl ${EXT_FROSTED_SURFACE} flex items-center justify-between gap-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--sx-primary)]/40`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <ExtensionAvatar source={src} mediaTab={mediaTab} />

                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="text-sm font-extrabold truncate">{src.name}</div>
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="px-2 py-0.5 rounded-md bg-[var(--sx-on-surface)]/8 dark:bg-white/10 backdrop-blur-sm border border-white/30 dark:border-white/10 text-[var(--sx-on-surface)] text-[10px] font-extrabold uppercase tracking-wide">
                                    {formatExtensionLangChip(src.lang)}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-md bg-[var(--sx-primary)]/12 backdrop-blur-sm border border-[var(--sx-primary)]/20 text-[var(--sx-primary)] text-[10px] font-extrabold uppercase">
                                    {formatExtensionVersion(src.version)}
                                    {src.versionCode ? ` (#${src.versionCode})` : ''}
                                  </span>
                                  <span
                                    data-testid={`available-runtime-${src.id}`}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-extrabold ${getRuntimeRequirementBadgeClasses(
                                      availableSnapshot.runtimeRequirement,
                                    )}`}
                                  >
                                    <RuntimeRequirementIcon
                                      requirement={availableSnapshot.runtimeRequirement}
                                      className="w-2.5 h-2.5"
                                    />
                                    <span>{availableSnapshot.runtimeRequirementLabel}</span>
                                  </span>
                                  {availableLiveBadge.kind !== 'android-native' &&
                                    availableLiveBadge.kind !== 'unsupported' && (
                                      <SourceLiveStatusChip
                                        badge={availableLiveBadge}
                                        isInbuilt={src.type === 'inbuilt'}
                                        testId={`available-live-status-${src.id}`}
                                      />
                                    )}
                                  {alreadyInstalled && isAniyomiNative && (
                                    <span
                                      data-testid={`available-saved-${src.id}`}
                                      className="px-2 py-0.5 rounded-md bg-emerald-500/14 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold uppercase"
                                    >
                                      Metadata Saved
                                    </span>
                                  )}
                                  {src.isNsfw && (
                                    <span className="px-2 py-0.5 rounded-md bg-red-500/16 border border-red-500/30 text-red-600 dark:text-red-300 text-[10px] font-extrabold uppercase">
                                      18+
                                    </span>
                                  )}
                                  {getSourcePlayabilityStatus(src, mediaTab) === 'metadata-only' && (
                                    <span className="px-2 py-0.5 rounded-md bg-orange-500/16 border border-orange-500/30 text-orange-700 dark:text-orange-300 text-[10px] font-extrabold uppercase">
                                      Metadata Only
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              data-testid={`install-available-${src.id}`}
                              disabled={alreadyInstalled}
                              onClick={() => installCatalogExtension(src)}
                              aria-label={
                                isAniyomiNative
                                  ? alreadyInstalled
                                    ? `${src.name} metadata saved`
                                    : `Save metadata for ${src.name}`
                                  : alreadyInstalled
                                    ? `${src.name} installed`
                                    : `Install ${src.name}`
                              }
                              title={
                                isAniyomiNative
                                  ? alreadyInstalled
                                    ? 'Metadata saved locally (APK not installed in Phase 1)'
                                    : 'Save repository metadata (APK not downloaded in Phase 1)'
                                  : alreadyInstalled
                                    ? 'Added'
                                    : 'Add source'
                              }
                              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 backdrop-blur-md border transition-all duration-200 ${
                                alreadyInstalled
                                  ? 'bg-emerald-500/16 border-emerald-500/30 text-emerald-600 dark:text-emerald-300 cursor-default'
                                  : 'bg-[var(--sx-primary)]/14 border-[var(--sx-primary)]/28 text-[var(--sx-primary)] hover:bg-[var(--sx-primary)] hover:text-[var(--sx-on-primary)]'
                              }`}
                            >
                              {alreadyInstalled ? (
                                <Check className="w-4 h-4" />
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Extension Settings / Details Modal */}
      {inspectSource &&
        (() => {
          const isActive = state.discoveryPrefs.activeSources.includes(inspectSource.id);
          const idx = allSources.findIndex((s) => s.id === inspectSource.id);
          const inspectSnapshot = buildExtensionCompatibilitySnapshot(
            inspectSource,
            diagnosticsBySourceId[inspectSource.id],
            mediaTab,
          );
          const isAniyomiInspect = isAniyomiPackageSource(inspectSource);
          const modal = (
            <div
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-md p-0 sm:p-4 sx-backdrop-enter"
              onClick={() => setInspectSource(null)}
              role="dialog"
              aria-modal="true"
              aria-label={`${inspectSource.name} settings`}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className={`w-full sm:max-w-md max-h-[88vh] overflow-y-auto ${EXT_FROSTED_SHEET} rounded-t-3xl sm:rounded-3xl p-5 space-y-4 sx-sheet-enter`}
              >
                <div className="w-10 h-1 rounded-full bg-[var(--sx-on-surface-muted)]/30 mx-auto sm:hidden" />

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ExtensionAvatar source={inspectSource} mediaTab={mediaTab} />
                    <div className="min-w-0">
                      <h3 className="text-base font-extrabold truncate">{inspectSource.name}</h3>
                      <p className="text-xs text-[var(--sx-on-surface-muted)]">
                        {formatExtensionLangChip(inspectSource.lang)} ·{' '}
                        {formatExtensionVersion(inspectSource.version)}
                        {inspectSource.versionCode ? ` (code ${inspectSource.versionCode})` : ''} ·{' '}
                        {getExtensionManagerType(inspectSource).toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInspectSource(null)}
                    aria-label="Close extension details"
                    className={`w-8 h-8 rounded-full ${EXT_FROSTED_ICON_BTN} flex items-center justify-center`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Runtime Requirement & Phase 1 Honesty Notice */}
                <div
                  data-testid="inspect-extension-metadata"
                  className="p-3 rounded-2xl bg-[var(--sx-on-surface)]/5 dark:bg-white/[0.06] border border-white/35 dark:border-white/10 space-y-2 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
                      Runtime Requirement
                    </span>
                    <span
                      data-testid="inspect-runtime-badge"
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-extrabold ${getRuntimeRequirementBadgeClasses(
                        inspectSnapshot.runtimeRequirement,
                      )}`}
                    >
                      <RuntimeRequirementIcon
                        requirement={inspectSnapshot.runtimeRequirement}
                        className="w-3 h-3"
                      />
                      <span>{inspectSnapshot.runtimeRequirementLabel}</span>
                    </span>
                  </div>

                  {isAniyomiInspect && inspectSnapshot.runtimeRequirement === 'android-native' && (
                    isAndroidNative ? (
                      <div className="space-y-2">
                        <p
                          data-testid="inspect-android-batch1-note"
                          className="px-2.5 py-1.5 rounded-xl bg-sky-500/12 border border-sky-500/25 text-[11px] font-semibold text-sky-700 dark:text-sky-300"
                        >
                          Android Batch 1: APKs can be staged read-only and verified locally. Bytecode/DEX execution is disabled until Batch 2.
                        </p>
                        <NativeApkCardStrip
                          source={inspectSource}
                          staged={inspectSource.pkg ? stagedByPkg[inspectSource.pkg.trim()] : undefined}
                          busy={Boolean(inspectSource.pkg && nativeBusyByPkg[inspectSource.pkg.trim()])}
                          error={inspectSource.pkg ? nativeErrorByPkg[inspectSource.pkg.trim()] : null}
                          onRequestStage={(target) => setConsentStageSource(target)}
                          onRemoveStaged={(pkg) => void executeNativeRemoveApk(pkg)}
                        />
                        {inspectSource.pkg && stagedByPkg[inspectSource.pkg.trim()]?.staged && (
                          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-1 text-[10px] font-mono-tabular">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-sans font-bold">APK SHA-256</span>
                              <span>{formatShortFingerprint(stagedByPkg[inspectSource.pkg.trim()].apkSha256)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-sans font-bold">Signing Cert SHA-256</span>
                              <span>{formatShortFingerprint(stagedByPkg[inspectSource.pkg.trim()].signingCertSha256)}</span>
                            </div>
                            <div className="font-sans text-[var(--sx-on-surface-muted)]">
                              {stagedByPkg[inspectSource.pkg.trim()].integrityNote}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p
                        data-testid="inspect-phase1-honesty-note"
                        className="px-2.5 py-1.5 rounded-xl bg-sky-500/12 border border-sky-500/25 text-[11px] font-semibold text-sky-700 dark:text-sky-300"
                      >
                        Metadata stored locally from repository manifest. APK download and Android DEX execution are disabled in Phase 1.
                      </p>
                    )
                  )}

                  {inspectSource.description && <p>{inspectSource.description}</p>}

                  <div className="grid grid-cols-1 gap-1 pt-1 border-t border-white/20 dark:border-white/10 text-[11px] font-mono-tabular text-[var(--sx-on-surface-muted)]">
                    {inspectSource.pkg && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-sans font-bold shrink-0 whitespace-nowrap">Package ID</span>
                        <span className="truncate">{inspectSource.pkg}</span>
                      </div>
                    )}
                    {inspectSource.apkName && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-sans font-bold shrink-0 whitespace-nowrap">APK Artifact</span>
                        <span className="truncate">{inspectSource.apkName}</span>
                      </div>
                    )}
                    {inspectSource.libVersion && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-sans font-bold shrink-0 whitespace-nowrap">Lib Version</span>
                        <span>{inspectSource.libVersion}</span>
                      </div>
                    )}
                    {inspectSource.versionCode !== undefined && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-sans font-bold shrink-0 whitespace-nowrap">Version Code</span>
                        <span>{inspectSource.versionCode}</span>
                      </div>
                    )}
                    {inspectSource.baseUrl && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-sans font-bold shrink-0">Host URL</span>
                        <span className="truncate inline-flex items-center gap-1">
                          <Globe className="w-3 h-3 shrink-0" />
                          <span className="truncate">{inspectSource.baseUrl}</span>
                        </span>
                      </div>
                    )}
                    {inspectSource.repoBaseUrl && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-sans font-bold shrink-0">Repo Base</span>
                        <span className="truncate">{inspectSource.repoBaseUrl}</span>
                      </div>
                    )}
                  </div>
                </div>

                {getSourcePlayabilityStatus(inspectSource, mediaTab) === 'metadata-only' ? (
                  <div className="p-3 rounded-2xl bg-orange-500/12 border border-orange-500/25 text-xs text-orange-700 dark:text-orange-300 font-bold">
                    Metadata-only catalog source: kept in your saved extensions list, and hidden from video/manga player pickers because it does not host playable streams or chapters.
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-[var(--sx-on-surface)]/5 dark:bg-white/[0.06] border border-white/35 dark:border-white/10">
                    <div>
                      <div className="text-xs font-extrabold">Enable in Source Picker</div>
                      <div className="text-[11px] text-[var(--sx-on-surface-muted)]">
                        Controls whether this source appears on Watch &amp; Read tabs
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleSourceActive(inspectSource.id)}
                      className={`px-3.5 h-8 rounded-full text-xs font-extrabold transition-[background-color,border-color,color,transform] duration-200 ${
                        isActive
                          ? EXT_FROSTED_ACTIVE_BUBBLE + ' text-[var(--sx-primary)]'
                          : `${EXT_FROSTED_ICON_BTN} text-[var(--sx-on-surface-muted)]`
                      }`}
                    >
                      {isActive ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                )}

                {/* Accessible Reorder Controls */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[var(--sx-on-surface-muted)]">
                    Priority Order
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={idx <= 0}
                      onClick={() => moveSourceStep(inspectSource.id, -1)}
                      className={`inline-flex items-center gap-1 px-3 h-8 rounded-xl ${EXT_FROSTED_ICON_BTN} text-xs font-bold disabled:opacity-40`}
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                      <span>Up</span>
                    </button>
                    <button
                      type="button"
                      disabled={idx === -1 || idx >= allSources.length - 1}
                      onClick={() => moveSourceStep(inspectSource.id, 1)}
                      className={`inline-flex items-center gap-1 px-3 h-8 rounded-xl ${EXT_FROSTED_ICON_BTN} text-xs font-bold disabled:opacity-40`}
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                      <span>Down</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const id = inspectSource.id;
                      const tab: ExtensionMediaTab = inspectSource.mediaTypes.includes('MANGA')
                        ? 'MANGA'
                        : 'ANIME';
                      setInspectSource(null);
                      setTestMediaType(tab);
                      setSelectedTestIds([id]);
                      switchView('testing');
                    }}
                    className={`inline-flex items-center gap-1.5 px-4 h-9 rounded-full ${EXT_FROSTED_ACTIVE_BUBBLE} text-[var(--sx-primary)] text-xs font-extrabold`}
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Test Extension</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const id = inspectSource.id;
                      setInspectSource(null);
                      navigate(`/settings/diagnostics?sourceId=${encodeURIComponent(id)}`);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 h-9 rounded-full sx-glass-cta text-xs font-extrabold"
                  >
                    <Plug className="w-3.5 h-3.5" />
                    <span>Diagnostics</span>
                  </button>
                </div>
              </div>
            </div>
          );
          return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal;
        })()}

      {/* Phase 2 — Android Batch 1 Consent & Signing Cert Change Modals (Android Native Only) */}
      {isAndroidNative && consentStageSource && (
        <NativeExtensionSecurityConsentDialog
          source={consentStageSource}
          busy={Boolean(
            consentStageSource.pkg && nativeBusyByPkg[consentStageSource.pkg.trim()],
          )}
          onCancel={() => setConsentStageSource(null)}
          onConfirm={() => void executeNativeStageApk(consentStageSource, false)}
        />
      )}

      {isAndroidNative && certMismatchPrompt && (
        <NativeSigningCertMismatchModal
          details={certMismatchPrompt.details}
          busy={Boolean(
            certMismatchPrompt.source.pkg &&
              nativeBusyByPkg[certMismatchPrompt.source.pkg.trim()],
          )}
          onCancel={() => setCertMismatchPrompt(null)}
          onApproveReplace={() =>
            void executeNativeStageApk(certMismatchPrompt.source, true)
          }
        />
      )}
    </div>
  );
};
