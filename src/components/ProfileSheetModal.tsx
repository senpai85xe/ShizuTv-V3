import React from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  Calendar,
  ChevronRight,
  Compass,
  Download,
  Eye,
  EyeOff,
  Palette,
  Puzzle,
  Settings,
  User,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { SmartImage } from './SmartImage';
import { suppressNextRouteHaptic, triggerHaptic } from '../utils/haptics';

interface ProfileSheetModalProps {
  open: boolean;
  onClose: () => void;
  onOpenLogin: () => void;
  onOpenServicePicker: () => void;
}

export const ProfileSheetModal: React.FC<ProfileSheetModalProps> = ({
  open,
  onClose,
  onOpenLogin,
  onOpenServicePicker,
}) => {
  const navigate = useNavigate();
  const { state, effectiveMetadataTracker, updateContentPrefs } = useApp();

  if (!open) return null;

  const profile = state.profiles[state.primaryTracker] || state.profiles.local;
  const username = profile?.username || 'Guest';
  const isLoggedIn = Boolean(state.anilistToken && state.primaryTracker === 'anilist');
  const incognito = Boolean(state.contentPrefs.incognitoMode);

  const serviceLabel =
    state.discoveryPrefs.mode === 'source'
      ? 'Extensions'
      : effectiveMetadataTracker === 'myanimelist'
        ? 'MyAnimeList'
        : effectiveMetadataTracker === 'kitsu'
          ? 'Kitsu'
          : 'AniList';

  const goTo = (path: string) => {
    triggerHaptic('menu-select');
    suppressNextRouteHaptic();
    onClose();
    navigate(path);
  };

  const menuRows: {
    id: string;
    label: string;
    sublabel?: string;
    icon: React.ReactNode;
    onClick: () => void;
    trailing?: React.ReactNode;
  }[] = [
    {
      id: 'service',
      label: 'Change Service',
      sublabel: serviceLabel,
      icon: <Compass className="w-4 h-4" />,
      onClick: () => {
        triggerHaptic('menu-select');
        onClose();
        onOpenServicePicker();
      },
    },
    {
      id: 'extensions',
      label: 'Extensions',
      icon: <Puzzle className="w-4 h-4" />,
      onClick: () => goTo('/settings/extensions'),
    },
    {
      id: 'downloads',
      label: 'Downloads',
      icon: <Download className="w-4 h-4" />,
      onClick: () => goTo('/downloads'),
    },
    {
      id: 'calendar',
      label: 'Airing Calendar',
      icon: <Calendar className="w-4 h-4" />,
      onClick: () => goTo('/calendar'),
    },
    {
      id: 'appearance',
      label: 'Header & UI Style',
      icon: <Palette className="w-4 h-4" />,
      onClick: () => goTo('/settings/ui'),
    },
    {
      id: 'incognito',
      label: 'Incognito Mode',
      sublabel: incognito ? 'History paused' : 'Off',
      icon: incognito ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />,
      onClick: () => {
        triggerHaptic('menu-select');
        updateContentPrefs({ incognitoMode: !incognito });
      },
      trailing: (
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
            incognito
              ? 'sx-glass-active font-extrabold'
              : 'sx-glass-control text-[var(--sx-on-surface-muted)]'
          }`}
        >
          {incognito ? 'On' : 'Off'}
        </span>
      ),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="w-4 h-4" />,
      onClick: () => goTo('/settings'),
    },
  ];

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-md p-0 sm:p-4 sx-backdrop-enter"
      onClick={() => {
        triggerHaptic('nav-pop');
        onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Account and Quick Menu"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-[var(--sx-surface-container)]/85 backdrop-blur-2xl backdrop-saturate-150 border border-[var(--sx-outline)] ring-1 ring-inset ring-white/10 rounded-t-[28px] sm:rounded-[28px] p-4 sm:p-5 space-y-3.5 shadow-2xl max-h-[88dvh] overflow-y-auto no-scrollbar sx-sheet-enter"
      >
        <div className="w-10 h-1 rounded-full bg-[var(--sx-on-surface-muted)]/35 mx-auto mb-1" />

        {/* Top User Card */}
        <div className="rounded-2xl border border-[var(--sx-outline)] bg-[var(--sx-surface)]/55 p-3.5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onOpenLogin}
            className="flex items-center gap-3.5 text-left min-w-0 flex-1 group"
          >
            <div className="w-12 h-12 rounded-full border-2 border-[var(--sx-primary)]/70 bg-[var(--sx-primary)]/12 overflow-hidden flex items-center justify-center shrink-0">
              {profile?.avatarUrl ? (
                <SmartImage
                  src={profile.avatarUrl}
                  alt={username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-5 h-5 text-[var(--sx-on-surface)]" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-base font-extrabold tracking-tight truncate">
                {username}
              </div>
              <div className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--sx-primary)] group-hover:underline mt-0.5">
                <span>{isLoggedIn ? 'Manage tracker' : 'Tap to login'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => goTo('/calendar')}
            title="Airing Calendar & Schedule"
            aria-label="Airing Calendar"
            className="w-10 h-10 rounded-xl sx-glass-control hover:bg-[var(--sx-primary)]/15 border border-[var(--sx-outline)] flex items-center justify-center text-[var(--sx-on-surface)] transition-colors shrink-0"
          >
            <Bell className="w-4 h-4" />
          </button>
        </div>

        {/* Grouped Menu List */}
        <div className="rounded-2xl border border-[var(--sx-outline)] bg-[var(--sx-surface)]/45 divide-y divide-[var(--sx-outline)] overflow-hidden">
          {menuRows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={row.onClick}
              className="w-full px-3.5 py-3 flex items-center justify-between gap-3 hover:bg-[var(--sx-surface-high)]/70 active:bg-[var(--sx-surface-high)] transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-xl bg-[var(--sx-primary)]/15 text-[var(--sx-primary)] flex items-center justify-center shrink-0">
                  {row.icon}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[var(--sx-on-surface)] truncate">
                    {row.label}
                  </div>
                  {row.sublabel && (
                    <div className="text-[11px] font-medium text-[var(--sx-on-surface-muted)] truncate">
                      {row.sublabel}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {row.trailing}
                <ChevronRight className="w-4 h-4 text-[var(--sx-on-surface-muted)]" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
