import React, { useEffect, useMemo, useState } from 'react';
import {
  Grid3X3,
  Image as ImageIcon,
  LayoutGrid,
  LayoutList,
  List,
  Play,
  Search,
  X,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { EpisodeChapterStyle } from '../data/themePresets';
import { UnifiedEpisode } from '../types/media';
import {
  EPISODE_CHAPTER_STYLE_ORDER,
  formatEpisodeMetaLine,
} from '../utils/episodeChapterStyle';
import { triggerHaptic } from '../utils/haptics';

interface PlayerEpisodeDrawerProps {
  open: boolean;
  episodes: UnifiedEpisode[];
  activeIndex: number;
  compact?: boolean;
  onSelectEpisode: (index: number) => void;
  onClose: () => void;
}

const POPUP_CHUNK_SIZE = 50;

const STYLE_LABELS: Record<EpisodeChapterStyle, string> = {
  classic: 'Classic',
  grid: 'Grid',
  box: 'Box',
  compact: 'Compact',
  cover: 'Cover',
};

const STYLE_ICONS: Record<EpisodeChapterStyle, React.ComponentType<{ className?: string }>> = {
  classic: LayoutList,
  grid: LayoutGrid,
  box: Grid3X3,
  compact: List,
  cover: ImageIcon,
};

export const PlayerEpisodeDrawer: React.FC<PlayerEpisodeDrawerProps> = ({
  open,
  episodes,
  activeIndex,
  compact = false,
  onSelectEpisode,
  onClose,
}) => {
  const { state, updateUiPrefs } = useApp();
  const [query, setQuery] = useState('');
  const [chunkIndex, setChunkIndex] = useState(0);

  const activeStyle: EpisodeChapterStyle = state.uiPrefs.episodeChapterStyle || 'classic';

  const chunks = useMemo(() => {
    if (episodes.length <= POPUP_CHUNK_SIZE) return [];
    const list: Array<{ start: number; end: number; label: string }> = [];
    for (let i = 0; i < episodes.length; i += POPUP_CHUNK_SIZE) {
      const startNum = episodes[i]?.number ?? i + 1;
      const endIdx = Math.min(episodes.length - 1, i + POPUP_CHUNK_SIZE - 1);
      const endNum = episodes[endIdx]?.number ?? endIdx + 1;
      list.push({ start: i, end: endIdx + 1, label: `${startNum}-${endNum}` });
    }
    return list;
  }, [episodes]);

  // Keep the popup chunk aligned with the currently playing episode when opened
  useEffect(() => {
    if (!open || chunks.length === 0) return;
    const nextChunk = Math.max(
      0,
      Math.min(chunks.length - 1, Math.floor(activeIndex / POPUP_CHUNK_SIZE)),
    );
    setChunkIndex(nextChunk);
  }, [open, activeIndex, chunks.length]);

  const visibleEpisodes = useMemo(() => {
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return episodes.filter(
        (ep) => ep.title.toLowerCase().includes(q) || String(ep.number).includes(q),
      );
    }
    if (chunks.length > 0) {
      const chunk = chunks[chunkIndex] ?? chunks[0];
      return episodes.slice(chunk.start, chunk.end);
    }
    return episodes;
  }, [episodes, query, chunks, chunkIndex]);

  if (!open) return null;

  const isWideStyle = activeStyle === 'grid' || activeStyle === 'cover';

  const listContainerClass = (() => {
    if (activeStyle === 'box') {
      return compact
        ? 'p-2.5 grid grid-cols-5 sm:grid-cols-6 gap-1.5 content-start'
        : 'p-3.5 grid grid-cols-4 sm:grid-cols-5 gap-2 content-start';
    }
    if (activeStyle === 'grid') {
      return compact
        ? 'p-2 grid grid-cols-2 sm:grid-cols-3 gap-2 content-start'
        : 'p-3 grid grid-cols-2 gap-2.5 content-start';
    }
    if (activeStyle === 'compact') {
      return 'm-2.5 rounded-2xl border border-white/10 bg-white/5 divide-y divide-white/10 overflow-hidden';
    }
    if (activeStyle === 'cover') {
      return compact
        ? 'p-2 grid grid-cols-1 sm:grid-cols-2 gap-2 content-start'
        : 'p-3 space-y-2';
    }
    return compact
      ? 'p-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5 content-start'
      : 'p-3 space-y-1.5';
  })();

  return (
    <div
      data-no-gesture="true"
      className="absolute inset-0 z-40 flex items-center justify-center sm:justify-end p-2 sm:p-4"
    >
      {/* Frosted Blur Backdrop */}
      <button
        type="button"
        aria-label="Close episode drawer"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="sx-backdrop-enter absolute inset-0 w-full h-full bg-black/45 backdrop-blur-md cursor-default"
      />

      {/* Floating Frosted Glass Popup Card fitted cleanly inside the Player */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Episode List"
        data-testid="player-episode-drawer"
        data-ep-style={activeStyle}
        onClick={(e) => e.stopPropagation()}
        className={`sx-player-drawer-enter relative z-10 flex flex-col overflow-hidden bg-zinc-950/82 backdrop-blur-2xl backdrop-saturate-150 border border-white/20 ring-1 ring-inset ring-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.65)] text-white transition-[max-width] duration-200 ${
          compact
            ? 'w-full h-full rounded-2xl'
            : `${isWideStyle ? 'w-full max-w-[420px]' : 'w-full max-w-[368px]'} max-h-[min(80%,560px)] sm:mt-10 sm:mb-12 rounded-3xl`
        }`}
      >
        {/* Header + Search Row */}
        <div
          className={`flex items-center justify-between gap-2 border-b border-white/12 shrink-0 ${
            compact ? 'px-2.5 py-2' : 'px-4 py-3'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0 shrink-0">
            <span
              aria-hidden="true"
              className="w-2 h-2 rounded-full bg-[var(--sx-player-accent)] shrink-0"
            />
            <h3 className={`${compact ? 'text-[11px] sm:text-xs' : 'text-sm'} font-extrabold whitespace-nowrap`}>
              Episodes ({episodes.length})
            </h3>
          </div>

          <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0 max-w-[56%] sm:max-w-[62%]">
            <div className="relative flex-1 min-w-[74px] max-w-[180px]">
              <Search className="w-3 h-3 text-white/55 absolute left-2.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Jump ep..."
                aria-label="Jump to episode"
                className={`w-full pl-7 pr-2 rounded-full bg-white/12 border border-white/15 text-[11px] text-white placeholder:text-white/50 focus:outline-none focus:border-[var(--sx-player-accent)] ${
                  compact ? 'py-1' : 'py-1.5'
                }`}
              />
            </div>

            <button
              type="button"
              aria-label="Close episodes"
              onClick={() => {
                triggerHaptic('nav-pop');
                onClose();
              }}
              className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Interactive Episode Style Switcher Bar */}
        <div
          data-testid="drawer-ep-style-bar"
          className={`flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-white/10 bg-white/[0.03] shrink-0 ${
            compact ? 'px-2.5 py-1.5' : 'px-3.5 py-2'
          }`}
        >
          {EPISODE_CHAPTER_STYLE_ORDER.map((styleId) => {
            const Icon = STYLE_ICONS[styleId];
            const selected = activeStyle === styleId;
            return (
              <button
                key={styleId}
                type="button"
                data-testid={`drawer-ep-style-${styleId}`}
                aria-pressed={selected}
                onClick={() => {
                  triggerHaptic('menu-select');
                  updateUiPrefs({ episodeChapterStyle: styleId });
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold whitespace-nowrap transition-all shrink-0 ${
                  selected
                    ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] shadow-sm'
                    : 'bg-white/8 text-white/75 hover:bg-white/16 hover:text-white'
                }`}
              >
                <Icon className="w-3 h-3 shrink-0" />
                <span>{STYLE_LABELS[styleId]}</span>
              </button>
            );
          })}
        </div>

        {/* Chunk Selector when > 50 episodes */}
        {chunks.length > 0 && !query.trim() && (
          <div
            className={`flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b border-white/10 shrink-0 ${
              compact ? 'px-2.5 py-1.5' : 'px-3.5 py-2'
            }`}
          >
            {chunks.map((c, idx) => {
              const active = idx === chunkIndex;
              return (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => {
                    triggerHaptic('menu-select');
                    setChunkIndex(idx);
                  }}
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold whitespace-nowrap tabular-nums transition-colors ${
                    active
                      ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] shadow-sm'
                      : 'bg-white/10 text-white/75 hover:bg-white/20 hover:text-white'
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Episode Items */}
        <div className={`flex-1 overflow-y-auto ${activeStyle === 'compact' ? 'py-1' : ''}`}>
          {visibleEpisodes.length === 0 ? (
            <p className="py-8 px-4 text-center text-xs text-white/60 font-semibold">
              No episodes match &ldquo;{query}&rdquo;
            </p>
          ) : (
            <div className={listContainerClass}>
              {visibleEpisodes.map((ep, idx) => {
                const realIdx = episodes.findIndex((item) => item.id === ep.id);
                const isActive = realIdx === activeIndex;
                const handlePick = () => {
                  triggerHaptic('menu-select');
                  onSelectEpisode(realIdx >= 0 ? realIdx : 0);
                  onClose();
                };

                if (activeStyle === 'box') {
                  return (
                    <button
                      key={ep.id}
                      type="button"
                      data-testid={`drawer-ep-${ep.number}`}
                      title={`EP ${ep.number}: ${ep.title}`}
                      aria-label={`Episode ${ep.number}: ${ep.title}`}
                      onClick={handlePick}
                      style={{ animationDelay: `${Math.min(idx, 12) * 12}ms` }}
                      className={`sx-card-animate aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 border text-center transition-all ${
                        isActive
                          ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-transparent shadow-md font-black'
                          : 'bg-white/8 hover:bg-white/18 border-white/12 text-white font-extrabold'
                      }`}
                    >
                      <span className="text-xs font-mono-tabular leading-none">{ep.number}</span>
                      {isActive && <Play className="w-2.5 h-2.5 fill-current" />}
                    </button>
                  );
                }

                if (activeStyle === 'grid') {
                  return (
                    <button
                      key={ep.id}
                      type="button"
                      data-testid={`drawer-ep-${ep.number}`}
                      onClick={handlePick}
                      style={{ animationDelay: `${Math.min(idx, 12) * 14}ms` }}
                      className={`sx-card-animate group rounded-2xl overflow-hidden text-left border transition-all flex flex-col ${
                        isActive
                          ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-transparent shadow-md'
                          : 'bg-white/8 hover:bg-white/14 border-white/12 text-white'
                      }`}
                    >
                      <div className="relative aspect-video w-full bg-black/50 overflow-hidden">
                        {ep.thumbnail ? (
                          <img
                            src={ep.thumbnail}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/10 to-white/5 text-xs font-black text-white/40">
                            EP {ep.number}
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/80 to-transparent" />
                        <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/75 text-[9.5px] font-mono-tabular font-black text-white">
                          EP {ep.number}
                        </span>
                        {isActive && (
                          <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] flex items-center justify-center shadow">
                            <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                          </span>
                        )}
                      </div>
                      <div className="p-2 min-w-0">
                        <p className="text-[11px] font-bold leading-snug line-clamp-2">
                          {ep.title}
                        </p>
                      </div>
                    </button>
                  );
                }

                if (activeStyle === 'cover') {
                  return (
                    <button
                      key={ep.id}
                      type="button"
                      data-testid={`drawer-ep-${ep.number}`}
                      onClick={handlePick}
                      style={{ animationDelay: `${Math.min(idx, 12) * 14}ms` }}
                      className={`sx-card-animate w-full flex items-center gap-2.5 p-2 rounded-2xl text-left border transition-all ${
                        isActive
                          ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-transparent shadow-md'
                          : 'bg-white/8 hover:bg-white/15 border-white/12 text-white'
                      }`}
                    >
                      <div className="relative w-24 aspect-video rounded-xl overflow-hidden bg-black/50 shrink-0">
                        {ep.thumbnail ? (
                          <img
                            src={ep.thumbnail}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-white/10 text-[10px] font-black text-white/50">
                            EP {ep.number}
                          </div>
                        )}
                        {isActive && (
                          <span className="absolute inset-0 bg-black/45 flex items-center justify-center">
                            <Play className="w-4 h-4 fill-white text-white" />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11.5px] font-extrabold truncate">
                          {ep.number}. {ep.title}
                        </p>
                        <p
                          className={`text-[10px] mt-0.5 truncate ${
                            isActive ? 'opacity-85' : 'text-white/60'
                          }`}
                        >
                          {formatEpisodeMetaLine(ep)}
                        </p>
                      </div>
                    </button>
                  );
                }

                if (activeStyle === 'compact') {
                  return (
                    <button
                      key={ep.id}
                      type="button"
                      data-testid={`drawer-ep-${ep.number}`}
                      onClick={handlePick}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${
                        isActive
                          ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] font-extrabold'
                          : 'hover:bg-white/10 text-white/90'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[11px] font-mono-tabular font-black w-7 shrink-0 opacity-85">
                          {ep.number}
                        </span>
                        <span className="text-[11px] font-semibold truncate">{ep.title}</span>
                      </div>
                      {isActive && <Play className="w-3 h-3 fill-current shrink-0" />}
                    </button>
                  );
                }

                // Classic default row
                return (
                  <button
                    key={ep.id}
                    type="button"
                    data-testid={`drawer-ep-${ep.number}`}
                    onClick={handlePick}
                    style={{ animationDelay: `${Math.min(idx, 12) * 16}ms` }}
                    className={`sx-card-animate w-full flex items-center justify-between gap-2 rounded-xl text-left transition-all border ${
                      compact ? 'px-2.5 py-1.5' : 'px-3 py-2.5'
                    } ${
                      isActive
                        ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-transparent shadow-md font-extrabold'
                        : 'bg-white/8 hover:bg-white/16 border-white/10 text-white/90'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] font-mono-tabular font-black shrink-0 opacity-90">
                        {ep.number}
                      </span>
                      <span className="text-[11px] font-semibold truncate">{ep.title}</span>
                    </div>
                    {isActive && <Play className="w-3 h-3 fill-current shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
