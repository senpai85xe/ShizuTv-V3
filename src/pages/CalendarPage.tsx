import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Search, Calendar as CalIcon, RotateCw } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { CalendarEntry, getPreferredTitle } from '../types/media';
import { fetchCalendarSchedule } from '../services/discoveryService';
import { CalendarSectionSkeleton } from '../components/Skeleton';
import { SmartImage } from '../components/SmartImage';

function getWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const CalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useApp();
  const [source, setSource] = useState<'anilist' | 'myanimelist'>('anilist');
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekMonday(new Date()));
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCalendarSchedule(
        source,
        weekStart,
        state.contentPrefs.adultContentMode,
      );
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load airing schedule');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, weekStart]);

  const shiftWeek = (days: number) => {
    setWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + days);
      return next;
    });
  };

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const filtered = entries.filter((e) => {
    if (!query.trim()) return true;
    const t = getPreferredTitle(e.media.title, state.contentPrefs.titlePreference).toLowerCase();
    return t.includes(query.toLowerCase());
  });

  return (
    <div className="min-h-screen px-4 sm:px-6 pt-5 pb-12 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl sx-glass-panel border border-[var(--sx-outline)]"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight">Airing Calendar</h1>
            <p className="text-xs text-[var(--sx-on-surface-muted)]">
              Weekly episode release schedule
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as 'anilist' | 'myanimelist')}
            className="px-3 py-2 rounded-xl sx-glass-panel border border-[var(--sx-outline)] text-xs font-bold"
          >
            <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="anilist">AniList Schedule</option>
            <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="myanimelist">MyAnimeList (Jikan)</option>
          </select>

          <div className="flex items-center gap-1 sx-glass-panel border border-[var(--sx-outline)] rounded-xl p-1">
            <button
              type="button"
              onClick={() => shiftWeek(-7)}
              className="p-1.5 rounded-lg hover:bg-[var(--sx-surface-high)]"
              title="Previous Week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setWeekStart(getWeekMonday(new Date()))}
              className="px-2.5 py-1 text-xs font-bold hover:text-[var(--sx-primary)]"
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => shiftWeek(7)}
              className="p-1.5 rounded-lg hover:bg-[var(--sx-surface-high)]"
              title="Next Week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-[var(--sx-on-surface-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search airing anime..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl sx-glass-panel border border-[var(--sx-outline)] text-xs focus:outline-none focus:border-[var(--sx-primary)]"
        />
      </div>

      {loading ? (
        <div
          aria-busy="true"
          aria-label="Loading airing schedule"
          className="space-y-5"
        >
          {days.map((d, i) => (
            <CalendarSectionSkeleton
              key={d.toISOString()}
              index={i}
              cards={i === 0 ? 6 : 3}
            />
          ))}
        </div>
      ) : error ? (
        <div className="p-8 rounded-[var(--sx-radius)] sx-glass-panel border border-red-500/30 text-center space-y-3">
          <p className="text-sm font-bold text-red-400">{error}</p>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl sx-glass-cta text-xs font-bold"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {days.map((day) => {
            const key = day.toDateString();
            const isToday = key === new Date().toDateString();
            const dayItems = filtered.filter(
              (item) => new Date(item.airingAt).toDateString() === key,
            );

            return (
              <section
                key={key}
                className="rounded-[var(--sx-radius)] sx-glass-panel border border-[var(--sx-outline)] p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalIcon className={`w-4 h-4 ${isToday ? 'text-[var(--sx-primary)]' : 'text-[var(--sx-on-surface-muted)]'}`} />
                    <h2 className="text-sm font-extrabold">
                      {day.toLocaleDateString(undefined, {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </h2>
                    {isToday && (
                      <span className="text-xs font-bold text-[var(--sx-primary)]">· Today</span>
                    )}
                  </div>
                  <span className="text-xs font-mono-tabular text-[var(--sx-on-surface-muted)]">
                    {dayItems.length} releases
                  </span>
                </div>

                {dayItems.length === 0 ? (
                  <p className="text-xs text-[var(--sx-on-surface-muted)] py-2">
                    No scheduled episodes for this day.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {dayItems.map((entry) => {
                      const title = getPreferredTitle(
                        entry.media.title,
                        state.contentPrefs.titlePreference,
                      );
                      const timeStr = new Date(entry.airingAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() =>
                            navigate(`/details/anime/${entry.media.id}`, {
                              state: { media: entry.media },
                            })
                          }
                          className="flex items-center gap-3 p-2.5 rounded-xl sx-glass-control hover:border-[var(--sx-primary)] border border-transparent text-left transition-colors"
                        >
                          <SmartImage
                            src={entry.media.cover}
                            alt={title}
                            className="w-12 h-16 rounded-lg shrink-0"
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-xs font-bold line-clamp-2">{title}</p>
                            <p className="text-[11px] font-mono-tabular text-[var(--sx-primary)] font-bold">
                              Ep {entry.episode} · {timeStr}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
