import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ArrowBigDown,
  ArrowBigUp,
  ArrowLeft,
  Bold,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pin,
  Plus,
  Quote,
  Search,
  Send,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { searchDiscoveryMedia } from '../services/discoveryService';
import {
  addCommunityComment,
  createCommunityPost,
  deleteCommunityPost,
  fetchCommunityPosts,
  recordCommunityPostView,
  voteCommunityPost,
} from '../services/communityService';
import {
  BodyBlock,
  COMMUNITY_CATEGORIES,
  COMMUNITY_LABELS,
  COMMUNITY_RULES,
  CommunityCategory,
  CommunityLabel,
  CommunityLinkedAnime,
  CommunityPost,
  CommunitySort,
  filterAndSortCommunityPosts,
  formatRelativeTimeAgo,
  getCategoryMeta,
  parseCommunityBodyBlocks,
  validateCommunityPostDraft,
} from '../utils/community';
import {
  getOrCreateWatchPartyClientId,
  resolveDefaultDisplayName,
  resolveDefaultHostAvatar,
} from '../utils/watchParty';
import { UnifiedMedia } from '../types/media';
import { SmartImage } from '../components/SmartImage';

type CommunityViewMode = 'feed' | 'detail';

const glassCardClass =
  'bg-white/32 dark:bg-white/[0.06] backdrop-blur-2xl backdrop-saturate-150 border border-white/50 dark:border-white/14 ring-1 ring-inset ring-white/25 dark:ring-white/8 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.16)]';

const glassControlClass =
  'bg-white/24 dark:bg-white/[0.05] backdrop-blur-xl border border-white/45 dark:border-white/12 ring-1 ring-inset ring-white/20 dark:ring-white/6';

function getLabelPillClasses(label?: CommunityLabel | null): string {
  switch (label) {
    case 'resolved':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
    case 'planned':
      return 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30';
    case 'bug':
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';
    case 'duplicate':
      return 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30';
    default:
      return 'bg-[var(--sx-surface-high)]/70 text-[var(--sx-on-surface-muted)] border-[var(--sx-outline)]';
  }
}

function getCategoryChipClasses(category: CommunityCategory): string {
  if (category === 'announcements') {
    return 'bg-amber-400/22 text-amber-800 dark:text-amber-300 border-amber-400/40';
  }
  return 'bg-[var(--sx-surface-high)]/75 text-[var(--sx-on-surface-muted)] border-[var(--sx-outline)]';
}

const CommunityBodyRenderer: React.FC<{ body: string; compact?: boolean }> = ({
  body,
  compact = false,
}) => {
  const [revealedSpoilers, setRevealedSpoilers] = useState<Record<string, boolean>>({});
  const blocks: BodyBlock[] = useMemo(() => parseCommunityBodyBlocks(body), [body]);

  if (compact) {
    const plain = body.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\|\|[^|]+\|\|/g, '[spoiler]');
    return (
      <p className="text-xs sm:text-sm text-[var(--sx-on-surface-muted)] line-clamp-2 leading-relaxed">
        {plain}
      </p>
    );
  }

  return (
    <div className="space-y-2.5 text-sm text-[var(--sx-on-surface)] leading-relaxed">
      {blocks.map((block, bIdx) => {
        const inner = block.tokens.map((tok, tIdx) => {
          if (tok.kind === 'bold') {
            return (
              <strong key={tIdx} className="font-extrabold text-[var(--sx-on-surface)]">
                {tok.text}
              </strong>
            );
          }
          if (tok.kind === 'spoiler') {
            const key = `${bIdx}-${tIdx}`;
            const revealed = Boolean(revealedSpoilers[key]);
            return (
              <button
                key={tIdx}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRevealedSpoilers((prev) => ({ ...prev, [key]: !prev[key] }));
                }}
                title={revealed ? 'Hide spoiler' : 'Click to reveal spoiler'}
                className={`inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-md text-xs font-semibold transition-colors ${
                  revealed
                    ? 'bg-[var(--sx-surface-high)] text-[var(--sx-on-surface)]'
                    : 'bg-[var(--sx-on-surface)]/85 text-transparent select-none hover:bg-[var(--sx-on-surface)]/70'
                }`}
              >
                {tok.text}
              </button>
            );
          }
          return <React.Fragment key={tIdx}>{tok.text}</React.Fragment>;
        });

        if (block.kind === 'quote') {
          return (
            <blockquote
              key={bIdx}
              className="pl-3.5 py-1.5 border-l-2 border-[var(--sx-primary)] bg-[var(--sx-primary)]/6 rounded-r-xl text-[var(--sx-on-surface-muted)] italic"
            >
              {inner}
            </blockquote>
          );
        }
        return <p key={bIdx}>{inner}</p>;
      })}
    </div>
  );
};

export const CommunityPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, effectiveMetadataTracker } = useApp();
  const roundness = `${state.themePrefs.uiRoundness}px`;
  const clientId = useMemo(() => getOrCreateWatchPartyClientId(), []);
  const displayName = resolveDefaultDisplayName(state.profiles);
  const avatarUrl = resolveDefaultHostAvatar(state.profiles);

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<CommunityViewMode>('feed');
  const [newPostModalOpen, setNewPostModalOpen] = useState(false);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [openMenuPostId, setOpenMenuPostId] = useState<string | null>(null);

  // Feed filters
  const [categoryFilter, setCategoryFilter] = useState<CommunityCategory | 'all'>('all');
  const [labelFilter, setLabelFilter] = useState<CommunityLabel | 'any'>('any');
  const [sortBy, setSortBy] = useState<CommunitySort>('hot');
  const [searchQuery, setSearchQuery] = useState('');

  // Composer state
  const [draftCategory, setDraftCategory] = useState<CommunityCategory | ''>('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [draftAnime, setDraftAnime] = useState<CommunityLinkedAnime[]>([]);
  const [draftPreview, setDraftPreview] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [submittingPost, setSubmittingPost] = useState(false);

  // Anime search for New Post
  const [animeQuery, setAnimeQuery] = useState('');
  const [animeResults, setAnimeResults] = useState<UnifiedMedia[]>([]);
  const [searchingAnime, setSearchingAnime] = useState(false);
  const bodyInputRef = useRef<HTMLTextAreaElement | null>(null);

  // Post Detail comment draft
  const [commentDraft, setCommentDraft] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const loadPosts = useCallback(async () => {
    try {
      setErrorMsg(null);
      const list = await fetchCommunityPosts();
      setPosts(list);
    } catch {
      setErrorMsg('Could not load community posts right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  // Lock background scroll & close New Post popup on Escape
  useEffect(() => {
    if (!newPostModalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNewPostModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [newPostModalOpen]);

  // Debounced anime search inside New Post composer
  useEffect(() => {
    const q = animeQuery.trim();
    if (!q || !newPostModalOpen) {
      setAnimeResults([]);
      setSearchingAnime(false);
      return;
    }
    let cancelled = false;
    setSearchingAnime(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await searchDiscoveryMedia(effectiveMetadataTracker, {
          query: q,
          type: 'ANIME',
          adultMode: state.contentPrefs.adultContentMode,
        });
        if (!cancelled) {
          setAnimeResults(res.items.slice(0, 6));
        }
      } catch {
        if (!cancelled) setAnimeResults([]);
      } finally {
        if (!cancelled) setSearchingAnime(false);
      }
    }, 260);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [animeQuery, newPostModalOpen, effectiveMetadataTracker, state.contentPrefs.adultContentMode]);

  const filteredPosts = useMemo(
    () =>
      filterAndSortCommunityPosts(posts, {
        category: categoryFilter,
        label: labelFilter,
        sort: sortBy,
        search: searchQuery,
      }),
    [posts, categoryFilter, labelFilter, sortBy, searchQuery],
  );

  const activePost = useMemo(
    () => posts.find((p) => p.id === activePostId) ?? null,
    [posts, activePostId],
  );

  const handleVote = async (post: CommunityPost, direction: -1 | 1) => {
    const nextVote: -1 | 0 | 1 = post.userVote === direction ? 0 : direction;
    // Optimistic update
    const prevVote = post.userVote ?? 0;
    const scoreDelta = nextVote - prevVote;
    setPosts((curr) =>
      curr.map((p) =>
        p.id === post.id ? { ...p, userVote: nextVote, score: p.score + scoreDelta } : p,
      ),
    );
    try {
      const updated = await voteCommunityPost(post.id, nextVote);
      setPosts((curr) => curr.map((p) => (p.id === updated.id ? updated : p)));
    } catch {
      // Revert if vote fails
      setPosts((curr) => curr.map((p) => (p.id === post.id ? post : p)));
    }
  };

  const handleOpenPost = async (post: CommunityPost) => {
    setOpenMenuPostId(null);
    setActivePostId(post.id);
    setViewMode('detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const updated = await recordCommunityPostView(post.id);
    if (updated) {
      setPosts((curr) => curr.map((p) => (p.id === updated.id ? updated : p)));
    }
  };

  const handleOpenNewPost = () => {
    setDraftError(null);
    setDraftPreview(false);
    setNewPostModalOpen(true);
  };

  const handleInsertFormatting = (prefix: string, suffix: string, placeholder: string) => {
    const el = bodyInputRef.current;
    if (!el) {
      setDraftBody((prev) => `${prev}${prev ? ' ' : ''}${prefix}${placeholder}${suffix}`);
      return;
    }
    const start = el.selectionStart ?? draftBody.length;
    const end = el.selectionEnd ?? draftBody.length;
    const selected = draftBody.slice(start, end) || placeholder;
    const nextText =
      draftBody.slice(0, start) + prefix + selected + suffix + draftBody.slice(end);
    setDraftBody(nextText);
    window.requestAnimationFrame(() => {
      el.focus();
      const cursorPos = start + prefix.length + selected.length;
      el.setSelectionRange(cursorPos, cursorPos);
    });
  };

  const handleAddLinkedAnime = (media: UnifiedMedia) => {
    if (draftAnime.length >= 3) return;
    if (draftAnime.some((item) => String(item.id) === String(media.id))) return;
    const title =
      media.title.english || media.title.romaji || media.title.native || 'Anime';
    setDraftAnime((prev) => [
      ...prev,
      { id: media.id, title, cover: media.cover ?? media.banner ?? null },
    ]);
    setAnimeQuery('');
    setAnimeResults([]);
  };

  const handleSubmitNewPost = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErr = validateCommunityPostDraft({
      category: draftCategory,
      title: draftTitle,
      body: draftBody,
      linkedAnime: draftAnime,
    });
    if (validationErr) {
      setDraftError(validationErr);
      return;
    }
    setSubmittingPost(true);
    setDraftError(null);
    try {
      const created = await createCommunityPost({
        category: draftCategory as CommunityCategory,
        title: draftTitle.trim(),
        body: draftBody.trim(),
        linkedAnime: draftAnime,
        authorName: displayName,
        authorAvatar: avatarUrl,
      });
      setPosts((curr) => [created, ...curr]);
      setDraftCategory('');
      setDraftTitle('');
      setDraftBody('');
      setDraftAnime([]);
      setDraftPreview(false);
      setActivePostId(created.id);
      setNewPostModalOpen(false);
      setViewMode('feed');
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Failed to publish post');
    } finally {
      setSubmittingPost(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePost || !commentDraft.trim()) return;
    setSubmittingComment(true);
    try {
      const updated = await addCommunityComment({
        postId: activePost.id,
        body: commentDraft.trim(),
        authorName: displayName,
        authorAvatar: avatarUrl,
      });
      setPosts((curr) => curr.map((p) => (p.id === updated.id ? updated : p)));
      setCommentDraft('');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await deleteCommunityPost(postId);
      setPosts((curr) => curr.filter((p) => p.id !== postId));
      setOpenMenuPostId(null);
      if (activePostId === postId) {
        setActivePostId(null);
        setViewMode('feed');
      }
    } catch {
      // Ignore unauthorized or failed deletes
    }
  };

  const newPostModalNode =
    newPostModalOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            data-testid="community-new-post-backdrop"
            onClick={() => setNewPostModalOpen(false)}
            className="sx-backdrop-enter fixed inset-0 z-[120] flex items-center justify-center bg-black/30 backdrop-blur-md p-3 sm:p-5"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="community-new-post-title"
              data-testid="community-new-post-modal"
              onClick={(e) => e.stopPropagation()}
              style={{ borderRadius: roundness }}
              className="sx-sheet-enter relative w-full max-w-2xl max-h-[90dvh] overflow-y-auto no-scrollbar bg-white/74 dark:bg-zinc-950/76 backdrop-blur-2xl backdrop-saturate-150 border border-white/65 dark:border-white/16 ring-1 ring-inset ring-white/35 dark:ring-white/10 shadow-[0_24px_64px_rgba(0,0,0,0.35)] p-4 sm:p-6 space-y-3.5 sm:space-y-4"
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <h2
                    id="community-new-post-title"
                    className="text-xl sm:text-2xl font-black tracking-tight text-[var(--sx-on-surface)]"
                  >
                    New post
                  </h2>
                  <p className="text-xs text-[var(--sx-on-surface-muted)]">
                    Share anime discussions, bug reports, or ideas with the community.
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="community-new-post-close-btn"
                  aria-label="Close New post"
                  onClick={() => setNewPostModalOpen(false)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] transition-colors shrink-0 ${glassControlClass}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Frosted Blurred Composer Form */}
              <form
                onSubmit={handleSubmitNewPost}
                data-testid="community-new-post-form"
                className="space-y-3"
              >
                {draftError && (
                  <div className="px-3.5 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs font-bold text-rose-600 dark:text-rose-300">
                    {draftError}
                  </div>
                )}

                {/* Category */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="community-category-select"
                    className="block text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--sx-on-surface-muted)]"
                  >
                    Category
                  </label>
                  <div className="relative">
                    <select
                      id="community-category-select"
                      data-testid="community-category-select"
                      value={draftCategory}
                      onChange={(e) => setDraftCategory(e.target.value as CommunityCategory | '')}
                      className={`w-full appearance-none px-4 py-3 pr-10 rounded-xl text-sm font-semibold text-[var(--sx-on-surface)] focus:outline-none focus:border-[var(--sx-primary)] transition-colors ${glassControlClass}`}
                    >
                      <option
                        value=""
                        className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]"
                      >
                        Choose a category
                      </option>
                      {COMMUNITY_CATEGORIES.filter((c) => c.userSelectable).map((cat) => (
                        <option
                          key={cat.id}
                          value={cat.id}
                          className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]"
                        >
                          {cat.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-[var(--sx-on-surface-muted)] pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                {/* Title */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="community-title-input"
                    className="block text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--sx-on-surface-muted)]"
                  >
                    Title
                  </label>
                  <input
                    id="community-title-input"
                    data-testid="community-title-input"
                    type="text"
                    maxLength={120}
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    placeholder="What's it about?"
                    className={`w-full px-4 py-3 rounded-xl text-sm font-semibold text-[var(--sx-on-surface)] placeholder:text-[var(--sx-on-surface-muted)]/70 focus:outline-none focus:border-[var(--sx-primary)] transition-colors ${glassControlClass}`}
                  />
                  <div className="text-right text-[11px] font-mono-tabular text-[var(--sx-on-surface-muted)]">
                    {draftTitle.length}/120
                  </div>
                </div>

                {/* Anime (Optional) */}
                <div className="space-y-2">
                  <label
                    htmlFor="community-anime-search"
                    className="block text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--sx-on-surface-muted)]"
                  >
                    Anime (optional)
                  </label>

                  {draftAnime.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {draftAnime.map((anime) => (
                        <span
                          key={anime.id}
                          className={`inline-flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full text-xs font-bold text-[var(--sx-on-surface)] ${glassControlClass}`}
                        >
                          {anime.cover && (
                            <img
                              src={anime.cover}
                              alt=""
                              className="w-5 h-5 rounded-full object-cover shrink-0"
                            />
                          )}
                          <span className="truncate max-w-[180px]">{anime.title}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setDraftAnime((curr) => curr.filter((a) => a.id !== anime.id))
                            }
                            aria-label={`Remove ${anime.title}`}
                            className="p-0.5 rounded-full hover:bg-[var(--sx-on-surface)]/10"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="relative">
                    <Search className="w-4 h-4 text-[var(--sx-on-surface-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
                    <input
                      id="community-anime-search"
                      type="text"
                      disabled={draftAnime.length >= 3}
                      value={animeQuery}
                      onChange={(e) => setAnimeQuery(e.target.value)}
                      placeholder={
                        draftAnime.length >= 3 ? 'Maximum 3 anime linked' : 'Link an anime'
                      }
                      className={`w-full pl-10 pr-9 py-3 rounded-xl text-sm font-semibold text-[var(--sx-on-surface)] placeholder:text-[var(--sx-on-surface-muted)]/70 focus:outline-none focus:border-[var(--sx-primary)] transition-colors disabled:opacity-60 ${glassControlClass}`}
                    />
                    {searchingAnime && (
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--sx-primary)] absolute right-3.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
                    )}

                    {animeResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-2xl p-1.5 space-y-1 max-h-60 overflow-y-auto bg-white/75 dark:bg-zinc-900/82 backdrop-blur-2xl backdrop-saturate-150 border border-white/55 dark:border-white/15 shadow-2xl">
                        {animeResults.map((item) => {
                          const title =
                            item.title.english || item.title.romaji || item.title.native || 'Anime';
                          const alreadyAdded = draftAnime.some(
                            (a) => String(a.id) === String(item.id),
                          );
                          return (
                            <button
                              key={item.id}
                              type="button"
                              disabled={alreadyAdded}
                              onClick={() => handleAddLinkedAnime(item)}
                              className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-[var(--sx-on-surface)]/8 text-left transition-colors disabled:opacity-45"
                            >
                              <div className="w-8 h-10 rounded-lg overflow-hidden bg-[var(--sx-surface-high)] shrink-0">
                                <SmartImage
                                  src={item.cover}
                                  alt={title}
                                  fallbackTitle={title}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-[var(--sx-on-surface)] truncate">
                                  {title}
                                </p>
                                <p className="text-[10px] text-[var(--sx-on-surface-muted)]">
                                  {[item.format, item.year].filter(Boolean).join(' · ')}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-[var(--sx-on-surface-muted)]">
                    Up to 3. They show as chips on your post.
                  </p>
                </div>

                {/* Body */}
                <div className="space-y-2">
                  <label
                    htmlFor="community-body-input"
                    className="block text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--sx-on-surface-muted)]"
                  >
                    Body
                  </label>

                  {draftPreview ? (
                    <div className={`min-h-[152px] p-4 rounded-xl ${glassControlClass}`}>
                      {draftBody.trim() ? (
                        <CommunityBodyRenderer body={draftBody} />
                      ) : (
                        <p className="text-sm text-[var(--sx-on-surface-muted)] italic">
                          Nothing to preview yet...
                        </p>
                      )}
                    </div>
                  ) : (
                    <textarea
                      ref={bodyInputRef}
                      id="community-body-input"
                      data-testid="community-body-input"
                      rows={3}
                      maxLength={4000}
                      value={draftBody}
                      onChange={(e) => setDraftBody(e.target.value)}
                      placeholder="Share the details. **bold**, ||spoiler|| and > quote work here."
                      className={`w-full px-4 py-3 rounded-xl text-sm font-medium text-[var(--sx-on-surface)] placeholder:text-[var(--sx-on-surface-muted)]/70 focus:outline-none focus:border-[var(--sx-primary)] transition-colors resize-y ${glassControlClass}`}
                    />
                  )}

                  {/* Formatting Toolbar + Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-1.5 text-[var(--sx-on-surface-muted)]">
                      <button
                        type="button"
                        onClick={() => handleInsertFormatting('**', '**', 'bold text')}
                        title="Bold"
                        aria-label="Insert bold text"
                        className="p-2 rounded-lg hover:bg-[var(--sx-on-surface)]/10 hover:text-[var(--sx-on-surface)] transition-colors"
                      >
                        <Bold className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertFormatting('\n> ', '', 'quote')}
                        title="Quote"
                        aria-label="Insert quote"
                        className="p-2 rounded-lg hover:bg-[var(--sx-on-surface)]/10 hover:text-[var(--sx-on-surface)] transition-colors"
                      >
                        <Quote className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertFormatting('||', '||', 'spoiler')}
                        title="Spoiler"
                        aria-label="Insert spoiler"
                        className="p-2 rounded-lg hover:bg-[var(--sx-on-surface)]/10 hover:text-[var(--sx-on-surface)] transition-colors"
                      >
                        <EyeOff className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraftPreview((v) => !v)}
                        title="Preview"
                        aria-label="Toggle preview"
                        aria-pressed={draftPreview}
                        className={`p-2 rounded-lg transition-colors ${
                          draftPreview
                            ? 'bg-[var(--sx-primary)]/18 text-[var(--sx-primary)]'
                            : 'hover:bg-[var(--sx-on-surface)]/10 hover:text-[var(--sx-on-surface)]'
                        }`}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <span className="hidden sm:inline text-[11px] ml-2 opacity-80">
                        Eye shows a preview
                      </span>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={() => setNewPostModalOpen(false)}
                        className={`px-4 py-2 rounded-xl text-xs font-extrabold text-[var(--sx-on-surface)] hover:bg-[var(--sx-on-surface)]/10 transition-colors ${glassControlClass}`}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        data-testid="community-publish-btn"
                        disabled={submittingPost}
                        className="px-5 py-2 rounded-xl sx-glass-cta text-xs font-extrabold disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        {submittingPost && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>Post</span>
                      </button>
                    </div>
                  </div>
                </div>
              </form>

              {/* Compact Community Rules footer */}
              <section className={`p-3.5 sm:p-4 rounded-2xl space-y-2 ${glassControlClass}`}>
                <h3 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--sx-on-surface-muted)]">
                  Rules
                </h3>
                <ol className="space-y-1.5 text-xs text-[var(--sx-on-surface-muted)]">
                  {COMMUNITY_RULES.map((rule, idx) => (
                    <li key={rule.title} className="leading-relaxed">
                      <span className="font-mono-tabular text-[var(--sx-on-surface-muted)] mr-1.5">
                        {idx + 1}.
                      </span>
                      <strong className="font-extrabold text-[var(--sx-on-surface)] mr-1">
                        {rule.title}
                      </strong>
                      <span>{rule.description}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </div>,
          document.body,
        )
      : null;

  // ==================== VIEW: POST DETAIL ====================
  if (viewMode === 'detail' && activePost) {
    const catMeta = getCategoryMeta(activePost.category);
    const isOwnPost = activePost.clientId === clientId;

    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-5 pb-12 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setViewMode('feed');
              setActivePostId(null);
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-bold text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]/50 transition-colors ${glassCardClass}`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Community</span>
          </button>

          {isOwnPost && (
            <button
              type="button"
              onClick={() => void handleDeletePost(activePost.id)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-rose-500/12 border border-rose-500/30 text-xs font-bold text-rose-600 dark:text-rose-300 hover:bg-rose-500/20 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          )}
        </div>

        <article
          style={{ borderRadius: roundness }}
          className={`p-5 sm:p-6 space-y-4 ${glassCardClass}`}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {activePost.pinned && (
              <span className="inline-flex items-center gap-1 text-amber-500 font-bold">
                <Pin className="w-3.5 h-3.5" />
                <span>Pinned</span>
              </span>
            )}
            <span
              className={`px-2.5 py-0.5 rounded-full border text-[10px] font-extrabold tracking-wide uppercase ${getCategoryChipClasses(
                activePost.category,
              )}`}
            >
              {catMeta.chipLabel}
            </span>
            {activePost.label && (
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-bold capitalize ${getLabelPillClasses(
                  activePost.label,
                )}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {activePost.label}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--sx-on-surface)]">
              <span className="w-5 h-5 rounded-full bg-[var(--sx-primary)]/18 text-[var(--sx-primary)] text-[10px] font-black flex items-center justify-center overflow-hidden">
                {activePost.authorAvatar ? (
                  <img
                    src={activePost.authorAvatar}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  activePost.authorName.slice(0, 1).toUpperCase()
                )}
              </span>
              <span>{activePost.authorName}</span>
            </span>
            {activePost.authorIsMod && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-black">
                <Shield className="w-2.5 h-2.5" />
                MOD
              </span>
            )}
            <span className="text-[var(--sx-on-surface-muted)]">
              {formatRelativeTimeAgo(activePost.createdAt)}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[var(--sx-on-surface)]">
            {activePost.title}
          </h1>

          <CommunityBodyRenderer body={activePost.body} />

          {activePost.linkedAnime.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {activePost.linkedAnime.map((anime) => (
                <button
                  key={anime.id}
                  type="button"
                  onClick={() => navigate(`/details/anime/${anime.id}`)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)] transition-colors ${glassControlClass}`}
                >
                  {anime.cover && (
                    <img
                      src={anime.cover}
                      alt=""
                      className="w-4 h-4 rounded-full object-cover"
                    />
                  )}
                  <span>{anime.title}</span>
                </button>
              ))}
            </div>
          )}

          <div className="pt-3 border-t border-[var(--sx-outline)]/60 flex items-center gap-4 text-xs font-bold text-[var(--sx-on-surface-muted)]">
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                aria-label="Upvote post"
                onClick={() => void handleVote(activePost, 1)}
                className={`p-1.5 rounded-lg transition-colors ${
                  activePost.userVote === 1
                    ? 'bg-[var(--sx-primary)]/18 text-[var(--sx-primary)]'
                    : 'hover:bg-[var(--sx-on-surface)]/10 hover:text-[var(--sx-on-surface)]'
                }`}
              >
                <ArrowBigUp className="w-4 h-4" />
              </button>
              <span className="tabular-nums font-extrabold text-[var(--sx-on-surface)]">
                {activePost.score}
              </span>
              <button
                type="button"
                aria-label="Downvote post"
                onClick={() => void handleVote(activePost, -1)}
                className={`p-1.5 rounded-lg transition-colors ${
                  activePost.userVote === -1
                    ? 'bg-rose-500/18 text-rose-500'
                    : 'hover:bg-[var(--sx-on-surface)]/10 hover:text-[var(--sx-on-surface)]'
                }`}
              >
                <ArrowBigDown className="w-4 h-4" />
              </button>
            </div>
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <MessageSquare className="w-3.5 h-3.5" />
              {activePost.comments.length} replies
            </span>
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Eye className="w-3.5 h-3.5" />
              {activePost.views} views
            </span>
          </div>
        </article>

        {/* Comments Composer & List */}
        <section
          style={{ borderRadius: roundness }}
          className={`p-5 space-y-4 ${glassCardClass}`}
        >
          <h2 className="text-sm font-extrabold text-[var(--sx-on-surface)]">
            Replies ({activePost.comments.length})
          </h2>

          <form onSubmit={handleAddComment} className="flex items-center gap-2">
            <input
              type="text"
              data-testid="community-comment-input"
              maxLength={1200}
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              placeholder="Write a reply..."
              className={`flex-1 px-4 py-2.5 rounded-full text-xs sm:text-sm font-semibold text-[var(--sx-on-surface)] placeholder:text-[var(--sx-on-surface-muted)]/70 focus:outline-none focus:border-[var(--sx-primary)] ${glassControlClass}`}
            />
            <button
              type="submit"
              data-testid="community-comment-submit"
              disabled={submittingComment || !commentDraft.trim()}
              className="px-4 py-2.5 rounded-full sx-glass-cta text-xs font-extrabold inline-flex items-center gap-1.5 disabled:opacity-45"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Reply</span>
            </button>
          </form>

          {activePost.comments.length === 0 ? (
            <p className="text-xs text-[var(--sx-on-surface-muted)] py-3 text-center">
              No replies yet — start the conversation.
            </p>
          ) : (
            <div className="space-y-2.5">
              {activePost.comments.map((cmt) => (
                <div
                  key={cmt.id}
                  className={`p-3.5 rounded-2xl space-y-1.5 ${glassControlClass}`}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-5 h-5 rounded-full bg-[var(--sx-primary)]/18 text-[var(--sx-primary)] text-[10px] font-black flex items-center justify-center overflow-hidden">
                      {cmt.authorAvatar ? (
                        <img
                          src={cmt.authorAvatar}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        cmt.authorName.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span className="font-extrabold text-[var(--sx-on-surface)]">
                      {cmt.authorName}
                    </span>
                    {cmt.authorIsMod && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[9px] font-black">
                        MOD
                      </span>
                    )}
                    <span className="text-[11px] text-[var(--sx-on-surface-muted)]">
                      {formatRelativeTimeAgo(cmt.createdAt)}
                    </span>
                  </div>
                  <CommunityBodyRenderer body={cmt.body} />
                </div>
              ))}
            </div>
          )}
        </section>
        {newPostModalNode}
      </div>
    );
  }

  // ==================== VIEW: COMMUNITY FEED ====================
  return (
    <div
      data-testid="community-page"
      className="max-w-5xl mx-auto px-4 sm:px-6 pt-5 pb-12 space-y-4 sm:space-y-5"
    >
      {/* Header matching screenshots 2 & 4 */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--sx-on-surface)]">
            Community
          </h1>
          <p className="text-xs sm:text-sm text-[var(--sx-on-surface-muted)]">
            Chat about anime, get help, and tell us what to fix or build next.
          </p>
        </div>

        <button
          type="button"
          data-testid="community-new-post-btn"
          onClick={handleOpenNewPost}
          className="w-full sm:w-auto px-5 py-3 sm:py-2.5 rounded-full sx-glass-cta text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New post</span>
        </button>
      </header>

      {/* Category Filter Pills */}
      <div
        role="tablist"
        aria-label="Community categories"
        className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={categoryFilter === 'all'}
          data-testid="community-cat-all"
          onClick={() => setCategoryFilter('all')}
          className={`px-4 py-2 rounded-full text-xs font-extrabold whitespace-nowrap transition-colors shrink-0 border ${
            categoryFilter === 'all'
              ? 'sx-glass-active'
              : `${glassCardClass} text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]`
          }`}
        >
          All
        </button>
        {COMMUNITY_CATEGORIES.map((cat) => {
          const active = categoryFilter === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`community-cat-${cat.id}`}
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-4 py-2 rounded-full text-xs font-extrabold whitespace-nowrap transition-colors shrink-0 border ${
                active
                  ? 'sx-glass-active'
                  : `${glassCardClass} text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]`
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Search + Label & Sort Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[var(--sx-on-surface-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
          <input
            type="text"
            data-testid="community-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search posts"
            className={`w-full pl-10 pr-4 py-2.5 rounded-full text-xs sm:text-sm font-semibold text-[var(--sx-on-surface)] placeholder:text-[var(--sx-on-surface-muted)]/75 focus:outline-none focus:border-[var(--sx-primary)] ${glassCardClass}`}
          />
        </div>

        <div className="grid grid-cols-2 sm:flex items-center gap-2">
          <label
            className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-full text-xs font-bold ${glassCardClass}`}
          >
            <span className="text-[var(--sx-on-surface-muted)] font-semibold">Label</span>
              <select
                aria-label="Filter by label"
                data-testid="community-label-select"
                value={labelFilter}
                onChange={(e) => setLabelFilter(e.target.value as CommunityLabel | 'any')}
                className="bg-transparent font-extrabold text-[var(--sx-on-surface)] focus:outline-none cursor-pointer"
              >
                <option
                  value="any"
                  className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]"
                >
                  Any
                </option>
                {COMMUNITY_LABELS.map((lbl) => (
                  <option
                    key={lbl.id}
                    value={lbl.id}
                    className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]"
                  >
                    {lbl.label}
                  </option>
                ))}
              </select>
            </label>

            <label
              className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-full text-xs font-bold ${glassCardClass}`}
            >
              <span className="text-[var(--sx-on-surface-muted)] font-semibold">Sort</span>
              <select
                aria-label="Sort posts"
                data-testid="community-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as CommunitySort)}
                className="bg-transparent font-extrabold text-[var(--sx-on-surface)] focus:outline-none cursor-pointer"
              >
                <option
                  value="hot"
                  className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]"
                >
                  Hot
                </option>
                <option
                  value="new"
                  className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]"
                >
                  New
                </option>
                <option
                  value="top"
                  className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]"
                >
                  Top
                </option>
              </select>
            </label>
          </div>
        </div>

      {/* Feed Content */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{ borderRadius: roundness }}
              className={`h-28 animate-pulse ${glassCardClass}`}
            />
          ))}
        </div>
      ) : errorMsg ? (
        <div
          style={{ borderRadius: roundness }}
          className={`p-8 text-center space-y-3 ${glassCardClass}`}
        >
          <p className="text-sm font-bold text-[var(--sx-on-surface)]">{errorMsg}</p>
          <button
            type="button"
            onClick={() => void loadPosts()}
            className="px-4 py-2 rounded-full sx-glass-cta text-xs font-extrabold"
          >
            Retry
          </button>
        </div>
      ) : filteredPosts.length === 0 ? (
        <div
          style={{ borderRadius: roundness }}
          className={`p-10 text-center space-y-2 ${glassCardClass}`}
        >
          <p className="text-sm font-extrabold text-[var(--sx-on-surface)]">
            No matching posts found
          </p>
          <p className="text-xs text-[var(--sx-on-surface-muted)]">
            Try clearing your filters or create the first post in this topic.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPosts.map((post) => {
            const catMeta = getCategoryMeta(post.category);
            const isOwn = post.clientId === clientId;

            return (
              <article
                key={post.id}
                data-testid={`community-post-${post.id}`}
                style={{ borderRadius: roundness }}
                className={`relative p-4 sm:px-5 sm:py-4 transition-all hover:border-[var(--sx-primary)]/45 cursor-pointer ${glassCardClass}`}
                onClick={() => void handleOpenPost(post)}
              >
                <div className="flex items-start gap-4">
                  {/* Desktop Left Vote Column matching Screenshot 4 */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="hidden sm:flex flex-col items-center justify-center gap-0.5 min-w-[34px] pt-0.5 text-[var(--sx-on-surface-muted)]"
                  >
                    <button
                      type="button"
                      aria-label={`Upvote ${post.title}`}
                      data-testid={`community-upvote-${post.id}`}
                      onClick={() => void handleVote(post, 1)}
                      className={`p-1 rounded-lg transition-colors ${
                        post.userVote === 1
                          ? 'bg-[var(--sx-primary)]/18 text-[var(--sx-primary)]'
                          : 'hover:bg-[var(--sx-on-surface)]/10 hover:text-[var(--sx-on-surface)]'
                      }`}
                    >
                      <ArrowBigUp className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-extrabold tabular-nums text-[var(--sx-on-surface)]">
                      {post.score}
                    </span>
                    <button
                      type="button"
                      aria-label={`Downvote ${post.title}`}
                      onClick={() => void handleVote(post, -1)}
                      className={`p-1 rounded-lg transition-colors ${
                        post.userVote === -1
                          ? 'bg-rose-500/18 text-rose-500'
                          : 'hover:bg-[var(--sx-on-surface)]/10 hover:text-[var(--sx-on-surface)]'
                      }`}
                    >
                      <ArrowBigDown className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Main Body */}
                  <div className="min-w-0 flex-1 space-y-2">
                    {/* Metadata badges + author */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      {post.pinned && (
                        <span className="inline-flex items-center gap-1 text-amber-500 font-extrabold">
                          <Pin className="w-3 h-3" />
                          <span>Pinned</span>
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-full border text-[10px] font-extrabold tracking-wide uppercase ${getCategoryChipClasses(
                          post.category,
                        )}`}
                      >
                        {catMeta.chipLabel}
                      </span>
                      {post.label && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold capitalize ${getLabelPillClasses(
                            post.label,
                          )}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {post.label}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 font-bold text-[var(--sx-on-surface)]">
                        <span className="w-4 h-4 rounded-full bg-[var(--sx-primary)]/18 text-[var(--sx-primary)] text-[9px] font-black flex items-center justify-center overflow-hidden">
                          {post.authorAvatar ? (
                            <img
                              src={post.authorAvatar}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            post.authorName.slice(0, 1).toUpperCase()
                          )}
                        </span>
                        <span>{post.authorName}</span>
                      </span>
                      {post.authorIsMod && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[9px] font-black">
                          MOD
                        </span>
                      )}
                      <span className="text-[var(--sx-on-surface-muted)]">
                        {formatRelativeTimeAgo(post.createdAt)}
                      </span>
                    </div>

                    {/* Title */}
                    <h2 className="text-sm sm:text-base font-extrabold text-[var(--sx-on-surface)] leading-snug">
                      {post.title}
                    </h2>

                    {/* Snippet */}
                    <CommunityBodyRenderer body={post.body} compact />

                    {/* Linked Anime Chips */}
                    {post.linkedAnime.length > 0 && (
                      <div
                        className="flex flex-wrap gap-1.5 pt-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {post.linkedAnime.map((anime) => (
                          <button
                            key={anime.id}
                            type="button"
                            onClick={() => navigate(`/details/anime/${anime.id}`)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)] transition-colors ${glassControlClass}`}
                          >
                            {anime.cover && (
                              <img
                                src={anime.cover}
                                alt=""
                                className="w-3.5 h-3.5 rounded-full object-cover"
                              />
                            )}
                            <span className="truncate max-w-[160px]">{anime.title}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Bottom Stats Row (Desktop stats + Mobile votes & stats matching Screenshot 2) */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-3.5 pt-1 text-xs font-bold text-[var(--sx-on-surface-muted)]"
                    >
                      <div className="flex sm:hidden items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Upvote ${post.title}`}
                          onClick={() => void handleVote(post, 1)}
                          className={`p-1 rounded-md transition-colors ${
                            post.userVote === 1
                              ? 'text-[var(--sx-primary)]'
                              : 'hover:text-[var(--sx-on-surface)]'
                          }`}
                        >
                          <ArrowBigUp className="w-4 h-4" />
                        </button>
                        <span className="tabular-nums text-[var(--sx-on-surface)]">
                          {post.score}
                        </span>
                        <button
                          type="button"
                          aria-label={`Downvote ${post.title}`}
                          onClick={() => void handleVote(post, -1)}
                          className={`p-1 rounded-md transition-colors ${
                            post.userVote === -1
                              ? 'text-rose-500'
                              : 'hover:text-[var(--sx-on-surface)]'
                          }`}
                        >
                          <ArrowBigDown className="w-4 h-4" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleOpenPost(post)}
                        className="inline-flex items-center gap-1 tabular-nums hover:text-[var(--sx-on-surface)] transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>{post.comments.length}</span>
                      </button>

                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Eye className="w-3.5 h-3.5" />
                        <span>{post.views}</span>
                      </span>

                      <div className="relative">
                        <button
                          type="button"
                          aria-label="Post options"
                          onClick={() =>
                            setOpenMenuPostId((curr) => (curr === post.id ? null : post.id))
                          }
                          className="p-1 rounded-lg hover:bg-[var(--sx-on-surface)]/10 hover:text-[var(--sx-on-surface)] transition-colors"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>

                        {openMenuPostId === post.id && (
                          <div
                            className={`absolute left-0 bottom-[calc(100%+4px)] z-30 min-w-[140px] rounded-xl p-1 ${glassCardClass}`}
                          >
                            <button
                              type="button"
                              onClick={() => void handleOpenPost(post)}
                              className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--sx-on-surface)] hover:bg-[var(--sx-on-surface)]/10"
                            >
                              Open thread
                            </button>
                            {isOwn && (
                              <button
                                type="button"
                                onClick={() => void handleDeletePost(post.id)}
                                className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold text-rose-500 hover:bg-rose-500/12"
                              >
                                Delete post
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {newPostModalNode}
    </div>
  );
};
