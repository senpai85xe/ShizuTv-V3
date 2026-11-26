import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Pause, Play, Trash2, CheckCircle2 } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { SmartImage } from '../components/SmartImage';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export const DownloadsPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, toggleDownloadPause, removeDownload, clearCompletedDownloads } = useApp();
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  const items = state.downloads.filter((d) => {
    if (filter === 'active') return d.status === 'downloading' || d.status === 'pending' || d.status === 'paused';
    if (filter === 'completed') return d.status === 'completed';
    return true;
  });

  const completedCount = state.downloads.filter((d) => d.status === 'completed').length;

  return (
    <div className="min-h-screen px-4 sm:px-6 pt-5 pb-12 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Downloads</h1>
          <p className="text-xs text-[var(--sx-on-surface-muted)]">
            Manage offline anime episodes & manga chapters
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl sx-glass-panel border border-[var(--sx-outline)]">
            {(['all', 'active', 'completed'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${
                  filter === tab
                    ? 'sx-glass-active font-extrabold'
                    : 'text-[var(--sx-on-surface-muted)]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          {completedCount > 0 && (
            <button
              type="button"
              onClick={clearCompletedDownloads}
              className="px-3 py-2 rounded-xl sx-glass-panel border border-[var(--sx-outline)] text-xs font-bold hover:border-[var(--sx-primary)]"
            >
              Clear Completed
            </button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="py-16 text-center rounded-[var(--sx-radius)] sx-glass-panel border border-[var(--sx-outline)] space-y-3">
          <Download className="w-10 h-10 mx-auto text-[var(--sx-on-surface-muted)] opacity-60" />
          <p className="text-base font-bold">No downloads in queue</p>
          <p className="text-xs text-[var(--sx-on-surface-muted)]">
            Open any anime or manga details page and click the download icon next to an episode or chapter.
          </p>
          <button
            type="button"
            onClick={() => navigate('/discover')}
            className="px-4 py-2 rounded-xl sx-glass-cta text-xs font-bold"
          >
            Browse Catalog
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((task) => {
            const pct = Math.round(task.progress * 100);
            return (
              <div
                key={task.id}
                className="flex items-center gap-4 p-4 rounded-[var(--sx-radius)] sx-glass-panel border border-[var(--sx-outline)]"
              >
                <SmartImage
                  src={task.cover}
                  alt={task.mediaTitle}
                  className="w-14 h-20 rounded-xl shrink-0"
                />

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold truncate">{task.mediaTitle}</p>
                      <p className="text-xs text-[var(--sx-on-surface-muted)] truncate">
                        {task.mediaType === 'MANGA' ? 'Chapter' : 'Episode'} {task.itemNumber} · {task.itemTitle} · {task.quality}
                      </p>
                    </div>
                    <span className="text-xs font-mono-tabular font-bold text-[var(--sx-primary)] shrink-0">
                      {task.status === 'completed' ? 'Completed' : `${pct}%`}
                    </span>
                  </div>

                  <div className="w-full h-1.5 rounded-full bg-[var(--sx-surface-high)]/55 overflow-hidden">
                    <div
                      className="h-full bg-[var(--sx-primary)] transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[var(--sx-on-surface-muted)]">
                    <span>
                      {formatBytes(task.downloadedBytes)} / {formatBytes(task.totalBytes)}
                    </span>
                    <span className="capitalize">{task.status}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {task.status === 'completed' ? (
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          task.mediaType === 'MANGA'
                            ? '/reader'
                            : `/details/${task.mediaType.toLowerCase()}/${task.mediaId}`,
                          {
                            state: {
                              media: {
                                id: task.mediaId,
                                type: task.mediaType,
                                title: { english: task.mediaTitle },
                                cover: task.cover,
                              },
                              ...(task.mediaType !== 'MANGA'
                                ? {
                                    initialTab: 'watch',
                                    episodeIndex: Math.max(0, task.itemNumber - 1),
                                  }
                                : {}),
                            },
                          },
                        )
                      }
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl sx-glass-cta text-xs font-bold"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Open</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleDownloadPause(task.id)}
                      className="p-2 rounded-xl sx-glass-control hover:bg-[var(--sx-primary)] hover:text-[var(--sx-on-primary)] transition-colors"
                      title={task.status === 'paused' ? 'Resume' : 'Pause'}
                    >
                      {task.status === 'paused' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeDownload(task.id)}
                    className="p-2 rounded-xl sx-glass-control hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
