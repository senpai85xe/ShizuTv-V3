import {
  BackgroundGradientStyle,
  EXCLUSIVE_SCHEMES,
  HomeHeaderStyle,
  ThemeMode,
} from '../data/themePresets';

export function shouldOpenProfileSheet(headerStyle: HomeHeaderStyle): boolean {
  return (
    headerStyle === 'clean' ||
    headerStyle === 'cleanWave' ||
    headerStyle === 'glassIsland' ||
    headerStyle === 'floatingDock'
  );
}

export interface ThemePrefs {
  themeMode: ThemeMode;
  exclusiveScheme: string;
  activePresetId: string | null;
  useAmoled: boolean;
  uiRoundness: number;
  uiScale: number;
  useGradients: boolean;
  gradientStyle: BackgroundGradientStyle;
  gradientIntensity: number;
  useNoiseOverlay: boolean;
  noiseOpacity: number;
}

export const DEFAULT_THEME_MODE: ThemeMode = 'system';
export const DEFAULT_EXCLUSIVE_SCHEME = 'metallic_black';
export const DEFAULT_UI_ROUNDNESS = 24;
export const DEFAULT_GRADIENT_STYLE: BackgroundGradientStyle = 'linear';
export const DEFAULT_GRADIENT_INTENSITY = 0.75;

export function createDefaultThemePrefs(): ThemePrefs {
  return {
    themeMode: DEFAULT_THEME_MODE,
    exclusiveScheme: DEFAULT_EXCLUSIVE_SCHEME,
    activePresetId: null,
    useAmoled: false,
    uiRoundness: DEFAULT_UI_ROUNDNESS,
    uiScale: 1,
    useGradients: true,
    gradientStyle: DEFAULT_GRADIENT_STYLE,
    gradientIntensity: DEFAULT_GRADIENT_INTENSITY,
    useNoiseOverlay: false,
    noiseOpacity: 0.05,
  };
}

export function resolveSchemePalette(schemeId: string, isDark: boolean) {
  const scheme =
    EXCLUSIVE_SCHEMES.find((s) => s.id === schemeId) ??
    EXCLUSIVE_SCHEMES.find((s) => s.id === DEFAULT_EXCLUSIVE_SCHEME) ??
    EXCLUSIVE_SCHEMES[0];
  return isDark ? scheme.dark : scheme.light;
}

export function resolveEffectiveIsDark(
  themeMode: ThemeMode,
  prefersDark: boolean,
): boolean {
  return themeMode === 'dark' || (themeMode === 'system' && prefersDark);
}

export function applyThemeToDocument(
  root: HTMLElement,
  themePrefs: ThemePrefs,
  prefersDark: boolean,
): boolean {
  const isDark = resolveEffectiveIsDark(themePrefs.themeMode, prefersDark);

  root.classList.toggle('dark', isDark);
  root.classList.toggle('amoled', isDark && themePrefs.useAmoled);

  const palette = resolveSchemePalette(themePrefs.exclusiveScheme, isDark);
  const playerPalette = resolveSchemePalette(themePrefs.exclusiveScheme, true);

  root.style.setProperty('--sx-primary', palette.primary);
  root.style.setProperty('--sx-primary-container', palette.primaryContainer);
  root.style.setProperty('--sx-secondary', palette.secondary);
  root.style.setProperty('--sx-tertiary', palette.tertiary);
  root.style.setProperty('--sx-radius', `${themePrefs.uiRoundness}px`);

  const computeOnColor = (hexInput: string) => {
    const clean = hexInput.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) || 0;
    const g = parseInt(clean.substring(2, 4), 16) || 0;
    const b = parseInt(clean.substring(4, 6), 16) || 0;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.62 ? '#0b0c10' : '#ffffff';
  };

  root.style.setProperty('--sx-on-primary', computeOnColor(palette.primary));
  root.style.setProperty('--sx-on-primary-container', isDark ? '#f8fafc' : '#111827');
  root.style.setProperty('--sx-player-accent', playerPalette.primary);
  root.style.setProperty('--sx-player-on-accent', computeOnColor(playerPalette.primary));

  const themeColorMeta = root.ownerDocument?.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute(
      'content',
      isDark ? (themePrefs.useAmoled ? '#000000' : '#0b0c12') : '#f4f5fb',
    );
  }

  return isDark;
}
