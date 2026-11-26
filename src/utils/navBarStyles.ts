import { NavBarStyle } from '../data/themePresets';

export interface NavBarStyleOption {
  id: NavBarStyle;
  label: string;
  desc: string;
}

export const NAV_BAR_STYLE_OPTIONS: NavBarStyleOption[] = [
  { id: 'classic', label: 'Classic', desc: 'Floating side rail & pill mobile bar' },
  { id: 'frosted', label: 'Frosted', desc: 'Translucent backdrop-blur glass rail' },
  { id: 'glassIcons', label: 'Glass Icons', desc: 'Blurred round capsule · Icons only' },
  { id: 'glassLabeled', label: 'Glass Labeled', desc: 'Blurred round capsule · Icon & name' },
  { id: 'docked', label: 'Docked', desc: 'Full-height anchored edge rail' },
  { id: 'material', label: 'Material', desc: 'Tonal pill indicators' },
  { id: 'liquidPill', label: 'Liquid Pill', desc: 'Ultra-frosted curved glass capsule · All labels' },
  { id: 'crystalRail', label: 'Crystal Rail', desc: 'Layered crystal edge glass bar · Crisp borders' },
  { id: 'ambientGlow', label: 'Ambient Glow', desc: 'Translucent dock with active radial halo' },
  { id: 'compactCapsule', label: 'Compact Capsule', desc: 'Slim floating glass capsule · Tight spacing' },
];

export const DEFAULT_NAV_BAR_STYLE: NavBarStyle = 'glassLabeled';

const VALID_NAV_BAR_STYLES = new Set<string>(NAV_BAR_STYLE_OPTIONS.map((o) => o.id));

export function resolveNavBarStyle(style?: string | null): NavBarStyle {
  if (style && VALID_NAV_BAR_STYLES.has(style)) {
    return style as NavBarStyle;
  }
  return DEFAULT_NAV_BAR_STYLE;
}

export function isGlassPillNavStyle(style: NavBarStyle): boolean {
  return (
    style === 'glassIcons' ||
    style === 'glassLabeled' ||
    style === 'liquidPill' ||
    style === 'compactCapsule'
  );
}

export function isIconOnlyNavStyle(style: NavBarStyle): boolean {
  return style === 'glassIcons';
}

export function shouldShowAllMobileNavLabels(style: NavBarStyle): boolean {
  return style === 'glassLabeled' || style === 'liquidPill';
}

export function shouldShowActiveMobileNavLabel(style: NavBarStyle, active: boolean): boolean {
  if (style === 'glassIcons') return false;
  if (style === 'glassLabeled' || style === 'liquidPill') return true;
  return active;
}

export function getNavBarStyleLabel(style: NavBarStyle): string {
  return NAV_BAR_STYLE_OPTIONS.find((opt) => opt.id === style)?.label ?? style;
}
