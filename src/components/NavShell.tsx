import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import {
  Home,
  Search,
  BookMarked,
  Download,
  Settings,
  Calendar,
  Tv,
  Users,
  Radio,
  MessagesSquare,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { ShonenXLogo } from './ShonenXLogo';
import { useSlidingPill } from '../hooks/useSlidingPill';
import {
  getRouteTransitionClass,
  getRouteTransitionKind,
  RouteTransitionKind,
  shouldShowOnlineHubSwitcher,
} from '../utils/appMotion';
import {
  getPreviousVisitedRoute,
  shouldNavShellResetScroll,
} from '../utils/scrollPersistence';
import {
  isGlassPillNavStyle,
  isIconOnlyNavStyle,
  resolveNavBarStyle,
  shouldShowActiveMobileNavLabel,
} from '../utils/navBarStyles';
import { suppressNextRouteHaptic, triggerHaptic } from '../utils/haptics';

interface NavShellProps {
  children: React.ReactNode;
}

export const NavShell: React.FC<NavShellProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const { state, updateUiPrefs } = useApp();

  const navStyle = resolveNavBarStyle(state.uiPrefs.navBarStyle);
  const isTvMode = state.uiPrefs.useNewUi;

  const navigateWithHaptic = (path: string, cue: 'nav-tab' | 'nav-push' = 'nav-tab') => {
    triggerHaptic(cue);
    suppressNextRouteHaptic();
    navigate(path);
  };

  const activeDownloads = state.downloads.filter(
    (d) => d.status === 'downloading' || d.status === 'pending',
  );
  const downloadCount = activeDownloads.length;

  const navItems = [
    { path: '/home', label: 'Home', shortLabel: 'Home', icon: Home },
    { path: '/discover', label: 'Discover', shortLabel: 'Discover', icon: Search },
    { path: '/watch-together', label: 'Online', shortLabel: 'Online', icon: Radio, isOnlineHub: true },
    { path: '/library', label: 'Library', shortLabel: 'Library', icon: BookMarked },
    { path: '/downloads', label: 'Downloads', shortLabel: 'Downloads', icon: Download, badge: downloadCount },
  ];

  const onlineHubTabs = [
    { path: '/watch-together', label: 'Watch Together', icon: Users, testId: 'online-menu-watch-together-btn' },
    { path: '/community', label: 'Community', icon: MessagesSquare, testId: 'online-menu-community-btn' },
  ];

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  const isOnlineRouteActive = isActive('/watch-together') || isActive('/community');
  const showOnlineSwitcher = shouldShowOnlineHubSwitcher(location.pathname);
  const isNavItemActive = (path: string) =>
    path === '/watch-together' ? isOnlineRouteActive : isActive(path);

  const routeStageKey = location.pathname.startsWith('/watch-together/')
    ? '/watch-together/:roomCode'
    : location.pathname;

  const initialPrevPath = getPreviousVisitedRoute();
  const prevPathRef = useRef<string | null>(routeStageKey);
  const transitionRef = useRef<{
    path: string;
    prevPath: string | null;
    kind: RouteTransitionKind;
  }>({
    path: routeStageKey,
    prevPath: initialPrevPath,
    kind: getRouteTransitionKind(initialPrevPath, location.pathname),
  });
  if (transitionRef.current.path !== routeStageKey) {
    const prevPath = prevPathRef.current;
    transitionRef.current = {
      path: routeStageKey,
      prevPath,
      kind: getRouteTransitionKind(prevPath, location.pathname),
    };
    prevPathRef.current = routeStageKey;
  }

  useEffect(() => {
    if (
      shouldNavShellResetScroll(
        location.pathname,
        transitionRef.current.prevPath,
        navigationType,
      )
    ) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [routeStageKey, location.pathname, navigationType]);

  const transitionKind = transitionRef.current.kind;
  const transitionClass = getRouteTransitionClass(transitionKind);

  const resolvedTabPath = isOnlineRouteActive
    ? '/watch-together'
    : ['/home', '/discover', '/library', '/downloads', '/calendar'].find((p) => isActive(p)) || '';
  const tvActivePath = resolvedTabPath;
  const sideActivePath =
    resolvedTabPath && ['/home', '/discover', '/watch-together', '/library'].includes(resolvedTabPath)
      ? resolvedTabPath
      : '';
  const mobileActivePath =
    resolvedTabPath && resolvedTabPath !== '/calendar' ? resolvedTabPath : '';
  const onlineActivePath = showOnlineSwitcher
    ? isActive('/community')
      ? '/community'
      : '/watch-together'
    : '';

  const tvPill = useSlidingPill<HTMLElement>(tvActivePath, isTvMode);
  const sidePill = useSlidingPill<HTMLElement>(sideActivePath, `${isTvMode}-${navStyle}`);
  const mobilePill = useSlidingPill<HTMLElement>(mobileActivePath, `${isTvMode}-${navStyle}`);
  const onlinePill = useSlidingPill<HTMLElement>(
    onlineActivePath,
    `${isTvMode}-${navStyle}-${showOnlineSwitcher}`,
  );

  const roundness = `${Math.min(20, state.themePrefs.uiRoundness)}px`;

  const glassSurfaceClass =
    navStyle === 'liquidPill'
      ? 'bg-white/45 dark:bg-white/[0.11] backdrop-blur-3xl backdrop-saturate-180 border border-white/65 dark:border-white/25 ring-1 ring-inset ring-white/35 dark:ring-white/15 shadow-[0_16px_42px_-10px_rgba(0,0,0,0.34)]'
      : navStyle === 'compactCapsule'
        ? 'bg-white/34 dark:bg-white/[0.06] backdrop-blur-2xl backdrop-saturate-150 border border-white/45 dark:border-white/15 shadow-[0_10px_28px_-10px_rgba(0,0,0,0.3)]'
        : 'bg-white/38 dark:bg-white/[0.07] backdrop-blur-2xl backdrop-saturate-150 border border-white/50 dark:border-white/15 ring-1 ring-inset ring-white/25 dark:ring-white/8 shadow-[0_14px_38px_-10px_rgba(0,0,0,0.28)]';
  const glassActiveBubbleClass =
    navStyle === 'ambientGlow'
      ? 'bg-[var(--sx-primary)]/20 dark:bg-[var(--sx-primary)]/28 backdrop-blur-md border border-[var(--sx-primary)]/45 shadow-[0_0_20px_-4px_var(--sx-primary)]'
      : navStyle === 'crystalRail'
        ? 'bg-white/25 dark:bg-white/12 backdrop-blur-md border border-white/50 dark:border-white/25 shadow-sm'
        : 'bg-[var(--sx-primary)]/16 dark:bg-[var(--sx-primary)]/22 backdrop-blur-md border border-white/40 dark:border-white/15 ring-1 ring-inset ring-white/25 dark:ring-white/10 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.18)]';

  const renderOnlineHubSwitcher = (tvLayout = false) => {
    if (!showOnlineSwitcher) return null;
    const isGlassPillStyle = isGlassPillNavStyle(navStyle);
    const isIconOnlyStyle = isIconOnlyNavStyle(navStyle);
    const useGlassBubble = isGlassPillStyle || navStyle === 'frosted';

    return (
      <div
        data-testid="online-hub-switcher"
        className={`fixed z-40 pointer-events-none sx-online-dock-enter ${
          tvLayout
            ? 'bottom-6 left-1/2 -translate-x-1/2 px-3'
            : `bottom-[calc(5.85rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 px-3 md:bottom-6 landscape:bottom-6 ${
                isGlassPillStyle && isIconOnlyStyle
                  ? 'md:left-[calc(50%+37px)] landscape:left-[calc(50%+37px)]'
                  : 'md:left-[calc(50%+42px)] landscape:left-[calc(50%+42px)]'
              }`
        }`}
      >
        <nav
          ref={onlinePill.containerRef}
          aria-label="Online section switcher"
          className={`relative pointer-events-auto inline-flex items-center gap-1 p-1.5 rounded-full transition-all duration-200 ${glassSurfaceClass}`}
        >
          {onlinePill.pillRect.ready && (
            <span
              aria-hidden="true"
              data-testid="online-switcher-pill"
              style={{
                transform: `translate3d(${onlinePill.pillRect.left}px, ${onlinePill.pillRect.top}px, 0)`,
                width: `${onlinePill.pillRect.width}px`,
                height: `${onlinePill.pillRect.height}px`,
                borderRadius: '9999px',
              }}
              className={`sx-pill-glide pointer-events-none absolute left-0 top-0 ${glassActiveBubbleClass}`}
            />
          )}

          {onlineHubTabs.map((tab) => {
            const TabIcon = tab.icon;
            const tabActive = onlineActivePath === tab.path;
            return (
              <button
                key={tab.path}
                ref={onlinePill.registerItemRef(tab.path)}
                type="button"
                data-testid={tab.testId}
                aria-current={tabActive ? 'page' : undefined}
                onClick={() => navigateWithHaptic(tab.path, 'nav-tab')}
                className={`relative z-10 flex items-center justify-center gap-2 px-4 sm:px-5 h-10 rounded-full text-xs sm:text-[13px] whitespace-nowrap transition-colors duration-200 cursor-pointer ${
                  tabActive
                    ? onlinePill.pillRect.ready
                      ? 'text-[var(--sx-primary)] font-extrabold'
                      : `${glassActiveBubbleClass} text-[var(--sx-primary)] font-extrabold`
                    : 'text-[var(--sx-on-surface)]/72 hover:text-[var(--sx-on-surface)] font-bold'
                }`}
              >
                <TabIcon
                  className="w-4 h-4 shrink-0"
                  strokeWidth={tabActive ? 2.3 : 1.9}
                />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    );
  };

  if (isTvMode) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-8 px-8 py-4 bg-[var(--sx-surface)]/85 backdrop-blur-xl border-b border-[var(--sx-outline)]">
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="flex items-center gap-2.5 text-lg font-black tracking-tight text-[var(--sx-on-surface)] whitespace-nowrap shrink-0 group"
          >
            <ShonenXLogo size={28} className="transition-transform duration-200 group-hover:scale-105" />
            <span>ShizuTv</span>
          </button>

          <nav ref={tvPill.containerRef} className="relative flex items-center gap-4">
            {tvPill.pillRect.ready && (
              <span
                aria-hidden="true"
                style={{
                  transform: `translate3d(${tvPill.pillRect.left}px, ${tvPill.pillRect.top}px, 0)`,
                  width: `${tvPill.pillRect.width}px`,
                  height: `${tvPill.pillRect.height}px`,
                }}
                className={`sx-pill-glide pointer-events-none absolute left-0 top-0 rounded-lg ${glassActiveBubbleClass}`}
              />
            )}
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isNavItemActive(item.path);
              const isOnline = Boolean(item.isOnlineHub);
              return (
                <button
                  key={item.path}
                  ref={tvPill.registerItemRef(item.path)}
                  type="button"
                  data-testid={isOnline ? 'tv-nav-online-btn' : undefined}
                  onClick={() => navigateWithHaptic(item.path, 'nav-tab')}
                  className={`relative z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? tvPill.pillRect.ready
                        ? 'text-[var(--sx-primary)]'
                        : `${glassActiveBubbleClass} text-[var(--sx-primary)]`
                      : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                  }`}
                >
                  <span className="relative inline-flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </span>
                  <span>{item.label}</span>
                  {item.badge ? (
                    <span className="ml-1 text-[11px] font-mono-tabular">({item.badge})</span>
                  ) : null}
                </button>
              );
            })}
            <button
              ref={tvPill.registerItemRef('/calendar')}
              type="button"
              onClick={() => navigateWithHaptic('/calendar', 'nav-tab')}
              className={`relative z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors whitespace-nowrap shrink-0 ${
                isActive('/calendar')
                  ? tvPill.pillRect.ready
                    ? 'text-[var(--sx-primary)]'
                    : `${glassActiveBubbleClass} text-[var(--sx-primary)]`
                  : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Calendar</span>
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('menu-select');
                updateUiPrefs({ useNewUi: false });
              }}
              title="Exit TV Mode"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold sx-glass-control border border-[var(--sx-outline)] text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]/45 transition-colors whitespace-nowrap shrink-0"
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Standard UI</span>
            </button>
            <button
              type="button"
              onClick={() => navigateWithHaptic('/settings', 'nav-push')}
              className="p-2 rounded-lg sx-glass-panel border border-[var(--sx-outline)] text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)] transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>
        <main className={`flex-1 ${showOnlineSwitcher ? 'pb-24' : 'pb-12'} overflow-x-clip`}>
          <div
            key={routeStageKey}
            data-testid="app-route-stage"
            data-transition={transitionKind}
            className={transitionClass}
          >
            {children}
          </div>
        </main>
        {renderOnlineHubSwitcher(true)}
      </div>
    );
  }

  const isDocked = navStyle === 'docked';
  const isFrosted = navStyle === 'frosted';
  const isCrystalRail = navStyle === 'crystalRail';
  const isAmbientGlow = navStyle === 'ambientGlow';
  const isCompactCapsule = navStyle === 'compactCapsule';
  const isGlassPill = isGlassPillNavStyle(navStyle);
  const isIconOnly = isIconOnlyNavStyle(navStyle);

  return (
    <div className="min-h-screen flex flex-col md:flex-row landscape:flex-row">
      {/* Desktop / Tablet / Rotated Phone Side Rail */}
      <aside
        data-testid="desktop-side-rail"
        data-nav-style={navStyle}
        className={`sx-widget-scale hidden md:flex landscape:flex flex-col justify-between shrink-0 z-40 sticky top-0 h-dvh overflow-y-auto no-scrollbar transition-all duration-200 ${
          isDocked
            ? 'w-20 short-screen:w-[68px] bg-[var(--sx-surface-container)]/76 backdrop-blur-xl border-r border-[var(--sx-outline)] py-5 short-screen:py-2'
            : isGlassPill && isIconOnly
              ? 'w-[74px] short-screen:w-[66px] py-5 short-screen:py-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-1'
              : 'w-[84px] short-screen:w-[72px] py-5 short-screen:py-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-1'
        }`}
      >
        <div
          style={{
            borderRadius: isDocked ? '0px' : isGlassPill ? '9999px' : roundness,
          }}
          className={`flex-1 flex flex-col items-center py-4 short-screen:py-2 gap-2 short-screen:gap-1 ${
            isDocked
              ? ''
              : isGlassPill
                ? glassSurfaceClass
                : isCrystalRail
                  ? 'bg-white/30 dark:bg-white/[0.06] backdrop-blur-2xl border border-white/55 dark:border-white/22 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]'
                  : isAmbientGlow
                    ? 'sx-glass-panel border border-[var(--sx-primary)]/35 shadow-[0_12px_34px_-12px_var(--sx-primary)]'
                    : isFrosted
                      ? 'bg-[var(--sx-surface-container)]/62 backdrop-blur-2xl border border-white/30 dark:border-white/12 shadow-lg'
                      : 'sx-glass-panel border border-[var(--sx-outline)]'
          }`}
        >
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="mb-4 short-screen:mb-1 p-2 short-screen:p-1 rounded-full hover:scale-105 active:scale-95 transition-transform flex flex-col items-center gap-1 shrink-0"
            title="ShizuTv Home"
          >
            <ShonenXLogo size={28} />
          </button>

          <nav
            ref={sidePill.containerRef}
            className={`relative flex-1 flex flex-col items-center justify-center gap-2 short-screen:gap-1 w-full ${
              isGlassPill ? 'px-1.5' : 'px-2 short-screen:px-1.5'
            }`}
          >
            {sidePill.pillRect.ready && (
              <span
                aria-hidden="true"
                style={{
                  transform: `translate3d(${sidePill.pillRect.left}px, ${sidePill.pillRect.top}px, 0)`,
                  width: `${sidePill.pillRect.width}px`,
                  height: `${sidePill.pillRect.height}px`,
                  borderRadius: isGlassPill ? '9999px' : `calc(${roundness} * 0.75)`,
                }}
                className={`sx-pill-glide pointer-events-none absolute left-0 top-0 ${glassActiveBubbleClass}`}
              />
            )}
            {navItems.slice(0, 4).map((item) => {
              const Icon = item.icon;
              const active = isNavItemActive(item.path);
              const isOnline = Boolean(item.isOnlineHub);
              const navLabel = item.shortLabel;
              return (
                <button
                  key={item.path}
                  ref={sidePill.registerItemRef(item.path)}
                  type="button"
                  aria-label={item.label}
                  title={item.label}
                  data-testid={
                    isOnline ? 'side-nav-online-btn' : `side-nav-${item.shortLabel.toLowerCase()}-btn`
                  }
                  onClick={() => navigateWithHaptic(item.path, 'nav-tab')}
                  style={{
                    borderRadius: isGlassPill ? '9999px' : `calc(${roundness} * 0.75)`,
                  }}
                  className={`relative z-10 flex flex-col items-center justify-center transition-colors duration-200 ${
                    isGlassPill && isIconOnly
                      ? 'w-11 h-11 short-screen:w-9 short-screen:h-9 mx-auto'
                      : 'w-full py-3 short-screen:py-1.5 px-1 gap-1 short-screen:gap-0.5'
                  } ${
                    active
                      ? sidePill.pillRect.ready
                        ? 'text-[var(--sx-primary)]'
                        : `${glassActiveBubbleClass} text-[var(--sx-primary)]`
                      : isGlassPill
                        ? 'text-[var(--sx-on-surface)]/65 hover:text-[var(--sx-on-surface)] hover:bg-white/20 dark:hover:bg-white/10'
                        : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] hover:bg-[var(--sx-surface-high)]'
                  }`}
                >
                  <span className="relative inline-flex items-center justify-center shrink-0">
                    <Icon
                      className={`${
                        isGlassPill && isIconOnly
                          ? 'w-5 h-5 short-screen:w-4 short-screen:h-4'
                          : 'w-5 h-5 short-screen:w-4 short-screen:h-4'
                      } shrink-0`}
                      strokeWidth={isGlassPill && active ? 2.3 : 1.9}
                    />
                  </span>
                  {!isIconOnly && (
                    <span
                      className={`text-[10px] short-screen:text-[9px] tracking-tight leading-tight text-center ${
                        isGlassPill && active ? 'font-extrabold' : 'font-bold'
                      }`}
                    >
                      {navLabel}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div
            className={`flex flex-col items-center gap-2 short-screen:gap-1 w-full pt-2 short-screen:pt-1.5 border-t shrink-0 ${
              isGlassPill
                ? 'px-1.5 border-white/25 dark:border-white/10'
                : 'px-2 short-screen:px-1.5 border-[var(--sx-outline)]'
            }`}
          >
            <button
              type="button"
              onClick={() => navigateWithHaptic('/calendar', 'nav-tab')}
              style={{
                borderRadius: isGlassPill ? '9999px' : `calc(${roundness} * 0.75)`,
              }}
              aria-label="Airing Calendar"
              title="Airing Calendar"
              className={`flex flex-col items-center justify-center transition-colors ${
                isGlassPill && isIconOnly
                  ? 'w-11 h-11 short-screen:w-9 short-screen:h-9 mx-auto'
                  : 'w-full py-2.5 short-screen:py-1.5 gap-1 short-screen:gap-0.5'
              } ${
                isActive('/calendar')
                  ? `${glassActiveBubbleClass} text-[var(--sx-primary)]`
                  : isGlassPill
                    ? 'text-[var(--sx-on-surface)]/65 hover:text-[var(--sx-on-surface)] hover:bg-white/20 dark:hover:bg-white/10'
                    : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] hover:bg-[var(--sx-surface-high)]'
              }`}
            >
              <Calendar className="w-4 h-4 short-screen:w-3.5 short-screen:h-3.5" />
              {!isIconOnly && (
                <span className="text-[10px] short-screen:text-[9px] font-semibold leading-none">
                  Calendar
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigateWithHaptic('/settings', 'nav-push')}
              style={{
                borderRadius: isGlassPill ? '9999px' : `calc(${roundness} * 0.75)`,
              }}
              aria-label="Settings"
              title="Settings"
              className={`flex flex-col items-center justify-center transition-colors ${
                isGlassPill && isIconOnly
                  ? 'w-11 h-11 short-screen:w-9 short-screen:h-9 mx-auto'
                  : 'w-full py-2.5 short-screen:py-1.5 gap-1 short-screen:gap-0.5'
              } ${
                isActive('/settings')
                  ? `${glassActiveBubbleClass} text-[var(--sx-primary)]`
                  : isGlassPill
                    ? 'text-[var(--sx-on-surface)]/65 hover:text-[var(--sx-on-surface)] hover:bg-white/20 dark:hover:bg-white/10'
                    : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] hover:bg-[var(--sx-surface-high)]'
              }`}
            >
              <Settings className="w-4 h-4 short-screen:w-3.5 short-screen:h-3.5" />
              {!isIconOnly && (
                <span className="text-[10px] short-screen:text-[9px] font-semibold leading-none">
                  Settings
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Separate Downloads Pill on Side Rail */}
        <button
          type="button"
          onClick={() => navigateWithHaptic('/downloads', 'nav-tab')}
          aria-label="Downloads"
          title="Downloads"
          style={{
            borderRadius: isDocked ? '0px' : isGlassPill ? '9999px' : roundness,
          }}
          className={`mt-3 short-screen:mt-1.5 shrink-0 flex flex-col items-center justify-center relative transition-[transform,background-color,border-color,color] duration-200 ${
            isGlassPill && isIconOnly
              ? 'w-12 h-12 mx-auto'
              : 'py-4 short-screen:py-2 gap-1 short-screen:gap-0.5'
          } ${
            isDocked
              ? 'mx-2 rounded-xl'
              : isGlassPill
                ? glassSurfaceClass
                : isFrosted
                  ? 'bg-[var(--sx-surface-container)]/62 backdrop-blur-2xl border border-white/30 dark:border-white/12'
                  : 'sx-glass-panel border border-[var(--sx-outline)]'
          } ${
            isActive('/downloads')
              ? `${glassActiveBubbleClass} text-[var(--sx-primary)]`
              : isGlassPill
                ? 'text-[var(--sx-on-surface)]/70 hover:text-[var(--sx-on-surface)]'
                : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
          }`}
        >
          <Download className="w-5 h-5 short-screen:w-4 short-screen:h-4" />
          {!isIconOnly && (
            <span className="text-[10px] short-screen:text-[9px] font-bold leading-none">
              Downloads
            </span>
          )}
          {downloadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[16px] h-[16px] px-1 rounded-full sx-glass-active text-[9px] font-bold flex items-center justify-center tabular-nums">
              {downloadCount}
            </span>
          )}
        </button>
      </aside>

      {/* Main Content */}
      <main
        className={`flex-1 min-w-0 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] ${
          showOnlineSwitcher
            ? 'pb-44 md:pb-24 landscape:pb-24'
            : 'pb-24 md:pb-10 landscape:pb-10'
        } overflow-x-clip`}
      >
        <div
          key={routeStageKey}
          data-testid="app-route-stage"
          data-transition={transitionKind}
          className={transitionClass}
        >
          {children}
        </div>
      </main>

      {/* Portrait Mobile Bottom NavBar */}
      <div
        className={`sx-widget-scale md:hidden landscape:hidden fixed bottom-0 inset-x-0 z-40 ${
          isDocked
            ? 'pb-[env(safe-area-inset-bottom)]'
            : isGlassPill
              ? 'px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none'
              : 'px-4 pb-[max(0.625rem,env(safe-area-inset-bottom))] pointer-events-none'
        }`}
      >
        <nav
          data-testid="mobile-bottom-nav"
          data-nav-style={navStyle}
          ref={mobilePill.containerRef}
          style={{
            borderRadius: isDocked ? '0px' : isGlassPill ? '9999px' : '22px',
          }}
          className={`relative pointer-events-auto flex items-center transition-all duration-200 ${
            isGlassPill
              ? isIconOnly
                ? `max-w-[336px] mx-auto h-[60px] px-2 justify-between ${glassSurfaceClass}`
                : isCompactCapsule
                  ? `max-w-[350px] mx-auto h-[54px] px-1.5 justify-around ${glassSurfaceClass}`
                  : `max-w-[420px] mx-auto h-[66px] px-1.5 justify-around ${glassSurfaceClass}`
              : `justify-around h-14 px-2 ${
                  isDocked
                    ? 'bg-[var(--sx-surface-container)]/78 backdrop-blur-xl border-t border-[var(--sx-outline)]'
                    : isCrystalRail
                      ? 'bg-white/30 dark:bg-white/[0.06] backdrop-blur-2xl border border-white/55 dark:border-white/22 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_12px_30px_-10px_rgba(0,0,0,0.4)]'
                      : isAmbientGlow
                        ? 'sx-glass-panel border border-[var(--sx-primary)]/40 shadow-[0_12px_34px_-12px_var(--sx-primary)]'
                        : isFrosted
                          ? 'bg-[var(--sx-surface-container)]/64 backdrop-blur-2xl border border-white/30 dark:border-white/12 shadow-[0_12px_36px_-10px_rgba(0,0,0,0.45)]'
                          : 'sx-glass-panel border border-[var(--sx-outline)] shadow-xl'
                }`
          }`}
        >
          {mobilePill.pillRect.ready && (
            <span
              aria-hidden="true"
              data-testid="mobile-nav-pill"
              style={{
                transform: `translate3d(${mobilePill.pillRect.left}px, ${mobilePill.pillRect.top}px, 0)`,
                width: `${mobilePill.pillRect.width}px`,
                height: `${mobilePill.pillRect.height}px`,
                borderRadius: isGlassPill ? '9999px' : '14px',
              }}
              className={`sx-pill-glide pointer-events-none absolute left-0 top-0 ${glassActiveBubbleClass}`}
            />
          )}
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isNavItemActive(item.path);
            const isOnline = Boolean(item.isOnlineHub);
            const showLabel = shouldShowActiveMobileNavLabel(navStyle, active);
            const displayLabel = isGlassPill ? item.shortLabel : item.label;
            return (
              <button
                key={item.path}
                ref={mobilePill.registerItemRef(item.path)}
                type="button"
                aria-label={item.label}
                title={item.label}
                data-testid={
                  isOnline
                    ? 'mobile-nav-online-btn'
                    : `mobile-nav-${item.shortLabel.toLowerCase()}-btn`
                }
                onClick={() => navigateWithHaptic(item.path, 'nav-tab')}
                style={{ borderRadius: isGlassPill ? '9999px' : '14px' }}
                className={`relative z-10 flex items-center justify-center transition-colors duration-200 ${
                  isGlassPill
                    ? isIconOnly
                      ? 'w-11 h-11 shrink-0'
                      : 'flex-1 min-w-0 h-[52px] px-1 flex-col gap-0.5'
                    : `${active ? 'px-3 py-1.5' : 'px-2.5 py-1.5'} gap-1.5 min-h-[40px] text-[11px] sm:text-xs font-bold`
                } ${
                  active
                    ? mobilePill.pillRect.ready
                      ? 'text-[var(--sx-primary)]'
                      : `${glassActiveBubbleClass} text-[var(--sx-primary)]`
                    : isGlassPill
                      ? 'text-[var(--sx-on-surface)]/65 hover:text-[var(--sx-on-surface)]'
                      : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                }`}
              >
                <span className="relative inline-flex items-center justify-center shrink-0">
                  <Icon
                    className={
                      isGlassPill
                        ? isIconOnly
                          ? 'w-[21px] h-[21px] shrink-0'
                          : 'w-[18px] h-[18px] shrink-0'
                        : 'w-4 h-4 shrink-0'
                    }
                    strokeWidth={isGlassPill && active ? 2.3 : 1.9}
                  />
                </span>
                {showLabel && (
                  <span
                    className={
                      isGlassPill
                        ? `text-[10px] leading-none tracking-tight whitespace-nowrap ${
                            active ? 'font-extrabold' : 'font-semibold'
                          }`
                        : 'sx-nav-label-enter whitespace-nowrap'
                    }
                  >
                    {displayLabel}
                  </span>
                )}
                {item.badge ? (
                  isGlassPill ? (
                    <span className="absolute top-1 right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full sx-glass-active text-[8px] font-black flex items-center justify-center tabular-nums">
                      {item.badge}
                    </span>
                  ) : (
                    <span className="ml-0.5 text-[10px] font-mono-tabular">({item.badge})</span>
                  )
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>
      {renderOnlineHubSwitcher(false)}
    </div>
  );
};
