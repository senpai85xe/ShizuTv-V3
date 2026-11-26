import { TrackerProfile } from '../types/media';
import { resolveWsUrl } from './backendConfig';

export type WatchPartyTrack = 'H-Sub' | 'Dub';

export interface WatchPartyParticipant {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: number;
}

export interface WatchPartyChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: number;
}

export interface WatchPartyRoom {
  roomCode: string;
  roomName?: string;
  track?: WatchPartyTrack;
  hostId: string;
  hostClientId?: string;
  hostAvatar?: string;
  isPublic?: boolean;
  mediaId: string;
  mediaTitle: string;
  mediaCover?: string;
  mediaBanner?: string;
  totalEpisodes?: number;
  episodeNumber: number;
  episodeTitle: string;
  isPlaying: boolean;
  currentTime: number;
  createdAt?: number;
  updatedAt: number;
  peakParticipants?: number;
  messagesCount?: number;
  messages?: WatchPartyChatMessage[];
  participants: WatchPartyParticipant[];
}

export interface WatchPartyEndedRoom {
  roomCode: string;
  roomName: string;
  track: WatchPartyTrack;
  hostName: string;
  hostAvatar?: string;
  hostClientId?: string;
  isPublic: boolean;
  mediaId: string;
  mediaTitle: string;
  mediaCover?: string;
  mediaBanner?: string;
  episodeNumber: number;
  episodeTitle: string;
  createdAt: number;
  endedAt: number;
  durationMs: number;
  peakParticipants: number;
  messagesCount: number;
}

export interface WatchPartyReaction {
  id: string;
  emoji: string;
  senderId: string;
  senderName: string;
  sentAt: number;
  laneSeed?: number;
}

export interface FloatingEmojiItem {
  id: string;
  emoji: string;
  senderName: string;
  xPercent: number;
  driftPx: number;
  rotateDeg: number;
  scale: number;
  createdAt: number;
}

export const WATCH_PARTY_REACTIONS = ['🔥', '❤️', '😂', '😮', '😭', '👏', '⚡'] as const;
export const REACTION_LIFETIME_MS = 2200;

export type WatchPartyLobbyTab = 'live' | 'ended' | 'my';

export type WatchPartySyncAction = 'play' | 'pause' | 'seek' | 'episode';

export interface WatchPartySyncPayload {
  action: WatchPartySyncAction;
  currentTime: number;
  isPlaying: boolean;
  episodeNumber: number;
  episodeTitle: string;
  updatedAt?: number;
}

export type WatchPartyConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export const WATCH_PARTY_CODE_LENGTH = 6;
export const WATCH_PARTY_CLIENT_ID_STORAGE_KEY = 'shizutv_watch_party_client_id';

export function getOrCreateWatchPartyClientId(): string {
  if (typeof window === 'undefined') return 'server-client';
  try {
    const existing = window.sessionStorage.getItem(WATCH_PARTY_CLIENT_ID_STORAGE_KEY);
    if (existing) return existing;
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `wp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    window.sessionStorage.setItem(WATCH_PARTY_CLIENT_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `wp-${Date.now()}`;
  }
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

export function isValidRoomCode(code: string): boolean {
  const normalized = normalizeRoomCode(code);
  return normalized.length >= 4 && normalized.length <= 8;
}

export function createEmptyCodeSlots(length = WATCH_PARTY_CODE_LENGTH): string[] {
  return Array.from({ length }, () => '');
}

export function splitCodeIntoSlots(
  code: string,
  length = WATCH_PARTY_CODE_LENGTH,
): string[] {
  const normalized = normalizeRoomCode(code).slice(0, length);
  return Array.from({ length }, (_, idx) => normalized[idx] ?? '');
}

export function joinCodeSlots(slots: string[]): string {
  return slots.map((s) => normalizeRoomCode(s).slice(0, 1)).join('');
}

export function updateCodeSlot(
  slots: string[],
  index: number,
  rawInput: string,
): { nextSlots: string[]; nextFocusIndex: number } {
  const length = slots.length || WATCH_PARTY_CODE_LENGTH;
  const clampedIdx = Math.max(0, Math.min(length - 1, index));
  const cleaned = normalizeRoomCode(rawInput);
  const nextSlots = [...slots];

  if (!cleaned) {
    nextSlots[clampedIdx] = '';
    return { nextSlots, nextFocusIndex: clampedIdx };
  }

  if (cleaned.length === 1) {
    nextSlots[clampedIdx] = cleaned;
    return {
      nextSlots,
      nextFocusIndex: Math.min(length - 1, clampedIdx + 1),
    };
  }

  return applyCodePaste(nextSlots, clampedIdx, cleaned);
}

export function applyCodePaste(
  slots: string[],
  startIndex: number,
  pastedText: string,
): { nextSlots: string[]; nextFocusIndex: number } {
  const length = slots.length || WATCH_PARTY_CODE_LENGTH;
  const cleaned = normalizeRoomCode(pastedText).slice(0, length);
  if (!cleaned) {
    return { nextSlots: [...slots], nextFocusIndex: Math.max(0, startIndex) };
  }

  const nextSlots = [...slots];
  const baseIdx = cleaned.length >= length ? 0 : Math.max(0, Math.min(length - 1, startIndex));
  let written = 0;
  for (let i = 0; i < cleaned.length && baseIdx + i < length; i++) {
    nextSlots[baseIdx + i] = cleaned[i];
    written++;
  }
  const nextFocusIndex = Math.min(length - 1, baseIdx + written);
  return { nextSlots, nextFocusIndex };
}

export function resolveDefaultDisplayName(profiles: {
  anilist?: TrackerProfile;
  myanimelist?: TrackerProfile;
  kitsu?: TrackerProfile;
}): string {
  const candidates = [
    profiles.anilist?.username,
    profiles.myanimelist?.username,
    profiles.kitsu?.username,
  ];
  for (const username of candidates) {
    if (typeof username === 'string' && username.trim().length > 0) {
      return username.trim().slice(0, 28);
    }
  }
  return 'Guest';
}

export function resolveDefaultHostAvatar(profiles: {
  anilist?: TrackerProfile;
  myanimelist?: TrackerProfile;
  kitsu?: TrackerProfile;
}): string | undefined {
  return (
    profiles.anilist?.avatarUrl ||
    profiles.myanimelist?.avatarUrl ||
    profiles.kitsu?.avatarUrl ||
    undefined
  );
}

export function buildDefaultRoomName(displayName: string): string {
  const trimmed = displayName.trim().slice(0, 28) || 'Guest';
  return `${trimmed}'s room`;
}

export function formatRoomDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 60_000) {
    return '<1 min';
  }
  const totalMinutes = Math.round(durationMs / 60_000);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function formatRoomClosedAgo(endedAt: number, nowMs = Date.now()): string {
  if (!Number.isFinite(endedAt) || endedAt <= 0) return 'Recently';
  const diffSec = Math.max(0, Math.floor((nowMs - endedAt) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function upsertParticipant(
  list: WatchPartyParticipant[],
  participant: WatchPartyParticipant,
): WatchPartyParticipant[] {
  const existingIdx = list.findIndex((p) => p.id === participant.id);
  if (existingIdx === -1) {
    return [...list, participant];
  }
  const next = [...list];
  next[existingIdx] = { ...next[existingIdx], ...participant };
  return next;
}

export function removeParticipant(
  list: WatchPartyParticipant[],
  participantId: string,
): WatchPartyParticipant[] {
  return list.filter((p) => p.id !== participantId);
}

export function computeSyncedPlaybackTime(
  currentTime: number,
  updatedAt: number,
  isPlaying: boolean,
  nowMs = Date.now(),
): number {
  const safeTime = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0;
  if (!isPlaying || !Number.isFinite(updatedAt) || updatedAt <= 0) {
    return safeTime;
  }
  const elapsedSec = Math.max(0, Math.min(30, (nowMs - updatedAt) / 1000));
  return Math.round((safeTime + elapsedSec) * 100) / 100;
}

export function shouldApplyRemoteSeek(
  localTime: number,
  remoteTime: number,
  thresholdSeconds = 1.5,
): boolean {
  if (!Number.isFinite(remoteTime) || remoteTime < 0) return false;
  if (!Number.isFinite(localTime)) return true;
  return Math.abs(localTime - remoteTime) >= thresholdSeconds;
}

export function buildWatchPartyWsUrl(locationLike?: {
  protocol?: string;
  host?: string;
}): string {
  return resolveWsUrl('/ws/watch-party', { locationLike });
}

export function buildWatchPartyInviteUrl(
  roomCode: string,
  origin?: string,
): string {
  const normalized = normalizeRoomCode(roomCode);
  const base =
    origin ??
    (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3000');
  return `${base}/watch-together/${encodeURIComponent(normalized)}`;
}

export function isSupportedReactionEmoji(emoji: string): boolean {
  const trimmed = emoji.trim();
  if (!trimmed || trimmed.length > 8) return false;
  return (WATCH_PARTY_REACTIONS as readonly string[]).includes(trimmed);
}

export function buildFloatingEmojiParticle(
  reaction: WatchPartyReaction,
): FloatingEmojiItem {
  let hash = 0;
  for (let i = 0; i < reaction.id.length; i++) {
    hash = (hash * 31 + reaction.id.charCodeAt(i)) >>> 0;
  }
  const seed =
    typeof reaction.laneSeed === 'number' && Number.isFinite(reaction.laneSeed)
      ? Math.max(0, Math.min(1, reaction.laneSeed))
      : (hash % 1000) / 1000;
  const subSeed = ((hash >> 5) % 100) / 100;

  return {
    id: reaction.id,
    emoji: reaction.emoji,
    senderName: reaction.senderName,
    xPercent: Math.round(14 + seed * 72),
    driftPx: Math.round((subSeed - 0.5) * 44),
    rotateDeg: Math.round((subSeed - 0.5) * 24),
    scale: Math.round((0.95 + (seed % 0.3)) * 100) / 100,
    createdAt: reaction.sentAt || Date.now(),
  };
}

export function getParticipantInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : 'G';
}

export function filterPublicRooms(rooms: WatchPartyRoom[]): WatchPartyRoom[] {
  return rooms.filter((room) => room.isPublic !== false);
}

export function filterMyLiveRooms(
  rooms: WatchPartyRoom[],
  clientId: string,
  displayName?: string,
): WatchPartyRoom[] {
  const normName = displayName?.trim().toLowerCase();
  return rooms.filter((room) => {
    if (room.hostClientId && room.hostClientId === clientId) return true;
    if (room.hostId === clientId) return true;
    if (normName && normName !== 'guest') {
      return getHostDisplayName(room).trim().toLowerCase() === normName;
    }
    return false;
  });
}

export function filterMyEndedRooms(
  endedRooms: WatchPartyEndedRoom[],
  clientId: string,
  displayName?: string,
): WatchPartyEndedRoom[] {
  const normName = displayName?.trim().toLowerCase();
  return endedRooms.filter((room) => {
    if (room.hostClientId && room.hostClientId === clientId) return true;
    if (normName && normName !== 'guest') {
      return room.hostName.trim().toLowerCase() === normName;
    }
    return false;
  });
}

export function getHostDisplayName(room: WatchPartyRoom): string {
  const host = room.participants.find((p) => p.id === room.hostId || p.isHost);
  return host?.name || 'Host';
}

export const EMPTY_ROOM_GRACE_MS = 120_000;

export function shouldRestoreHostRole(
  roomHostClientId: string | undefined,
  incomingClientId: string,
  activeParticipantCount: number,
): boolean {
  if (!incomingClientId) return false;
  if (roomHostClientId && roomHostClientId === incomingClientId) return true;
  return activeParticipantCount === 0;
}

export function isRoomGraceExpired(
  emptySince: number | null | undefined,
  nowMs = Date.now(),
  graceMs = EMPTY_ROOM_GRACE_MS,
): boolean {
  if (typeof emptySince !== 'number' || !Number.isFinite(emptySince) || emptySince <= 0) {
    return false;
  }
  return nowMs - emptySince >= graceMs;
}

export function sanitizeRoomNameUpdate(
  raw: unknown,
  fallbackHostName = 'Host',
): string {
  if (typeof raw === 'string') {
    const cleaned = raw.trim().slice(0, 48);
    if (cleaned.length > 0) return cleaned;
  }
  return buildDefaultRoomName(fallbackHostName);
}

export function formatWatchRoomMetaLine(params: {
  format?: string | null;
  year?: number | null;
  totalEpisodes?: number | null;
  averageScore?: number | null;
}): string {
  const parts: string[] = [];
  if (typeof params.format === 'string' && params.format.trim()) {
    parts.push(params.format.trim().toUpperCase());
  }
  if (typeof params.year === 'number' && Number.isFinite(params.year) && params.year > 1900) {
    parts.push(String(Math.floor(params.year)));
  }
  if (
    typeof params.totalEpisodes === 'number' &&
    Number.isFinite(params.totalEpisodes) &&
    params.totalEpisodes > 0
  ) {
    parts.push(`${Math.floor(params.totalEpisodes)} eps`);
  }
  if (
    typeof params.averageScore === 'number' &&
    Number.isFinite(params.averageScore) &&
    params.averageScore > 0
  ) {
    const normalizedTen =
      params.averageScore > 10 ? params.averageScore / 10 : params.averageScore;
    parts.push(`★ ${normalizedTen.toFixed(1)}`);
  }
  return parts.join(' · ');
}
