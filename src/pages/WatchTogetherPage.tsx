import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  MessageSquare,
  MonitorOff,
  Plus,
  RotateCw,
  Tv,
  Users,
} from 'lucide-react';
import {
  buildWatchPartyWsUrl,
  filterMyEndedRooms,
  filterMyLiveRooms,
  filterPublicRooms,
  formatRoomClosedAgo,
  formatRoomDuration,
  getHostDisplayName,
  getOrCreateWatchPartyClientId,
  getParticipantInitial,
  isValidRoomCode,
  normalizeRoomCode,
  resolveDefaultDisplayName,
  WatchPartyEndedRoom,
  WatchPartyLobbyTab,
  WatchPartyRoom,
} from '../utils/watchParty';
import { useApp } from '../store/AppContext';
import { SmartImage } from '../components/SmartImage';
import {
  CreateWatchRoomModal,
  CreateWatchRoomPayload,
} from '../components/CreateWatchRoomModal';
import {
  BackendNotConfiguredError,
  NonJsonResponseError,
  parseJsonResponseSafely,
  resolveApiUrl,
} from '../utils/backendConfig';

const watchGlassCardClass =
  'bg-white/32 dark:bg-white/[0.06] backdrop-blur-2xl backdrop-saturate-150 border border-white/50 dark:border-white/14 ring-1 ring-inset ring-white/25 dark:ring-white/8 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.16)]';

const watchGlassControlClass =
  'bg-white/26 dark:bg-white/[0.06] backdrop-blur-2xl backdrop-saturate-150 border border-white/48 dark:border-white/14 ring-1 ring-inset ring-white/22 dark:ring-white/8 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.14)]';

export const WatchTogetherPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, updatePlayerPrefs } = useApp();

  const clientId = useMemo(() => getOrCreateWatchPartyClientId(), []);
  const displayName = resolveDefaultDisplayName(state.profiles);

  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<WatchPartyLobbyTab>('live');
  const [publicRooms, setPublicRooms] = useState<WatchPartyRoom[]>([]);
  const [allLiveRooms, setAllLiveRooms] = useState<WatchPartyRoom[]>([]);
  const [endedRooms, setEndedRooms] = useState<WatchPartyEndedRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [refreshSpinning, setRefreshSpinning] = useState(false);

  const normalizedInputCode = normalizeRoomCode(roomCodeInput);
  const canJoinCode = isValidRoomCode(normalizedInputCode) && !joining;

  const fetchLobbyState = useCallback(async (manual = false) => {
    if (manual) {
      setRefreshSpinning(true);
    } else {
      setLoadingRooms(true);
    }
    try {
      const res = await fetch(resolveApiUrl('/api/watch-party/rooms'));
      const data = await parseJsonResponseSafely<{
        rooms?: WatchPartyRoom[];
        allLiveRooms?: WatchPartyRoom[];
        endedRooms?: WatchPartyEndedRoom[];
      }>(res, 'watch party rooms');
      if (res.ok) {
        if (Array.isArray(data.rooms)) {
          setPublicRooms(filterPublicRooms(data.rooms));
        }
        if (Array.isArray(data.allLiveRooms)) {
          setAllLiveRooms(data.allLiveRooms);
        } else if (Array.isArray(data.rooms)) {
          setAllLiveRooms(data.rooms);
        }
        if (Array.isArray(data.endedRooms)) {
          setEndedRooms(data.endedRooms);
        }
      }
    } catch {
      // Ignore transient network errors when refreshing lobby
    } finally {
      setLoadingRooms(false);
      if (manual) {
        window.setTimeout(() => setRefreshSpinning(false), 380);
      }
    }
  }, []);

  useEffect(() => {
    void fetchLobbyState(false);

    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return;
    let ws: WebSocket | null = null;
    let closedByCleanup = false;

    try {
      ws = new WebSocket(buildWatchPartyWsUrl());
      ws.onopen = () => {
        if (!closedByCleanup && ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'lobby:subscribe' }));
        }
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as {
            type?: string;
            rooms?: WatchPartyRoom[];
            allLiveRooms?: WatchPartyRoom[];
            endedRooms?: WatchPartyEndedRoom[];
          };
          if (msg.type === 'lobby:rooms') {
            if (Array.isArray(msg.rooms)) {
              setPublicRooms(filterPublicRooms(msg.rooms));
            }
            if (Array.isArray(msg.allLiveRooms)) {
              setAllLiveRooms(msg.allLiveRooms);
            } else if (Array.isArray(msg.rooms)) {
              setAllLiveRooms(msg.rooms);
            }
            if (Array.isArray(msg.endedRooms)) {
              setEndedRooms(msg.endedRooms);
            }
            setLoadingRooms(false);
          }
        } catch {
          // Ignore malformed WS message
        }
      };
    } catch {
      // WebSocket lobby optional if server unavailable
    }

    return () => {
      closedByCleanup = true;
      if (ws) {
        try {
          ws.onmessage = null;
          ws.onerror = null;
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'lobby:unsubscribe' }));
            ws.close();
          } else if (ws.readyState === WebSocket.CONNECTING) {
            ws.onopen = () => {
              try {
                ws?.close();
              } catch {
                // Ignore close errors
              }
            };
          }
        } catch {
          // Ignore close errors
        }
      }
    };
  }, [fetchLobbyState]);

  const navigateIntoRoom = (roomCode: string, room?: WatchPartyRoom) => {
    const normalized = normalizeRoomCode(roomCode);
    if (room) {
      const total = Math.max(room.episodeNumber, room.totalEpisodes || 1);
      const episodes = Array.from({ length: total }, (_, idx) => ({
        id: `${room.mediaId}-ep-${idx + 1}`,
        number: idx + 1,
        title:
          idx + 1 === room.episodeNumber && room.episodeTitle
            ? room.episodeTitle
            : `Episode ${idx + 1}`,
        thumbnail: room.mediaBanner || room.mediaCover || null,
      }));
      navigate(`/watch-together/${encodeURIComponent(normalized)}`, {
        state: {
          media: {
            id: room.mediaId,
            type: 'ANIME' as const,
            title: { english: room.mediaTitle },
            cover: room.mediaCover,
            banner: room.mediaBanner,
            episodes: total,
          },
          episodes,
          episodeIndex: Math.max(0, room.episodeNumber - 1),
        },
      });
      return;
    }
    navigate(`/watch-together/${encodeURIComponent(normalized)}`);
  };

  const handleJoinByCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isValidRoomCode(normalizedInputCode)) {
      setJoinError('Enter a 6-character room code to join.');
      return;
    }

    setJoining(true);
    setJoinError(null);
    try {
      const res = await fetch(
        resolveApiUrl(`/api/watch-party/rooms/${encodeURIComponent(normalizedInputCode)}`),
      );
      const data = await parseJsonResponseSafely<{
        exists?: boolean;
        room?: WatchPartyRoom;
        message?: string;
      }>(res, 'watch party room lookup');
      if (!res.ok) {
        setJoinError(
          data.message || `Room ${normalizedInputCode} was not found. Check the code and try again.`,
        );
        setJoining(false);
        return;
      }
      if (!data.exists || !data.room) {
        setJoinError(`Room ${normalizedInputCode} was not found.`);
        setJoining(false);
        return;
      }
      navigateIntoRoom(normalizedInputCode, data.room);
    } catch (err) {
      if (err instanceof BackendNotConfiguredError || err instanceof NonJsonResponseError) {
        setJoinError(err.message);
      } else {
        setJoinError('Unable to reach Watch Party server. Please try again.');
      }
      setJoining(false);
    }
  };

  const handleCreateRoomSubmit = (payload: CreateWatchRoomPayload) => {
    setCreateOpen(false);
    if (payload.audioLanguage) {
      updatePlayerPrefs({ audioLanguage: payload.audioLanguage });
    }
    navigate('/watch-together/new', {
      state: {
        autoCreateWatchParty: {
          media: payload.media,
          episodes: payload.episodes,
          episodeIndex: payload.episodeIndex,
          userName: payload.userName,
          roomName: payload.roomName,
          track: payload.track,
          audioLanguage: payload.audioLanguage,
          isPublic: payload.isPublic,
          hostAvatar: payload.hostAvatar,
          currentTime: 0,
          isPlaying: true,
        },
      },
    });
  };

  const myLiveRooms = useMemo(
    () => filterMyLiveRooms(allLiveRooms, clientId, displayName),
    [allLiveRooms, clientId, displayName],
  );
  const myEndedRooms = useMemo(
    () => filterMyEndedRooms(endedRooms, clientId, displayName),
    [endedRooms, clientId, displayName],
  );

  const renderLiveRoomCard = (room: WatchPartyRoom) => {
    const hostName = getHostDisplayName(room);
    const thumb = room.mediaCover || room.mediaBanner;
    const trackLabel = (room.track || 'H-Sub').toUpperCase();
    const roomLabel = room.roomName || `${hostName}'s room`;
    const msgCount = room.messagesCount ?? 0;

    return (
      <li
        key={room.roomCode}
        data-testid="watch-together-room-card"
        className={`rounded-[var(--sx-radius)] ${watchGlassCardClass} p-3.5 sm:p-4 flex items-start justify-between gap-3.5 transition-colors hover:border-[var(--sx-primary)]/40`}
      >
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <div className="w-16 h-24 sm:w-20 sm:h-28 rounded-xl overflow-hidden bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] shrink-0 flex items-center justify-center">
            {thumb ? (
              <SmartImage
                src={thumb}
                alt={room.mediaTitle}
                fallbackTitle={room.mediaTitle}
                className="w-full h-full object-cover"
              />
            ) : (
              <Tv className="w-5 h-5 text-[var(--sx-primary)]" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <h3 className="text-sm sm:text-base font-extrabold text-[var(--sx-on-surface)] truncate">
              {room.mediaTitle}
            </h3>

            <p className="text-xs font-medium text-[var(--sx-on-surface-muted)] truncate">
              <span>Ep {room.episodeNumber}</span>
              <span aria-hidden="true"> · </span>
              <span>{trackLabel}</span>
              <span aria-hidden="true"> · </span>
              <span>{roomLabel}</span>
            </p>

            <div className="flex items-center gap-2 min-w-0">
              {room.hostAvatar ? (
                <img
                  src={room.hostAvatar}
                  alt={hostName}
                  referrerPolicy="no-referrer"
                  className="w-5 h-5 rounded-full object-cover shrink-0 border border-[var(--sx-outline)]"
                />
              ) : (
                <span className="w-5 h-5 rounded-full bg-[var(--sx-primary)]/20 text-[var(--sx-primary)] text-[10px] font-extrabold flex items-center justify-center shrink-0">
                  {getParticipantInitial(hostName)}
                </span>
              )}
              <span className="text-xs font-semibold text-[var(--sx-on-surface)]/85 truncate">
                {hostName}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--sx-on-surface-muted)] pt-0.5">
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Clock className="w-3.5 h-3.5" />
                <span>Live · {formatRoomDuration(Date.now() - (room.createdAt || room.updatedAt))}</span>
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Users className="w-3.5 h-3.5" />
                <span>{room.participants.length} watching</span>
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>
                  {msgCount} {msgCount === 1 ? 'message' : 'messages'}
                </span>
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          data-testid={`watch-together-join-public-${room.roomCode}`}
          onClick={() => navigateIntoRoom(room.roomCode, room)}
          className="min-h-[40px] px-4 py-2 rounded-full sx-glass-cta text-xs font-bold whitespace-nowrap shrink-0 self-center"
        >
          Join
        </button>
      </li>
    );
  };

  const renderEndedRoomCard = (room: WatchPartyEndedRoom) => {
    const thumb = room.mediaCover || room.mediaBanner;
    const trackLabel = (room.track || 'H-Sub').toUpperCase();

    return (
      <li
        key={`${room.roomCode}-${room.endedAt}`}
        data-testid="watch-together-ended-card"
        className={`rounded-[var(--sx-radius)] ${watchGlassCardClass} p-3.5 sm:p-4 flex items-start gap-3.5`}
      >
        <div className="w-16 h-24 sm:w-20 sm:h-28 rounded-xl overflow-hidden bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] shrink-0 flex items-center justify-center">
          {thumb ? (
            <SmartImage
              src={thumb}
              alt={room.mediaTitle}
              fallbackTitle={room.mediaTitle}
              className="w-full h-full object-cover"
            />
          ) : (
            <Tv className="w-5 h-5 text-[var(--sx-primary)]" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="text-sm sm:text-base font-extrabold text-[var(--sx-on-surface)] truncate">
            {room.mediaTitle}
          </h3>

          <p className="text-xs font-medium text-[var(--sx-on-surface-muted)] truncate">
            <span>Ep {room.episodeNumber}</span>
            <span aria-hidden="true"> · </span>
            <span>{trackLabel}</span>
            <span aria-hidden="true"> · </span>
            <span>{room.roomName}</span>
          </p>

          <div className="flex items-center gap-2 min-w-0">
            {room.hostAvatar ? (
              <img
                src={room.hostAvatar}
                alt={room.hostName}
                referrerPolicy="no-referrer"
                className="w-5 h-5 rounded-full object-cover shrink-0 border border-[var(--sx-outline)]"
              />
            ) : (
              <span className="w-5 h-5 rounded-full bg-[var(--sx-primary)]/20 text-[var(--sx-primary)] text-[10px] font-extrabold flex items-center justify-center shrink-0">
                {getParticipantInitial(room.hostName)}
              </span>
            )}
            <span className="text-xs font-semibold text-[var(--sx-on-surface)]/85 truncate">
              {room.hostName}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--sx-on-surface-muted)] pt-0.5">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Clock className="w-3.5 h-3.5" />
              <span>
                Closed {formatRoomClosedAgo(room.endedAt)} · {formatRoomDuration(room.durationMs)}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Users className="w-3.5 h-3.5" />
              <span>Peak {room.peakParticipants}</span>
            </span>
          </div>

          <div className="flex items-center gap-1 text-xs text-[var(--sx-on-surface-muted)] tabular-nums">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>
              {room.messagesCount} {room.messagesCount === 1 ? 'message' : 'messages'}
            </span>
          </div>
        </div>
      </li>
    );
  };

  return (
    <div
      data-testid="watch-together-page"
      className="px-4 sm:px-6 lg:px-8 pt-6 pb-8 max-w-4xl mx-auto space-y-5"
    >
      {/* Header matching reference screenshot */}
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--sx-on-surface)]">
            Watch Together
          </h1>
          <p className="text-sm text-[var(--sx-on-surface-muted)] leading-relaxed">
            Watch anime in sync with friends and chat while you watch.
          </p>
        </div>

        <button
          type="button"
          data-testid="watch-together-refresh-btn"
          onClick={() => void fetchLobbyState(true)}
          aria-label="Refresh active rooms"
          title="Refresh active rooms"
          className={`w-11 h-11 rounded-full ${watchGlassControlClass} hover:border-[var(--sx-primary)]/40 flex items-center justify-center text-[var(--sx-on-surface)] transition-colors shrink-0`}
        >
          <RotateCw className={`w-4 h-4 ${refreshSpinning ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Join by Room Code + Create Room CTA */}
      <div className="space-y-3">
        <form
          onSubmit={(e) => void handleJoinByCode(e)}
          className="flex items-center gap-2.5"
        >
          <input
            type="text"
            data-testid="watch-together-code-input"
            value={roomCodeInput}
            maxLength={8}
            autoCapitalize="characters"
            autoComplete="off"
            aria-label="Room code"
            onChange={(e) => {
              setRoomCodeInput(normalizeRoomCode(e.target.value));
              setJoinError(null);
            }}
            placeholder="Room code"
            className={`flex-1 min-w-0 min-h-[48px] px-5 py-3 rounded-full ${watchGlassControlClass} text-sm font-semibold text-[var(--sx-on-surface)] placeholder:text-[var(--sx-on-surface-muted)] focus:outline-none focus:border-[var(--sx-primary)] transition-colors`}
          />
          <button
            type="submit"
            data-testid="watch-together-join-btn"
            disabled={!canJoinCode}
            className={`min-h-[48px] px-6 py-3 rounded-full ${watchGlassControlClass} hover:border-[var(--sx-primary)] text-sm font-bold text-[var(--sx-on-surface)] disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors`}
          >
            {joining ? 'Joining...' : 'Join'}
          </button>
        </form>

        {joinError && (
          <p
            data-testid="watch-together-code-error"
            className="text-xs font-semibold text-red-500 dark:text-red-300 bg-red-500/10 border border-red-500/25 rounded-2xl px-4 py-2.5"
          >
            {joinError}
          </p>
        )}

        <button
          type="button"
          data-testid="watch-together-host-btn"
          onClick={() => setCreateOpen(true)}
          className="w-full min-h-[50px] px-5 py-3 rounded-full sx-glass-cta text-sm font-extrabold flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <Plus className="w-4 h-4 shrink-0 stroke-[2.5]" />
          <span>Create room</span>
        </button>
      </div>

      {/* Segmented Lobby Tabs: Live now | Ended | My rooms */}
      <div
        role="tablist"
        aria-label="Watch Together room categories"
        className="flex items-center gap-2 pt-2 overflow-x-auto no-scrollbar"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'live'}
          data-testid="watch-tab-live"
          onClick={() => setActiveTab('live')}
          className={`min-h-[40px] px-4 py-2 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap inline-flex items-center gap-2 border transition-colors ${
            activeTab === 'live'
              ? 'bg-[var(--sx-primary)] border-[var(--sx-primary)] text-[var(--sx-on-primary)] shadow-sm'
              : `${watchGlassControlClass} text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]`
          }`}
        >
          <span>Live now</span>
          <span
            data-testid="watch-together-active-count"
            className="tabular-nums opacity-75"
          >
            {publicRooms.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'ended'}
          data-testid="watch-tab-ended"
          onClick={() => setActiveTab('ended')}
          className={`min-h-[40px] px-4 py-2 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap inline-flex items-center gap-2 border transition-colors ${
            activeTab === 'ended'
              ? 'bg-[var(--sx-primary)] border-[var(--sx-primary)] text-[var(--sx-on-primary)] shadow-sm'
              : `${watchGlassControlClass} text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]`
          }`}
        >
          <span>Ended</span>
          {endedRooms.length > 0 && (
            <span className="tabular-nums opacity-75">{endedRooms.length}</span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'my'}
          data-testid="watch-tab-my"
          onClick={() => setActiveTab('my')}
          className={`min-h-[40px] px-4 py-2 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap inline-flex items-center gap-2 border transition-colors ${
            activeTab === 'my'
              ? 'bg-[var(--sx-primary)] border-[var(--sx-primary)] text-[var(--sx-on-primary)] shadow-sm'
              : `${watchGlassControlClass} text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]`
          }`}
        >
          <span>My rooms</span>
        </button>
      </div>

      {/* Rooms Feed */}
      <section aria-live="polite" className="space-y-3">
        {loadingRooms &&
        publicRooms.length === 0 &&
        endedRooms.length === 0 ? (
          <div className={`rounded-[var(--sx-radius)] ${watchGlassCardClass} py-12 text-center text-xs font-semibold text-[var(--sx-on-surface-muted)]`}>
            Loading watch rooms...
          </div>
        ) : activeTab === 'live' ? (
          publicRooms.length === 0 ? (
            <div
              data-testid="watch-together-empty-rooms"
              className={`rounded-[var(--sx-radius)] ${watchGlassCardClass} py-12 px-4 text-center space-y-2.5`}
            >
              <MonitorOff
                aria-hidden="true"
                className="w-10 h-10 mx-auto text-[var(--sx-on-surface)]/75 stroke-[1.75]"
              />
              <p className="text-sm font-extrabold text-[var(--sx-on-surface)]">
                No live rooms right now
              </p>
              <p className="text-xs font-medium text-[var(--sx-on-surface-muted)] max-w-[260px] mx-auto leading-relaxed">
                Tap Create room above to start watching anime in sync with friends.
              </p>
            </div>
          ) : (
            <ul
              data-testid="watch-together-rooms-list"
              className="grid grid-cols-1 lg:grid-cols-2 gap-3"
            >
              {publicRooms.map(renderLiveRoomCard)}
            </ul>
          )
        ) : activeTab === 'ended' ? (
          endedRooms.length === 0 ? (
            <div
              data-testid="watch-together-empty-ended"
              className={`rounded-[var(--sx-radius)] ${watchGlassCardClass} py-12 px-4 text-center space-y-2.5`}
            >
              <Clock
                aria-hidden="true"
                className="w-10 h-10 mx-auto text-[var(--sx-on-surface)]/75 stroke-[1.75]"
              />
              <p className="text-sm font-extrabold text-[var(--sx-on-surface)]">
                No ended rooms yet
              </p>
              <p className="text-xs font-medium text-[var(--sx-on-surface-muted)] max-w-[260px] mx-auto leading-relaxed">
                Completed watch sessions will appear here with viewer and message summaries.
              </p>
            </div>
          ) : (
            <ul
              data-testid="watch-together-ended-list"
              className="grid grid-cols-1 lg:grid-cols-2 gap-3"
            >
              {endedRooms.map(renderEndedRoomCard)}
            </ul>
          )
        ) : myLiveRooms.length === 0 && myEndedRooms.length === 0 ? (
          <div
            data-testid="watch-together-empty-my"
            className={`rounded-[var(--sx-radius)] ${watchGlassCardClass} py-12 px-4 text-center space-y-2.5`}
          >
            <Users
              aria-hidden="true"
              className="w-10 h-10 mx-auto text-[var(--sx-on-surface)]/75 stroke-[1.75]"
            />
            <p className="text-sm font-extrabold text-[var(--sx-on-surface)]">
              You haven&apos;t hosted any rooms yet
            </p>
            <p className="text-xs font-medium text-[var(--sx-on-surface-muted)] max-w-[260px] mx-auto leading-relaxed">
              Rooms you create appear here so you can jump back in or review past sessions.
            </p>
          </div>
        ) : (
          <ul
            data-testid="watch-together-my-list"
            className="grid grid-cols-1 lg:grid-cols-2 gap-3"
          >
            {myLiveRooms.map(renderLiveRoomCard)}
            {myEndedRooms.map(renderEndedRoomCard)}
          </ul>
        )}
      </section>

      <CreateWatchRoomModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreateRoomSubmit}
      />
    </div>
  );
};
