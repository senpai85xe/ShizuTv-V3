import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildFloatingEmojiParticle,
  buildWatchPartyWsUrl,
  computeSyncedPlaybackTime,
  FloatingEmojiItem,
  getOrCreateWatchPartyClientId,
  normalizeRoomCode,
  REACTION_LIFETIME_MS,
  WatchPartyChatMessage,
  WatchPartyConnectionStatus,
  WatchPartyParticipant,
  WatchPartyReaction,
  WatchPartyRoom,
  WatchPartySyncPayload,
  WatchPartyTrack,
} from '../utils/watchParty';

export interface CreateWatchPartyInput {
  userName: string;
  roomName?: string;
  track?: WatchPartyTrack;
  hostAvatar?: string;
  isPublic?: boolean;
  mediaId: string;
  mediaTitle: string;
  mediaCover?: string | null;
  mediaBanner?: string | null;
  totalEpisodes?: number;
  episodeNumber: number;
  episodeTitle: string;
  currentTime: number;
  isPlaying: boolean;
}

export interface JoinWatchPartyInput {
  roomCode: string;
  userName: string;
}

export interface UseWatchPartyOptions {
  onRemoteSync?: (payload: WatchPartySyncPayload) => void;
  onRoomHydrated?: (room: WatchPartyRoom, syncedTime: number) => void;
}

export interface UpdateWatchRoomInput {
  roomName?: string;
  mediaId?: string;
  mediaTitle?: string;
  mediaCover?: string | null;
  mediaBanner?: string | null;
  totalEpisodes?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  track?: WatchPartyTrack;
  isPublic?: boolean;
}

export interface UseWatchPartyResult {
  room: WatchPartyRoom | null;
  participantId: string | null;
  isActive: boolean;
  status: WatchPartyConnectionStatus;
  error: string | null;
  lastEventNotice: string | null;
  messages: WatchPartyChatMessage[];
  reactions: FloatingEmojiItem[];
  createRoom: (input: CreateWatchPartyInput) => void;
  joinRoom: (input: JoinWatchPartyInput) => void;
  leaveRoom: () => void;
  endRoom: () => void;
  sendSync: (payload: WatchPartySyncPayload) => void;
  sendChatMessage: (text: string) => void;
  sendReaction: (emoji: string) => void;
  updateRoomMeta: (patch: UpdateWatchRoomInput) => void;
  clearError: () => void;
}

export function useWatchParty({
  onRemoteSync,
  onRoomHydrated,
}: UseWatchPartyOptions = {}): UseWatchPartyResult {
  const [room, setRoom] = useState<WatchPartyRoom | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [status, setStatus] = useState<WatchPartyConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [lastEventNotice, setLastEventNotice] = useState<string | null>(null);
  const [messages, setMessages] = useState<WatchPartyChatMessage[]>([]);
  const [reactions, setReactions] = useState<FloatingEmojiItem[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string>(getOrCreateWatchPartyClientId());
  const desiredRoomRef = useRef<{ roomCode: string; userName: string } | null>(null);
  const pendingConnectActionRef = useRef<(() => void) | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const reactionTimersRef = useRef<Map<string, number>>(new Map());
  const reconnectAttemptRef = useRef(0);
  const unmountedRef = useRef(false);

  const onRemoteSyncRef = useRef(onRemoteSync);
  onRemoteSyncRef.current = onRemoteSync;

  const onRoomHydratedRef = useRef(onRoomHydrated);
  onRoomHydratedRef.current = onRoomHydrated;

  const pushNotice = useCallback((msg: string) => {
    setLastEventNotice(msg);
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setLastEventNotice(null);
      noticeTimerRef.current = null;
    }, 3200);
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const sendRaw = useCallback((payload: unknown): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }, []);

  const ensureSocket = useCallback(
    (onOpenAction?: () => void) => {
      if (onOpenAction) {
        pendingConnectActionRef.current = onOpenAction;
      }

      const existing = wsRef.current;
      if (existing && existing.readyState === WebSocket.OPEN) {
        const fn = pendingConnectActionRef.current;
        pendingConnectActionRef.current = null;
        fn?.();
        return;
      }
      if (existing && existing.readyState === WebSocket.CONNECTING) {
        return;
      }

      clearReconnectTimer();
      setStatus(desiredRoomRef.current ? 'reconnecting' : 'connecting');

      let ws: WebSocket;
      try {
        ws = new WebSocket(buildWatchPartyWsUrl());
      } catch (err) {
        pendingConnectActionRef.current = null;
        setStatus('disconnected');
        setError(
          err instanceof Error
            ? err.message
            : 'Watch Party server URL is not configured.',
        );
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmountedRef.current || wsRef.current !== ws) return;
        reconnectAttemptRef.current = 0;
        setStatus('connected');
        setError(null);

        const pending = pendingConnectActionRef.current;
        pendingConnectActionRef.current = null;
        if (pending) {
          pending();
        } else if (desiredRoomRef.current) {
          ws.send(
            JSON.stringify({
              type: 'party:join',
              roomCode: desiredRoomRef.current.roomCode,
              userName: desiredRoomRef.current.userName,
              clientId: clientIdRef.current,
            }),
          );
        }
      };

      ws.onmessage = (event) => {
        if (unmountedRef.current) return;
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(String(event.data)) as Record<string, unknown>;
        } catch {
          return;
        }

        const msgType = typeof data.type === 'string' ? data.type : '';

        if (msgType === 'party:state' && data.room && typeof data.room === 'object') {
          const nextRoom = data.room as WatchPartyRoom;
          const yourId =
            typeof data.yourParticipantId === 'string'
              ? data.yourParticipantId
              : clientIdRef.current;
          const selfParticipant = nextRoom.participants.find((p) => p.id === yourId);
          desiredRoomRef.current = {
            roomCode: nextRoom.roomCode,
            userName: selfParticipant?.name || desiredRoomRef.current?.userName || 'Guest',
          };
          setParticipantId(yourId);
          setRoom(nextRoom);
          setMessages(Array.isArray(nextRoom.messages) ? nextRoom.messages : []);
          setError(null);

          const syncedTime = computeSyncedPlaybackTime(
            nextRoom.currentTime,
            nextRoom.updatedAt,
            nextRoom.isPlaying,
          );
          onRoomHydratedRef.current?.(nextRoom, syncedTime);
          return;
        }

        if (msgType === 'party:presence') {
          const incomingParticipants = Array.isArray(data.participants)
            ? (data.participants as WatchPartyParticipant[])
            : null;
          const incomingHostId =
            typeof data.hostId === 'string' ? data.hostId : undefined;
          const actorName = typeof data.actorName === 'string' ? data.actorName : 'Viewer';
          const ev = data.event === 'left' ? 'left' : 'joined';

          if (incomingParticipants) {
            setRoom((prev) =>
              prev && prev.roomCode === data.roomCode
                ? {
                    ...prev,
                    hostId: incomingHostId ?? prev.hostId,
                    participants: incomingParticipants,
                  }
                : prev,
            );
            pushNotice(`${actorName} ${ev} the room`);
          }
          return;
        }

        if (msgType === 'party:sync') {
          const payload: WatchPartySyncPayload = {
            action:
              data.action === 'play' ||
              data.action === 'pause' ||
              data.action === 'seek' ||
              data.action === 'episode'
                ? data.action
                : 'seek',
            currentTime: typeof data.currentTime === 'number' ? data.currentTime : 0,
            isPlaying: Boolean(data.isPlaying),
            episodeNumber: typeof data.episodeNumber === 'number' ? data.episodeNumber : 1,
            episodeTitle:
              typeof data.episodeTitle === 'string' ? data.episodeTitle : 'Episode 1',
            updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
          };
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  currentTime: payload.currentTime,
                  isPlaying: payload.isPlaying,
                  episodeNumber: payload.episodeNumber,
                  episodeTitle: payload.episodeTitle,
                  updatedAt: payload.updatedAt ?? Date.now(),
                }
              : prev,
          );
          onRemoteSyncRef.current?.(payload);
          return;
        }

        if (msgType === 'party:chat' && data.message && typeof data.message === 'object') {
          const incoming = data.message as WatchPartyChatMessage;
          setMessages((prev) =>
            prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming],
          );
          return;
        }

        if (msgType === 'party:reaction' && data.reaction && typeof data.reaction === 'object') {
          const incoming = data.reaction as WatchPartyReaction;
          if (!incoming.id || !incoming.emoji) return;
          const particle = buildFloatingEmojiParticle(incoming);
          setReactions((prev) =>
            prev.some((r) => r.id === particle.id)
              ? prev
              : [...prev.slice(-29), particle],
          );
          if (!reactionTimersRef.current.has(particle.id)) {
            const timerId = window.setTimeout(() => {
              reactionTimersRef.current.delete(particle.id);
              setReactions((prev) => prev.filter((r) => r.id !== particle.id));
            }, REACTION_LIFETIME_MS);
            reactionTimersRef.current.set(particle.id, timerId);
          }
          return;
        }

        if (msgType === 'party:ended') {
          const message =
            typeof data.message === 'string'
              ? data.message
              : 'The host ended this Watch Party.';
          desiredRoomRef.current = null;
          pendingConnectActionRef.current = null;
          clearReconnectTimer();
          setRoom(null);
          setParticipantId(null);
          setMessages([]);
          setReactions([]);
          setStatus('disconnected');
          setError(message);
          return;
        }

        if (msgType === 'party:error') {
          const message =
            typeof data.message === 'string' ? data.message : 'Watch Party error occurred.';
          if (data.code === 'ROOM_NOT_FOUND') {
            desiredRoomRef.current = null;
            setRoom(null);
            setMessages([]);
          }
          setError(message);
        }
      };

      ws.onerror = () => {
        if (unmountedRef.current || wsRef.current !== ws) return;
        setError('Unable to reach Watch Party server.');
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        if (unmountedRef.current) return;

        if (desiredRoomRef.current) {
          setStatus('reconnecting');
          const attempt = reconnectAttemptRef.current;
          reconnectAttemptRef.current += 1;
          const delayMs = Math.min(8000, 900 * 2 ** Math.min(attempt, 3));
          clearReconnectTimer();
          reconnectTimerRef.current = window.setTimeout(() => {
            if (!unmountedRef.current && desiredRoomRef.current) {
              ensureSocket();
            }
          }, delayMs);
        } else {
          setStatus('disconnected');
        }
      };
    },
    [clearReconnectTimer, pushNotice],
  );

  const createRoom = useCallback(
    (input: CreateWatchPartyInput) => {
      setError(null);
      ensureSocket(() => {
        sendRaw({
          type: 'party:create',
          clientId: clientIdRef.current,
          userName: input.userName.trim() || 'Guest',
          roomName: input.roomName?.trim() || undefined,
          track: input.track || 'H-Sub',
          hostAvatar: input.hostAvatar || undefined,
          isPublic: input.isPublic !== false,
          mediaId: input.mediaId,
          mediaTitle: input.mediaTitle,
          mediaCover: input.mediaCover || undefined,
          mediaBanner: input.mediaBanner || undefined,
          totalEpisodes: input.totalEpisodes || undefined,
          episodeNumber: input.episodeNumber,
          episodeTitle: input.episodeTitle,
          currentTime: input.currentTime,
          isPlaying: input.isPlaying,
        });
      });
    },
    [ensureSocket, sendRaw],
  );

  const joinRoom = useCallback(
    (input: JoinWatchPartyInput) => {
      const normalized = normalizeRoomCode(input.roomCode);
      if (!normalized) {
        setError('Enter a room code to join.');
        return;
      }
      const userName = input.userName.trim() || 'Guest';
      desiredRoomRef.current = { roomCode: normalized, userName };
      setError(null);
      ensureSocket(() => {
        sendRaw({
          type: 'party:join',
          clientId: clientIdRef.current,
          roomCode: normalized,
          userName,
        });
      });
    },
    [ensureSocket, sendRaw],
  );

  const leaveRoom = useCallback(() => {
    const activeCode = desiredRoomRef.current?.roomCode || room?.roomCode;
    desiredRoomRef.current = null;
    pendingConnectActionRef.current = null;
    clearReconnectTimer();

    if (activeCode) {
      sendRaw({ type: 'party:leave', roomCode: activeCode });
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignore close errors
      }
      wsRef.current = null;
    }

    setRoom(null);
    setParticipantId(null);
    setMessages([]);
    setReactions([]);
    setError(null);
    setLastEventNotice(null);
    setStatus('disconnected');
  }, [clearReconnectTimer, room?.roomCode, sendRaw]);

  const endRoom = useCallback(() => {
    const activeCode = desiredRoomRef.current?.roomCode || room?.roomCode;
    desiredRoomRef.current = null;
    pendingConnectActionRef.current = null;
    clearReconnectTimer();

    if (activeCode) {
      sendRaw({ type: 'party:end', roomCode: activeCode });
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignore close errors
      }
      wsRef.current = null;
    }

    setRoom(null);
    setParticipantId(null);
    setMessages([]);
    setReactions([]);
    setError(null);
    setLastEventNotice(null);
    setStatus('disconnected');
  }, [clearReconnectTimer, room?.roomCode, sendRaw]);

  const sendSync = useCallback(
    (payload: WatchPartySyncPayload) => {
      if (!desiredRoomRef.current && !room) return;
      sendRaw({
        type: 'party:sync',
        roomCode: room?.roomCode ?? desiredRoomRef.current?.roomCode,
        action: payload.action,
        currentTime: payload.currentTime,
        isPlaying: payload.isPlaying,
        episodeNumber: payload.episodeNumber,
        episodeTitle: payload.episodeTitle,
      });
    },
    [room, sendRaw],
  );

  const sendChatMessage = useCallback(
    (text: string) => {
      const cleaned = text.trim().slice(0, 280);
      if (!cleaned || (!desiredRoomRef.current && !room)) return;
      sendRaw({
        type: 'party:chat',
        roomCode: room?.roomCode ?? desiredRoomRef.current?.roomCode,
        text: cleaned,
      });
    },
    [room, sendRaw],
  );

  const sendReaction = useCallback(
    (emoji: string) => {
      const cleaned = emoji.trim().slice(0, 8);
      if (!cleaned || (!desiredRoomRef.current && !room)) return;
      sendRaw({
        type: 'party:reaction',
        roomCode: room?.roomCode ?? desiredRoomRef.current?.roomCode,
        emoji: cleaned,
      });
    },
    [room, sendRaw],
  );

  const updateRoomMeta = useCallback(
    (patch: UpdateWatchRoomInput) => {
      if (!desiredRoomRef.current && !room) return;
      sendRaw({
        type: 'party:update',
        roomCode: room?.roomCode ?? desiredRoomRef.current?.roomCode,
        ...patch,
      });
    },
    [room, sendRaw],
  );

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      clearReconnectTimer();
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
      for (const timerId of reactionTimersRef.current.values()) {
        window.clearTimeout(timerId);
      }
      reactionTimersRef.current.clear();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        try {
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
          if (ws.readyState === WebSocket.OPEN) {
            if (desiredRoomRef.current) {
              ws.send(
                JSON.stringify({
                  type: 'party:leave',
                  roomCode: desiredRoomRef.current.roomCode,
                }),
              );
            }
            ws.close();
          } else if (ws.readyState === WebSocket.CONNECTING) {
            ws.onopen = () => {
              try {
                ws.close();
              } catch {
                // Ignore close errors
              }
            };
          }
        } catch {
          // Ignore unmount socket errors
        }
      }
    };
  }, [clearReconnectTimer]);

  return {
    room,
    participantId,
    isActive: Boolean(room),
    status,
    error,
    lastEventNotice,
    messages,
    reactions,
    createRoom,
    joinRoom,
    leaveRoom,
    endRoom,
    sendSync,
    sendChatMessage,
    sendReaction,
    updateRoomMeta,
    clearError,
  };
}
