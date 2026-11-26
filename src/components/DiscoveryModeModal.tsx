import React from 'react';
import { createPortal } from 'react-dom';
import { X, Compass, Puzzle, Check } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { TrackerType } from '../types/media';
import { useSlidingPill } from '../hooks/useSlidingPill';
import { triggerHaptic } from '../utils/haptics';

interface DiscoveryModeModalProps {
  open: boolean;
  onClose: () => void;
}

export const DiscoveryModeModal: React.FC<DiscoveryModeModalProps> = ({ open, onClose }) => {
  const { state, updateDiscoveryPrefs } = useApp();
  const { mode, metadataTrackerId } = state.discoveryPrefs;
  const modePill = useSlidingPill<HTMLDivElement>(mode, open);

  if (!open) return null;

  const trackerOptions: { id: TrackerType | null; label: string; desc: string }[] = [
    { id: null, label: 'Auto (Follow Primary)', desc: 'Uses your primary tracker or AniList' },
    { id: 'anilist', label: 'AniList', desc: 'GraphQL catalog with rich seasonal & tag data' },
    { id: 'myanimelist', label: 'MyAnimeList (Jikan)', desc: 'MAL rankings, synopses & episode titles' },
    { id: 'kitsu', label: 'Kitsu', desc: 'Community ratings & streaming catalog' },
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
      aria-label="Discovery Source"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md sx-glass-modal border border-[var(--sx-outline)] rounded-t-2xl sm:rounded-2xl p-5 space-y-5 shadow-2xl sx-sheet-enter"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold">Discovery Source</h2>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Choose how ShizuTv populates Home & Discover feeds
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('nav-pop');
              onClose();
            }}
            className="p-2 rounded-lg hover:bg-[var(--sx-surface-high)] text-[var(--sx-on-surface-muted)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          ref={modePill.containerRef}
          className="relative grid grid-cols-2 gap-2 p-1 rounded-xl sx-glass-control border border-[var(--sx-outline)]/60"
        >
          {modePill.pillRect.ready && (
            <span
              aria-hidden="true"
              style={{
                transform: `translate3d(${modePill.pillRect.left}px, ${modePill.pillRect.top}px, 0)`,
                width: `${modePill.pillRect.width}px`,
                height: `${modePill.pillRect.height}px`,
              }}
              className="sx-pill-glide pointer-events-none absolute left-0 top-0 rounded-lg bg-[var(--sx-primary)] shadow-sm"
            />
          )}
          <button
            ref={modePill.registerItemRef('tracker')}
            type="button"
            onClick={() => {
              triggerHaptic('nav-tab');
              updateDiscoveryPrefs({ mode: 'tracker' });
            }}
            className={`relative z-10 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-colors ${
              mode === 'tracker'
                ? modePill.pillRect.ready
                  ? 'text-[var(--sx-on-primary)]'
                  : 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Tracker Metadata</span>
          </button>
          <button
            ref={modePill.registerItemRef('source')}
            type="button"
            onClick={() => {
              triggerHaptic('nav-tab');
              updateDiscoveryPrefs({ mode: 'source' });
            }}
            className={`relative z-10 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-colors ${
              mode === 'source'
                ? modePill.pillRect.ready
                  ? 'text-[var(--sx-on-primary)]'
                  : 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
            }`}
          >
            <Puzzle className="w-4 h-4" />
            <span>Extensions</span>
          </button>
        </div>

        {mode === 'tracker' ? (
          <div className="space-y-2">
            {trackerOptions.map((opt) => {
              const selected = metadataTrackerId === opt.id;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => {
                    triggerHaptic('menu-select');
                    updateDiscoveryPrefs({ metadataTrackerId: opt.id });
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-colors ${
                    selected
                      ? 'border-[var(--sx-primary)] bg-[var(--sx-primary-container)]/20'
                      : 'border-[var(--sx-outline)] hover:bg-[var(--sx-surface-high)]'
                  }`}
                >
                  <div>
                    <p className="text-sm font-bold">{opt.label}</p>
                    <p className="text-xs text-[var(--sx-on-surface-muted)]">{opt.desc}</p>
                  </div>
                  {selected && <Check className="w-4 h-4 text-[var(--sx-primary)] shrink-0" />}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-4 rounded-xl sx-glass-control border border-[var(--sx-outline)]/60 text-xs text-[var(--sx-on-surface-muted)] space-y-2">
            <p className="font-bold text-[var(--sx-on-surface)]">Extension Mode Active</p>
            <p>
              Home and Discover will display sections from your enabled inbuilt and custom
              extension sources ({state.discoveryPrefs.activeSources.length} active).
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
