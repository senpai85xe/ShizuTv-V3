import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import {
  ANILIST_TOKEN_URL,
  buildAniListAuthorizeUrl,
  resolveAniListRedirectUri,
} from './src/utils/anilistOAuth.ts';
import {
  isSafeExternalHttpUrl,
  parseExtensionRepoManifest,
} from './src/utils/extensionRepoParser.ts';
import {
  buildApiCorsHeaders,
  getAllowedCorsOrigins,
} from './src/utils/corsConfig.ts';
import {
  diagnoseAnimeExtensionServer,
  ExtensionCapabilityError,
  resolveAnimeEpisodeStream,
  resolveAnimeExtensionEpisodesServer,
  searchAnimeExtensionEntriesServer,
} from './src/server/animeStreamResolver.ts';
import {
  diagnoseMangaExtensionServer,
  resolveMangaChapterPagesServer,
  resolveMangaChaptersServer,
} from './src/server/mangaResolver.ts';
import {
  buildCapabilitiesBreakdown,
  type ExtensionDiagnoseMode,
} from './src/utils/extensionDiagnostics.ts';
import {
  checkBatchSourcesHealthServer,
  type ServerHealthCheckInputSource,
} from './src/server/sourceHealthCheck.ts';
import { isMetadataOnlyCatalogHost, rewriteM3u8Manifest } from './src/utils/streamResolverUtils.ts';
import { isM3u8ManifestBody, shouldBufferForM3u8Check } from './src/utils/sourceFailover.ts';
import type { ExtensionRepo, SourceInfo } from './src/types/media.ts';

type WatchPartyTrack = 'H-Sub' | 'Dub';

interface WatchPartyParticipant {
  id: string;
  name: string;
  clientId: string;
  isHost: boolean;
  joinedAt: number;
}

interface WatchPartyChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: number;
}

interface WatchPartyRoomState {
  roomCode: string;
  roomName: string;
  track: WatchPartyTrack;
  hostId: string;
  hostClientId: string;
  hostAvatar?: string;
  isPublic: boolean;
  mediaId: string;
  mediaTitle: string;
  mediaCover?: string;
  mediaBanner?: string;
  totalEpisodes: number;
  episodeNumber: number;
  episodeTitle: string;
  isPlaying: boolean;
  currentTime: number;
  createdAt: number;
  updatedAt: number;
  peakParticipants: number;
  messagesCount: number;
  emptySince?: number;
  messages: WatchPartyChatMessage[];
  participants: WatchPartyParticipant[];
}

interface WatchPartyEndedRoomSummary {
  roomCode: string;
  roomName: string;
  track: WatchPartyTrack;
  hostName: string;
  hostAvatar?: string;
  hostClientId: string;
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

interface ConnectionMeta {
  participantId: string;
  clientId: string;
  roomCode: string | null;
  subscribedToLobby: boolean;
}

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const EMPTY_ROOM_GRACE_MS = 120_000;
const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rooms = new Map<string, WatchPartyRoomState>();
const roomExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const endedRooms: WatchPartyEndedRoomSummary[] = [];
const socketMeta = new Map<WebSocket, ConnectionMeta>();

const ANILIST_SESSION_COOKIE_NAME = 'shizutv_anilist_token';
const OAUTH_STATE_TTL_MS = 10 * 60_000;
const oauthPendingStates = new Map<
  string,
  { redirectUri: string; createdAt: number }
>();

function pruneExpiredOAuthStates() {
  const cutoff = Date.now() - OAUTH_STATE_TTL_MS;
  for (const [key, value] of oauthPendingStates.entries()) {
    if (value.createdAt < cutoff) {
      oauthPendingStates.delete(key);
    }
  }
}

function getAniListOAuthConfig() {
  const clientId = (
    process.env.ANILIST_CLIENT_ID ||
    process.env.CLIENT_ID ||
    process.env.VITE_ANILIST_CLIENT_ID ||
    ''
  ).trim();
  const clientSecret = (
    process.env.ANILIST_CLIENT_SECRET ||
    process.env.CLIENT_SECRET ||
    ''
  ).trim();
  return {
    clientId,
    clientSecret,
    configured: clientId.length > 0,
    hasSecret: clientSecret.length > 0,
    flow: (clientSecret.length > 0 ? 'code' : 'token') as 'code' | 'token',
  };
}

function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

function setAniListSessionCookie(
  res: express.Response,
  accessToken: string,
  expiresInSeconds?: number | null,
) {
  const maxAgeMs =
    typeof expiresInSeconds === 'number' &&
    Number.isFinite(expiresInSeconds) &&
    expiresInSeconds > 0
      ? Math.min(expiresInSeconds, 365 * 24 * 60 * 60) * 1000
      : 30 * 24 * 60 * 60 * 1000;
  res.cookie(ANILIST_SESSION_COOKIE_NAME, accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: maxAgeMs,
  });
}

function clearAniListSessionCookie(res: express.Response) {
  res.clearCookie(ANILIST_SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
  });
}

function escapeHtmlScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

type CommunityCategory = 'announcements' | 'general' | 'feedback' | 'features' | 'help';
type CommunityLabel = 'resolved' | 'planned' | 'duplicate' | 'bug';

interface StoredCommunityComment {
  id: string;
  authorName: string;
  authorAvatar?: string | null;
  authorIsMod?: boolean;
  body: string;
  createdAt: number;
}

interface StoredCommunityPost {
  id: string;
  clientId: string;
  category: CommunityCategory;
  title: string;
  body: string;
  authorName: string;
  authorAvatar?: string | null;
  authorIsMod?: boolean;
  pinned?: boolean;
  label?: CommunityLabel | null;
  linkedAnime: Array<{ id: string | number; title: string; cover?: string | null }>;
  baseScore: number;
  votes: Record<string, -1 | 1>;
  comments: StoredCommunityComment[];
  views: number;
  createdAt: number;
}

const COMMUNITY_STORE_PATH = path.join(os.tmpdir(), 'shizutv-community-posts-v1.json');

const EXTRA_COMMUNITY_SEED_IDS = new Set([
  'seed-seasonal',
  'seed-softsubs',
  'seed-feedback-sync',
  'seed-general-recs',
  'seed-help-anilist',
]);

function createSeedCommunityPosts(): StoredCommunityPost[] {
  const now = Date.now();
  return [
    {
      id: 'seed-welcome',
      clientId: 'shizutv-mod',
      category: 'announcements',
      title: 'Welcome to the Community — please read the rules',
      body: 'Welcome! This is the place to talk anime with **fellow fans**, share recommendations, report playback bugs, and suggest what ShizuTv should build next.\n> Keep spoilers wrapped like ||this|| and stay kind in every thread.',
      authorName: 'ShizuTv',
      authorIsMod: true,
      pinned: true,
      label: null,
      linkedAnime: [],
      baseScore: 16,
      votes: {},
      comments: [
        {
          id: 'seed-c1',
          authorName: 'ShizuTv',
          authorIsMod: true,
          body: 'Drop your favorite currently airing shows below!',
          createdAt: now - 2 * 86_400_000,
        },
        {
          id: 'seed-c2',
          authorName: 'Rio',
          body: 'Super clean frosted community hub — loving the Watch Together rooms too.',
          createdAt: now - 36 * 3600_000,
        },
      ],
      views: 192,
      createdAt: now - 3 * 86_400_000,
    },
  ];
}

function loadCommunityPosts(): StoredCommunityPost[] {
  try {
    if (fs.existsSync(COMMUNITY_STORE_PATH)) {
      const raw = fs.readFileSync(COMMUNITY_STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cleaned = (parsed as StoredCommunityPost[]).filter(
          (post) => !EXTRA_COMMUNITY_SEED_IDS.has(post.id),
        );
        if (cleaned.length !== parsed.length) {
          try {
            fs.writeFileSync(
              COMMUNITY_STORE_PATH,
              JSON.stringify(cleaned.length > 0 ? cleaned : createSeedCommunityPosts()),
              'utf8',
            );
          } catch {
            // Ignore write failure in ephemeral containers
          }
        }
        if (cleaned.length > 0) {
          return cleaned;
        }
      }
    }
  } catch {
    // Fall back to seeds if temp file unreadable
  }
  return createSeedCommunityPosts();
}

const communityPosts: StoredCommunityPost[] = loadCommunityPosts();

function persistCommunityPosts() {
  try {
    fs.writeFileSync(COMMUNITY_STORE_PATH, JSON.stringify(communityPosts), 'utf8');
  } catch {
    // Ignore disk write failure in ephemeral containers
  }
}

function serializeCommunityPost(post: StoredCommunityPost, clientId?: string) {
  const voteDelta = Object.values(post.votes).reduce<number>((sum, v) => sum + v, 0);
  return {
    id: post.id,
    clientId: post.clientId,
    category: post.category,
    title: post.title,
    body: post.body,
    authorName: post.authorName,
    authorAvatar: post.authorAvatar ?? null,
    authorIsMod: Boolean(post.authorIsMod),
    pinned: Boolean(post.pinned),
    label: post.label ?? null,
    linkedAnime: post.linkedAnime,
    score: post.baseScore + voteDelta,
    userVote: clientId ? post.votes[clientId] ?? 0 : 0,
    comments: post.comments,
    views: post.views,
    createdAt: post.createdAt,
  };
}

function clearRoomExpiryTimer(roomCode: string) {
  const existing = roomExpiryTimers.get(roomCode);
  if (existing) {
    clearTimeout(existing);
    roomExpiryTimers.delete(roomCode);
  }
}

function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Guest';
  const trimmed = raw.trim().slice(0, 28);
  return trimmed.length > 0 ? trimmed : 'Guest';
}

function sanitizeRoomName(raw: unknown, hostName: string): string {
  if (typeof raw === 'string') {
    const trimmed = raw.trim().slice(0, 48);
    if (trimmed.length > 0) return trimmed;
  }
  return `${hostName}'s room`;
}

function sanitizeTrack(raw: unknown): WatchPartyTrack {
  return raw === 'Dub' ? 'Dub' : 'H-Sub';
}

function sanitizeRoomCode(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function sanitizeOptionalUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/')
  ) {
    return trimmed.slice(0, 500);
  }
  return undefined;
}

function generateUniqueRoomCode(): string {
  for (let attempt = 0; attempt < 24; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function serializeRoom(room: WatchPartyRoomState) {
  return {
    roomCode: room.roomCode,
    roomName: room.roomName,
    track: room.track,
    hostId: room.hostId,
    hostClientId: room.hostClientId,
    hostAvatar: room.hostAvatar,
    isPublic: room.isPublic,
    mediaId: room.mediaId,
    mediaTitle: room.mediaTitle,
    mediaCover: room.mediaCover,
    mediaBanner: room.mediaBanner,
    totalEpisodes: room.totalEpisodes,
    episodeNumber: room.episodeNumber,
    episodeTitle: room.episodeTitle,
    isPlaying: room.isPlaying,
    currentTime: room.currentTime,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    peakParticipants: room.peakParticipants,
    messagesCount: room.messagesCount,
    messages: room.messages,
    participants: room.participants.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      joinedAt: p.joinedAt,
    })),
  };
}

function getAllLiveRoomsList() {
  return Array.from(rooms.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(serializeRoom);
}

function getPublicRoomsList() {
  return Array.from(rooms.values())
    .filter((room) => room.isPublic)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(serializeRoom);
}

function recordEndedRoom(room: WatchPartyRoomState, lastHostName: string) {
  const endedAt = Date.now();
  const durationMs = Math.max(0, endedAt - room.createdAt);
  const summary: WatchPartyEndedRoomSummary = {
    roomCode: room.roomCode,
    roomName: room.roomName,
    track: room.track,
    hostName: lastHostName || 'Host',
    hostAvatar: room.hostAvatar,
    hostClientId: room.hostClientId,
    isPublic: room.isPublic,
    mediaId: room.mediaId,
    mediaTitle: room.mediaTitle,
    mediaCover: room.mediaCover,
    mediaBanner: room.mediaBanner,
    episodeNumber: room.episodeNumber,
    episodeTitle: room.episodeTitle,
    createdAt: room.createdAt,
    endedAt,
    durationMs,
    peakParticipants: Math.max(1, room.peakParticipants),
    messagesCount: room.messagesCount,
  };
  endedRooms.unshift(summary);
  if (endedRooms.length > 40) {
    endedRooms.length = 40;
  }
}

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastLobbyRooms() {
  const payload = JSON.stringify({
    type: 'lobby:rooms',
    rooms: getPublicRoomsList(),
    allLiveRooms: getAllLiveRoomsList(),
    endedRooms,
  });
  for (const [clientWs, meta] of socketMeta.entries()) {
    if (meta.subscribedToLobby && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(payload);
    }
  }
}

function broadcastToRoom(
  roomCode: string,
  payload: unknown,
  excludeSocket?: WebSocket,
) {
  const serialized = JSON.stringify(payload);
  for (const [clientWs, meta] of socketMeta.entries()) {
    if (
      meta.roomCode === roomCode &&
      clientWs !== excludeSocket &&
      clientWs.readyState === WebSocket.OPEN
    ) {
      clientWs.send(serialized);
    }
  }
}

function finalizeEndedRoom(roomCode: string, lastHostName?: string) {
  clearRoomExpiryTimer(roomCode);
  const room = rooms.get(roomCode);
  if (!room) return;
  const resolvedHostName =
    lastHostName ||
    room.participants.find((p) => p.id === room.hostId || p.isHost)?.name ||
    'Host';
  recordEndedRoom(room, resolvedHostName);
  rooms.delete(roomCode);
  broadcastLobbyRooms();
}

function detachFromCurrentRoom(ws: WebSocket) {
  const meta = socketMeta.get(ws);
  if (!meta || !meta.roomCode) return;

  const roomCode = meta.roomCode;
  meta.roomCode = null;
  const room = rooms.get(roomCode);
  if (!room) return;

  const departing = room.participants.find((p) => p.id === meta.participantId);
  const lastHostName =
    room.participants.find((p) => p.id === room.hostId || p.isHost)?.name ||
    departing?.name ||
    'Host';
  room.participants = room.participants.filter((p) => p.id !== meta.participantId);

  if (room.participants.length === 0) {
    room.isPlaying = false;
    room.emptySince = Date.now();
    room.updatedAt = Date.now();
    clearRoomExpiryTimer(roomCode);
    const expiryTimer = setTimeout(() => {
      const current = rooms.get(roomCode);
      if (current && current.participants.length === 0) {
        finalizeEndedRoom(roomCode, lastHostName);
      }
    }, EMPTY_ROOM_GRACE_MS);
    roomExpiryTimers.set(roomCode, expiryTimer);
    broadcastLobbyRooms();
    return;
  }

  if (room.hostId === meta.participantId) {
    const nextHost = room.participants[0];
    room.hostId = nextHost.id;
    room.participants = room.participants.map((p, idx) => ({
      ...p,
      isHost: idx === 0,
    }));
  }

  broadcastToRoom(roomCode, {
    type: 'party:presence',
    roomCode,
    hostId: room.hostId,
    participants: serializeRoom(room).participants,
    event: 'left',
    actorName: departing?.name || 'Guest',
  });
  broadcastLobbyRooms();
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());

  const allowedCorsOrigins = getAllowedCorsOrigins({
    appUrl: process.env.APP_URL,
    extraOrigins: process.env.CORS_ALLOWED_ORIGINS,
    port: PORT,
  });

  app.use('/api', (req, res, next) => {
    const rawForwardedHost = req.headers['x-forwarded-host'];
    const requestHost =
      typeof rawForwardedHost === 'string' && rawForwardedHost.trim()
        ? rawForwardedHost
        : typeof req.headers.host === 'string'
          ? req.headers.host
          : undefined;
    const corsHeaders = buildApiCorsHeaders(
      typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
      allowedCorsOrigins,
      {
        requestHost,
        extraOrigins: process.env.CORS_ALLOWED_ORIGINS,
      },
    );
    for (const [header, value] of Object.entries(corsHeaders)) {
      res.setHeader(header, value);
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'shizutv-backend',
      version: '2.1.8',
      timestamp: new Date().toISOString(),
    });
  });

  const resolveServerRedirectUri = (queryOrigin?: string) => {
    if (queryOrigin) {
      try {
        const parsed = new URL(queryOrigin);
        if (parsed.protocol === 'https:' && parsed.hostname.endsWith('.run.app')) {
          return `${parsed.origin}/auth/callback`;
        }
      } catch {
        // Ignore invalid origin query string
      }
    }
    return resolveAniListRedirectUri(
      process.env.APP_URL,
      queryOrigin || `http://localhost:${PORT}`,
    );
  };

  app.get('/api/auth/anilist/status', (req, res) => {
    const config = getAniListOAuthConfig();
    const queryOrigin = typeof req.query.origin === 'string' ? req.query.origin : undefined;
    const redirectUri = resolveServerRedirectUri(queryOrigin);
    const cookies = parseCookieHeader(req.headers.cookie);
    res.json({
      configured: config.configured,
      hasSecret: config.hasSecret,
      clientId: config.clientId || null,
      flow: config.flow,
      redirectUri,
      authenticated: Boolean(cookies[ANILIST_SESSION_COOKIE_NAME]),
    });
  });

  app.get('/api/auth/anilist/url', (req, res) => {
    const config = getAniListOAuthConfig();
    const queryOrigin = typeof req.query.origin === 'string' ? req.query.origin : undefined;
    const redirectUri = resolveServerRedirectUri(queryOrigin);

    if (!config.configured) {
      res.status(200).json({
        configured: false,
        url: null,
        redirectUri,
        message:
          'AniList OAuth Client ID is missing. Configure ANILIST_CLIENT_ID and ANILIST_CLIENT_SECRET in AI Studio environment variables.',
      });
      return;
    }

    pruneExpiredOAuthStates();
    const state = crypto.randomBytes(16).toString('hex');
    oauthPendingStates.set(state, {
      redirectUri,
      createdAt: Date.now(),
    });

    const url = buildAniListAuthorizeUrl({
      clientId: config.clientId,
      redirectUri,
      state,
      responseType: config.flow,
    });

    res.json({
      url,
      state,
      redirectUri,
      configured: true,
      flow: config.flow,
    });
  });

  app.post('/api/auth/anilist/exchange-code', async (req, res) => {
    const bodyObj = (req.body ?? {}) as Record<string, unknown>;
    const code = typeof bodyObj.code === 'string' ? bodyObj.code.trim() : '';
    const requestedRedirectUri =
      typeof bodyObj.redirectUri === 'string' ? bodyObj.redirectUri.trim() : '';
    const requestOrigin = typeof bodyObj.origin === 'string' ? bodyObj.origin.trim() : undefined;

    if (!code) {
      res.status(400).json({ message: 'Authorization code is required.' });
      return;
    }

    const config = getAniListOAuthConfig();
    if (!config.configured || !config.hasSecret) {
      res.status(400).json({
        message:
          'Server OAuth credentials (ANILIST_CLIENT_ID / ANILIST_CLIENT_SECRET) are not configured.',
      });
      return;
    }

    const redirectUri = requestedRedirectUri || resolveServerRedirectUri(requestOrigin);

    try {
      const tokenResp = await fetch(ANILIST_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: redirectUri,
          code,
        }),
      });

      const tokenJson = (await tokenResp.json().catch(() => ({}))) as {
        access_token?: string;
        expires_in?: number;
        error?: string;
        message?: string;
      };

      if (!tokenResp.ok || !tokenJson.access_token) {
        res.status(400).json({
          message:
            tokenJson.message ||
            tokenJson.error ||
            'Failed to exchange authorization code. Codes expire quickly—please authorize again.',
        });
        return;
      }

      const expiresIn =
        typeof tokenJson.expires_in === 'number' && Number.isFinite(tokenJson.expires_in)
          ? tokenJson.expires_in
          : null;
      setAniListSessionCookie(res, tokenJson.access_token, expiresIn);
      res.json({ accessToken: tokenJson.access_token, expiresIn });
    } catch (err) {
      res.status(502).json({
        message: err instanceof Error ? err.message : 'Network error exchanging AniList code.',
      });
    }
  });

  app.get('/api/auth/anilist/session', (req, res) => {
    const cookies = parseCookieHeader(req.headers.cookie);
    const accessToken = cookies[ANILIST_SESSION_COOKIE_NAME];
    if (!accessToken) {
      res.status(200).json({ authenticated: false, accessToken: null });
      return;
    }
    res.json({ authenticated: true, accessToken, expiresIn: null });
  });

  app.post('/api/auth/anilist/session', (req, res) => {
    const bodyObj = (req.body ?? {}) as Record<string, unknown>;
    const accessToken =
      typeof bodyObj.accessToken === 'string' ? bodyObj.accessToken.trim() : '';
    if (!accessToken) {
      res.status(400).json({ message: 'accessToken is required' });
      return;
    }
    const expiresIn =
      typeof bodyObj.expiresIn === 'number' && Number.isFinite(bodyObj.expiresIn)
        ? bodyObj.expiresIn
        : null;
    setAniListSessionCookie(res, accessToken, expiresIn);
    res.json({ ok: true });
  });

  app.post('/api/auth/anilist/logout', (_req, res) => {
    clearAniListSessionCookie(res);
    res.json({ ok: true });
  });

  const handleAniListOAuthCallback: express.RequestHandler = async (req, res) => {
    const error = typeof req.query.error === 'string' ? req.query.error : '';
    const errorDescription =
      typeof req.query.error_description === 'string' ? req.query.error_description : '';
    const code = typeof req.query.code === 'string' ? req.query.code.trim() : '';
    const state = typeof req.query.state === 'string' ? req.query.state.trim() : '';

    if (error) {
      const payload = {
        type: 'ANILIST_OAUTH_ERROR',
        error,
        errorDescription: errorDescription || 'AniList authorization was cancelled or denied.',
        state: state || null,
      };
      res.status(200).type('html').send(`<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>AniList Login</title></head>
  <body style="font-family:system-ui,sans-serif;background:#0b0c12;color:#f5f5f7;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center;">
    <div>
      <p style="font-weight:700;margin-bottom:8px;">AniList Authorization Cancelled</p>
      <p style="opacity:.72;font-size:14px;">You can close this window and return to ShizuTv.</p>
    </div>
    <script>
      (function () {
        var payload = ${escapeHtmlScriptJson(payload)};
        if (window.opener) {
          window.opener.postMessage(payload, '*');
          window.close();
        }
      })();
    </script>
  </body>
</html>`);
      return;
    }

    if (code) {
      pruneExpiredOAuthStates();
      const pending = state ? oauthPendingStates.get(state) : undefined;
      if (state) {
        oauthPendingStates.delete(state);
      }

      const config = getAniListOAuthConfig();
      const redirectUri =
        pending?.redirectUri ||
        resolveAniListRedirectUri(process.env.APP_URL, `http://localhost:${PORT}`);

      if (!config.configured || !config.hasSecret) {
        const payload = {
          type: 'ANILIST_OAUTH_ERROR',
          error: 'missing_client_secret',
          errorDescription:
            'Server is missing ANILIST_CLIENT_ID or ANILIST_CLIENT_SECRET to exchange the authorization code.',
          state: state || null,
        };
        res.status(200).type('html').send(`<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>AniList Login</title></head>
  <body style="font-family:system-ui,sans-serif;background:#0b0c12;color:#f5f5f7;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center;">
    <p>Server OAuth credentials are not configured.</p>
    <script>
      (function () {
        var payload = ${escapeHtmlScriptJson(payload)};
        if (window.opener) {
          window.opener.postMessage(payload, '*');
          window.close();
        }
      })();
    </script>
  </body>
</html>`);
        return;
      }

      try {
        const tokenResp = await fetch(ANILIST_TOKEN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: redirectUri,
            code,
          }),
        });

        const tokenJson = (await tokenResp.json().catch(() => ({}))) as {
          access_token?: string;
          expires_in?: number;
          error?: string;
          message?: string;
        };

        if (!tokenResp.ok || !tokenJson.access_token) {
          const errPayload = {
            type: 'ANILIST_OAUTH_ERROR',
            error: tokenJson.error || 'token_exchange_failed',
            errorDescription:
              tokenJson.message || 'Failed to exchange AniList authorization code for token.',
            state: state || null,
          };
          res.status(200).type('html').send(`<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>AniList Login</title></head>
  <body style="font-family:system-ui,sans-serif;background:#0b0c12;color:#f5f5f7;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center;">
    <p>AniList token exchange failed. You can close this window.</p>
    <script>
      (function () {
        var payload = ${escapeHtmlScriptJson(errPayload)};
        if (window.opener) {
          window.opener.postMessage(payload, '*');
          window.close();
        }
      })();
    </script>
  </body>
</html>`);
          return;
        }

        const expiresIn =
          typeof tokenJson.expires_in === 'number' && Number.isFinite(tokenJson.expires_in)
            ? tokenJson.expires_in
            : null;
        setAniListSessionCookie(res, tokenJson.access_token, expiresIn);

        const successPayload = {
          type: 'ANILIST_OAUTH_SUCCESS',
          accessToken: tokenJson.access_token,
          expiresIn,
          state: state || null,
        };

        res.status(200).type('html').send(`<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>AniList Connected</title></head>
  <body style="font-family:system-ui,sans-serif;background:#0b0c12;color:#f5f5f7;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center;">
    <div>
      <p style="font-weight:700;margin-bottom:8px;">Authentication successful</p>
      <p style="opacity:.72;font-size:14px;">This window should close automatically.</p>
    </div>
    <script>
      (function () {
        var payload = ${escapeHtmlScriptJson(successPayload)};
        if (window.opener) {
          window.opener.postMessage(payload, '*');
          window.close();
        } else {
          window.location.href = '/settings';
        }
      })();
    </script>
  </body>
</html>`);
        return;
      } catch (err) {
        const errPayload = {
          type: 'ANILIST_OAUTH_ERROR',
          error: 'network_error',
          errorDescription: err instanceof Error ? err.message : 'AniList token exchange error.',
          state: state || null,
        };
        res.status(200).type('html').send(`<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>AniList Login</title></head>
  <body style="font-family:system-ui,sans-serif;background:#0b0c12;color:#f5f5f7;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center;">
    <p>Network error while connecting to AniList.</p>
    <script>
      (function () {
        var payload = ${escapeHtmlScriptJson(errPayload)};
        if (window.opener) {
          window.opener.postMessage(payload, '*');
          window.close();
        }
      })();
    </script>
  </body>
</html>`);
        return;
      }
    }

    // Support implicit-grant hash fragment callbacks (#access_token=...) if client secret is omitted
    res.status(200).type('html').send(`<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>AniList Login</title></head>
  <body style="font-family:system-ui,sans-serif;background:#0b0c12;color:#f5f5f7;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center;">
    <div>
      <p style="font-weight:700;margin-bottom:8px;">Completing AniList Login...</p>
      <p style="opacity:.72;font-size:14px;">This window should close automatically.</p>
    </div>
    <script>
      (function () {
        var hash = window.location.hash ? window.location.hash.slice(1) : '';
        var params = new URLSearchParams(hash);
        var token = params.get('access_token');
        var expiresRaw = params.get('expires_in');
        var expiresIn = expiresRaw ? Number(expiresRaw) : null;
        var hashState = params.get('state');
        var hashError = params.get('error');
        var hashErrDesc = params.get('error_description');
        var payload = token
          ? {
              type: 'ANILIST_OAUTH_SUCCESS',
              accessToken: token,
              expiresIn: Number.isFinite(expiresIn) ? expiresIn : null,
              state: hashState || ${escapeHtmlScriptJson(state || null)},
            }
          : {
              type: 'ANILIST_OAUTH_ERROR',
              error: hashError || 'missing_token',
              errorDescription: hashErrDesc || 'No AniList authorization token was returned.',
              state: hashState || ${escapeHtmlScriptJson(state || null)},
            };
        if (window.opener) {
          window.opener.postMessage(payload, '*');
          window.close();
        } else {
          window.location.href = '/settings';
        }
      })();
    </script>
  </body>
</html>`);
  };

  app.get(['/auth/callback', '/auth/callback/'], handleAniListOAuthCallback);

  app.get('/api/watch-party/rooms', (_req, res) => {
    res.json({
      rooms: getPublicRoomsList(),
      allLiveRooms: getAllLiveRoomsList(),
      endedRooms,
    });
  });

  app.get('/api/watch-party/rooms/:roomCode', (req, res) => {
    const code = sanitizeRoomCode(req.params.roomCode);
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ exists: false, message: 'Room not found' });
      return;
    }
    res.json({ exists: true, room: serializeRoom(room) });
  });

  app.get('/api/community/posts', (req, res) => {
    const clientId =
      typeof req.query.clientId === 'string' ? req.query.clientId.trim().slice(0, 64) : undefined;
    res.json({
      posts: communityPosts.map((p) => serializeCommunityPost(p, clientId)),
    });
  });

  app.post('/api/community/posts', (req, res) => {
    const bodyObj = (req.body ?? {}) as Record<string, unknown>;
    const rawCategory = typeof bodyObj.category === 'string' ? bodyObj.category : '';
    const allowedCategories: CommunityCategory[] = ['general', 'feedback', 'features', 'help'];
    if (!allowedCategories.includes(rawCategory as CommunityCategory)) {
      res.status(400).json({ message: 'Please choose a valid category.' });
      return;
    }
    const title = typeof bodyObj.title === 'string' ? bodyObj.title.trim().slice(0, 120) : '';
    const body = typeof bodyObj.body === 'string' ? bodyObj.body.trim().slice(0, 4000) : '';
    if (title.length < 3 || body.length < 5) {
      res.status(400).json({ message: 'Title (3+ chars) and body (5+ chars) are required.' });
      return;
    }
    const clientId =
      typeof bodyObj.clientId === 'string' && bodyObj.clientId.trim()
        ? bodyObj.clientId.trim().slice(0, 64)
        : crypto.randomUUID();
    const linkedRaw = Array.isArray(bodyObj.linkedAnime) ? bodyObj.linkedAnime.slice(0, 3) : [];
    const linkedAnime = linkedRaw
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => {
        const rawId =
          typeof item.id === 'number'
            ? item.id
            : typeof item.id === 'string'
              ? item.id.trim().slice(0, 80)
              : '';
        return {
          id: rawId,
          title: typeof item.title === 'string' ? item.title.trim().slice(0, 100) : 'Anime',
          cover: sanitizeOptionalUrl(item.cover) ?? null,
        };
      })
      .filter((item) => (typeof item.id === 'number' ? item.id > 0 : item.id.length > 0));

    const newPost: StoredCommunityPost = {
      id: `post-${crypto.randomUUID().slice(0, 8)}`,
      clientId,
      category: rawCategory as CommunityCategory,
      title,
      body,
      authorName: sanitizeName(bodyObj.authorName),
      authorAvatar: sanitizeOptionalUrl(bodyObj.authorAvatar) ?? null,
      authorIsMod: false,
      pinned: false,
      label: null,
      linkedAnime,
      baseScore: 1,
      votes: { [clientId]: 1 },
      comments: [],
      views: 1,
      createdAt: Date.now(),
    };
    communityPosts.unshift(newPost);
    persistCommunityPosts();
    res.status(201).json({ post: serializeCommunityPost(newPost, clientId) });
  });

  app.post('/api/community/posts/:id/vote', (req, res) => {
    const post = communityPosts.find((p) => p.id === req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found' });
      return;
    }
    const bodyObj = (req.body ?? {}) as Record<string, unknown>;
    const clientId =
      typeof bodyObj.clientId === 'string' && bodyObj.clientId.trim()
        ? bodyObj.clientId.trim().slice(0, 64)
        : '';
    if (!clientId) {
      res.status(400).json({ message: 'clientId required' });
      return;
    }
    const vote = bodyObj.vote;
    if (vote === 1 || vote === -1) {
      post.votes[clientId] = vote;
    } else {
      delete post.votes[clientId];
    }
    persistCommunityPosts();
    res.json({ post: serializeCommunityPost(post, clientId) });
  });

  app.post('/api/community/posts/:id/view', (req, res) => {
    const post = communityPosts.find((p) => p.id === req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found' });
      return;
    }
    post.views += 1;
    persistCommunityPosts();
    const clientId =
      typeof req.body?.clientId === 'string' ? req.body.clientId.trim().slice(0, 64) : undefined;
    res.json({ post: serializeCommunityPost(post, clientId) });
  });

  app.post('/api/community/posts/:id/comments', (req, res) => {
    const post = communityPosts.find((p) => p.id === req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found' });
      return;
    }
    const bodyObj = (req.body ?? {}) as Record<string, unknown>;
    const text = typeof bodyObj.body === 'string' ? bodyObj.body.trim().slice(0, 1200) : '';
    if (!text) {
      res.status(400).json({ message: 'Comment text required' });
      return;
    }
    const comment: StoredCommunityComment = {
      id: `cmt-${crypto.randomUUID().slice(0, 8)}`,
      authorName: sanitizeName(bodyObj.authorName),
      authorAvatar: sanitizeOptionalUrl(bodyObj.authorAvatar) ?? null,
      authorIsMod: false,
      body: text,
      createdAt: Date.now(),
    };
    post.comments.push(comment);
    persistCommunityPosts();
    const clientId =
      typeof bodyObj.clientId === 'string' ? bodyObj.clientId.trim().slice(0, 64) : undefined;
    res.status(201).json({ post: serializeCommunityPost(post, clientId), comment });
  });

  app.delete('/api/community/posts/:id', (req, res) => {
    const idx = communityPosts.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Post not found' });
      return;
    }
    const clientId =
      typeof req.query.clientId === 'string' ? req.query.clientId.trim().slice(0, 64) : '';
    if (communityPosts[idx].clientId !== clientId) {
      res.status(403).json({ message: 'Not allowed to delete this post' });
      return;
    }
    communityPosts.splice(idx, 1);
    persistCommunityPosts();
    res.json({ deleted: true });
  });

  app.post('/api/extensions/fetch-repo', async (req, res) => {
    const bodyObj = (req.body ?? {}) as Record<string, unknown>;
    const rawUrl = typeof bodyObj.url === 'string' ? bodyObj.url.trim() : '';
    const managerRaw = typeof bodyObj.manager === 'string' ? bodyObj.manager.trim() : undefined;
    const manager = (
      managerRaw === 'aniyomi' ||
      managerRaw === 'mangayomi' ||
      managerRaw === 'cloudstream' ||
      managerRaw === 'shonenx'
        ? managerRaw
        : undefined
    ) as ExtensionRepo['manager'] | undefined;
    const fallbackName =
      typeof bodyObj.name === 'string' && bodyObj.name.trim()
        ? bodyObj.name.trim().slice(0, 80)
        : undefined;

    if (!isSafeExternalHttpUrl(rawUrl)) {
      res.status(400).json({
        message: 'Invalid repository URL. Only public http/https manifest URLs are allowed.',
      });
      return;
    }

    try {
      const upstream = await fetch(rawUrl, {
        headers: {
          Accept: 'application/json, text/plain, */*',
          'User-Agent': 'ShizuTv-Web/2.1.5',
        },
        signal: AbortSignal.timeout(8500),
      });

      if (!upstream.ok) {
        res.status(502).json({
          message: `Repository returned HTTP ${upstream.status} ${upstream.statusText || ''}`.trim(),
        });
        return;
      }

      const rawText = await upstream.text();
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawText);
      } catch {
        res.status(422).json({
          message:
            'URL does not return a JSON extension manifest (expected Aniyomi index.min.json, Mangayomi index.json, or CloudStream repo.json).',
        });
        return;
      }

      const parsed = parseExtensionRepoManifest(parsedJson, {
        repoUrl: rawUrl,
        manager,
        fallbackName,
      });

      const collectedSources: SourceInfo[] = [...parsed.sources];
      const seenIds = new Set(collectedSources.map((s) => s.id));

      if (parsed.pluginListUrls.length > 0) {
        const subResults = await Promise.allSettled(
          parsed.pluginListUrls.slice(0, 4).map(async (pluginUrl) => {
            if (!isSafeExternalHttpUrl(pluginUrl)) return [];
            const subRes = await fetch(pluginUrl, {
              headers: {
                Accept: 'application/json, text/plain, */*',
                'User-Agent': 'ShizuTv-Web/2.1.5',
              },
              signal: AbortSignal.timeout(8000),
            });
            if (!subRes.ok) return [];
            const subJson = await subRes.json().catch(() => null);
            if (!subJson) return [];
            return parseExtensionRepoManifest(subJson, {
              repoUrl: rawUrl,
              manager: manager ?? 'cloudstream',
              fallbackName: parsed.repoName || fallbackName,
            }).sources;
          }),
        );

        for (const outcome of subResults) {
          if (outcome.status === 'fulfilled') {
            for (const src of outcome.value) {
              if (!seenIds.has(src.id)) {
                seenIds.add(src.id);
                collectedSources.push(src);
              }
            }
          }
        }
      }

      if (collectedSources.length === 0) {
        res.status(422).json({
          message: 'No extension sources found in this repository manifest.',
        });
        return;
      }

      let derivedHostname = 'Custom Repo';
      try {
        derivedHostname = new URL(rawUrl).hostname.replace(/^www\./, '');
      } catch {
        // Keep fallback hostname
      }

      res.json({
        repoName: parsed.repoName || fallbackName || derivedHostname,
        format: parsed.format,
        sources: collectedSources,
      });
    } catch (err) {
      res.status(502).json({
        message:
          err instanceof Error
            ? `Failed to fetch repository manifest: ${err.message}`
            : 'Network error fetching repository manifest.',
      });
    }
  });

  app.post('/api/stream/resolve', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawTitles = (body.titles ?? {}) as Record<string, unknown>;
    const episodeNumberRaw = Number(body.episodeNumber);
    const episodeNumber =
      Number.isFinite(episodeNumberRaw) && episodeNumberRaw > 0 ? episodeNumberRaw : 1;
    const categoryRaw = typeof body.category === 'string' ? body.category.toLowerCase() : 'sub';
    const category: 'sub' | 'dub' | 'raw' =
      categoryRaw === 'dub' ? 'dub' : categoryRaw === 'raw' ? 'raw' : 'sub';
    const audioLangRaw =
      typeof body.audioLanguage === 'string' ? body.audioLanguage.trim().toLowerCase() : '';
    const audioLanguage: 'ja' | 'en' | 'hi' | 'es' | undefined =
      audioLangRaw === 'ja' ||
      audioLangRaw === 'en' ||
      audioLangRaw === 'hi' ||
      audioLangRaw === 'es'
        ? audioLangRaw
        : undefined;
    const sourceLang = typeof body.sourceLang === 'string' ? body.sourceLang.trim() : undefined;

    const rawSelectedEntry =
      body.selectedSourceEntry && typeof body.selectedSourceEntry === 'object'
        ? (body.selectedSourceEntry as Record<string, unknown>)
        : null;
    const selectedSourceEntry =
      rawSelectedEntry && typeof rawSelectedEntry.href === 'string' && rawSelectedEntry.href.trim()
        ? {
            sourceId:
              typeof rawSelectedEntry.sourceId === 'string'
                ? rawSelectedEntry.sourceId.trim()
                : undefined,
            title:
              typeof rawSelectedEntry.title === 'string'
                ? rawSelectedEntry.title.trim()
                : undefined,
            href: rawSelectedEntry.href.trim(),
            slug:
              typeof rawSelectedEntry.slug === 'string'
                ? rawSelectedEntry.slug.trim()
                : undefined,
          }
        : null;

    const rawSelectedEpisode =
      body.selectedEpisode && typeof body.selectedEpisode === 'object'
        ? (body.selectedEpisode as Record<string, unknown>)
        : null;
    const selectedEpisode =
      rawSelectedEpisode &&
      (typeof rawSelectedEpisode.sourceEpisodeId === 'string' ||
        typeof rawSelectedEpisode.episodeUrl === 'string')
        ? {
            id:
              typeof rawSelectedEpisode.id === 'string'
                ? rawSelectedEpisode.id.trim()
                : undefined,
            number:
              typeof rawSelectedEpisode.number === 'number' &&
              Number.isFinite(rawSelectedEpisode.number)
                ? rawSelectedEpisode.number
                : undefined,
            title:
              typeof rawSelectedEpisode.title === 'string'
                ? rawSelectedEpisode.title.trim()
                : undefined,
            sourceId:
              typeof rawSelectedEpisode.sourceId === 'string'
                ? rawSelectedEpisode.sourceId.trim()
                : undefined,
            sourceEpisodeId:
              typeof rawSelectedEpisode.sourceEpisodeId === 'string'
                ? rawSelectedEpisode.sourceEpisodeId.trim()
                : undefined,
            episodeUrl:
              typeof rawSelectedEpisode.episodeUrl === 'string'
                ? rawSelectedEpisode.episodeUrl.trim()
                : undefined,
            sourceAnimeHref:
              typeof rawSelectedEpisode.sourceAnimeHref === 'string'
                ? rawSelectedEpisode.sourceAnimeHref.trim()
                : undefined,
            sourceAnimeSlug:
              typeof rawSelectedEpisode.sourceAnimeSlug === 'string'
                ? rawSelectedEpisode.sourceAnimeSlug.trim()
                : undefined,
          }
        : null;

    try {
      const resolved = await resolveAnimeEpisodeStream({
        mediaId: typeof body.mediaId === 'string' ? body.mediaId : 'unknown',
        titles: {
          overrideTitle:
            typeof rawTitles.overrideTitle === 'string' ? rawTitles.overrideTitle : null,
          english: typeof rawTitles.english === 'string' ? rawTitles.english : null,
          romaji: typeof rawTitles.romaji === 'string' ? rawTitles.romaji : null,
          native: typeof rawTitles.native === 'string' ? rawTitles.native : null,
          synonyms: Array.isArray(rawTitles.synonyms)
            ? rawTitles.synonyms.filter((s): s is string => typeof s === 'string')
            : null,
        },
        format: typeof body.format === 'string' ? body.format : null,
        episodeNumber,
        serverId: typeof body.serverId === 'string' ? body.serverId : undefined,
        serverName: typeof body.serverName === 'string' ? body.serverName : undefined,
        category,
        audioLanguage,
        sourceId: typeof body.sourceId === 'string' ? body.sourceId : undefined,
        sourceName: typeof body.sourceName === 'string' ? body.sourceName : undefined,
        sourceBaseUrl:
          typeof body.sourceBaseUrl === 'string' ? body.sourceBaseUrl : undefined,
        sourceLang,
        selectedSourceEntry,
        selectedEpisode,
        bypassCache: Boolean(body.bypassCache),
      });

      res.json(resolved);
    } catch (err) {
      if (err instanceof ExtensionCapabilityError) {
        res.status(err.statusCode).json({
          message: err.reason,
          code: err.code,
          capability: err.capability,
        });
        return;
      }
      res.status(404).json({
        message:
          err instanceof Error
            ? err.message
            : 'Unable to resolve an active stream for this episode.',
      });
    }
  });

  app.post('/api/manga/chapters', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawTitles = (body.titles ?? {}) as Record<string, unknown>;
    const mediaType = typeof body.mediaType === 'string' ? body.mediaType.trim().toUpperCase() : undefined;
    try {
      const resolved = await resolveMangaChaptersServer({
        mediaId: typeof body.mediaId === 'string' ? body.mediaId : 'unknown',
        mediaType,
        titles: {
          overrideTitle:
            typeof rawTitles.overrideTitle === 'string' ? rawTitles.overrideTitle : null,
          english: typeof rawTitles.english === 'string' ? rawTitles.english : null,
          romaji: typeof rawTitles.romaji === 'string' ? rawTitles.romaji : null,
          native: typeof rawTitles.native === 'string' ? rawTitles.native : null,
          synonyms: Array.isArray(rawTitles.synonyms)
            ? rawTitles.synonyms.filter((s): s is string => typeof s === 'string')
            : null,
        },
        sourceId: typeof body.sourceId === 'string' ? body.sourceId : undefined,
        sourceName: typeof body.sourceName === 'string' ? body.sourceName : undefined,
        sourceBaseUrl:
          typeof body.sourceBaseUrl === 'string' ? body.sourceBaseUrl : undefined,
        sourceLang: typeof body.sourceLang === 'string' ? body.sourceLang : undefined,
        bypassCache: Boolean(body.bypassCache),
      });
      res.json(resolved);
    } catch (err) {
      res.status(404).json({
        message:
          err instanceof Error
            ? err.message
            : 'Unable to resolve manga chapters from this source.',
      });
    }
  });

  app.post('/api/manga/pages', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawTitles = (body.titles ?? {}) as Record<string, unknown>;
    const rawChapter = (body.chapter ?? {}) as Record<string, unknown>;
    const mediaType = typeof body.mediaType === 'string' ? body.mediaType.trim().toUpperCase() : undefined;
    const chNumRaw = Number(rawChapter.number);
    const chNum = Number.isFinite(chNumRaw) && chNumRaw >= 0 ? chNumRaw : 1;
    try {
      const resolved = await resolveMangaChapterPagesServer({
        mediaId: typeof body.mediaId === 'string' ? body.mediaId : 'unknown',
        mediaType,
        titles: {
          overrideTitle:
            typeof rawTitles.overrideTitle === 'string' ? rawTitles.overrideTitle : null,
          english: typeof rawTitles.english === 'string' ? rawTitles.english : null,
          romaji: typeof rawTitles.romaji === 'string' ? rawTitles.romaji : null,
          native: typeof rawTitles.native === 'string' ? rawTitles.native : null,
          synonyms: Array.isArray(rawTitles.synonyms)
            ? rawTitles.synonyms.filter((s): s is string => typeof s === 'string')
            : null,
        },
        chapter: {
          id: typeof rawChapter.id === 'string' ? rawChapter.id : undefined,
          number: chNum,
          title: typeof rawChapter.title === 'string' ? rawChapter.title : undefined,
          sourceChapterId:
            typeof rawChapter.sourceChapterId === 'string'
              ? rawChapter.sourceChapterId
              : undefined,
          chapterUrl:
            typeof rawChapter.chapterUrl === 'string' ? rawChapter.chapterUrl : undefined,
        },
        sourceId: typeof body.sourceId === 'string' ? body.sourceId : undefined,
        sourceName: typeof body.sourceName === 'string' ? body.sourceName : undefined,
        sourceBaseUrl:
          typeof body.sourceBaseUrl === 'string' ? body.sourceBaseUrl : undefined,
        sourceLang: typeof body.sourceLang === 'string' ? body.sourceLang : undefined,
        bypassCache: Boolean(body.bypassCache),
      });
      res.json(resolved);
    } catch (err) {
      res.status(404).json({
        message:
          err instanceof Error
            ? err.message
            : 'Unable to load manga chapter pages from this source.',
      });
    }
  });

  app.post('/api/extensions/search', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const sourceId = typeof body.sourceId === 'string' ? body.sourceId.trim() : '';
    if (!sourceId) {
      res.status(400).json({ message: 'sourceId is required.' });
      return;
    }

    const sourceName = typeof body.sourceName === 'string' ? body.sourceName.trim() : sourceId;
    const sourceBaseUrl =
      typeof body.sourceBaseUrl === 'string' ? body.sourceBaseUrl.trim() : undefined;
    const sourceLang = typeof body.sourceLang === 'string' ? body.sourceLang.trim() : undefined;
    const sourcePkg = typeof body.sourcePkg === 'string' ? body.sourcePkg.trim() : undefined;
    const query = typeof body.query === 'string' ? body.query.trim() : '';

    if (!query) {
      res.json({ compatible: true, sourceLabel: sourceName, items: [] });
      return;
    }

    try {
      const result = await searchAnimeExtensionEntriesServer({
        sourceId,
        sourceName,
        sourceBaseUrl,
        sourceLang,
        sourcePkg,
        query,
      });
      res.json(result);
    } catch (err) {
      res.status(502).json({
        compatible: false,
        reason:
          err instanceof Error
            ? err.message
            : `Failed to search titles on ${sourceName}.`,
        sourceLabel: sourceName,
        items: [],
      });
    }
  });

  app.post('/api/extensions/episodes', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const sourceId = typeof body.sourceId === 'string' ? body.sourceId.trim() : '';
    if (!sourceId) {
      res.status(400).json({ message: 'sourceId is required.' });
      return;
    }

    const rawEntry =
      body.selectedSourceEntry && typeof body.selectedSourceEntry === 'object'
        ? (body.selectedSourceEntry as Record<string, unknown>)
        : null;
    const href = rawEntry && typeof rawEntry.href === 'string' ? rawEntry.href.trim() : '';
    if (!href) {
      res.status(400).json({
        compatible: false,
        reason: 'selectedSourceEntry.href is required.',
        episodes: [],
      });
      return;
    }

    const sourceName = typeof body.sourceName === 'string' ? body.sourceName.trim() : sourceId;
    const sourceBaseUrl =
      typeof body.sourceBaseUrl === 'string' ? body.sourceBaseUrl.trim() : undefined;
    const sourceLang = typeof body.sourceLang === 'string' ? body.sourceLang.trim() : undefined;
    const sourcePkg = typeof body.sourcePkg === 'string' ? body.sourcePkg.trim() : undefined;

    try {
      const result = await resolveAnimeExtensionEpisodesServer({
        sourceId,
        sourceName,
        sourceBaseUrl,
        sourceLang,
        sourcePkg,
        selectedSourceEntry: {
          sourceId:
            typeof rawEntry?.sourceId === 'string' ? rawEntry.sourceId.trim() : sourceId,
          title: typeof rawEntry?.title === 'string' ? rawEntry.title.trim() : undefined,
          href,
          slug: typeof rawEntry?.slug === 'string' ? rawEntry.slug.trim() : undefined,
        },
        bypassCache: Boolean(body.bypassCache),
      });
      res.json(result);
    } catch (err) {
      res.status(502).json({
        compatible: false,
        reason:
          err instanceof Error
            ? err.message
            : `Failed to retrieve episodes from ${sourceName}.`,
        sourceLabel: sourceName,
        episodes: [],
      });
    }
  });

  app.post('/api/extensions/diagnose', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const sourceId = typeof body.sourceId === 'string' ? body.sourceId.trim() : '';
    if (!sourceId) {
      res.status(400).json({ message: 'sourceId is required.' });
      return;
    }

    const sourceName = typeof body.sourceName === 'string' ? body.sourceName.trim() : sourceId;
    const sourceBaseUrl =
      typeof body.sourceBaseUrl === 'string' ? body.sourceBaseUrl.trim() : undefined;
    const sourceLang = typeof body.sourceLang === 'string' ? body.sourceLang.trim() : undefined;
    const sourcePkg = typeof body.sourcePkg === 'string' ? body.sourcePkg.trim() : undefined;
    const mediaTypeRaw =
      typeof body.mediaType === 'string' ? body.mediaType.trim().toUpperCase() : 'ANIME';
    const mediaTab: 'ANIME' | 'MANGA' = mediaTypeRaw === 'MANGA' ? 'MANGA' : 'ANIME';
    const modeRaw = typeof body.mode === 'string' ? body.mode.trim().toLowerCase() : 'basic';
    const mode: ExtensionDiagnoseMode =
      modeRaw === 'ping' ? 'ping' : modeRaw === 'full' ? 'full' : 'basic';
    const query = typeof body.query === 'string' && body.query.trim() ? body.query.trim() : 'Naruto';

    try {
      const report =
        mediaTab === 'MANGA'
          ? await diagnoseMangaExtensionServer({
              sourceId,
              sourceName,
              sourceBaseUrl,
              sourceLang,
              sourcePkg,
              mode,
              query,
            })
          : await diagnoseAnimeExtensionServer({
              sourceId,
              sourceName,
              sourceBaseUrl,
              sourceLang,
              sourcePkg,
              mode,
              query,
            });
      res.json({
        ...report,
        testedAt: report.testedAt || new Date().toISOString(),
        mode: report.mode || mode,
      });
    } catch (err) {
      res.status(500).json({
        message: err instanceof Error ? err.message : 'Extension diagnostics execution failed.',
      });
    }
  });

  app.post('/api/extensions/health-check', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawSources = Array.isArray(body.sources)
      ? body.sources
      : body.source && typeof body.source === 'object'
        ? [body.source]
        : [];

    if (rawSources.length === 0) {
      res.status(400).json({ message: 'At least one extension source is required.' });
      return;
    }

    const cappedSources = rawSources
      .slice(0, 25)
      .filter((item): item is ServerHealthCheckInputSource => {
        return Boolean(item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string');
      });

    if (cappedSources.length === 0) {
      res.status(400).json({ message: 'Each source entry must include a valid string id.' });
      return;
    }

    try {
      const results = await checkBatchSourcesHealthServer(cappedSources);
      res.json({
        checkedAt: new Date().toISOString(),
        results,
      });
    } catch (err) {
      res.status(500).json({
        message: err instanceof Error ? err.message : 'Source health check failed.',
      });
    }
  });

  app.get('/api/stream/proxy', async (req, res) => {
    const targetUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const rawReferer =
      typeof req.query.referer === 'string' ? req.query.referer.trim() : '';

    if (!isSafeExternalHttpUrl(targetUrl)) {
      res.status(400).json({ message: 'Invalid stream target URL.' });
      return;
    }

    const safeReferer = isSafeExternalHttpUrl(rawReferer) ? rawReferer : undefined;
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: '*/*',
    };
    if (safeReferer) {
      headers.Referer = safeReferer;
      try {
        headers.Origin = new URL(safeReferer).origin;
      } catch {
        // Ignore origin parse errors
      }
    }
    if (typeof req.headers.range === 'string' && req.headers.range.trim()) {
      headers.Range = req.headers.range;
    }

    try {
      const upstream = await fetch(targetUrl, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });

      const finalUrl = upstream.url || targetUrl;
      if (!isSafeExternalHttpUrl(finalUrl)) {
        res.status(403).json({ message: 'Redirect target blocked.' });
        return;
      }

      const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
      const pathnameLower = (() => {
        try {
          return new URL(finalUrl).pathname.toLowerCase();
        } catch {
          return finalUrl.toLowerCase();
        }
      })();

      const isM3u8 =
        contentType.includes('mpegurl') || pathnameLower.endsWith('.m3u8');
      const isVtt = contentType.includes('text/vtt') || pathnameLower.endsWith('.vtt');

      if (!res.getHeader('Access-Control-Allow-Origin')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');

      if (!upstream.ok && upstream.status !== 206) {
        const errBody = await upstream.text().catch(() => '');
        res.status(upstream.status).send(errBody.slice(0, 400));
        return;
      }

      if (isM3u8) {
        const rawManifest = await upstream.text();
        const rewritten = rewriteM3u8Manifest(
          rawManifest,
          finalUrl,
          '/api/stream/proxy',
          safeReferer,
        );
        res.status(200);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.send(rewritten);
        return;
      }

      if (isVtt) {
        const vttText = await upstream.text();
        res.status(200);
        res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.send(vttText);
        return;
      }

      if (
        shouldBufferForM3u8Check({
          contentType,
          pathname: pathnameLower,
          contentLengthHeader: upstream.headers.get('content-length'),
        })
      ) {
        const rawBuf = Buffer.from(await upstream.arrayBuffer());
        if (
          rawBuf.byteLength <= 524_288 &&
          isM3u8ManifestBody(rawBuf.subarray(0, 64).toString('utf8'))
        ) {
          const rewritten = rewriteM3u8Manifest(
            rawBuf.toString('utf8'),
            finalUrl,
            '/api/stream/proxy',
            safeReferer,
          );
          res.status(200);
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.send(rewritten);
          return;
        }
        res.status(upstream.status);
        res.setHeader('Content-Type', contentType || 'application/octet-stream');
        const bufHeaders = ['content-range', 'accept-ranges', 'cache-control'];
        for (const hName of bufHeaders) {
          const val = upstream.headers.get(hName);
          if (val) res.setHeader(hName, val);
        }
        res.setHeader('Content-Length', String(rawBuf.byteLength));
        res.send(rawBuf);
        return;
      }

      res.status(upstream.status);
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      } else {
        res.setHeader('Content-Type', 'application/octet-stream');
      }
      const passthroughHeaders = [
        'content-length',
        'content-range',
        'accept-ranges',
        'cache-control',
      ];
      for (const hName of passthroughHeaders) {
        const val = upstream.headers.get(hName);
        if (val) res.setHeader(hName, val);
      }
      if (contentType.startsWith('image/') && !upstream.headers.get('cache-control')) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }

      if (upstream.body) {
        const nodeStream = Readable.fromWeb(
          upstream.body as Parameters<typeof Readable.fromWeb>[0],
        );
        nodeStream.on('error', () => {
          if (!res.headersSent) res.status(502).end();
          else res.end();
        });
        req.on('close', () => {
          nodeStream.destroy();
        });
        nodeStream.pipe(res);
      } else {
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.send(buf);
      }
    } catch (err) {
      if (!res.headersSent) {
        res.status(502).json({
          message: err instanceof Error ? err.message : 'Stream proxy fetch failed.',
        });
      }
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (reqUrl.pathname !== '/ws/watch-party') {
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    const initialId = crypto.randomUUID();
    socketMeta.set(ws, {
      participantId: initialId,
      clientId: initialId,
      roomCode: null,
      subscribedToLobby: false,
    });

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw)) as Record<string, unknown>;
      } catch {
        sendJson(ws, {
          type: 'party:error',
          code: 'INVALID_PAYLOAD',
          message: 'Malformed message payload.',
        });
        return;
      }

      const meta = socketMeta.get(ws);
      if (!meta) return;

      const msgType = typeof msg.type === 'string' ? msg.type : '';

      if (msgType === 'lobby:subscribe') {
        meta.subscribedToLobby = true;
        sendJson(ws, {
          type: 'lobby:rooms',
          rooms: getPublicRoomsList(),
          allLiveRooms: getAllLiveRoomsList(),
          endedRooms,
        });
        return;
      }

      if (msgType === 'lobby:unsubscribe') {
        meta.subscribedToLobby = false;
        return;
      }

      if (msgType === 'party:create') {
        detachFromCurrentRoom(ws);

        const clientId =
          typeof msg.clientId === 'string' && msg.clientId.trim()
            ? msg.clientId.trim().slice(0, 64)
            : meta.clientId;
        meta.clientId = clientId;
        meta.participantId = clientId;

        const roomCode = generateUniqueRoomCode();
        const now = Date.now();
        const hostName = sanitizeName(msg.userName);
        const participant: WatchPartyParticipant = {
          id: meta.participantId,
          clientId,
          name: hostName,
          isHost: true,
          joinedAt: now,
        };

        const episodeNumber =
          typeof msg.episodeNumber === 'number' && Number.isFinite(msg.episodeNumber)
            ? Math.max(1, Math.floor(msg.episodeNumber))
            : 1;
        const totalEpisodes =
          typeof msg.totalEpisodes === 'number' && Number.isFinite(msg.totalEpisodes)
            ? Math.max(episodeNumber, Math.floor(msg.totalEpisodes))
            : Math.max(episodeNumber, 12);

        const room: WatchPartyRoomState = {
          roomCode,
          roomName: sanitizeRoomName(msg.roomName, hostName),
          track: sanitizeTrack(msg.track),
          hostId: participant.id,
          hostClientId: clientId,
          hostAvatar: sanitizeOptionalUrl(msg.hostAvatar),
          isPublic: msg.isPublic !== false,
          mediaId: typeof msg.mediaId === 'string' ? msg.mediaId : 'demo-anime',
          mediaTitle:
            typeof msg.mediaTitle === 'string' && msg.mediaTitle.trim()
              ? msg.mediaTitle.trim().slice(0, 120)
              : 'Anime Stream',
          mediaCover: sanitizeOptionalUrl(msg.mediaCover),
          mediaBanner: sanitizeOptionalUrl(msg.mediaBanner),
          totalEpisodes,
          episodeNumber,
          episodeTitle:
            typeof msg.episodeTitle === 'string' && msg.episodeTitle.trim()
              ? msg.episodeTitle.trim().slice(0, 120)
              : `Episode ${episodeNumber}`,
          isPlaying: Boolean(msg.isPlaying),
          currentTime:
            typeof msg.currentTime === 'number' && Number.isFinite(msg.currentTime)
              ? Math.max(0, msg.currentTime)
              : 0,
          createdAt: now,
          updatedAt: now,
          peakParticipants: 1,
          messagesCount: 0,
          messages: [],
          participants: [participant],
        };

        clearRoomExpiryTimer(roomCode);
        rooms.set(roomCode, room);
        meta.roomCode = roomCode;

        sendJson(ws, {
          type: 'party:state',
          yourParticipantId: participant.id,
          room: serializeRoom(room),
        });
        broadcastLobbyRooms();
        return;
      }

      if (msgType === 'party:join') {
        const requestedCode = sanitizeRoomCode(msg.roomCode);
        const room = rooms.get(requestedCode);
        if (!room) {
          sendJson(ws, {
            type: 'party:error',
            code: 'ROOM_NOT_FOUND',
            message: requestedCode
              ? `Room ${requestedCode} was not found.`
              : 'Enter a valid room code to join.',
          });
          return;
        }

        const clientId =
          typeof msg.clientId === 'string' && msg.clientId.trim()
            ? msg.clientId.trim().slice(0, 64)
            : meta.clientId;

        if (meta.roomCode && meta.roomCode !== requestedCode) {
          detachFromCurrentRoom(ws);
        }

        for (const [otherWs, otherMeta] of socketMeta.entries()) {
          if (
            otherWs !== ws &&
            otherMeta.roomCode === requestedCode &&
            otherMeta.clientId === clientId
          ) {
            otherMeta.roomCode = null;
          }
        }

        meta.clientId = clientId;
        meta.participantId = clientId;
        meta.roomCode = requestedCode;

        clearRoomExpiryTimer(requestedCode);
        delete room.emptySince;

        const now = Date.now();
        const displayName = sanitizeName(msg.userName);
        const shouldBecomeHost =
          room.participants.length === 0 || room.hostClientId === clientId;

        if (shouldBecomeHost) {
          room.hostId = clientId;
        }

        const existingIdx = room.participants.findIndex((p) => p.id === clientId);
        if (existingIdx >= 0) {
          room.participants[existingIdx] = {
            ...room.participants[existingIdx],
            name: displayName,
            isHost: room.hostId === clientId,
          };
        } else {
          room.participants.push({
            id: clientId,
            clientId,
            name: displayName,
            isHost: room.hostId === clientId,
            joinedAt: now,
          });
        }

        if (shouldBecomeHost) {
          room.participants = room.participants.map((p) => ({
            ...p,
            isHost: p.id === room.hostId,
          }));
        }

        room.peakParticipants = Math.max(room.peakParticipants, room.participants.length);

        sendJson(ws, {
          type: 'party:state',
          yourParticipantId: clientId,
          room: serializeRoom(room),
        });

        broadcastToRoom(
          requestedCode,
          {
            type: 'party:presence',
            roomCode: requestedCode,
            hostId: room.hostId,
            participants: serializeRoom(room).participants,
            event: 'joined',
            actorName: displayName,
          },
          ws,
        );
        broadcastLobbyRooms();
        return;
      }

      if (msgType === 'party:sync') {
        const roomCode = meta.roomCode;
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;

        const now = Date.now();
        const action =
          msg.action === 'play' ||
          msg.action === 'pause' ||
          msg.action === 'seek' ||
          msg.action === 'episode'
            ? msg.action
            : 'seek';

        if (typeof msg.currentTime === 'number' && Number.isFinite(msg.currentTime)) {
          room.currentTime = Math.max(0, msg.currentTime);
        }
        if (typeof msg.isPlaying === 'boolean') {
          room.isPlaying = msg.isPlaying;
        }
        if (typeof msg.episodeNumber === 'number' && Number.isFinite(msg.episodeNumber)) {
          room.episodeNumber = Math.max(1, Math.floor(msg.episodeNumber));
          if (room.episodeNumber > room.totalEpisodes) {
            room.totalEpisodes = room.episodeNumber;
          }
        }
        if (typeof msg.episodeTitle === 'string' && msg.episodeTitle.trim()) {
          room.episodeTitle = msg.episodeTitle.trim().slice(0, 120);
        }
        room.updatedAt = now;

        broadcastToRoom(
          roomCode,
          {
            type: 'party:sync',
            roomCode,
            fromId: meta.participantId,
            action,
            currentTime: room.currentTime,
            isPlaying: room.isPlaying,
            episodeNumber: room.episodeNumber,
            episodeTitle: room.episodeTitle,
            updatedAt: now,
          },
          ws,
        );
        if (room.isPublic && action === 'episode') {
          broadcastLobbyRooms();
        }
        return;
      }

      if (msgType === 'party:chat') {
        const roomCode = meta.roomCode;
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;
        const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, 280) : '';
        if (!text) return;

        const sender = room.participants.find((p) => p.id === meta.participantId);
        const chatMsg: WatchPartyChatMessage = {
          id: crypto.randomUUID(),
          senderId: meta.participantId,
          senderName: sender?.name || sanitizeName(msg.userName),
          text,
          sentAt: Date.now(),
        };
        room.messages.push(chatMsg);
        if (room.messages.length > 80) {
          room.messages.shift();
        }
        room.messagesCount += 1;
        room.updatedAt = Date.now();

        broadcastToRoom(roomCode, {
          type: 'party:chat',
          roomCode,
          message: chatMsg,
          messagesCount: room.messagesCount,
        });
        broadcastLobbyRooms();
        return;
      }

      if (msgType === 'party:reaction') {
        const roomCode = meta.roomCode;
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;
        const emoji = typeof msg.emoji === 'string' ? msg.emoji.trim().slice(0, 8) : '';
        if (!emoji) return;

        const sender = room.participants.find((p) => p.id === meta.participantId);
        broadcastToRoom(roomCode, {
          type: 'party:reaction',
          roomCode,
          reaction: {
            id: crypto.randomUUID(),
            emoji,
            senderId: meta.participantId,
            senderName: sender?.name || sanitizeName(msg.userName),
            sentAt: Date.now(),
            laneSeed: Math.random(),
          },
        });
        return;
      }

      if (msgType === 'party:update') {
        const roomCode = meta.roomCode;
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room || room.hostId !== meta.participantId) return;

        if (typeof msg.roomName === 'string' && msg.roomName.trim()) {
          const hostDisplay =
            room.participants.find((p) => p.id === room.hostId || p.isHost)?.name || 'Host';
          room.roomName = sanitizeRoomName(msg.roomName, hostDisplay);
        }
        if (typeof msg.mediaId === 'string' && msg.mediaId.trim()) {
          room.mediaId = msg.mediaId.trim().slice(0, 64);
          room.currentTime = 0;
        }
        if (typeof msg.mediaTitle === 'string' && msg.mediaTitle.trim()) {
          room.mediaTitle = msg.mediaTitle.trim().slice(0, 120);
        }
        if ('mediaCover' in msg) {
          room.mediaCover = sanitizeOptionalUrl(msg.mediaCover);
        }
        if ('mediaBanner' in msg) {
          room.mediaBanner = sanitizeOptionalUrl(msg.mediaBanner);
        }
        if (typeof msg.totalEpisodes === 'number' && Number.isFinite(msg.totalEpisodes)) {
          room.totalEpisodes = Math.max(1, Math.floor(msg.totalEpisodes));
        }
        if (typeof msg.episodeNumber === 'number' && Number.isFinite(msg.episodeNumber)) {
          room.episodeNumber = Math.max(1, Math.floor(msg.episodeNumber));
        }
        if (typeof msg.episodeTitle === 'string' && msg.episodeTitle.trim()) {
          room.episodeTitle = msg.episodeTitle.trim().slice(0, 120);
        }
        if (msg.track === 'H-Sub' || msg.track === 'Dub') {
          room.track = msg.track;
        }
        if (typeof msg.isPublic === 'boolean') {
          room.isPublic = msg.isPublic;
        }
        room.updatedAt = Date.now();

        for (const [clientWs, clientMeta] of socketMeta.entries()) {
          if (clientMeta.roomCode === roomCode && clientWs.readyState === WebSocket.OPEN) {
            sendJson(clientWs, {
              type: 'party:state',
              yourParticipantId: clientMeta.participantId,
              room: serializeRoom(room),
            });
          }
        }
        broadcastLobbyRooms();
        return;
      }

      if (msgType === 'party:end') {
        const roomCode = meta.roomCode;
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;
        if (room.hostId !== meta.participantId && room.hostClientId !== meta.clientId) {
          detachFromCurrentRoom(ws);
          return;
        }

        const hostActor =
          room.participants.find((p) => p.id === meta.participantId)?.name || 'Host';

        for (const [clientWs, clientMeta] of socketMeta.entries()) {
          if (clientMeta.roomCode === roomCode) {
            clientMeta.roomCode = null;
            if (clientWs !== ws) {
              sendJson(clientWs, {
                type: 'party:ended',
                roomCode,
                message: `${hostActor} ended the Watch Party.`,
              });
            }
          }
        }
        finalizeEndedRoom(roomCode, hostActor);
        return;
      }

      if (msgType === 'party:leave') {
        detachFromCurrentRoom(ws);
      }
    });

    ws.on('close', () => {
      detachFromCurrentRoom(ws);
      socketMeta.delete(ws);
    });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`ShizuTv server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
