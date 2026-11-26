import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2, Play, BookOpen } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { getPreferredTitle, LibraryEntry } from '../types/media';
import { fetchAniListUserLibrary } from '../services/anilist';
import { SmartImage } from '../components/SmartImage';
import { ContinueHistoryCardSkeleton } from '../components/MediaCardSkeleton';
import { mergeContinueHistoryItems } from '../utils/mediaCard';

export const ContinueHistoryPage: React.FC = () => {
  const { mediaType } = useParams<{ mediaType: string }>();
  const navigate = useNavigate();
  const { state, removeHistoryItem } = useApp();
  const [cloudEntries, setCloudEntries] = useState<LibraryEntry[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);

  const isManga = mediaType?.toLowerCase() === 'manga';
  const anilistUserId = state.profiles.anilist?.id;

  useEffect(() => {
    if (
      state.primaryTracker !== 'anilist' ||
      !state.anilistToken ||
      !anilistUserId
    ) {
      setCloudEntries([]);
      setLoadingCloud(false);
      return;
    }

    let cancelled = false;
    setLoadingCloud(true);
    fetchAniListUserLibrary(
      state.anilistToken,
      anilistUserId,
      isManga ? 'MANGA' : 'ANIME',
      'CURRENT',
    )
      .then((entries) => {
        if (!cancelled) {
          setCloudEntries(entries);
          setLoadingCloud(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadingCloud(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [state.primaryTracker, state.anilistToken, anilistUserId, isManga]);

  const items = mergeContinueHistoryItems(state.history, cloudEntries, isManga);
  const showSkeletons = loadingCloud && items.length === 0;

  return (
    <div className="min-h-screen px-4 sm:px-6 pt-5 pb-12 space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="p-2 rounded-xl sx-glass-panel border border-[var(--sx-outline)]"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight">
            {isManga ? 'Continue Reading' : 'Continue Watching'}
          </h1>
          <p className="text-xs text-[var(--sx-on-surface-muted)]">
            Resume right where you left off
          </p>
        </div>
      </div>

      {showSkeletons ? (
        <div
          aria-busy="true"
          aria-label={isManga ? 'Loading continue reading history' : 'Loading continue watching history'}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <ContinueHistoryCardSkeleton key={i} index={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center rounded-[var(--sx-radius)] sx-glass-panel border border-[var(--sx-outline)]">
          <p className="text-sm font-bold">No recent history recorded</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {items.map((item) => {
            const title = getPreferredTitle(item.media.title, state.contentPrefs.titlePreference);
            const isLocal = !item.id.startsWith('cloud-');
            return (
              <div
                key={item.id}
                className="flex items-center gap-3.5 p-3 rounded-[var(--sx-radius)] sx-glass-panel border border-[var(--sx-outline)]"
              >
                <SmartImage
                  src={item.media.cover}
                  alt={title}
                  className="w-16 h-24 rounded-xl shrink-0"
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="text-sm font-bold line-clamp-2">{title}</p>
                  <p className="text-xs font-semibold text-[var(--sx-primary)]">
                    {isManga
                      ? `Chapter ${item.chapterNumber ?? 1} · Page ${(item.pageIndex ?? 0) + 1}`
                      : `Episode ${item.episodeNumber ?? 1}`}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/details/${item.media.type.toLowerCase()}/${item.media.id}`, {
                          state: { media: item.media },
                        })
                      }
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg sx-glass-cta text-xs font-bold"
                    >
                      {isManga ? <BookOpen className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
                      <span>Resume</span>
                    </button>
                    {isLocal && (
                      <button
                        type="button"
                        onClick={() => removeHistoryItem(item.id)}
                        aria-label={`Remove ${title} from history`}
                        className="p-1.5 rounded-lg sx-glass-control text-[var(--sx-on-surface-muted)] hover:text-red-400"
                        title="Remove from history"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
