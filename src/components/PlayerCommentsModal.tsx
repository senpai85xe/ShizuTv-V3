import React, { useMemo, useState } from 'react';
import { MessageSquare, Send, ThumbsUp, X } from 'lucide-react';
import { useApp } from '../store/AppContext';
import {
  FullscreenCommentScope,
  getCommentsScopeKey,
} from '../utils/inlinePlayer';

interface PlayerCommentsModalProps {
  open: boolean;
  mediaId: string;
  mediaTitle: string;
  episodeNumber: number;
  episodeTitle: string;
  onClose: () => void;
}

export const PlayerCommentsModal: React.FC<PlayerCommentsModalProps> = ({
  open,
  mediaId,
  mediaTitle,
  episodeNumber,
  episodeTitle,
  onClose,
}) => {
  const { state, addComment, likeComment } = useApp();
  const [scope, setScope] = useState<FullscreenCommentScope>('episode');
  const [draft, setDraft] = useState('');
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});

  const epKey = getCommentsScopeKey(mediaId, 'episode', episodeNumber);
  const seriesKey = getCommentsScopeKey(mediaId, 'series', episodeNumber);
  const epComments = useMemo(() => state.comments[epKey] || [], [state.comments, epKey]);
  const seriesComments = useMemo(
    () => state.comments[seriesKey] || [],
    [state.comments, seriesKey],
  );

  if (!open) return null;

  const activeKey = scope === 'episode' ? epKey : seriesKey;
  const activeComments = scope === 'episode' ? epComments : seriesComments;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    addComment(activeKey, draft, isSpoiler);
    setDraft('');
    setIsSpoiler(false);
  };

  return (
    <div
      data-no-gesture="true"
      data-testid="fs-comments-modal"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      className="sx-backdrop-enter absolute inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-md p-2.5 sm:p-5"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Episode and series comments"
        onClick={(e) => e.stopPropagation()}
        className="sx-comments-sheet-enter w-full max-w-lg max-h-[82vh] flex flex-col rounded-3xl bg-zinc-950/92 backdrop-blur-2xl backdrop-saturate-150 border border-white/15 ring-1 ring-inset ring-white/10 text-white shadow-2xl overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[var(--sx-player-accent)] shrink-0">
              <MessageSquare className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-white truncate">Comments</h3>
              <p className="text-[11px] font-medium text-white/60 truncate">
                {scope === 'episode'
                  ? `EP ${episodeNumber} · ${episodeTitle}`
                  : `${mediaTitle} · Full Series`}
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Close comments"
            data-testid="fs-comments-close-btn"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scope Segmented Switcher (Episode vs Full Series) */}
        <div className="px-4 pt-3 shrink-0">
          <div
            role="tablist"
            aria-label="Comment scope"
            className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-white/8 border border-white/10"
          >
            <button
              type="button"
              role="tab"
              aria-selected={scope === 'episode'}
              data-testid="fs-comments-tab-episode"
              onClick={() => setScope('episode')}
              className={`py-1.5 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 ${
                scope === 'episode'
                  ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] shadow-sm'
                  : 'text-white/75 hover:text-white hover:bg-white/8'
              }`}
            >
              <span>Episode {episodeNumber}</span>
              <span className="tabular-nums opacity-75">({epComments.length})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scope === 'series'}
              data-testid="fs-comments-tab-series"
              onClick={() => setScope('series')}
              className={`py-1.5 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 ${
                scope === 'series'
                  ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] shadow-sm'
                  : 'text-white/75 hover:text-white hover:bg-white/8'
              }`}
            >
              <span>All Series</span>
              <span className="tabular-nums opacity-75">({seriesComments.length})</span>
            </button>
          </div>
        </div>

        {/* Composer */}
        <form onSubmit={handleSubmit} className="px-4 pt-3 pb-2 space-y-2 shrink-0">
          <div className="flex items-center gap-2">
            <input
              type="text"
              data-testid="fs-comments-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                scope === 'episode'
                  ? `Share thoughts on Episode ${episodeNumber}...`
                  : `Share thoughts on ${mediaTitle}...`
              }
              className="flex-1 min-w-0 px-3.5 py-2 rounded-full bg-white/10 border border-white/15 text-xs font-medium text-white placeholder:text-white/45 focus:outline-none focus:border-[var(--sx-player-accent)]"
            />
            <button
              type="submit"
              data-testid="fs-comments-submit-btn"
              disabled={!draft.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] text-xs font-extrabold disabled:opacity-45 shrink-0 transition-opacity"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Post</span>
            </button>
          </div>
          <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-white/65 cursor-pointer select-none px-1">
            <input
              type="checkbox"
              checked={isSpoiler}
              onChange={(e) => setIsSpoiler(e.target.checked)}
              className="accent-[var(--sx-player-accent)]"
            />
            <span>Mark as spoiler</span>
          </label>
        </form>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2.5">
          {activeComments.length === 0 ? (
            <div className="py-8 text-center space-y-1.5">
              <MessageSquare className="w-6 h-6 mx-auto text-white/40" />
              <p className="text-xs font-extrabold text-white/90">
                {scope === 'episode'
                  ? `No comments on Episode ${episodeNumber} yet`
                  : `No series comments for ${mediaTitle} yet`}
              </p>
              <p className="text-[11px] text-white/55">
                Start the conversation while watching.
              </p>
            </div>
          ) : (
            activeComments.map((c) => {
              const hidden = c.spoiler && !revealedIds[c.id];
              const initial = (c.author || 'U').slice(0, 1).toUpperCase();
              return (
                <div
                  key={c.id}
                  data-testid="fs-comment-item"
                  className="rounded-2xl bg-white/[0.06] border border-white/10 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-7 h-7 rounded-full bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] flex items-center justify-center text-[11px] font-black shrink-0">
                        {initial}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-white truncate">
                          {c.author}
                        </p>
                        <p className="text-[10px] text-white/55">
                          {new Date(c.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {c.spoiler && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-extrabold uppercase shrink-0">
                        Spoiler
                      </span>
                    )}
                  </div>

                  {hidden ? (
                    <button
                      type="button"
                      onClick={() =>
                        setRevealedIds((prev) => ({ ...prev, [c.id]: true }))
                      }
                      className="w-full py-1.5 px-3 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 text-[11px] font-bold text-white/75 text-left transition-colors"
                    >
                      Tap to reveal spoiler comment
                    </button>
                  ) : (
                    <p className="text-xs text-white/90 leading-relaxed">{c.body}</p>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => likeComment(activeKey, c.id)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-white/65 hover:text-[var(--sx-player-accent)] transition-colors"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span className="tabular-nums">{c.likes}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
