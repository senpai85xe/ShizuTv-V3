import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Palette,
  LayoutGrid,
  ListOrdered,
  PlayCircle,
  BookOpen,
  Globe,
  Puzzle,
  UserCheck,
  DatabaseBackup,
  MessageSquareCode,
  ShieldCheck,
  Terminal,
  Info,
  ChevronRight,
  Sparkles,
  Tv,
  Activity,
  Server,
  BatteryCharging,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { getNavBarStyleLabel } from '../utils/navBarStyles';
import { BUILT_IN_PRESETS, EXCLUSIVE_SCHEMES } from '../data/themePresets';
import { ScrollReveal } from '../components/ScrollReveal';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { AniListAccountCard } from '../components/AniListLoginButton';
import { getBoundedStaggerDelay } from '../utils/appMotion';
import {
  BACKEND_CONFIG_CHANGED_EVENT,
  getEffectiveBackendConfig,
} from '../utils/backendConfig';
import { suppressNextRouteHaptic, triggerHaptic } from '../utils/haptics';

interface SettingItem {
  path: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, allSources, batterySaver, setBatterySaver } = useApp();
  const [backendVersion, setBackendVersion] = React.useState(0);

  React.useEffect(() => {
    const onChanged = () => setBackendVersion((v) => v + 1);
    window.addEventListener(BACKEND_CONFIG_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(BACKEND_CONFIG_CHANGED_EVENT, onChanged);
  }, []);

  const backendConfig = React.useMemo(() => {
    void backendVersion;
    return getEffectiveBackendConfig();
  }, [backendVersion]);

  const activePreset = BUILT_IN_PRESETS.find((p) => p.id === state.themePrefs.activePresetId);
  const activeScheme = EXCLUSIVE_SCHEMES.find((s) => s.id === state.themePrefs.exclusiveScheme);
  const trackerProfile = state.profiles[state.primaryTracker];
  const roundness = `${state.themePrefs.uiRoundness}px`;

  const groups: { label: string; items: SettingItem[] }[] = [
    {
      label: 'Appearance & UI',
      items: [
        {
          path: '/settings/theme',
          title: 'Theme & Appearance',
          subtitle: activePreset
            ? `Preset: ${activePreset.name}`
            : `${activeScheme?.name || 'Custom'} · ${state.themePrefs.themeMode} mode`,
          icon: Palette,
          badge: state.themePrefs.useAmoled ? 'AMOLED' : undefined,
        },
        {
          path: '/settings/ui',
          title: 'UI & Layout Styles',
          subtitle: `${state.uiPrefs.cardStyle} cards · ${state.uiPrefs.episodeChapterStyle} episodes · ${getNavBarStyleLabel(state.uiPrefs.navBarStyle)} nav`,
          icon: LayoutGrid,
          badge: state.uiPrefs.useNewUi ? 'TV Mode' : undefined,
        },
        {
          path: '/settings/home',
          title: 'Home Sections',
          subtitle: `${state.homeSections.filter((s) => !s.disabled).length} of ${state.homeSections.length} sections visible`,
          icon: ListOrdered,
        },
      ],
    },
    {
      label: 'Playback & Reading',
      items: [
        {
          path: '/settings/player',
          title: 'Video Player',
          subtitle: `${state.playerPrefs.defaultQuality} · ${state.playerPrefs.defaultSpeed}x speed${state.playerPrefs.autoSkipOp ? ' · Auto-skip OP' : ''}`,
          icon: PlayCircle,
        },
        {
          path: '/settings/reader',
          title: 'Manga Reader',
          subtitle: `${state.readerPrefs.mode} mode · ${state.readerPrefs.direction.toUpperCase()} · ${state.readerPrefs.background} canvas`,
          icon: BookOpen,
        },
        {
          path: '/settings/content',
          title: 'Content & Titles',
          subtitle: `Titles: ${state.contentPrefs.titlePreference} · Filter: ${state.contentPrefs.adultContentMode}`,
          icon: Globe,
        },
      ],
    },
    {
      label: 'Tracking, Extensions & Sync',
      items: [
        {
          path: '/settings/tracking',
          title: 'Account & Trackers',
          subtitle: `Primary: ${state.primaryTracker.toUpperCase()} (${trackerProfile?.username || 'Guest'})`,
          icon: UserCheck,
          badge: state.anilistToken ? 'Cloud Sync' : 'Local',
        },
        {
          path: '/settings/extensions',
          title: 'Extensions & Repositories',
          subtitle: `${state.discoveryPrefs.activeSources.length}/${allSources.length} sources active · ${state.repos.length} repos`,
          icon: Puzzle,
        },
        {
          path: '/settings/backend',
          title: 'Backend Server',
          subtitle: backendConfig.baseUrl
            ? `Routing API & sockets to ${backendConfig.baseUrl}`
            : backendConfig.isNative
              ? 'Not configured · Tap to enter your Express backend HTTPS URL'
              : 'Same-origin (/api/*) · Optional Android/custom server override',
          icon: Server,
          badge: backendConfig.baseUrl
            ? backendConfig.source === 'runtime'
              ? 'Custom'
              : 'Env'
            : backendConfig.isNative
              ? 'Action Needed'
              : 'Web',
        },
        {
          path: '/settings/backup',
          title: 'Backup & Restore',
          subtitle: `${state.library.length} library items · ${state.history.length} history entries`,
          icon: DatabaseBackup,
        },
        {
          path: '/settings/discord',
          title: 'Discord Rich Presence',
          subtitle: state.discordPrefs.enabled ? state.discordPrefs.customState : 'Disabled',
          icon: MessageSquareCode,
        },
      ],
    },
    {
      label: 'Security & System',
      items: [
        {
          path: '/settings/security',
          title: 'Security & App Lock',
          subtitle: state.securityPrefs.pinEnabled ? 'PIN protection enabled' : 'No PIN configured',
          icon: ShieldCheck,
        },
        {
          path: '/settings/logs',
          title: 'System Logs',
          subtitle: 'Inspect API calls, sync events & source diagnostics',
          icon: Terminal,
        },
        {
          path: '/settings/diagnostics',
          title: 'Episode Fetch Diagnostics',
          subtitle: 'Probe extension episode waterfalls, ID mappings & title fallbacks',
          icon: Activity,
          badge: 'Debugger',
        },
        {
          path: '/settings/about',
          title: 'About ShizuTv',
          subtitle: 'v2.1.5 · Smooth anime & manga streaming client',
          icon: Info,
        },
      ],
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--sx-primary)]">
            Configuration
          </p>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-1">Settings</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PWAInstallButton compact />
          <button
            type="button"
            onClick={() => {
              triggerHaptic('menu-select');
              suppressNextRouteHaptic();
              navigate('/settings/theme');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold sx-glass-cta"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Theme Presets</span>
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('menu-select');
              suppressNextRouteHaptic();
              navigate('/settings/ui');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold sx-glass-panel text-[var(--sx-on-surface)] border border-[var(--sx-outline)] hover:border-[var(--sx-primary)] transition-colors"
          >
            <Tv className="w-3.5 h-3.5" />
            <span>{state.uiPrefs.useNewUi ? 'TV Mode On' : 'Layout'}</span>
          </button>
        </div>
      </div>

      <ScrollReveal index={0}>
        <AniListAccountCard
          roundness={roundness}
          showManageLink
          onManageClick={() => navigate('/settings/tracking')}
        />
      </ScrollReveal>

      <ScrollReveal index={1}>
        <section className="space-y-2.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)] px-1">
            Power & Performance
          </h2>
          <div
            style={{ borderRadius: roundness }}
            className="overflow-hidden sx-glass-panel border border-[var(--sx-outline)]"
          >
            <button
              type="button"
              role="switch"
              aria-checked={batterySaver}
              data-testid="settings-battery-saver-toggle"
              onClick={() => {
                triggerHaptic('menu-select');
                setBatterySaver(!batterySaver);
              }}
              className="w-full flex items-center gap-4 px-4 sm:px-5 py-3.5 text-left hover:bg-[var(--sx-surface-high)]/55 transition-colors"
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                  batterySaver
                    ? 'bg-emerald-500/18 text-emerald-500'
                    : 'bg-[var(--sx-primary)]/12 text-[var(--sx-primary)]'
                }`}
              >
                <BatteryCharging className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[var(--sx-on-surface)]">
                    Battery Saver
                  </span>
                  <span
                    data-testid="settings-battery-saver-status"
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${
                      batterySaver
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : 'bg-[var(--sx-surface-high)] text-[var(--sx-on-surface-muted)]'
                    }`}
                  >
                    {batterySaver ? 'Active' : 'Off'}
                  </span>
                </div>
                <p className="text-xs text-[var(--sx-on-surface-muted)] mt-0.5">
                  Disables heavy blur & ambient animations, pauses auto-carousel & background checks, and caps video quality at 480p
                </p>
              </div>
              <div
                className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${
                  batterySaver
                    ? 'bg-emerald-500/24 border border-emerald-500/45'
                    : 'sx-glass-control border border-[var(--sx-outline)]'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full transition-transform duration-200 ${
                    batterySaver
                      ? 'translate-x-5 bg-emerald-400 shadow-sm'
                      : 'translate-x-0 bg-[var(--sx-on-surface-muted)]'
                  }`}
                />
              </div>
            </button>
          </div>
        </section>
      </ScrollReveal>

      <div className="space-y-6">
        {groups.map((group, groupIdx) => (
          <ScrollReveal key={group.label} index={groupIdx}>
            <section className="space-y-2.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)] px-1">
                {group.label}
              </h2>
              <div
                style={{ borderRadius: roundness }}
                className="overflow-hidden sx-glass-panel border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)]"
              >
                {group.items.map((item, itemIdx) => {
                  const Icon = item.icon;
                  const delay = getBoundedStaggerDelay(groupIdx * 3 + itemIdx, 24, 10);
                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => {
                        triggerHaptic('menu-select');
                        suppressNextRouteHaptic();
                        navigate(item.path);
                      }}
                      style={delay > 0 ? { animationDelay: `${delay}ms` } : undefined}
                      className="sx-card-animate w-full flex items-center gap-4 px-4 sm:px-5 py-3.5 text-left hover:bg-[var(--sx-surface-high)]/55 transition-colors duration-200 group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-[var(--sx-primary)]/12 text-[var(--sx-primary)] flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[var(--sx-on-surface)] group-hover:text-[var(--sx-primary)] transition-colors">
                            {item.title}
                          </span>
                          {item.badge && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--sx-primary)]/15 text-[var(--sx-primary)]">
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--sx-on-surface-muted)] truncate mt-0.5">
                          {item.subtitle}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[var(--sx-on-surface-muted)] group-hover:translate-x-1 transition-transform duration-200 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </section>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
};
