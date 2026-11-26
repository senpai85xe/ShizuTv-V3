import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Check,
  Download,
  Loader2,
  LogIn,
  Upload,
  RotateCcw,
  Trash2,
  Plus,
  Lock,
  ShieldCheck,
  Terminal,
  Sparkles,
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
  Play,
  BookOpen,
  UserCheck,
  AlertTriangle,
  List,
  LayoutGrid,
  LayoutTemplate,
  Layers,
  PanelLeft,
  PlayCircle,
  Activity,
  BookMarked,
  Monitor,
  Smartphone,
  Tv,
  Vibrate,
  Type,
  Maximize2,
  Compass,
} from 'lucide-react';
import {
  BackupManifest,
  DEFAULT_HOME_SECTIONS,
  useApp,
} from '../store/AppContext';
import {
  BackgroundGradientStyle,
  BUILT_IN_PRESETS,
  CONTINUE_ROW_STYLES,
  EPISODE_CHAPTER_STYLES,
  EXCLUSIVE_SCHEMES,
  GENRE_CARD_STYLES,
  HERO_BANNER_STYLES,
  MEDIA_CARD_STYLES,
  ThemeMode,
} from '../data/themePresets';
import {
  AdultContentMode,
  HomeSection,
  TitlePreference,
  TrackedStatus,
  TrackerType,
} from '../types/media';
import { configureHaptics, triggerHaptic } from '../utils/haptics';
import {
  clampBorderRoundness,
  clampFontScale,
  clampWidgetScale,
  DEFAULT_FONT_SCALE,
  DEFAULT_WIDGET_SCALE,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  formatScalePercent,
  getContinueCardStyleDescription,
  getContinueCardStyleName,
  getEpisodeChapterStyleDescription,
  getEpisodeChapterStyleName,
  getHeroBannerStyleDescription,
  getHeroBannerStyleName,
  getHomeHeaderStyleDescription,
  getHomeHeaderStyleName,
  getMediaCardStyleDescription,
  getMediaCardStyleName,
  getNavBarStyleDescription,
  HOME_HEADER_STYLE_OPTIONS,
  resolveHomeHeaderStyle,
  UI_ROUNDNESS_MAX,
  UI_ROUNDNESS_MIN,
  WIDGET_SCALE_MAX,
  WIDGET_SCALE_MIN,
} from '../utils/uiLayoutCustomization';
import { getNavBarStyleLabel, NAV_BAR_STYLE_OPTIONS, resolveNavBarStyle } from '../utils/navBarStyles';
import { resolveContinueCardStyle, resolveMediaCardStyle } from '../utils/mediaCard';
import {
  HomeMediaMode,
  reorderHomeSectionsWithinMediaMode,
  resolveHeroBannerStyle,
  splitHomeSectionsByMediaMode,
} from '../utils/heroBanner';
import { resolveEpisodeChapterStyle } from '../utils/episodeChapterStyle';
import {
  CURATED_GENRE_CATEGORIES,
  getGenreCategoryDescriptor,
  getGenreCardStyleDescription,
  getGenreCardStyleName,
  resolveGenreCardStyle,
} from '../utils/genreMetadata';
import { DEFAULT_UI_ROUNDNESS } from '../utils/themeDefaults';
import {
  PREVIEW_CHAPTER_ITEMS,
  PREVIEW_EPISODE_ITEMS,
  PREVIEW_HERO_MEDIA,
  PREVIEW_SAMPLE_MANGA,
  PREVIEW_SAMPLE_MEDIA,
} from '../data/uiPreviewSamples';
import { UiStyleSliderCard } from '../components/settings/UiStyleSliderCard';
import { NavBarLivePreview } from '../components/settings/NavBarLivePreview';
import { GenreCard } from '../components/GenreCard';
import { MediaCard } from '../components/MediaCard';
import { HeroBannerCarousel } from '../components/HeroBannerCarousel';
import { EpisodeChapterList } from '../components/EpisodeChapterList';
import { HomeHeader } from '../components/HomeHeader';
import { ShonenXLogo } from '../components/ShonenXLogo';
import { ScrollReveal } from '../components/ScrollReveal';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { getBoundedStaggerDelay } from '../utils/appMotion';
import { clearOfflineCaches } from '../utils/recentContentCache';
import { resolveEffectiveStreamQuality } from '../utils/inlinePlayer';
import {
  buildAniListTokenAuthorizeUrl,
  fetchAniListOAuthStatus,
} from '../services/anilistAuth';

const SettingsShell: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, action, children }) => {
  const navigate = useNavigate();
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
      <div className="flex items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="p-2 rounded-xl sx-glass-panel border border-[var(--sx-outline)] text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)] transition-colors shrink-0"
            aria-label="Back to Settings"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight truncate">{title}</h1>
            {subtitle && (
              <p className="text-xs text-[var(--sx-on-surface-muted)] mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
};

const ToggleRow: React.FC<{
  label: string;
  description?: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  testId?: string;
  hapticOnToggle?: boolean;
  icon?: React.ReactNode;
}> = ({ label, description, checked, onChange, testId, hapticOnToggle = true, icon }) => (
  <button
    type="button"
    data-testid={testId}
    aria-pressed={checked}
    onClick={() => {
      if (hapticOnToggle) {
        triggerHaptic('menu-select');
      }
      onChange(!checked);
    }}
    className="w-full flex items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-[var(--sx-surface-high)]/55 transition-colors"
  >
    <div className="flex items-center gap-3 min-w-0">
      {icon && (
        <div className="w-9 h-9 rounded-xl sx-glass-control border border-[var(--sx-outline)] flex items-center justify-center shrink-0 text-[var(--sx-on-surface)]">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-sm font-bold text-[var(--sx-on-surface)]">{label}</div>
        {description && (
          <p className="text-xs text-[var(--sx-on-surface-muted)] mt-0.5">{description}</p>
        )}
      </div>
    </div>
    <div
      className={`w-11 h-6 rounded-full p-0.5 border transition-colors shrink-0 ${
        checked
          ? 'bg-[var(--sx-primary)]/24 border-[var(--sx-primary)]/45'
          : 'sx-glass-control border-[var(--sx-outline)]'
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full transition-transform shadow-sm ${
          checked
            ? 'translate-x-5 bg-[var(--sx-primary)]'
            : 'translate-x-0 bg-[var(--sx-on-surface-muted)]'
        }`}
      />
    </div>
  </button>
);

export const ThemeSettingsPage: React.FC = () => {
  const { state, updateThemePrefs, applyPreset } = useApp();
  const { themePrefs } = state;
  const roundness = `${themePrefs.uiRoundness}px`;

  return (
    <SettingsShell
      title="Theme & Appearance"
      subtitle="Presets, 23 exclusive palettes, AMOLED mode, gradients & textures"
    >
      {/* Built-In Theme Presets */}
      <ScrollReveal index={0}>
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
            <Sparkles className="w-3.5 h-3.5 text-[var(--sx-primary)]" />
            <span>Curated Presets</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {BUILT_IN_PRESETS.map((preset, idx) => {
              const active = themePrefs.activePresetId === preset.id;
              const delay = getBoundedStaggerDelay(idx, 22, 9);
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  style={{
                    borderRadius: roundness,
                    ...(delay > 0 ? { animationDelay: `${delay}ms` } : {}),
                  }}
                  className={`sx-card-animate sx-card-spring p-4 text-left border ${
                    active
                      ? 'bg-[var(--sx-primary)]/12 border-[var(--sx-primary)]'
                      : 'sx-glass-panel border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/50'
                  }`}
                >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {preset.previewColors.map((hex, idx) => (
                      <span
                        key={idx}
                        className="w-4 h-4 rounded-full border border-white/20"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                  {active && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--sx-primary)]">
                      <Check className="w-3 h-3" /> Active
                    </span>
                  )}
                </div>
                <div className="mt-3 text-sm font-extrabold">{preset.name}</div>
                <p className="text-[11px] text-[var(--sx-on-surface-muted)] mt-1 line-clamp-2">
                  {preset.description}
                </p>
                <div className="mt-2 text-[10px] font-mono-tabular text-[var(--sx-on-surface-muted)]">
                  {preset.author} · {preset.cardStyle}
                </div>
              </button>
            );
          })}
          </div>
        </section>
      </ScrollReveal>

      {/* Theme Mode & Surface */}
      <ScrollReveal index={1}>
        <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
          Mode & Surface
        </h2>
        <div
          style={{ borderRadius: roundness }}
          className="sx-glass-panel border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
        >
          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold">Theme Mode</div>
              <p className="text-xs text-[var(--sx-on-surface-muted)]">
                Switch between Dark, Light, or match your OS preference
              </p>
            </div>
            <div className="flex items-center gap-1.5 sx-glass-control border border-[var(--sx-outline)]/60 p-1 rounded-xl">
              {(['dark', 'light', 'system'] as ThemeMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateThemePrefs({ themeMode: mode })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors ${
                    themePrefs.themeMode === mode
                      ? 'sx-glass-active font-extrabold'
                      : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <ToggleRow
            label="Pitch-Black AMOLED Surface"
            description="Uses pure #000000 backgrounds in Dark mode for OLED displays"
            checked={themePrefs.useAmoled}
            onChange={(useAmoled) => updateThemePrefs({ useAmoled })}
          />

          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>UI Corner Roundness</span>
              <span className="font-mono-tabular text-[var(--sx-primary)]">
                {themePrefs.uiRoundness}px
              </span>
            </div>
            <input
              type="range"
              min={UI_ROUNDNESS_MIN}
              max={UI_ROUNDNESS_MAX}
              step={1}
              value={clampBorderRoundness(themePrefs.uiRoundness)}
              onChange={(e) => updateThemePrefs({ uiRoundness: clampBorderRoundness(Number(e.target.value)) })}
              className="w-full accent-[var(--sx-primary)]"
            />
          </div>
        </div>
        </section>
      </ScrollReveal>

      {/* Atmospheric Background & Noise */}
      <ScrollReveal index={2}>
        <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
          Atmosphere & Texture
        </h2>
        <div
          style={{ borderRadius: roundness }}
          className="sx-glass-panel border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
        >
          <ToggleRow
            label="Ambient Background Gradients"
            description="Subtle primary/secondary glow washes across screens"
            checked={themePrefs.useGradients}
            onChange={(useGradients) => updateThemePrefs({ useGradients })}
          />
          {themePrefs.useGradients && (
            <div className="p-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                {(['topGlow', 'radial', 'linear', 'none'] as BackgroundGradientStyle[]).map(
                  (style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => updateThemePrefs({ gradientStyle: style })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        themePrefs.gradientStyle === style
                          ? 'sx-glass-active font-extrabold'
                          : 'sx-glass-control border border-[var(--sx-outline)]/60 text-[var(--sx-on-surface-muted)]'
                      }`}
                    >
                      {style}
                    </button>
                  ),
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span>Gradient Intensity</span>
                  <span className="font-mono-tabular">
                    {Math.round(themePrefs.gradientIntensity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={themePrefs.gradientIntensity}
                  onChange={(e) =>
                    updateThemePrefs({ gradientIntensity: Number(e.target.value) })
                  }
                  className="w-full accent-[var(--sx-primary)]"
                />
              </div>
            </div>
          )}

          <ToggleRow
            label="Film Grain / Noise Overlay"
            description="Adds subtle analog texture over background surfaces"
            checked={themePrefs.useNoiseOverlay}
            onChange={(useNoiseOverlay) => updateThemePrefs({ useNoiseOverlay })}
          />
          {themePrefs.useNoiseOverlay && (
            <div className="p-4 space-y-1.5">
              <div className="flex justify-between text-xs font-bold">
                <span>Noise Opacity</span>
                <span className="font-mono-tabular">
                  {Math.round(themePrefs.noiseOpacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.02}
                max={0.2}
                step={0.01}
                value={themePrefs.noiseOpacity}
                onChange={(e) => updateThemePrefs({ noiseOpacity: Number(e.target.value) })}
                className="w-full accent-[var(--sx-primary)]"
              />
            </div>
          )}
        </div>
        </section>
      </ScrollReveal>

      {/* 23 Exclusive Schemes */}
      <ScrollReveal index={3}>
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
            Exclusive Color Schemes ({EXCLUSIVE_SCHEMES.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {EXCLUSIVE_SCHEMES.map((scheme) => {
              const active = themePrefs.exclusiveScheme === scheme.id;
              return (
                <button
                  key={scheme.id}
                  type="button"
                  onClick={() => updateThemePrefs({ exclusiveScheme: scheme.id })}
                  style={{ borderRadius: roundness }}
                  className={`sx-card-spring p-3.5 text-left border flex items-center gap-3 ${
                    active
                      ? 'bg-[var(--sx-primary)]/12 border-[var(--sx-primary)]'
                      : 'sx-glass-panel border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/50'
                  }`}
                >
                  <div className="flex -space-x-1.5 shrink-0">
                    <span
                      className="w-6 h-6 rounded-full border-2 border-[var(--sx-surface)]"
                      style={{ backgroundColor: scheme.dark.primary }}
                    />
                    <span
                      className="w-6 h-6 rounded-full border-2 border-[var(--sx-surface)]"
                      style={{ backgroundColor: scheme.dark.secondary }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-extrabold truncate">{scheme.name}</div>
                    <div className="text-[11px] text-[var(--sx-on-surface-muted)] truncate">
                      {scheme.description}
                    </div>
                  </div>
                  {active && <Check className="w-4 h-4 text-[var(--sx-primary)] shrink-0" />}
                </button>
              );
            })}
          </div>
        </section>
      </ScrollReveal>
    </SettingsShell>
  );
};

export const UiSettingsPage: React.FC = () => {
  const { state, batterySaver, updateUiPrefs, updateThemePrefs } = useApp();
  const { uiPrefs, themePrefs } = state;
  const safeRoundness = clampBorderRoundness(themePrefs.uiRoundness);
  const safeFontScale = clampFontScale(uiPrefs.fontScale);
  const safeWidgetScale = clampWidgetScale(uiPrefs.widgetScale);
  const roundness = `${safeRoundness}px`;

  const [continueTab, setContinueTab] = useState<'watching' | 'reading'>('watching');
  const [episodePreviewKind, setEpisodePreviewKind] = useState<'episode' | 'chapter'>('episode');
  const [navPreviewDevice, setNavPreviewDevice] = useState<'mobile' | 'desktop'>('mobile');

  const activeCardStyle = resolveMediaCardStyle(uiPrefs.cardStyle);
  const activeEpisodeStyle = resolveEpisodeChapterStyle(uiPrefs.episodeChapterStyle);
  const activeContinueStyle = resolveContinueCardStyle(
    continueTab === 'watching' ? uiPrefs.continueWatchingStyle : uiPrefs.continueReadingStyle,
  );
  const activeHeroStyle = resolveHeroBannerStyle(uiPrefs.heroBannerStyle);
  const activeNavStyle = resolveNavBarStyle(uiPrefs.navBarStyle);
  const activeHeaderStyle = resolveHomeHeaderStyle(uiPrefs.homeHeaderStyle);
  const activeGenreCardStyle = resolveGenreCardStyle(uiPrefs.genreCardStyle);
  const previewGenreDescriptor = CURATED_GENRE_CATEGORIES[0] ?? getGenreCategoryDescriptor('Action');

  const roundnessPercent =
    ((safeRoundness - UI_ROUNDNESS_MIN) / (UI_ROUNDNESS_MAX - UI_ROUNDNESS_MIN)) * 100;
  const fontScalePercent =
    ((safeFontScale - FONT_SCALE_MIN) / (FONT_SCALE_MAX - FONT_SCALE_MIN)) * 100;
  const widgetScalePercent =
    ((safeWidgetScale - WIDGET_SCALE_MIN) / (WIDGET_SCALE_MAX - WIDGET_SCALE_MIN)) * 100;

  return (
    <SettingsShell
      title="UI Settings"
      subtitle="Live previews with horizontal style sliders across every interface element"
    >
      {/* 1. Media Card Style */}
      <UiStyleSliderCard
        testId="ui-customize-card-style"
        icon={Layers}
        title="Media Card Style"
        subtitle={getMediaCardStyleDescription(activeCardStyle)}
        activeBadge={getMediaCardStyleName(activeCardStyle)}
        roundness={roundness}
        animationDelayMs={0}
        options={MEDIA_CARD_STYLES.map((s) => ({
          id: s.id,
          label: s.name,
          testId: `card-style-option-${s.id}`,
        }))}
        selectedId={activeCardStyle}
        onSelect={(cardStyle) => updateUiPrefs({ cardStyle })}
        previewContent={
          <div className="flex justify-center py-1">
            <MediaCard
              media={PREVIEW_SAMPLE_MEDIA}
              style={activeCardStyle}
              rank={activeCardStyle === 'trendingRank' ? 1 : undefined}
              progressLabel={activeCardStyle === 'episodeTile' ? 'Episode 1071' : undefined}
              progressPercent={activeCardStyle === 'episodeTile' ? 0.76 : undefined}
              subtitleRight={activeCardStyle === 'episodeTile' ? '18m left' : undefined}
              onClick={() => {}}
            />
          </div>
        }
      />

      {/* 2. Continue Watching & Reading Cards */}
      <UiStyleSliderCard
        testId="ui-customize-continue-style"
        icon={PlayCircle}
        title="Continue Row Cards"
        subtitle={getContinueCardStyleDescription(activeContinueStyle)}
        activeBadge={getContinueCardStyleName(activeContinueStyle)}
        roundness={roundness}
        animationDelayMs={30}
        styleSectionLabel={continueTab === 'watching' ? 'WATCHING STYLE' : 'READING STYLE'}
        previewHeaderExtra={
          <div className="inline-flex items-center p-0.5 rounded-xl sx-glass-control border border-[var(--sx-outline)] gap-1">
            <button
              type="button"
              data-testid="continue-preview-tab-watching"
              onClick={() => {
                triggerHaptic('menu-select');
                setContinueTab('watching');
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                continueTab === 'watching'
                  ? 'sx-glass-active'
                  : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
              }`}
            >
              <Play className="w-3 h-3" />
              <span>Watching</span>
            </button>
            <button
              type="button"
              data-testid="continue-preview-tab-reading"
              onClick={() => {
                triggerHaptic('menu-select');
                setContinueTab('reading');
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                continueTab === 'reading'
                  ? 'sx-glass-active'
                  : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
              }`}
            >
              <BookMarked className="w-3 h-3" />
              <span>Reading</span>
            </button>
          </div>
        }
        options={CONTINUE_ROW_STYLES.map((s) => ({
          id: s.id,
          label: s.name,
          testId: `continue-${continueTab}-style-option-${s.id}`,
        }))}
        selectedId={activeContinueStyle}
        onSelect={(styleId) => {
          if (continueTab === 'watching') {
            updateUiPrefs({ continueWatchingStyle: styleId });
          } else {
            updateUiPrefs({ continueReadingStyle: styleId });
          }
        }}
        previewContent={
          <div className="flex justify-center py-1">
            {continueTab === 'watching' ? (
              <MediaCard
                media={PREVIEW_SAMPLE_MEDIA}
                style={resolveContinueCardStyle(uiPrefs.continueWatchingStyle)}
                progressLabel="Episode 1071"
                progressPercent={0.62}
                subtitleRight="18m left"
                onRemove={() => {}}
                onClick={() => {}}
              />
            ) : (
              <MediaCard
                media={PREVIEW_SAMPLE_MANGA}
                style={resolveContinueCardStyle(uiPrefs.continueReadingStyle)}
                progressLabel="Chapter 1124"
                progressPercent={0.55}
                subtitleRight="8p left"
                onRemove={() => {}}
                onClick={() => {}}
              />
            )}
          </div>
        }
      />

      {/* 3. Hero Banner Style */}
      <UiStyleSliderCard
        testId="ui-customize-hero-style"
        icon={Sparkles}
        title="Hero Banner Style"
        subtitle={getHeroBannerStyleDescription(activeHeroStyle)}
        activeBadge={getHeroBannerStyleName(activeHeroStyle)}
        roundness={roundness}
        animationDelayMs={60}
        options={HERO_BANNER_STYLES.map((s) => ({
          id: s.id,
          label: s.name,
          testId: `hero-style-option-${s.id}`,
        }))}
        selectedId={activeHeroStyle}
        onSelect={(heroBannerStyle) => updateUiPrefs({ heroBannerStyle })}
        previewContent={
          <div className="-mx-1 sm:-mx-2">
            <HeroBannerCarousel
              items={PREVIEW_HERO_MEDIA}
              paused={batterySaver}
              styleOverride={activeHeroStyle}
              onSelectMedia={() => {}}
              onWatchNow={() => {}}
            />
          </div>
        }
      />

      {/* 4. Episode & Chapter Style */}
      <UiStyleSliderCard
        testId="ui-customize-episode-style"
        icon={LayoutGrid}
        title="Episode & Chapter Style"
        subtitle={getEpisodeChapterStyleDescription(activeEpisodeStyle)}
        activeBadge={getEpisodeChapterStyleName(activeEpisodeStyle)}
        roundness={roundness}
        animationDelayMs={90}
        previewHeaderExtra={
          <div className="inline-flex items-center p-0.5 rounded-xl sx-glass-control border border-[var(--sx-outline)] gap-1">
            <button
              type="button"
              data-testid="episode-preview-kind-episode"
              onClick={() => {
                triggerHaptic('menu-select');
                setEpisodePreviewKind('episode');
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                episodePreviewKind === 'episode'
                  ? 'sx-glass-active'
                  : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
              }`}
            >
              Episodes
            </button>
            <button
              type="button"
              data-testid="episode-preview-kind-chapter"
              onClick={() => {
                triggerHaptic('menu-select');
                setEpisodePreviewKind('chapter');
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                episodePreviewKind === 'chapter'
                  ? 'sx-glass-active'
                  : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
              }`}
            >
              Chapters
            </button>
          </div>
        }
        options={EPISODE_CHAPTER_STYLES.map((s) => ({
          id: s.id,
          label: s.name,
          testId: `episode-style-option-${s.id}`,
        }))}
        selectedId={activeEpisodeStyle}
        onSelect={(episodeChapterStyle) => updateUiPrefs({ episodeChapterStyle })}
        previewContent={
          <div className="max-h-60 overflow-y-auto pr-0.5">
            <EpisodeChapterList
              items={
                episodePreviewKind === 'chapter'
                  ? PREVIEW_CHAPTER_ITEMS
                  : PREVIEW_EPISODE_ITEMS
              }
              unitLabel={episodePreviewKind === 'chapter' ? 'CHAPTER' : 'EPISODE'}
              style={activeEpisodeStyle}
              isManga={episodePreviewKind === 'chapter'}
              previewMode
              onSelectItem={() => {}}
              onDownloadItem={() => {}}
            />
          </div>
        }
      />

      {/* 5. Nav Bar Style (with Interactive Live Preview) */}
      <UiStyleSliderCard
        testId="ui-customize-nav-style"
        icon={PanelLeft}
        title="Nav Bar Style"
        subtitle={getNavBarStyleDescription(activeNavStyle)}
        activeBadge={getNavBarStyleLabel(activeNavStyle)}
        roundness={roundness}
        animationDelayMs={120}
        previewHeaderExtra={
          <div className="inline-flex items-center p-0.5 rounded-xl sx-glass-control border border-[var(--sx-outline)] gap-1">
            <button
              type="button"
              data-testid="nav-preview-device-mobile"
              onClick={() => {
                triggerHaptic('menu-select');
                setNavPreviewDevice('mobile');
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                navPreviewDevice === 'mobile'
                  ? 'sx-glass-active'
                  : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
              }`}
            >
              <Smartphone className="w-3 h-3" />
              <span>Mobile</span>
            </button>
            <button
              type="button"
              data-testid="nav-preview-device-desktop"
              onClick={() => {
                triggerHaptic('menu-select');
                setNavPreviewDevice('desktop');
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                navPreviewDevice === 'desktop'
                  ? 'sx-glass-active'
                  : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
              }`}
            >
              <Monitor className="w-3 h-3" />
              <span>Desktop</span>
            </button>
          </div>
        }
        options={NAV_BAR_STYLE_OPTIONS.map((n) => ({
          id: n.id,
          label: n.label,
          testId: `nav-style-option-${n.id}`,
        }))}
        selectedId={activeNavStyle}
        onSelect={(navBarStyle) => updateUiPrefs({ navBarStyle })}
        previewContent={
          <NavBarLivePreview
            navStyle={activeNavStyle}
            device={navPreviewDevice}
          />
        }
      />

      {/* 6. Home Header Style (with Live HomeHeader Preview) */}
      <UiStyleSliderCard
        testId="ui-customize-header-style"
        icon={LayoutTemplate}
        title="Home Header Style"
        subtitle={getHomeHeaderStyleDescription(activeHeaderStyle)}
        activeBadge={getHomeHeaderStyleName(activeHeaderStyle)}
        roundness={roundness}
        animationDelayMs={150}
        options={HOME_HEADER_STYLE_OPTIONS.map((h) => ({
          id: h.id,
          label: h.label,
          testId: `header-style-option-${h.id}`,
        }))}
        selectedId={activeHeaderStyle}
        onSelect={(homeHeaderStyle) => updateUiPrefs({ homeHeaderStyle })}
        previewContent={
          <div
            data-testid="home-header-live-preview"
            className="rounded-xl overflow-hidden border border-[var(--sx-outline)]/60 bg-gradient-to-br from-[var(--sx-primary)]/12 via-[var(--sx-surface)] to-[var(--sx-secondary)]/14 pb-2"
          >
            <HomeHeader
              styleOverride={activeHeaderStyle}
              previewMode
              onOpenProfile={() => {}}
              onOpenDiscoveryMode={() => {}}
            />
          </div>
        }
      />

      {/* 7. Genre Card Style (with Live GenreCard Preview) */}
      <UiStyleSliderCard
        testId="ui-customize-genre-style"
        icon={Compass}
        title="Genre Card Style"
        subtitle={getGenreCardStyleDescription(activeGenreCardStyle)}
        activeBadge={getGenreCardStyleName(activeGenreCardStyle)}
        roundness={roundness}
        animationDelayMs={180}
        options={GENRE_CARD_STYLES.map((g) => ({
          id: g.id,
          label: g.name,
          testId: `genre-style-option-${g.id}`,
        }))}
        selectedId={activeGenreCardStyle}
        onSelect={(genreCardStyle) => updateUiPrefs({ genreCardStyle })}
        previewContent={
          <div
            data-testid="genre-card-live-preview"
            className="flex justify-center py-1"
          >
            <div className="w-full max-w-sm">
              <GenreCard
                descriptor={previewGenreDescriptor}
                style={activeGenreCardStyle}
                roundness={roundness}
                previewMode
                onClick={() => {}}
              />
            </div>
          </div>
        }
      />

      {/* 8. Common / Navigation Layout & Tactile Toggles */}
      <ScrollReveal index={1}>
        <section className="space-y-3" aria-label="Common Layout and Tactile Preferences">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
            COMMON
          </h2>
          <div
            style={{ borderRadius: roundness }}
            className="sx-glass-panel border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
          >
            <ToggleRow
              icon={<Tv className="w-4 h-4" />}
              label="TV / Big-Screen Mode (useNewUi)"
              description="Replaces the side rail with a top horizontal navigation bar designed for widescreen & remote navigation"
              checked={uiPrefs.useNewUi}
              onChange={(useNewUi) => updateUiPrefs({ useNewUi })}
            />
            <ToggleRow
              icon={<Vibrate className="w-4 h-4" />}
              testId="toggle-haptic-feedback"
              label="Haptic Feedback"
              description="Subtle tactile vibration on mobile navigation transitions, tab switches, and menu interactions (auto-paused in Battery Saver or Reduced Motion)"
              checked={uiPrefs.hapticFeedback !== false}
              hapticOnToggle={false}
              onChange={(hapticFeedback) => {
                configureHaptics({ enabled: hapticFeedback });
                updateUiPrefs({ hapticFeedback });
                if (hapticFeedback) {
                  triggerHaptic('menu-select', { force: true });
                }
              }}
            />
          </div>
        </section>
      </ScrollReveal>

      {/* 8. Global UI Customization (Bottom section matching photo reference) */}
      <ScrollReveal index={2}>
        <section
          data-testid="ui-global-customization"
          aria-label="Global UI Customization"
          style={{ borderRadius: roundness }}
          className="sx-glass-panel border border-[var(--sx-outline)] p-5 sm:p-6 space-y-6 overflow-hidden"
        >
          {/* Header Row */}
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--sx-on-surface)]">
              Global UI Customization
            </h2>
            <button
              type="button"
              data-testid="global-ui-reset"
              onClick={() => {
                triggerHaptic('menu-select');
                updateThemePrefs({ uiRoundness: DEFAULT_UI_ROUNDNESS });
                updateUiPrefs({
                  fontScale: DEFAULT_FONT_SCALE,
                  widgetScale: DEFAULT_WIDGET_SCALE,
                });
              }}
              aria-label="Reset Global UI Customization to defaults"
              className="w-9 h-9 rounded-full sx-glass-control border border-[var(--sx-outline)] flex items-center justify-center text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] transition-colors shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Live Aa + Primary/Secondary Text Preview Card */}
          <div className="flex justify-center">
            <div
              data-testid="global-ui-preview-card"
              style={{ borderRadius: roundness }}
              className="w-full max-w-md px-5 py-4 sx-glass-control border border-[var(--sx-outline)]/80 bg-[var(--sx-surface)]/55 flex items-center gap-4 shadow-sm transition-[border-radius] duration-150"
            >
              <div
                aria-hidden="true"
                style={{ fontSize: `${Math.round(18 * safeFontScale)}px` }}
                className="w-13 h-13 rounded-full bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] flex items-center justify-center font-bold text-[var(--sx-on-surface)] shrink-0"
              >
                Aa
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div
                  style={{ fontSize: `${Math.round(15 * safeFontScale)}px` }}
                  className="font-bold text-[var(--sx-on-surface)] leading-tight truncate"
                >
                  Primary text
                </div>
                <div
                  style={{ fontSize: `${Math.round(13 * safeFontScale)}px` }}
                  className="font-medium text-[var(--sx-on-surface-muted)] leading-snug truncate"
                >
                  Secondary text
                </div>
              </div>
            </div>
          </div>

          {/* Customization Sliders */}
          <div className="space-y-6 pt-1">
            {/* Border Roundness */}
            <div className="flex items-start gap-3.5">
              <div
                aria-hidden="true"
                className="w-9 h-9 rounded-xl sx-glass-control border border-[var(--sx-outline)] flex items-center justify-center text-[var(--sx-on-surface)] shrink-0 mt-0.5"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
                  <path d="M4 9V7a3 3 0 0 1 3-3h2" />
                  <path d="M13 4h2m4 0h1v1m0 4v2m0 4v2m0 4v1h-1m-4 0h-2m-4 0H7m-3-3v-2m0-4v-2" strokeDasharray="1.8 3" />
                </svg>
              </div>
              <div className="flex-1 min-w-0 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <label
                      htmlFor="slider-border-roundness"
                      className="text-sm sm:text-base font-bold text-[var(--sx-on-surface)] block"
                    >
                      Border Roundness
                    </label>
                    <p className="text-xs text-[var(--sx-on-surface-muted)]">
                      Corner roundness across the app
                    </p>
                  </div>
                  <span
                    data-testid="value-border-roundness"
                    className="text-xs font-mono-tabular font-bold text-[var(--sx-primary)] px-2 py-0.5 rounded-lg sx-glass-control border border-[var(--sx-outline)] shrink-0"
                  >
                    {safeRoundness}px
                  </span>
                </div>

                <div className="relative h-6 flex items-center">
                  <div className="absolute inset-x-0 h-1.5 rounded-full bg-[var(--sx-outline)] overflow-hidden pointer-events-none">
                    <div
                      className="h-full bg-[var(--sx-on-surface)] rounded-full transition-[width] duration-75"
                      style={{ width: `${roundnessPercent}%` }}
                    />
                  </div>
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-1.5 flex items-center justify-between pointer-events-none"
                  >
                    {Array.from({ length: 25 }).map((_, idx) => {
                      const pct = (idx / 24) * 100;
                      const filled = pct <= roundnessPercent + 0.5;
                      return (
                        <span
                          key={idx}
                          className={`w-[2px] h-[2px] rounded-full ${
                            filled ? 'bg-[var(--sx-surface-container)]/75' : 'bg-[var(--sx-on-surface-muted)]/50'
                          }`}
                        />
                      );
                    })}
                  </div>
                  <input
                    id="slider-border-roundness"
                    data-testid="slider-border-roundness"
                    aria-label="Border Roundness"
                    type="range"
                    min={UI_ROUNDNESS_MIN}
                    max={UI_ROUNDNESS_MAX}
                    step={1}
                    value={safeRoundness}
                    onChange={(e) =>
                      updateThemePrefs({ uiRoundness: clampBorderRoundness(Number(e.target.value)) })
                    }
                    className="sx-custom-slider relative z-10 w-full"
                  />
                </div>
              </div>
            </div>

            {/* Font Scale */}
            <div className="flex items-start gap-3.5">
              <div
                aria-hidden="true"
                className="w-9 h-9 rounded-xl sx-glass-control border border-[var(--sx-outline)] flex items-center justify-center text-[var(--sx-on-surface)] shrink-0 mt-0.5"
              >
                <Type className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <label
                      htmlFor="slider-font-scale"
                      className="text-sm sm:text-base font-bold text-[var(--sx-on-surface)] block"
                    >
                      Font Scale
                    </label>
                    <p className="text-xs text-[var(--sx-on-surface-muted)]">
                      Scale text size globally
                    </p>
                  </div>
                  <span
                    data-testid="value-font-scale"
                    className="text-xs font-mono-tabular font-bold text-[var(--sx-primary)] px-2 py-0.5 rounded-lg sx-glass-control border border-[var(--sx-outline)] shrink-0"
                  >
                    {formatScalePercent(safeFontScale)}
                  </span>
                </div>

                <div className="relative h-6 flex items-center">
                  <div className="absolute inset-x-0 h-1.5 rounded-full bg-[var(--sx-outline)] overflow-hidden pointer-events-none">
                    <div
                      className="h-full bg-[var(--sx-on-surface)] rounded-full transition-[width] duration-75"
                      style={{ width: `${fontScalePercent}%` }}
                    />
                  </div>
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-1.5 flex items-center justify-between pointer-events-none"
                  >
                    {Array.from({ length: 8 }).map((_, idx) => {
                      const pct = (idx / 7) * 100;
                      const filled = pct <= fontScalePercent + 0.5;
                      return (
                        <span
                          key={idx}
                          className={`w-[3px] h-[3px] rounded-full ${
                            filled ? 'bg-[var(--sx-surface-container)]/80' : 'bg-[var(--sx-on-surface-muted)]/60'
                          }`}
                        />
                      );
                    })}
                  </div>
                  <input
                    id="slider-font-scale"
                    data-testid="slider-font-scale"
                    aria-label="Font Scale"
                    type="range"
                    min={FONT_SCALE_MIN}
                    max={FONT_SCALE_MAX}
                    step={0.05}
                    value={safeFontScale}
                    onChange={(e) =>
                      updateUiPrefs({ fontScale: clampFontScale(Number(e.target.value)) })
                    }
                    className="sx-custom-slider relative z-10 w-full"
                  />
                </div>
              </div>
            </div>

            {/* Widget Scale */}
            <div className="flex items-start gap-3.5">
              <div
                aria-hidden="true"
                className="w-9 h-9 rounded-xl sx-glass-control border border-[var(--sx-outline)] flex items-center justify-center text-[var(--sx-on-surface)] shrink-0 mt-0.5"
              >
                <Maximize2 className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <label
                      htmlFor="slider-widget-scale"
                      className="text-sm sm:text-base font-bold text-[var(--sx-on-surface)] block"
                    >
                      Widget Scale
                    </label>
                    <p className="text-xs text-[var(--sx-on-surface-muted)]">
                      Scale media cards & navigation bar
                    </p>
                  </div>
                  <span
                    data-testid="value-widget-scale"
                    className="text-xs font-mono-tabular font-bold text-[var(--sx-primary)] px-2 py-0.5 rounded-lg sx-glass-control border border-[var(--sx-outline)] shrink-0"
                  >
                    {formatScalePercent(safeWidgetScale)}
                  </span>
                </div>

                <div className="relative h-6 flex items-center">
                  <div className="absolute inset-x-0 h-1.5 rounded-full bg-[var(--sx-outline)] overflow-hidden pointer-events-none">
                    <div
                      className="h-full bg-[var(--sx-on-surface)] rounded-full transition-[width] duration-75"
                      style={{ width: `${widgetScalePercent}%` }}
                    />
                  </div>
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-1.5 flex items-center justify-between pointer-events-none"
                  >
                    {Array.from({ length: 7 }).map((_, idx) => {
                      const pct = (idx / 6) * 100;
                      const filled = pct <= widgetScalePercent + 0.5;
                      return (
                        <span
                          key={idx}
                          className={`w-[3px] h-[3px] rounded-full ${
                            filled ? 'bg-[var(--sx-surface-container)]/80' : 'bg-[var(--sx-on-surface-muted)]/60'
                          }`}
                        />
                      );
                    })}
                  </div>
                  <input
                    id="slider-widget-scale"
                    data-testid="slider-widget-scale"
                    aria-label="Widget Scale"
                    type="range"
                    min={WIDGET_SCALE_MIN}
                    max={WIDGET_SCALE_MAX}
                    step={0.05}
                    value={safeWidgetScale}
                    onChange={(e) =>
                      updateUiPrefs({ widgetScale: clampWidgetScale(Number(e.target.value)) })
                    }
                    className="sx-custom-slider relative z-10 w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </ScrollReveal>
    </SettingsShell>
  );
};

export const HomeSectionsSettingsPage: React.FC = () => {
  const { state, setHomeSections } = useApp();
  const [newStatus, setNewStatus] = useState<TrackedStatus>('PLANNING');
  const [newMediaType, setNewMediaType] = useState<'ANIME' | 'MANGA'>('ANIME');
  const roundness = `${state.themePrefs.uiRoundness}px`;

  const { anime: animeSections, manga: mangaSections } = useMemo(
    () => splitHomeSectionsByMediaMode(state.homeSections),
    [state.homeSections],
  );

  const moveWithinMode = (mediaMode: HomeMediaMode, id: string, delta: -1 | 1) => {
    setHomeSections(
      reorderHomeSectionsWithinMediaMode(state.homeSections, mediaMode, id, delta),
    );
  };

  const toggleDisabled = (id: string) => {
    setHomeSections(
      state.homeSections.map((s) => (s.id === id ? { ...s, disabled: !s.disabled } : s)),
    );
  };

  const removeSection = (id: string) => {
    setHomeSections(state.homeSections.filter((s) => s.id !== id));
  };

  const addLibrarySection = () => {
    const labelMap: Record<TrackedStatus, string> = {
      CURRENT: newMediaType === 'MANGA' ? 'Currently Reading' : 'Currently Watching',
      PLANNING: newMediaType === 'MANGA' ? 'Plan to Read' : 'Plan to Watch',
      COMPLETED: 'Completed',
      PAUSED: 'Paused',
      DROPPED: 'Dropped',
      REPEATING: newMediaType === 'MANGA' ? 'Rereading' : 'Rewatching',
    };
    const next: HomeSection = {
      id: `lib-${newMediaType.toLowerCase()}-${newStatus.toLowerCase()}-${Date.now()}`,
      title: `${labelMap[newStatus]} (${newMediaType === 'ANIME' ? 'Anime' : 'Manga'})`,
      type: 'libraryStatus',
      disabled: false,
      libraryStatus: newStatus,
      targetMediaType: newMediaType,
    };
    setHomeSections([...state.homeSections, next]);
  };

  const renderSectionGroup = (
    groupTitle: string,
    mediaMode: HomeMediaMode,
    groupSections: HomeSection[],
  ) => (
    <section
      data-testid={`home-sections-${mediaMode.toLowerCase()}-group`}
      className="space-y-2.5"
    >
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
          {groupTitle}
        </h2>
        <span className="text-[11px] font-bold text-[var(--sx-on-surface-muted)]">
          {groupSections.filter((s) => !s.disabled).length} / {groupSections.length} visible
        </span>
      </div>
      <div
        style={{ borderRadius: roundness }}
        className="sx-glass-panel border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
      >
        {groupSections.map((section, idx) => (
          <div
            key={section.id}
            data-testid={`home-section-row-${section.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-sm font-bold truncate ${
                    section.disabled ? 'line-through text-[var(--sx-on-surface-muted)]' : ''
                  }`}
                >
                  {section.title}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold sx-glass-control text-[var(--sx-on-surface-muted)]">
                  {section.type}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => moveWithinMode(mediaMode, section.id, -1)}
                disabled={idx === 0}
                className="p-1.5 rounded-lg sx-glass-control disabled:opacity-35 hover:text-[var(--sx-primary)]"
                aria-label="Move up"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => moveWithinMode(mediaMode, section.id, 1)}
                disabled={idx === groupSections.length - 1}
                className="p-1.5 rounded-lg sx-glass-control disabled:opacity-35 hover:text-[var(--sx-primary)]"
                aria-label="Move down"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => toggleDisabled(section.id)}
                className={`p-1.5 rounded-lg transition-colors ${
                  section.disabled
                    ? 'sx-glass-control text-[var(--sx-on-surface-muted)]'
                    : 'bg-[var(--sx-primary)]/15 text-[var(--sx-primary)]'
                }`}
                aria-label="Toggle visibility"
              >
                {section.disabled ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              {section.type === 'libraryStatus' && (
                <button
                  type="button"
                  onClick={() => removeSection(section.id)}
                  className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  aria-label="Remove section"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <SettingsShell
      title="Home Sections"
      subtitle="Reorder, toggle visibility, or add custom Library shelf rows"
      action={
        <button
          type="button"
          onClick={() => setHomeSections(DEFAULT_HOME_SECTIONS)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold sx-glass-panel border border-[var(--sx-outline)] hover:border-[var(--sx-primary)] transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Default</span>
        </button>
      }
    >
      <div className="space-y-6">
        {renderSectionGroup('ANIME', 'ANIME', animeSections)}
        {renderSectionGroup('MANGA', 'MANGA', mangaSections)}
      </div>

      {/* Add Library Shelf Section */}
      <div
        style={{ borderRadius: roundness }}
        className="p-4 sx-glass-panel border border-[var(--sx-outline)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div>
          <div className="text-sm font-bold">Add Library Shelf Row</div>
          <p className="text-xs text-[var(--sx-on-surface-muted)]">
            Pin a personal Watchlist or Reading status row onto your Home feed
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={newMediaType}
            onChange={(e) => setNewMediaType(e.target.value as 'ANIME' | 'MANGA')}
            className="px-3 py-2 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-bold"
          >
            <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="ANIME">Anime</option>
            <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="MANGA">Manga</option>
          </select>
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as TrackedStatus)}
            className="px-3 py-2 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-bold"
          >
            <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="CURRENT">Current</option>
            <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="PLANNING">Planning</option>
            <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="COMPLETED">Completed</option>
            <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="PAUSED">Paused</option>
            <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="REPEATING">Repeating</option>
          </select>
          <button
            type="button"
            onClick={addLibrarySection}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl sx-glass-cta text-xs font-bold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Row</span>
          </button>
        </div>
      </div>
    </SettingsShell>
  );
};

export const TrackingSettingsPage: React.FC = () => {
  const {
    state,
    setPrimaryTracker,
    connectAniListToken,
    loginWithAniList,
    logoutAniList,
    updateDiscoveryPrefs,
  } = useApp();
  const [tokenInput, setTokenInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [configuredClientId, setConfiguredClientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const roundness = `${state.themePrefs.uiRoundness}px`;

  const anilistProfile = state.profiles.anilist;

  useEffect(() => {
    if (anilistProfile) return;
    let active = true;
    void fetchAniListOAuthStatus()
      .then((status) => {
        if (active && status.clientId) {
          setConfiguredClientId(status.clientId);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [anilistProfile]);

  const tokenAuthorizeUrl = buildAniListTokenAuthorizeUrl(configuredClientId);

  const handleOAuthLogin = async () => {
    setOauthBusy(true);
    setError(null);
    try {
      await loginWithAniList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AniList OAuth2 login failed');
    } finally {
      setOauthBusy(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    setConnecting(true);
    setError(null);
    try {
      await connectAniListToken(tokenInput);
      setTokenInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify AniList token');
    } finally {
      setConnecting(false);
    }
  };

  const trackers: { id: TrackerType; label: string; desc: string }[] = [
    { id: 'local', label: 'Local Offline', desc: 'Saved directly in browser storage' },
    { id: 'anilist', label: 'AniList', desc: 'GraphQL cloud sync & catalog metadata' },
    { id: 'myanimelist', label: 'MyAnimeList (Jikan)', desc: 'Jikan v4 public catalog metadata' },
    { id: 'kitsu', label: 'Kitsu', desc: 'Kitsu REST catalog metadata' },
  ];

  return (
    <SettingsShell
      title="Account & Trackers"
      subtitle="Configure primary list sync & metadata provider"
    >
      {/* AniList Cloud Sync Card */}
      <div
        style={{ borderRadius: roundness }}
        className="p-5 sx-glass-panel border border-[var(--sx-outline)] space-y-4"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#02A9FF]/15 text-[#02A9FF] flex items-center justify-center font-black text-base">
              AL
            </div>
            <div>
              <div className="text-sm font-extrabold">AniList Account Sync</div>
              <p className="text-xs text-[var(--sx-on-surface-muted)]">
                {anilistProfile
                  ? `Connected as @${anilistProfile.username}`
                  : 'Sign in via AniList OAuth2 or paste a Personal Access Token'}
              </p>
            </div>
          </div>
          {state.anilistToken && (
            <button
              type="button"
              data-testid="tracking-anilist-logout-btn"
              onClick={() => void logoutAniList()}
              className="px-3 py-1.5 rounded-xl bg-red-500/12 text-red-400 text-xs font-bold hover:bg-red-500/20"
            >
              Disconnect
            </button>
          )}
        </div>

        {anilistProfile ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3 rounded-xl sx-glass-control border border-[var(--sx-outline)]/60">
              <div className="text-[11px] text-[var(--sx-on-surface-muted)]">Anime</div>
              <div className="text-lg font-black tabular-nums">{anilistProfile.animeCount ?? 0}</div>
            </div>
            <div className="p-3 rounded-xl sx-glass-control border border-[var(--sx-outline)]/60">
              <div className="text-[11px] text-[var(--sx-on-surface-muted)]">Episodes</div>
              <div className="text-lg font-black tabular-nums">
                {anilistProfile.episodesWatched ?? 0}
              </div>
            </div>
            <div className="p-3 rounded-xl sx-glass-control border border-[var(--sx-outline)]/60">
              <div className="text-[11px] text-[var(--sx-on-surface-muted)]">Manga</div>
              <div className="text-lg font-black tabular-nums">{anilistProfile.mangaCount ?? 0}</div>
            </div>
            <div className="p-3 rounded-xl sx-glass-control border border-[var(--sx-outline)]/60">
              <div className="text-[11px] text-[var(--sx-on-surface-muted)]">Mean Score</div>
              <div className="text-lg font-black tabular-nums">{anilistProfile.meanScore ?? 0}</div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                data-testid="tracking-anilist-login-btn"
                disabled={oauthBusy}
                onClick={handleOAuthLogin}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#02A9FF]/18 hover:bg-[#02A9FF]/28 text-[#02A9FF] border border-[#02A9FF]/40 backdrop-blur-md text-xs font-extrabold transition-colors disabled:opacity-60"
              >
                {oauthBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LogIn className="w-3.5 h-3.5" />
                )}
                <span>{oauthBusy ? 'Authorizing...' : 'Login with AniList (OAuth2)'}</span>
              </button>
              <a
                href={tokenAuthorizeUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--sx-primary)] hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Open AniList Token Authorization</span>
              </a>
            </div>

            <form onSubmit={handleConnect} className="space-y-2 pt-2 border-t border-[var(--sx-outline)]">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Paste Bearer token or full redirect URL (#access_token=... / ?code=...)"
                  className="flex-1 px-3.5 py-2.5 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-medium outline-none focus:border-[var(--sx-primary)]"
                />
                <button
                  type="submit"
                  disabled={connecting || !tokenInput.trim()}
                  className="px-4 py-2.5 rounded-xl sx-glass-cta text-xs font-bold disabled:opacity-50"
                >
                  {connecting ? 'Verifying...' : 'Save Token'}
                </button>
              </div>
              {error && <p className="text-xs font-semibold text-red-400">{error}</p>}
            </form>
          </div>
        )}
      </div>

      {/* Primary Tracker & Metadata Source */}
      <div
        style={{ borderRadius: roundness }}
        className="sx-glass-panel border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
      >
        <div className="p-4 space-y-3">
          <div className="text-sm font-bold">Primary Library Tracker</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {trackers.map((t) => {
              const active = state.primaryTracker === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPrimaryTracker(t.id)}
                  className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                    active
                      ? 'bg-[var(--sx-primary)]/12 border-[var(--sx-primary)]'
                      : 'sx-glass-control border-[var(--sx-outline)]'
                  }`}
                >
                  <div>
                    <div className="text-xs font-extrabold">{t.label}</div>
                    <div className="text-[11px] text-[var(--sx-on-surface-muted)]">{t.desc}</div>
                  </div>
                  {active && <UserCheck className="w-4 h-4 text-[var(--sx-primary)] shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold">Default Discovery Metadata Provider</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Auto uses your primary tracker (fallback to AniList)
            </p>
          </div>
          <select
            value={state.discoveryPrefs.metadataTrackerId ?? 'auto'}
            onChange={(e) =>
              updateDiscoveryPrefs({
                metadataTrackerId:
                  e.target.value === 'auto' ? null : (e.target.value as TrackerType),
              })
            }
            className="px-3 py-2 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-bold"
          >
            <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="auto">Auto (Follow Primary)</option>
            <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="anilist">AniList GraphQL</option>
            <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="myanimelist">MyAnimeList (Jikan v4)</option>
            <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="kitsu">Kitsu REST</option>
          </select>
        </div>
      </div>
    </SettingsShell>
  );
};

export const PlayerSettingsPage: React.FC = () => {
  const { state, batterySaver, setBatterySaver, updatePlayerPrefs } = useApp();
  const { playerPrefs } = state;
  const roundness = `${state.themePrefs.uiRoundness}px`;
  const effectiveQuality = resolveEffectiveStreamQuality(
    playerPrefs.defaultQuality,
    batterySaver,
  );

  return (
    <SettingsShell
      title="Video Player Settings"
      subtitle="Auto-play, video fit, default quality, Battery Saver, AniSkip & subtitles"
    >
      <div
        style={{ borderRadius: roundness }}
        className="sx-glass-panel border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
      >
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Play className="w-4 h-4 text-[var(--sx-primary)]" />
            <div>
              <div className="text-sm font-bold">Preferred Stream Quality</div>
              <p className="text-xs text-[var(--sx-on-surface-muted)]">
                {playerPrefs.batterySaver
                  ? `Battery Saver active — stream capped at ${effectiveQuality.toUpperCase()}`
                  : 'Initial resolution selected on stream load'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sx-glass-control border border-[var(--sx-outline)]/60 p-1 rounded-xl">
            {(['auto', '1080p', '720p', '480p', '360p'] as const).map((q) => {
              const capped = playerPrefs.batterySaver && q !== '480p' && q !== '360p';
              return (
                <button
                  key={q}
                  type="button"
                  disabled={capped}
                  onClick={() => updatePlayerPrefs({ defaultQuality: q })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase disabled:opacity-45 disabled:cursor-not-allowed ${
                    effectiveQuality === q
                      ? 'sx-glass-active font-extrabold'
                      : 'text-[var(--sx-on-surface-muted)]'
                  }`}
                >
                  {q}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold">Video Fit Mode</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Fit shows the full uncropped frame; Zoom crops to fill
            </p>
          </div>
          <div className="flex items-center gap-1.5 sx-glass-control border border-[var(--sx-outline)]/60 p-1 rounded-xl">
            {(
              [
                { id: 'contain', label: 'Fit (Full)' },
                { id: 'cover', label: 'Zoom' },
                { id: 'fill', label: 'Stretch' },
              ] as const
            ).map((fit) => (
              <button
                key={fit.id}
                type="button"
                onClick={() => updatePlayerPrefs({ videoFit: fit.id })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  playerPrefs.videoFit === fit.id
                    ? 'sx-glass-active font-extrabold'
                    : 'text-[var(--sx-on-surface-muted)]'
                }`}
              >
                {fit.label}
              </button>
            ))}
          </div>
        </div>

        <ToggleRow
          testId="settings-toggle-batterysaver"
          label="Battery Saver"
          description="Caps video stream quality to 480p max and disables non-essential UI & player animations"
          checked={batterySaver}
          onChange={(next) => setBatterySaver(next)}
        />
        <ToggleRow
          label="Auto-Play Video on Open"
          description="Automatically start playback when opening an episode or player"
          checked={playerPrefs.autoPlay}
          onChange={(autoPlay) => updatePlayerPrefs({ autoPlay })}
        />
        <ToggleRow
          label="Auto-Skip Opening (AniSkip)"
          description="Automatically jump past OP segments detected via AniSkip v2"
          checked={playerPrefs.autoSkipOp}
          onChange={(autoSkipOp) => updatePlayerPrefs({ autoSkipOp })}
        />
        <ToggleRow
          label="Auto-Skip Ending (AniSkip)"
          description="Automatically jump past ED credits when timestamps exist"
          checked={playerPrefs.autoSkipEd}
          onChange={(autoSkipEd) => updatePlayerPrefs({ autoSkipEd })}
        />
        <ToggleRow
          label="Auto-Play Next Episode"
          description="Queue the following episode automatically when playback ends"
          checked={playerPrefs.autoNextEpisode}
          onChange={(autoNextEpisode) => updatePlayerPrefs({ autoNextEpisode })}
        />
        <ToggleRow
          label="Auto Picture-in-Picture on Leave"
          description="Automatically enter PiP when leaving the player page while video is playing"
          checked={playerPrefs.autoPip}
          onChange={(autoPip) => updatePlayerPrefs({ autoPip })}
        />
        <ToggleRow
          label="Ambient Glow Effect"
          description="Sample colors from the playing video to illuminate around the inline player"
          checked={playerPrefs.ambientGlow}
          onChange={(ambientGlow) => updatePlayerPrefs({ ambientGlow })}
        />

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold">Default Playback Speed</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">Starting video rate</p>
          </div>
          <div className="flex items-center gap-1.5">
            {[0.75, 1, 1.25, 1.5, 2].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => updatePlayerPrefs({ defaultSpeed: spd })}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-mono-tabular font-bold ${
                  playerPrefs.defaultSpeed === spd
                    ? 'sx-glass-active font-extrabold'
                    : 'sx-glass-control border border-[var(--sx-outline)]/60 text-[var(--sx-on-surface-muted)]'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>

        <ToggleRow
          label="Enable Subtitles"
          description="Display closed captions during anime playback"
          checked={playerPrefs.subtitleEnabled}
          onChange={(subtitleEnabled) => updatePlayerPrefs({ subtitleEnabled })}
        />

        <div className="p-4 space-y-2">
          <div className="flex justify-between text-xs font-bold">
            <span>Subtitle Font Size</span>
            <span className="font-mono-tabular text-[var(--sx-primary)]">
              {playerPrefs.subtitleSize}px
            </span>
          </div>
          <input
            type="range"
            min={12}
            max={30}
            step={1}
            value={playerPrefs.subtitleSize}
            onChange={(e) => updatePlayerPrefs({ subtitleSize: Number(e.target.value) })}
            className="w-full accent-[var(--sx-primary)]"
          />
        </div>

        <ToggleRow
          label="Subtitle Backdrop Box"
          description="Render a dark translucent pill behind caption lines for legibility"
          checked={playerPrefs.subtitleBackground}
          onChange={(subtitleBackground) => updatePlayerPrefs({ subtitleBackground })}
        />

        <ToggleRow
          label="Subtitle Transition Animation"
          description="Animate caption lines smoothly when they appear on screen"
          checked={Boolean(playerPrefs.subtitleAnimation)}
          onChange={(subtitleAnimation) => updatePlayerPrefs({ subtitleAnimation })}
        />
      </div>
    </SettingsShell>
  );
};

export const ReaderSettingsPage: React.FC = () => {
  const { state, updateReaderPrefs } = useApp();
  const { readerPrefs } = state;
  const roundness = `${state.themePrefs.uiRoundness}px`;

  return (
    <SettingsShell
      title="Manga Reader Settings"
      subtitle="Reading orientation, page fit & canvas backdrop"
    >
      <div
        style={{ borderRadius: roundness }}
        className="sx-glass-panel border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
      >
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BookOpen className="w-4 h-4 text-[var(--sx-primary)]" />
            <div>
              <div className="text-sm font-bold">Reading Mode</div>
              <p className="text-xs text-[var(--sx-on-surface-muted)]">
                Continuous Webtoon scroll or paged manga spreads
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sx-glass-control border border-[var(--sx-outline)]/60 p-1 rounded-xl">
            {(['webtoon', 'single', 'double'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => updateReaderPrefs({ mode: m })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${
                  readerPrefs.mode === m
                    ? 'sx-glass-active font-extrabold'
                    : 'text-[var(--sx-on-surface-muted)]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold">Page Direction</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Left-to-Right (Western/Webtoon) or Right-to-Left (Traditional Manga)
            </p>
          </div>
          <div className="flex items-center gap-1.5 sx-glass-control border border-[var(--sx-outline)]/60 p-1 rounded-xl">
            {(['ltr', 'rtl'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => updateReaderPrefs({ direction: d })}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase ${
                  readerPrefs.direction === d
                    ? 'sx-glass-active font-extrabold'
                    : 'text-[var(--sx-on-surface-muted)]'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold">Image Scaling</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">How pages fit the viewport</p>
          </div>
          <div className="flex items-center gap-1.5 sx-glass-control border border-[var(--sx-outline)]/60 p-1 rounded-xl">
            {(['width', 'height', 'original'] as const).map((fit) => (
              <button
                key={fit}
                type="button"
                onClick={() => updateReaderPrefs({ fit })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${
                  readerPrefs.fit === fit
                    ? 'sx-glass-active font-extrabold'
                    : 'text-[var(--sx-on-surface-muted)]'
                }`}
              >
                {fit}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold">Canvas Backdrop</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Background tone behind manga pages
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(
              [
                { id: 'black', label: 'Black', color: '#000000' },
                { id: 'dark', label: 'Dark', color: '#14151a' },
                { id: 'white', label: 'White', color: '#f8fafc' },
                { id: 'sepia', label: 'Sepia', color: '#f4ecd8' },
              ] as const
            ).map((bg) => (
              <button
                key={bg.id}
                type="button"
                onClick={() => updateReaderPrefs({ background: bg.id })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${
                  readerPrefs.background === bg.id
                    ? 'border-[var(--sx-primary)] bg-[var(--sx-primary)]/12'
                    : 'border-[var(--sx-outline)] sx-glass-control'
                }`}
              >
                <span
                  className="w-3.5 h-3.5 rounded-full border border-white/25"
                  style={{ backgroundColor: bg.color }}
                />
                <span>{bg.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </SettingsShell>
  );
};

export const ContentSettingsPage: React.FC = () => {
  const { state, updateContentPrefs } = useApp();
  const { contentPrefs } = state;
  const roundness = `${state.themePrefs.uiRoundness}px`;

  return (
    <SettingsShell
      title="Content & Titles"
      subtitle="Preferred title script, content rating filters & language"
    >
      <div
        style={{ borderRadius: roundness }}
        className="sx-glass-panel border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
      >
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold">Title Language Preference</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Priority order when displaying anime & manga titles
            </p>
          </div>
          <div className="flex items-center gap-1.5 sx-glass-control border border-[var(--sx-outline)]/60 p-1 rounded-xl">
            {(['english', 'romaji', 'native'] as TitlePreference[]).map((pref) => (
              <button
                key={pref}
                type="button"
                onClick={() => updateContentPrefs({ titlePreference: pref })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${
                  contentPrefs.titlePreference === pref
                    ? 'sx-glass-active font-extrabold'
                    : 'text-[var(--sx-on-surface-muted)]'
                }`}
              >
                {pref}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold">18+ / Adult Content Filter</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Controls whether mature entries appear in discovery & search
            </p>
          </div>
          <div className="flex items-center gap-1.5 sx-glass-control border border-[var(--sx-outline)]/60 p-1 rounded-xl">
            {(
              [
                { id: 'safe', label: 'Safe Only' },
                { id: 'mixed', label: 'Mixed' },
                { id: 'adultOnly', label: '18+ Only' },
              ] as { id: AdultContentMode; label: string }[]
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => updateContentPrefs({ adultContentMode: mode.id })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  contentPrefs.adultContentMode === mode.id
                    ? 'sx-glass-active font-extrabold'
                    : 'text-[var(--sx-on-surface-muted)]'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold">Interface Locale</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Display localization for ShizuTv labels
            </p>
          </div>
          <select
            value={contentPrefs.language}
            onChange={(e) => updateContentPrefs({ language: e.target.value })}
            className="px-3 py-2 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-bold"
          >
            <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="en">English (en)</option>
            <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="ja">日本語 (ja)</option>
            <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="es">Español (es)</option>
            <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="fr">Français (fr)</option>
            <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="zh-HK">廣東話 (zh-HK)</option>
          </select>
        </div>
      </div>
    </SettingsShell>
  );
};

export const SecuritySettingsPage: React.FC = () => {
  const { state, updateSecurityPrefs, lockApp } = useApp();
  const [pinDraft, setPinDraft] = useState(state.securityPrefs.pinCode || '');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const roundness = `${state.themePrefs.uiRoundness}px`;

  const savePin = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = pinDraft.replace(/\D/g, '').slice(0, 6);
    if (clean.length < 4) {
      setStatusMsg('PIN must be 4 to 6 digits.');
      return;
    }
    updateSecurityPrefs({ pinCode: clean, pinEnabled: true });
    setPinDraft(clean);
    setStatusMsg('PIN saved and lock enabled.');
  };

  return (
    <SettingsShell
      title="Security & App Lock"
      subtitle="Protect your local library and watch history with a numeric PIN"
    >
      <div
        style={{ borderRadius: roundness }}
        className="sx-glass-panel border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
      >
        <ToggleRow
          label="Require PIN on Launch"
          description="Shows the lock keypad whenever ShizuTv opens"
          checked={state.securityPrefs.pinEnabled}
          onChange={(pinEnabled) => {
            if (pinEnabled && state.securityPrefs.pinCode.length < 4) {
              setStatusMsg('Set a 4–6 digit PIN below first.');
              return;
            }
            updateSecurityPrefs({ pinEnabled });
          }}
        />

        <form onSubmit={savePin} className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <ShieldCheck className="w-4 h-4 text-[var(--sx-primary)]" />
            <span>Configure PIN Code</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pinDraft}
              onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter 4–6 digit PIN"
              className="flex-1 px-3.5 py-2.5 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-sm font-mono-tabular outline-none focus:border-[var(--sx-primary)]"
            />
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl sx-glass-cta text-xs font-bold"
            >
              Save PIN
            </button>
            {state.securityPrefs.pinEnabled && state.securityPrefs.pinCode && (
              <button
                type="button"
                onClick={lockApp}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-bold hover:border-[var(--sx-primary)]"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Lock Now</span>
              </button>
            )}
          </div>
          {statusMsg && (
            <p className="text-xs font-semibold text-[var(--sx-primary)]">{statusMsg}</p>
          )}
        </form>
      </div>
    </SettingsShell>
  );
};

export const BackupSettingsPage: React.FC = () => {
  const { exportBackup, importBackup, resetAllData, state } = useApp();
  const [rawJson, setRawJson] = useState('');
  const [preview, setPreview] = useState<BackupManifest | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const roundness = `${state.themePrefs.uiRoundness}px`;

  const handleDownload = () => {
    const manifest = exportBackup();
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shizutv-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setFeedback({ type: 'ok', text: 'Backup manifest downloaded.' });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRawJson(text);
    try {
      const parsed = JSON.parse(text) as BackupManifest;
      if ((parsed.app !== 'ShizuTv' && parsed.app !== 'ShonenX') || !parsed.data) {
        throw new Error('Not a valid ShizuTv backup file');
      }
      setPreview(parsed);
      setFeedback(null);
    } catch (err) {
      setPreview(null);
      setFeedback({ type: 'err', text: String(err) });
    }
  };

  const handleParsePaste = () => {
    try {
      const parsed = JSON.parse(rawJson) as BackupManifest;
      if ((parsed.app !== 'ShizuTv' && parsed.app !== 'ShonenX') || !parsed.data) {
        throw new Error('Not a valid ShizuTv backup manifest');
      }
      setPreview(parsed);
      setFeedback(null);
    } catch (err) {
      setPreview(null);
      setFeedback({ type: 'err', text: String(err) });
    }
  };

  const applyImport = () => {
    if (!preview) return;
    try {
      importBackup(preview);
      setPreview(null);
      setRawJson('');
      setFeedback({ type: 'ok', text: 'Backup restored successfully!' });
    } catch (err) {
      setFeedback({ type: 'err', text: String(err) });
    }
  };

  return (
    <SettingsShell
      title="Backup & Restore"
      subtitle="Export or restore your library, history, theme & repository preferences"
    >
      <div
        style={{ borderRadius: roundness }}
        className="p-5 sx-glass-panel border border-[var(--sx-outline)] space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold">Export ShizuTv Manifest</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Includes {state.library.length} library entries, {state.history.length} history items,{' '}
              {state.repos.length} repos & theme settings
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl sx-glass-cta text-xs font-bold"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(JSON.stringify(exportBackup(), null, 2));
                setFeedback({ type: 'ok', text: 'Copied JSON manifest to clipboard.' });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-bold"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </button>
          </div>
        </div>
      </div>

      <div
        style={{ borderRadius: roundness }}
        className="p-5 sx-glass-panel border border-[var(--sx-outline)] space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold">Restore from JSON</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Upload a .json backup or paste manifest contents to preview before applying
            </p>
          </div>
          <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-bold cursor-pointer hover:border-[var(--sx-primary)]">
            <Upload className="w-3.5 h-3.5" />
            <span>Choose File</span>
            <input type="file" accept="application/json" onChange={handleFile} className="hidden" />
          </label>
        </div>

        <textarea
          rows={4}
          value={rawJson}
          onChange={(e) => setRawJson(e.target.value)}
          placeholder='{"app": "ShizuTv", "version": "2.1.5", ...}'
          className="w-full p-3 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-mono-tabular outline-none focus:border-[var(--sx-primary)]"
        />

        {rawJson && !preview && (
          <button
            type="button"
            onClick={handleParsePaste}
            className="px-4 py-2 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-bold"
          >
            Inspect Manifest
          </button>
        )}

        {preview && (
          <div className="p-4 rounded-xl bg-[var(--sx-primary)]/10 border border-[var(--sx-primary)]/30 space-y-3">
            <div className="text-xs font-extrabold text-[var(--sx-primary)]">
              Backup Preview · Exported {new Date(preview.exportedAt).toLocaleString()}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>Library: {preview.data.library?.length ?? 0}</div>
              <div>History: {preview.data.history?.length ?? 0}</div>
              <div>Repos: {preview.data.repos?.length ?? 0}</div>
            </div>
            <button
              type="button"
              onClick={applyImport}
              className="px-4 py-2 rounded-xl sx-glass-cta text-xs font-bold"
            >
              Restore Now
            </button>
          </div>
        )}

        {feedback && (
          <p
            className={`text-xs font-semibold ${
              feedback.type === 'ok' ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {feedback.text}
          </p>
        )}
      </div>

      {/* Danger Zone */}
      <div
        style={{ borderRadius: roundness }}
        className="p-5 bg-red-500/8 border border-red-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-extrabold text-red-300">Reset All Local Data</div>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Clears library, watch/read history, downloads, and resets preferences to defaults
            </p>
          </div>
        </div>
        {confirmReset ? (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                resetAllData();
                setConfirmReset(false);
                setFeedback({ type: 'ok', text: 'All local data reset to factory defaults.' });
              }}
              className="px-3.5 py-2 rounded-xl bg-red-500 text-white text-xs font-bold"
            >
              Confirm Reset
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="px-3 py-2 rounded-xl sx-glass-control text-xs font-bold"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="px-4 py-2 rounded-xl bg-red-500/15 text-red-300 border border-red-500/30 text-xs font-bold shrink-0"
          >
            Reset Data
          </button>
        )}
      </div>
    </SettingsShell>
  );
};

export const DiscordSettingsPage: React.FC = () => {
  const { state, updateDiscordPrefs } = useApp();
  const { discordPrefs } = state;
  const roundness = `${state.themePrefs.uiRoundness}px`;

  return (
    <SettingsShell
      title="Discord Rich Presence"
      subtitle="Configure activity metadata shown on your Discord profile (web preview)"
    >
      <div
        style={{ borderRadius: roundness }}
        className="sx-glass-panel border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
      >
        <ToggleRow
          label="Enable Rich Presence Activity"
          description="Track active episode or chapter status for Discord RPC"
          checked={discordPrefs.enabled}
          onChange={(enabled) => updateDiscordPrefs({ enabled })}
        />
        <ToggleRow
          label="Show Media Title"
          description="Display the anime or manga title in activity details"
          checked={discordPrefs.showMediaTitle}
          onChange={(showMediaTitle) => updateDiscordPrefs({ showMediaTitle })}
        />
        <ToggleRow
          label="Show Episode / Chapter Progress"
          description="Include current episode or chapter counter"
          checked={discordPrefs.showEpisodeProgress}
          onChange={(showEpisodeProgress) => updateDiscordPrefs({ showEpisodeProgress })}
        />
        <div className="p-4 space-y-2">
          <label className="text-xs font-bold block">Custom Idle Status</label>
          <input
            type="text"
            value={discordPrefs.customState}
            onChange={(e) => updateDiscordPrefs({ customState: e.target.value })}
            className="w-full px-3.5 py-2.5 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-medium outline-none focus:border-[var(--sx-primary)]"
          />
        </div>
      </div>

      {/* Live Discord Activity Card Preview */}
      <div
        style={{ borderRadius: roundness }}
        className="p-4 bg-[#111214] text-white border border-white/10 max-w-md space-y-3"
      >
        <div className="text-[10px] font-bold uppercase tracking-widest text-white/50">
          Activity Preview
        </div>
        <div className="flex items-center gap-3.5">
          <div className="w-14 h-14 rounded-xl bg-[var(--sx-primary)]/20 border border-[var(--sx-primary)]/40 flex items-center justify-center shrink-0">
            <ShonenXLogo size={28} className="text-[var(--sx-primary)]" />
          </div>
          <div className="min-w-0 text-xs space-y-0.5">
            <div className="font-extrabold">ShizuTv</div>
            <div className="text-white/80 truncate">
              {discordPrefs.enabled
                ? discordPrefs.showMediaTitle
                  ? 'One Piece'
                  : discordPrefs.customState
                : 'Rich Presence Disabled'}
            </div>
            {discordPrefs.enabled && discordPrefs.showEpisodeProgress && (
              <div className="text-white/60">Episode 1071 · 18:24 elapsed</div>
            )}
          </div>
        </div>
      </div>
    </SettingsShell>
  );
};

export const LogsSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { logs, clearLogs, state } = useApp();
  const [filter, setFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL');
  const roundness = `${state.themePrefs.uiRoundness}px`;

  const visible = filter === 'ALL' ? logs : logs.filter((l) => l.level === filter);

  return (
    <SettingsShell
      title="System Logs"
      subtitle="Runtime telemetry for trackers, streams & local persistence"
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/settings/diagnostics')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl sx-glass-panel border border-[var(--sx-outline)] text-xs font-bold hover:border-[var(--sx-primary)] whitespace-nowrap"
          >
            <Activity className="w-3.5 h-3.5 text-[var(--sx-primary)]" />
            <span>Episode Diagnostics</span>
          </button>
          <button
            type="button"
            onClick={clearLogs}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl sx-glass-panel border border-[var(--sx-outline)] text-xs font-bold hover:border-[var(--sx-primary)]"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      }
    >
      <div className="flex items-center gap-2">
        {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map((lvl) => (
          <button
            key={lvl}
            type="button"
            onClick={() => setFilter(lvl)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
              filter === lvl
                ? 'sx-glass-active font-extrabold'
                : 'sx-glass-panel border border-[var(--sx-outline)] text-[var(--sx-on-surface-muted)]'
            }`}
          >
            {lvl}
          </button>
        ))}
      </div>

      <div
        style={{ borderRadius: roundness }}
        className="sx-glass-panel border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden font-mono-tabular"
      >
        {visible.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--sx-on-surface-muted)] flex flex-col items-center gap-2">
            <Terminal className="w-5 h-5" />
            <span>No log entries for this filter.</span>
          </div>
        ) : (
          visible.map((entry) => (
            <div key={entry.id} className="px-4 py-2.5 text-xs flex items-start gap-3">
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                  entry.level === 'ERROR'
                    ? 'bg-red-500/20 text-red-400'
                    : entry.level === 'WARN'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-[var(--sx-primary)]/15 text-[var(--sx-primary)]'
                }`}
              >
                {entry.level}
              </span>
              <div className="min-w-0 flex-1">
                <span className="font-bold text-[var(--sx-on-surface)]">[{entry.scope}]</span>{' '}
                <span className="text-[var(--sx-on-surface-muted)]">{entry.message}</span>
              </div>
              <span className="text-[10px] text-[var(--sx-on-surface-muted)] shrink-0">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))
        )}
      </div>
    </SettingsShell>
  );
};

export const AboutSettingsPage: React.FC = () => {
  const { state, addLog } = useApp();
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);
  const roundness = `${state.themePrefs.uiRoundness}px`;

  const handleClearCache = async () => {
    try {
      sessionStorage.clear();
    } catch {
      // Ignore
    }
    await clearOfflineCaches();
    addLog('INFO', 'Cache', 'Cleared session, image, and offline recent content caches');
    setCacheNotice('Session & offline caches cleared.');
  };

  return (
    <SettingsShell title="About ShizuTv" subtitle="Watch. Read. Track.">
      <div
        style={{ borderRadius: roundness }}
        className="p-6 sx-glass-panel border border-[var(--sx-outline)] flex flex-col sm:flex-row items-center gap-5"
      >
        <div className="w-16 h-16 rounded-2xl bg-[var(--sx-primary)]/15 border border-[var(--sx-primary)]/30 flex items-center justify-center shrink-0">
          <ShonenXLogo size={36} className="text-[var(--sx-primary)]" />
        </div>
        <div className="text-center sm:text-left space-y-1 flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="text-xl font-black tracking-tight">ShizuTv v2.1.5</h2>
            <PWAInstallButton compact />
          </div>
          <p className="text-xs text-[var(--sx-on-surface-muted)]">
            Ad-free anime & manga streaming, reading, and tracking client · GPL-3.0 License.
          </p>
          <div className="pt-2 flex flex-wrap justify-center sm:justify-start gap-2">
            {['React 19', 'TypeScript', 'AniList GraphQL', 'Jikan v4', 'Kitsu REST', 'hls.js'].map(
              (tech) => (
                <span
                  key={tech}
                  className="px-2.5 py-1 rounded-lg sx-glass-control border border-[var(--sx-outline)]/60 text-[11px] font-bold"
                >
                  {tech}
                </span>
              ),
            )}
          </div>
        </div>
      </div>

      <div
        style={{ borderRadius: roundness }}
        className="p-5 sx-glass-panel border border-[var(--sx-outline)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div>
          <div className="text-sm font-bold">Offline &amp; Image Cache</div>
          <p className="text-xs text-[var(--sx-on-surface-muted)]">
            Clear cached images, recent feeds, and temporary session metadata without affecting your
            library or preferences
          </p>
          {cacheNotice && (
            <p className="text-xs font-semibold text-emerald-400 mt-1">{cacheNotice}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void handleClearCache()}
          className="px-4 py-2 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-bold hover:border-[var(--sx-primary)] shrink-0"
        >
          Clear Cache
        </button>
      </div>

      <div
        style={{ borderRadius: roundness }}
        className="p-5 sx-glass-panel border border-[var(--sx-outline)] text-xs text-[var(--sx-on-surface-muted)] leading-relaxed"
      >
        <strong className="text-[var(--sx-on-surface)]">Disclaimer:</strong> ShizuTv does not host,
        upload, or distribute copyrighted media files. Catalog metadata is retrieved directly from
        AniList, MyAnimeList (Jikan), Kitsu, and AniSkip public APIs.
      </div>
    </SettingsShell>
  );
};
