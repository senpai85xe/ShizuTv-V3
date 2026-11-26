import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Compass, Moon, Puzzle, Settings, Sun, User } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { SmartImage } from './SmartImage';
import { ShizuTvLogo } from './ShonenXLogo';
import { resolveEffectiveIsDark } from '../utils/themeDefaults';
import { triggerThemeWaveTransition } from '../utils/themeWaveTransition';
import { suppressNextRouteHaptic, triggerHaptic } from '../utils/haptics';

import { HomeHeaderStyle } from '../data/themePresets';

interface HomeHeaderProps {
  onOpenProfile: () => void;
  onOpenDiscoveryMode: () => void;
  styleOverride?: HomeHeaderStyle;
  previewMode?: boolean;
}

export const HomeHeader: React.FC<HomeHeaderProps> = ({
  onOpenProfile,
  onOpenDiscoveryMode,
  styleOverride,
  previewMode = false,
}) => {
  const navigate = useNavigate();
  const { state, effectiveMetadataTracker, updateThemePrefs } = useApp();
  const themeToggleRef = useRef<HTMLButtonElement | null>(null);
  const style = styleOverride ?? state.uiPrefs.homeHeaderStyle;
  const profile = state.profiles[state.primaryTracker] || state.profiles.local;
  const username = profile?.username || 'Guest';
  const avatarUrl = profile?.avatarUrl;
  const isTrackerMode = state.discoveryPrefs.mode === 'tracker';
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = resolveEffectiveIsDark(state.themePrefs.themeMode, prefersDark);

  const handleOpenProfileWithHaptic = () => {
    triggerHaptic('menu-open');
    onOpenProfile();
  };

  const handleOpenDiscoveryModeWithHaptic = () => {
    triggerHaptic('menu-open');
    onOpenDiscoveryMode();
  };

  const handleToggleThemeWave = () => {
    triggerHaptic('menu-select');
    void triggerThemeWaveTransition({
      sourceEl: themeToggleRef.current,
      themePrefs: state.themePrefs,
      onCommitMode: (nextMode) => updateThemePrefs({ themeMode: nextMode }),
    });
  };

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const trackerLabel =
    effectiveMetadataTracker === 'myanimelist'
      ? 'MyAnimeList'
      : effectiveMetadataTracker === 'kitsu'
        ? 'Kitsu'
        : 'AniList';

  const handleNavigate = (path: string) => {
    if (previewMode) {
      triggerHaptic('menu-select');
      return;
    }
    triggerHaptic('nav-push');
    suppressNextRouteHaptic();
    navigate(path);
  };

  const actionButtons = (
    <div className={`flex items-center shrink-0 ${previewMode ? 'gap-1 sm:gap-2' : 'gap-2'}`}>
      <button
        type="button"
        onClick={handleOpenDiscoveryModeWithHaptic}
        title={isTrackerMode ? `Discovery: ${trackerLabel}` : 'Discovery: Extensions'}
        className={`inline-flex items-center gap-1.5 rounded-[var(--sx-radius)] text-xs font-bold border transition-[transform,border-color,background-color] duration-200 ${
          previewMode ? 'px-2 py-1.5 sm:px-3 sm:py-2' : 'px-3 py-2'
        } ${
          isTrackerMode
            ? 'bg-[var(--sx-primary-container)]/35 border-[var(--sx-primary)]/40 text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]'
            : 'sx-glass-panel border-[var(--sx-outline)] text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]'
        }`}
      >
        {isTrackerMode ? (
          <Compass className="w-4 h-4 text-[var(--sx-primary)]" />
        ) : (
          <Puzzle className="w-4 h-4 text-[var(--sx-primary)]" />
        )}
        <span className="hidden sm:inline whitespace-nowrap">
          {isTrackerMode ? trackerLabel : 'Extensions'}
        </span>
      </button>

      <button
        type="button"
        onClick={() => handleNavigate('/calendar')}
        title="Airing Calendar"
        aria-label="Airing Calendar"
        className={`${previewMode ? 'p-1.5 sm:p-2.5' : 'p-2.5'} rounded-[var(--sx-radius)] sx-glass-panel border border-[var(--sx-outline)] text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)] transition-[transform,border-color] duration-200`}
      >
        <Calendar className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => handleNavigate('/settings')}
        title="Settings"
        aria-label="Settings"
        className={`${previewMode ? 'p-1.5 sm:p-2.5' : 'p-2.5'} rounded-[var(--sx-radius)] sx-glass-panel border border-[var(--sx-outline)] text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)] transition-[transform,border-color] duration-200`}
      >
        <Settings className="w-4 h-4" />
      </button>
    </div>
  );

  const avatar = avatarUrl ? (
    <SmartImage
      src={avatarUrl}
      alt={username}
      className="w-full h-full object-cover"
    />
  ) : (
    <div className="w-full h-full flex items-center justify-center bg-[var(--sx-primary-container)] text-[var(--sx-on-primary-container)]">
      <User className="w-4 h-4" />
    </div>
  );

  // New Header Style #8: Clean Wave (Clean brand bar + Dark/Light wave toggle next to Profile button)
  if (style === 'cleanWave') {
    return (
      <header className="px-4 sm:px-6 pt-5 pb-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => !previewMode && navigate('/home')}
            className="w-11 h-11 rounded-full bg-[var(--sx-primary)]/15 backdrop-blur-lg border border-[var(--sx-primary)]/20 flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition-transform"
            aria-label="ShizuTv Home"
          >
            <ShizuTvLogo size={22} />
          </button>
          <div className="min-w-0 leading-tight">
            <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--sx-on-surface)] truncate">
              ShizuTv
            </h1>
            <p className="text-xs font-medium text-[var(--sx-on-surface-muted)] truncate">
              {greeting}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            ref={themeToggleRef}
            type="button"
            data-testid="home-theme-wave-toggle"
            onClick={handleToggleThemeWave}
            aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="relative w-11 h-11 rounded-full bg-[var(--sx-primary)]/15 hover:bg-[var(--sx-primary)]/25 backdrop-blur-lg border border-[var(--sx-primary)]/25 flex items-center justify-center overflow-hidden transition-[transform,background-color] duration-250 ease-[cubic-bezier(0.32,0.72,0,1)] shrink-0"
          >
            <Sun
              className={`sx-theme-toggle-icon w-5 h-5 text-[var(--sx-on-surface)] absolute transition-[opacity,transform] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isDark
                  ? 'opacity-100 rotate-0 scale-100'
                  : 'opacity-0 -rotate-90 scale-50'
              }`}
            />
            <Moon
              className={`sx-theme-toggle-icon w-5 h-5 text-[var(--sx-on-surface)] absolute transition-[opacity,transform] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isDark
                  ? 'opacity-0 rotate-90 scale-50'
                  : 'opacity-100 rotate-0 scale-100'
              }`}
            />
          </button>

          <button
            type="button"
            onClick={handleOpenProfileWithHaptic}
            aria-label="Open profile and quick menu"
            title="Profile & Quick Menu"
            className="w-11 h-11 rounded-full bg-[var(--sx-primary)]/15 hover:bg-[var(--sx-primary)]/25 backdrop-blur-lg border border-[var(--sx-primary)]/25 flex items-center justify-center overflow-hidden transition-[transform,background-color] duration-200 shrink-0"
          >
            {avatarUrl ? (
              <SmartImage src={avatarUrl} alt={username} className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5 text-[var(--sx-on-surface)]" />
            )}
          </button>
        </div>
      </header>
    );
  }

  // New Header Style #7: Clean (Avatar-free minimal brand bar + single Profile Sheet button)
  if (style === 'clean') {
    return (
      <header className="px-4 sm:px-6 pt-5 pb-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => !previewMode && navigate('/home')}
            className="w-11 h-11 rounded-full bg-[var(--sx-primary)]/15 backdrop-blur-lg border border-[var(--sx-primary)]/20 flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition-transform"
            aria-label="ShizuTv Home"
          >
            <ShizuTvLogo size={22} />
          </button>
          <div className="min-w-0 leading-tight">
            <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--sx-on-surface)] truncate">
              ShizuTv
            </h1>
            <p className="text-xs font-medium text-[var(--sx-on-surface-muted)] truncate">
              {greeting}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleOpenProfileWithHaptic}
            aria-label="Open profile and quick menu"
            title="Profile & Quick Menu"
            className="w-11 h-11 rounded-full bg-[var(--sx-primary)]/15 hover:bg-[var(--sx-primary)]/25 backdrop-blur-lg border border-[var(--sx-primary)]/25 flex items-center justify-center overflow-hidden transition-all active:scale-95 shrink-0"
          >
            {avatarUrl ? (
              <SmartImage src={avatarUrl} alt={username} className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5 text-[var(--sx-on-surface)]" />
            )}
          </button>
        </div>
      </header>
    );
  }

  // New Header Style #5: Glass Island (Floating frosted glass island bar with quick theme & profile triggers)
  if (style === 'glassIsland') {
    return (
      <header className={previewMode ? 'px-2.5 sm:px-5 pt-3 pb-2' : 'px-4 sm:px-6 pt-4 pb-2'}>
        <div
          style={{ borderRadius: 'var(--sx-radius)' }}
          className="sx-glass-panel border border-white/30 dark:border-white/14 px-3.5 sm:px-5 py-2.5 flex items-center justify-between gap-3 shadow-lg"
        >
          <button
            type="button"
            onClick={() => !previewMode && navigate('/home')}
            className="flex items-center gap-2.5 min-w-0 text-left group"
          >
            <div className="w-9 h-9 rounded-full sx-glass-active flex items-center justify-center shrink-0">
              <ShizuTvLogo size={19} />
            </div>
            <div className="min-w-0 leading-tight">
              <h1 className="text-sm sm:text-base font-black tracking-tight text-[var(--sx-on-surface)] truncate group-hover:text-[var(--sx-primary)] transition-colors">
                ShizuTv
              </h1>
              <p className="text-[11px] font-medium text-[var(--sx-on-surface-muted)] truncate">
                {greeting}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              ref={themeToggleRef}
              type="button"
              data-testid="home-theme-wave-toggle"
              onClick={handleToggleThemeWave}
              aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="relative w-9 h-9 rounded-full sx-glass-control border border-[var(--sx-outline)] flex items-center justify-center overflow-hidden shrink-0"
            >
              <Sun
                className={`sx-theme-toggle-icon w-4 h-4 text-[var(--sx-on-surface)] absolute transition-[opacity,transform] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'
                }`}
              />
              <Moon
                className={`sx-theme-toggle-icon w-4 h-4 text-[var(--sx-on-surface)] absolute transition-[opacity,transform] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isDark ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'
                }`}
              />
            </button>
            <button
              type="button"
              onClick={handleOpenProfileWithHaptic}
              aria-label="Open profile and quick menu"
              className="w-9 h-9 rounded-full sx-glass-control border border-[var(--sx-primary)]/45 overflow-hidden flex items-center justify-center shrink-0"
            >
              {avatar}
            </button>
          </div>
        </div>
      </header>
    );
  }

  // New Header Style #6: Aurora Header (Ambient primary-tinted frosted top bar + action pills)
  if (style === 'auroraHeader') {
    return (
      <header
        className={`${
          previewMode ? 'px-3 sm:px-5 py-2.5' : 'px-4 sm:px-6 py-3.5'
        } w-full bg-gradient-to-r from-[var(--sx-primary)]/14 via-[var(--sx-surface-container)]/60 to-[var(--sx-secondary)]/12 backdrop-blur-2xl border-b border-[var(--sx-outline)] flex items-center justify-between gap-3`}
      >
        <button
          type="button"
          onClick={handleOpenProfileWithHaptic}
          className="flex items-center gap-2.5 sm:gap-3 text-left min-w-0 group"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden border-2 border-[var(--sx-primary)]/60 shadow-[0_0_16px_-4px_var(--sx-primary)] shrink-0">
            {avatar}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-[var(--sx-primary)] truncate">
              {greeting}
            </p>
            <p className="text-sm sm:text-base font-black tracking-tight text-[var(--sx-on-surface)] truncate">
              {username}
            </p>
          </div>
        </button>
        {actionButtons}
      </header>
    );
  }

  // New Header Style #7: Floating Dock (Dual frosted glass capsules for brand & quick actions)
  if (style === 'floatingDock') {
    return (
      <header
        className={`${
          previewMode ? 'px-2.5 sm:px-5 pt-3 pb-2 gap-2' : 'px-4 sm:px-6 pt-5 pb-2 gap-3'
        } flex items-center justify-between`}
      >
        <button
          type="button"
          onClick={handleOpenProfileWithHaptic}
          className="inline-flex items-center gap-2 sm:gap-2.5 px-3 py-1.5 rounded-full sx-glass-panel border border-white/30 dark:border-white/15 shadow-md min-w-0 group"
        >
          <ShizuTvLogo size={18} className="shrink-0" />
          <span className="text-xs sm:text-sm font-black tracking-tight text-[var(--sx-on-surface)] truncate">
            ShizuTv
          </span>
          <span className="hidden sm:inline text-[11px] font-semibold text-[var(--sx-on-surface-muted)]">
            · {username}
          </span>
        </button>

        <div className="inline-flex items-center gap-1 sm:gap-1.5 px-2 py-1 rounded-full sx-glass-panel border border-white/30 dark:border-white/15 shadow-md shrink-0">
          <button
            type="button"
            onClick={handleOpenDiscoveryModeWithHaptic}
            aria-label={isTrackerMode ? `Discovery: ${trackerLabel}` : 'Discovery: Extensions'}
            className="w-8 h-8 rounded-full sx-glass-control flex items-center justify-center text-[var(--sx-primary)] hover:border-[var(--sx-primary)] transition-colors"
          >
            {isTrackerMode ? <Compass className="w-4 h-4" /> : <Puzzle className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => handleNavigate('/calendar')}
            aria-label="Airing Calendar"
            className="w-8 h-8 rounded-full sx-glass-control flex items-center justify-center text-[var(--sx-on-surface)] hover:text-[var(--sx-primary)] transition-colors"
          >
            <Calendar className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleNavigate('/settings')}
            aria-label="Settings"
            className="w-8 h-8 rounded-full sx-glass-control flex items-center justify-center text-[var(--sx-on-surface)] hover:text-[var(--sx-primary)] transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleOpenProfileWithHaptic}
            aria-label="Open profile and quick menu"
            className="w-8 h-8 rounded-full overflow-hidden border border-[var(--sx-primary)]/50 shrink-0"
          >
            {avatar}
          </button>
        </div>
      </header>
    );
  }

  // Kept Style #2: Minimal
  if (style === 'minimal') {
    return (
      <header className="px-4 sm:px-6 pt-5 pb-2 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={handleOpenProfileWithHaptic}
          className="flex items-center gap-2.5 text-left min-w-0"
        >
          <div className="w-8 h-8 rounded-[var(--sx-radius)] overflow-hidden border border-[var(--sx-outline)] shrink-0">
            {avatar}
          </div>
          <span className="font-extrabold text-base truncate">{username}</span>
          <span className="text-xs text-[var(--sx-on-surface-muted)] hidden sm:inline">
            · {trackerLabel}
          </span>
        </button>
        {actionButtons}
      </header>
    );
  }

  // Kept Style #1: Classic
  return (
    <header className="px-4 sm:px-6 pt-5 pb-2 flex items-center justify-between gap-4">
      <button
        type="button"
        onClick={handleOpenProfileWithHaptic}
        className="flex items-center gap-3.5 text-left min-w-0 group"
      >
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden border-2 border-[var(--sx-primary)]/60 group-hover:scale-105 transition-transform shrink-0">
          {avatar}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--sx-on-surface-muted)]">{greeting}</p>
          <h1 className="text-lg sm:text-xl font-extrabold tracking-tight truncate group-hover:text-[var(--sx-primary)] transition-colors">
            {username}
          </h1>
        </div>
      </button>

      {actionButtons}
    </header>
  );
};
