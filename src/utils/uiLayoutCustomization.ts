import {
  CONTINUE_ROW_STYLES,
  ContinueCardStyle,
  EPISODE_CHAPTER_STYLES,
  GENRE_CARD_STYLES,
  GenreCardStyle,
  HERO_BANNER_STYLES,
  HomeHeaderStyle,
  MEDIA_CARD_STYLES,
  MediaCardStyle,
  NavBarStyle,
} from '../data/themePresets';
import { resolveEpisodeChapterStyle } from './episodeChapterStyle';
import { getGenreCardStyleName } from './genreMetadata';
import { resolveContinueCardStyle, resolveMediaCardStyle } from './mediaCard';
import { getNavBarStyleLabel, NAV_BAR_STYLE_OPTIONS, resolveNavBarStyle } from './navBarStyles';

export type UiCustomizeCategoryId =
  | 'cardStyle'
  | 'continueStyle'
  | 'heroBannerStyle'
  | 'episodeChapterStyle'
  | 'navBarStyle'
  | 'homeHeaderStyle'
  | 'genreCardStyle';

export interface HomeHeaderStyleOption {
  id: HomeHeaderStyle;
  label: string;
  description: string;
}

export const HOME_HEADER_STYLE_OPTIONS: HomeHeaderStyleOption[] = [
  { id: 'classic', label: 'Classic', description: 'Balanced signature ShizuTv home top bar' },
  { id: 'minimal', label: 'Minimal', description: 'Compact single-line avatar, name & tracker tag' },
  { id: 'clean', label: 'Clean', description: 'Minimal brand bar with single profile sheet trigger' },
  { id: 'cleanWave', label: 'Clean Wave', description: 'Minimal brand bar with Light/Dark radial wave toggle' },
  { id: 'glassIsland', label: 'Glass Island', description: 'Floating frosted glass island bar with quick theme & profile triggers' },
  { id: 'auroraHeader', label: 'Aurora Header', description: 'Ambient gradient frosted header with avatar & action controls' },
  { id: 'floatingDock', label: 'Floating Dock', description: 'Dual glass pills splitting brand emblem and utility dock' },
];

export const DEFAULT_HOME_HEADER_STYLE: HomeHeaderStyle = 'cleanWave';

const VALID_HOME_HEADER_STYLES = new Set<string>(HOME_HEADER_STYLE_OPTIONS.map((o) => o.id));

export function resolveHomeHeaderStyle(style?: string | null): HomeHeaderStyle {
  if (style && VALID_HOME_HEADER_STYLES.has(style)) {
    return style as HomeHeaderStyle;
  }
  return DEFAULT_HOME_HEADER_STYLE;
}

export const UI_ROUNDNESS_MIN = 4;
export const UI_ROUNDNESS_MAX = 28;
export const DEFAULT_FONT_SCALE = 1;
export const FONT_SCALE_MIN = 0.85;
export const FONT_SCALE_MAX = 1.2;
export const DEFAULT_WIDGET_SCALE = 1;
export const WIDGET_SCALE_MIN = 0.85;
export const WIDGET_SCALE_MAX = 1.15;

export function clampBorderRoundness(value?: number | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 24;
  return Math.min(UI_ROUNDNESS_MAX, Math.max(UI_ROUNDNESS_MIN, Math.round(value)));
}

export function clampFontScale(value?: number | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_FONT_SCALE;
  const clamped = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, value));
  return Math.round(clamped * 100) / 100;
}

export function clampWidgetScale(value?: number | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_WIDGET_SCALE;
  const clamped = Math.min(WIDGET_SCALE_MAX, Math.max(WIDGET_SCALE_MIN, value));
  return Math.round(clamped * 100) / 100;
}

export function formatScalePercent(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}

export function applyGlobalUiScaleToDocument(
  root: HTMLElement,
  fontScale?: number | null,
  widgetScale?: number | null,
): { fontScale: number; widgetScale: number } {
  const safeFont = clampFontScale(fontScale);
  const safeWidget = clampWidgetScale(widgetScale);
  root.style.setProperty('--sx-font-scale', String(safeFont));
  root.style.setProperty('--sx-widget-scale', String(safeWidget));
  root.style.fontSize = `${Math.round(safeFont * 1000) / 10}%`;
  return { fontScale: safeFont, widgetScale: safeWidget };
}

export interface UiCustomizeOptionDescriptor {
  id: UiCustomizeCategoryId;
  order: number;
  title: string;
  subtitle: string;
  optionCount: number;
  testId: string;
  modalTitle: string;
  modalSubtitle: string;
}

export const UI_CUSTOMIZE_CATEGORIES: ReadonlyArray<UiCustomizeOptionDescriptor> = [
  {
    id: 'cardStyle',
    order: 1,
    title: 'Media Card Style',
    subtitle: 'Poster framing, badges & hover elevation across feeds',
    optionCount: MEDIA_CARD_STYLES.length,
    testId: 'ui-customize-card-style',
    modalTitle: 'Media Card Style',
    modalSubtitle: 'Choose how anime and manga posters frame metadata across feeds and search',
  },
  {
    id: 'continueStyle',
    order: 2,
    title: 'Continue Watching & Reading Cards',
    subtitle: 'Dedicated progress cards for anime & manga resume rows',
    optionCount: CONTINUE_ROW_STYLES.length,
    testId: 'ui-customize-continue-style',
    modalTitle: 'Continue Row Cards',
    modalSubtitle: 'Customize the card styles used in Continue Watching and Continue Reading rows',
  },
  {
    id: 'heroBannerStyle',
    order: 3,
    title: 'Hero Banner Style',
    subtitle: 'Featured carousel geometry at the top of Home',
    optionCount: HERO_BANNER_STYLES.length,
    testId: 'ui-customize-hero-style',
    modalTitle: 'Hero Banner Style',
    modalSubtitle: 'Preview and switch featured carousel layouts on the Home screen',
  },
  {
    id: 'episodeChapterStyle',
    order: 4,
    title: 'Episode & Chapter Style',
    subtitle: 'Row, grid, compact & thumbnail layouts on Details',
    optionCount: EPISODE_CHAPTER_STYLES.length,
    testId: 'ui-customize-episode-style',
    modalTitle: 'Episode & Chapter Style',
    modalSubtitle: 'Customize how episode and chapter lists render on anime and manga pages',
  },
  {
    id: 'navBarStyle',
    order: 5,
    title: 'Nav Bar Style',
    subtitle: 'Desktop side rail & mobile bottom dock translucency',
    optionCount: NAV_BAR_STYLE_OPTIONS.length,
    testId: 'ui-customize-nav-style',
    modalTitle: 'Nav Bar Style',
    modalSubtitle: 'Interactive live preview for both mobile dock and desktop side rail',
  },
  {
    id: 'homeHeaderStyle',
    order: 6,
    title: 'Home Header Style',
    subtitle: 'Top greeting, brand emblem & wave theme switch layout',
    optionCount: HOME_HEADER_STYLE_OPTIONS.length,
    testId: 'ui-customize-header-style',
    modalTitle: 'Home Header Style',
    modalSubtitle: 'Live preview of top bar variations shown above your Home discovery feed',
  },
  {
    id: 'genreCardStyle',
    order: 7,
    title: 'Genre Card Style',
    subtitle: '5 genre card styles across Category Spotlight, Poster Mosaic, Editorial Pill, Aurora Glass & Gradient Tile',
    optionCount: GENRE_CARD_STYLES.length,
    testId: 'ui-customize-genre-style',
    modalTitle: 'Genre Card Style',
    modalSubtitle: 'Switch between Category Spotlight, Poster Mosaic, Editorial Pill, Aurora Glass, and Gradient Tile',
  },
];

export interface UiCustomizePrefsSnapshot {
  cardStyle: MediaCardStyle;
  continueWatchingStyle: ContinueCardStyle;
  continueReadingStyle: ContinueCardStyle;
  heroBannerStyle?: string;
  episodeChapterStyle: string;
  navBarStyle: NavBarStyle;
  homeHeaderStyle: HomeHeaderStyle;
  genreCardStyle?: GenreCardStyle;
}

export function getMediaCardStyleName(styleId: MediaCardStyle): string {
  const resolved = resolveMediaCardStyle(styleId);
  return MEDIA_CARD_STYLES.find((s) => s.id === resolved)?.name ?? resolved;
}

export function getMediaCardStyleDescription(styleId: MediaCardStyle): string {
  const resolved = resolveMediaCardStyle(styleId);
  return MEDIA_CARD_STYLES.find((s) => s.id === resolved)?.description ?? '';
}

export function getContinueCardStyleName(styleId: ContinueCardStyle): string {
  const resolved = resolveContinueCardStyle(styleId);
  return CONTINUE_ROW_STYLES.find((s) => s.id === resolved)?.name ?? resolved;
}

export function getContinueCardStyleDescription(styleId: ContinueCardStyle): string {
  const resolved = resolveContinueCardStyle(styleId);
  return CONTINUE_ROW_STYLES.find((s) => s.id === resolved)?.description ?? '';
}

export function getHeroBannerStyleName(styleId?: string): string {
  const target = styleId || 'classic';
  return HERO_BANNER_STYLES.find((s) => s.id === target)?.name ?? target;
}

export function getHeroBannerStyleDescription(styleId?: string): string {
  const target = styleId || 'classic';
  return HERO_BANNER_STYLES.find((s) => s.id === target)?.description ?? '';
}

export function getEpisodeChapterStyleName(styleId?: string): string {
  const resolved = resolveEpisodeChapterStyle(styleId);
  return EPISODE_CHAPTER_STYLES.find((s) => s.id === resolved)?.name ?? resolved;
}

export function getEpisodeChapterStyleDescription(styleId?: string): string {
  const resolved = resolveEpisodeChapterStyle(styleId);
  return EPISODE_CHAPTER_STYLES.find((s) => s.id === resolved)?.description ?? '';
}

export function getNavBarStyleDescription(styleId: NavBarStyle): string {
  const resolved = resolveNavBarStyle(styleId);
  return NAV_BAR_STYLE_OPTIONS.find((opt) => opt.id === resolved)?.desc ?? '';
}

export function getHomeHeaderStyleName(styleId: HomeHeaderStyle): string {
  const resolved = resolveHomeHeaderStyle(styleId);
  return HOME_HEADER_STYLE_OPTIONS.find((s) => s.id === resolved)?.label ?? resolved;
}

export function getHomeHeaderStyleDescription(styleId: HomeHeaderStyle): string {
  const resolved = resolveHomeHeaderStyle(styleId);
  return HOME_HEADER_STYLE_OPTIONS.find((s) => s.id === resolved)?.description ?? '';
}

export function getActiveOptionPosition<T extends string>(
  options: ReadonlyArray<{ id: T }>,
  selectedId: T,
): { current: number; total: number } {
  const idx = options.findIndex((o) => o.id === selectedId);
  return {
    current: idx >= 0 ? idx + 1 : 1,
    total: options.length,
  };
}

export function getCustomizeActiveSummary(
  category: UiCustomizeCategoryId,
  prefs: UiCustomizePrefsSnapshot,
): string {
  switch (category) {
    case 'cardStyle':
      return getMediaCardStyleName(prefs.cardStyle);
    case 'continueStyle': {
      const watch = getContinueCardStyleName(prefs.continueWatchingStyle);
      const read = getContinueCardStyleName(prefs.continueReadingStyle);
      return watch === read ? watch : `${watch} / ${read}`;
    }
    case 'heroBannerStyle':
      return getHeroBannerStyleName(prefs.heroBannerStyle);
    case 'episodeChapterStyle':
      return getEpisodeChapterStyleName(prefs.episodeChapterStyle);
    case 'navBarStyle':
      return getNavBarStyleLabel(resolveNavBarStyle(prefs.navBarStyle));
    case 'homeHeaderStyle':
      return getHomeHeaderStyleName(prefs.homeHeaderStyle);
    case 'genreCardStyle':
      return getGenreCardStyleName(prefs.genreCardStyle);
  }
}

export function getSortedUiCustomizeCategories(): UiCustomizeOptionDescriptor[] {
  return [...UI_CUSTOMIZE_CATEGORIES].sort((a, b) => a.order - b.order);
}
