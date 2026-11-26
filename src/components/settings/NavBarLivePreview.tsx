import React, { useState } from 'react';
import {
  BookMarked,
  Calendar,
  Download,
  Home,
  Radio,
  Search,
  Settings,
} from 'lucide-react';
import { NavBarStyle } from '../../data/themePresets';
import {
  getNavBarStyleLabel,
  isGlassPillNavStyle,
  isIconOnlyNavStyle,
  resolveNavBarStyle,
  shouldShowActiveMobileNavLabel,
} from '../../utils/navBarStyles';
import { triggerHaptic } from '../../utils/haptics';
import { ShonenXLogo } from '../ShonenXLogo';

export type PreviewNavTabId = 'home' | 'discover' | 'online' | 'library' | 'downloads';

const PREVIEW_NAV_ITEMS: {
  id: PreviewNavTabId;
  label: string;
  shortLabel: string;
  icon: React.FC<{ className?: string; strokeWidth?: number }>;
}[] = [
  { id: 'home', label: 'Home', shortLabel: 'Home', icon: Home },
  { id: 'discover', label: 'Discover', shortLabel: 'Discover', icon: Search },
  { id: 'online', label: 'Online', shortLabel: 'Online', icon: Radio },
  { id: 'library', label: 'Library', shortLabel: 'Library', icon: BookMarked },
  { id: 'downloads', label: 'Downloads', shortLabel: 'Downloads', icon: Download },
];

interface NavBarLivePreviewProps {
  navStyle: NavBarStyle;
  device: 'mobile' | 'desktop';
}

export const NavBarLivePreview: React.FC<NavBarLivePreviewProps> = ({
  navStyle: rawNavStyle,
  device,
}) => {
  const [activeTab, setActiveTab] = useState<PreviewNavTabId>('home');

  const navStyle = resolveNavBarStyle(rawNavStyle);
  const isDocked = navStyle === 'docked';
  const isFrosted = navStyle === 'frosted';
  const isCrystalRail = navStyle === 'crystalRail';
  const isAmbientGlow = navStyle === 'ambientGlow';
  const isCompactCapsule = navStyle === 'compactCapsule';
  const isGlassPill = isGlassPillNavStyle(navStyle);
  const isIconOnly = isIconOnlyNavStyle(navStyle);
  const styleLabel = getNavBarStyleLabel(navStyle);

  const glassSurfaceClass =
    navStyle === 'liquidPill'
      ? 'bg-white/52 dark:bg-white/[0.12] backdrop-blur-3xl backdrop-saturate-180 border border-white/65 dark:border-white/25 ring-1 ring-inset ring-white/35 dark:ring-white/15 shadow-[0_14px_34px_-10px_rgba(0,0,0,0.34)]'
      : navStyle === 'compactCapsule'
        ? 'bg-white/38 dark:bg-white/[0.06] backdrop-blur-2xl backdrop-saturate-150 border border-white/45 dark:border-white/15 shadow-md'
        : 'bg-white/45 dark:bg-white/[0.08] backdrop-blur-2xl backdrop-saturate-150 border border-white/55 dark:border-white/15 ring-1 ring-inset ring-white/25 dark:ring-white/10 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.28)]';
  const glassActiveBubbleClass =
    navStyle === 'ambientGlow'
      ? 'bg-[var(--sx-primary)]/20 dark:bg-[var(--sx-primary)]/28 border border-[var(--sx-primary)]/45 shadow-[0_0_16px_-3px_var(--sx-primary)] text-[var(--sx-primary)]'
      : navStyle === 'crystalRail'
        ? 'bg-white/28 dark:bg-white/14 border border-white/55 dark:border-white/25 text-[var(--sx-primary)]'
        : 'sx-glass-active ring-1 ring-inset ring-white/25 dark:ring-white/10';

  if (device === 'desktop') {
    return (
      <div
        data-testid="nav-preview-desktop-frame"
        data-nav-style={navStyle}
        className="relative h-56 sm:h-60 w-full rounded-2xl overflow-hidden border border-[var(--sx-outline)] bg-gradient-to-br from-[var(--sx-primary)]/14 via-[var(--sx-surface)] to-[var(--sx-secondary)]/16 flex"
      >
        <div className="pointer-events-none absolute -top-10 right-6 w-32 h-32 rounded-full bg-[var(--sx-primary)]/18 blur-2xl" />

        {/* Desktop Mini Rail */}
        <div
          className={`sx-widget-scale relative z-10 flex flex-col justify-between shrink-0 transition-[padding,width] duration-200 ${
            isDocked
              ? 'w-[68px] bg-[var(--sx-surface-container)]/78 backdrop-blur-xl border-r border-[var(--sx-outline)] py-2'
              : isGlassPill && isIconOnly
                ? 'w-[60px] py-2 pl-2.5 pr-1'
                : 'w-[70px] py-2 pl-2.5 pr-1'
          }`}
        >
          <div
            style={{
              borderRadius: isDocked ? '0px' : isGlassPill ? '9999px' : '14px',
            }}
            className={`flex-1 min-h-0 flex flex-col items-center py-1.5 gap-0.5 ${
              isDocked
                ? ''
                : isGlassPill
                  ? glassSurfaceClass
                  : isCrystalRail
                    ? 'bg-white/30 dark:bg-white/[0.06] backdrop-blur-2xl border border-white/55 dark:border-white/22 shadow-md'
                    : isAmbientGlow
                      ? 'sx-glass-panel border border-[var(--sx-primary)]/35 shadow-[0_8px_24px_-10px_var(--sx-primary)]'
                      : isFrosted
                        ? 'bg-[var(--sx-surface-container)]/62 backdrop-blur-2xl border border-white/30 dark:border-white/12 shadow-md'
                        : 'sx-glass-panel border border-[var(--sx-outline)]'
            }`}
          >
            <div className="mb-0.5 shrink-0">
              <ShonenXLogo size={15} />
            </div>

            <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-0.5 w-full px-1">
              {PREVIEW_NAV_ITEMS.slice(0, 4).map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('nav-tab');
                      setActiveTab(item.id);
                    }}
                    style={{
                      borderRadius: isGlassPill ? '9999px' : '10px',
                    }}
                    aria-label={`Preview ${item.label} tab`}
                    className={`flex flex-col items-center justify-center transition-colors duration-200 ${
                      isGlassPill && isIconOnly ? 'w-7 h-7' : 'w-full py-0.5 px-0.5 gap-0.5'
                    } ${
                      active
                        ? glassActiveBubbleClass
                        : isGlassPill
                          ? 'text-[var(--sx-on-surface)]/70 hover:text-[var(--sx-on-surface)]'
                          : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={active ? 2.3 : 1.9} />
                    {!isIconOnly && (
                      <span className="text-[7.5px] font-bold leading-none truncate max-w-full">
                        {item.shortLabel}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-center gap-1 pt-1 border-t border-[var(--sx-outline)]/60 w-4/5 shrink-0">
              <Calendar className="w-2.5 h-2.5 text-[var(--sx-on-surface-muted)]" />
              <Settings className="w-2.5 h-2.5 text-[var(--sx-on-surface-muted)]" />
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('nav-tab');
              setActiveTab('downloads');
            }}
            aria-label="Preview Downloads tab"
            style={{
              borderRadius: isDocked ? '0px' : isGlassPill ? '9999px' : '12px',
            }}
            className={`mt-1 shrink-0 flex flex-col items-center justify-center py-1 transition-colors ${
              isGlassPill && isIconOnly ? 'w-7 h-7 mx-auto' : 'w-full gap-0.5'
            } ${
              isDocked
                ? 'mx-1 rounded-lg'
                : isGlassPill
                  ? glassSurfaceClass
                  : isFrosted
                    ? 'bg-[var(--sx-surface-container)]/62 backdrop-blur-2xl border border-white/30 dark:border-white/12'
                    : 'sx-glass-panel border border-[var(--sx-outline)]'
            } ${
              activeTab === 'downloads'
                ? glassActiveBubbleClass
                : 'text-[var(--sx-on-surface-muted)]'
            }`}
          >
            <Download className="w-3 h-3" />
            {!isIconOnly && <span className="text-[7px] font-bold leading-none">DL</span>}
          </button>
        </div>

        {/* Mock Desktop Canvas */}
        <div className="flex-1 p-3.5 flex flex-col justify-between relative z-10 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="px-2.5 py-1 rounded-full sx-glass-active text-[10px] font-extrabold capitalize">
              {activeTab} View
            </span>
            <span className="text-[10px] font-semibold text-[var(--sx-on-surface-muted)]">
              Desktop Rail · {styleLabel}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((cardIdx) => (
              <div
                key={cardIdx}
                className="h-20 rounded-xl sx-glass-panel border border-[var(--sx-outline)]/60 p-2 flex flex-col justify-end"
              >
                <div className="h-2 w-4/5 rounded bg-[var(--sx-on-surface)]/18 mb-1" />
                <div className="h-1.5 w-1/2 rounded bg-[var(--sx-primary)]/45" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="nav-preview-mobile-frame"
      data-nav-style={navStyle}
      className="w-full py-5 px-2 sm:px-4 flex flex-col items-center justify-center gap-3"
    >
      {/* Floating Dock Capsule matching user's reference screenshot */}
      <nav
        aria-label="Live Navigation Bar Preview"
        style={{
          borderRadius: isDocked ? '0px' : isGlassPill ? '9999px' : '24px',
        }}
        className={`sx-widget-scale relative flex items-center transition-all duration-200 w-full ${
          isGlassPill
            ? isIconOnly
              ? `max-w-[300px] h-14 px-2.5 justify-between ${glassSurfaceClass}`
              : isCompactCapsule
                ? `max-w-[330px] h-12 px-1.5 justify-around ${glassSurfaceClass}`
                : `max-w-[380px] h-16 px-2 justify-around ${glassSurfaceClass}`
            : `max-w-[380px] justify-around h-16 px-2 ${
                isDocked
                  ? 'bg-[var(--sx-surface-container)]/84 backdrop-blur-xl border-y border-[var(--sx-outline)]'
                  : isCrystalRail
                    ? 'bg-white/30 dark:bg-white/[0.06] backdrop-blur-2xl border border-white/55 dark:border-white/22 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]'
                    : isAmbientGlow
                      ? 'sx-glass-panel border border-[var(--sx-primary)]/40 shadow-[0_10px_28px_-10px_var(--sx-primary)]'
                      : isFrosted
                        ? 'bg-[var(--sx-surface-container)]/62 backdrop-blur-2xl border border-white/30 dark:border-white/14 shadow-lg'
                        : 'sx-glass-panel border border-[var(--sx-outline)] shadow-md'
              }`
        }`}
      >
        {PREVIEW_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          const showLabel = shouldShowActiveMobileNavLabel(navStyle, active);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                triggerHaptic('nav-tab');
                setActiveTab(item.id);
              }}
              style={{ borderRadius: isGlassPill || navStyle === 'classic' ? '9999px' : '14px' }}
              aria-label={`Preview ${item.label} tab`}
              className={`relative flex items-center justify-center transition-colors duration-200 ${
                isGlassPill
                  ? isIconOnly
                    ? 'w-10 h-10 shrink-0'
                    : isCompactCapsule
                      ? 'flex-1 min-w-0 h-9 px-1 flex-col gap-0.5'
                      : 'flex-1 min-w-0 h-12 px-1 flex-col gap-0.5'
                  : 'flex-1 min-w-0 h-12 px-1.5 flex-col gap-0.5 text-[10px] font-bold'
              } ${
                active
                  ? glassActiveBubbleClass
                  : isGlassPill
                    ? 'text-[var(--sx-on-surface)]/70 hover:text-[var(--sx-on-surface)]'
                    : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" strokeWidth={active ? 2.3 : 1.9} />
              {showLabel && (
                <span
                  className={`text-[9.5px] leading-none whitespace-nowrap ${
                    active ? 'font-extrabold' : 'font-semibold'
                  }`}
                >
                  {item.shortLabel}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
