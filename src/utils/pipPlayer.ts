import { UnifiedEpisode, UnifiedMedia } from '../types/media';
import { SubtitleCue } from './inlinePlayer';

export type PipCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface PipSessionState {
  media: UnifiedMedia;
  episodes: UnifiedEpisode[];
  episodeIndex: number;
  sourceId?: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  overrideTitle?: string;
  serverId?: string;
  currentTime: number;
  duration: number;
  playing: boolean;
  speed: number;
  muted: boolean;
  volume: number;
  activeSubLang: string;
  editedCuesMap?: Record<string, SubtitleCue[]>;
}

export interface PipBoundsOptions {
  margin?: number;
  topClearance?: number;
  bottomClearance?: number;
}

export function clampPipPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  options: PipBoundsOptions = {},
): { x: number; y: number } {
  const margin = options.margin ?? 12;
  const topClearance = options.topClearance ?? margin;
  const bottomClearance = options.bottomClearance ?? margin;

  const minX = margin;
  const maxX = Math.max(minX, viewportWidth - width - margin);
  const minY = topClearance;
  const maxY = Math.max(minY, viewportHeight - height - bottomClearance);

  return {
    x: Math.round(Math.max(minX, Math.min(maxX, Number.isFinite(x) ? x : maxX))),
    y: Math.round(Math.max(minY, Math.min(maxY, Number.isFinite(y) ? y : maxY))),
  };
}

export function snapPipCorner(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): PipCorner {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const horizontal = centerX < viewportWidth / 2 ? 'left' : 'right';
  const vertical = centerY < viewportHeight / 2 ? 'top' : 'bottom';
  return `${vertical}-${horizontal}` as PipCorner;
}

export function computePipCornerPosition(
  corner: PipCorner,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  options: PipBoundsOptions = {},
): { x: number; y: number } {
  const margin = options.margin ?? 12;
  const topClearance = options.topClearance ?? margin;
  const bottomClearance = options.bottomClearance ?? margin;

  const isLeft = corner.endsWith('left');
  const isTop = corner.startsWith('top');

  const targetX = isLeft ? margin : Math.max(margin, viewportWidth - width - margin);
  const targetY = isTop
    ? topClearance
    : Math.max(topClearance, viewportHeight - height - bottomClearance);

  return clampPipPosition(
    targetX,
    targetY,
    width,
    height,
    viewportWidth,
    viewportHeight,
    options,
  );
}

export function canUseNativePictureInPicture(
  doc?: { pictureInPictureEnabled?: boolean } | null,
  video?: { requestPictureInPicture?: unknown; disablePictureInPicture?: boolean } | null,
): boolean {
  if (!doc || !doc.pictureInPictureEnabled) return false;
  if (!video) return true;
  if (video.disablePictureInPicture) return false;
  return typeof video.requestPictureInPicture === 'function';
}

export function shouldRestorePipPlayback(
  session: Pick<PipSessionState, 'media' | 'episodes' | 'episodeIndex'> | null | undefined,
  targetMediaId: string,
  targetEpisodeNumber: number,
): boolean {
  if (!session) return false;
  if (session.media.id !== targetMediaId) return false;
  const activeEp = session.episodes[session.episodeIndex];
  return Boolean(activeEp && activeEp.number === targetEpisodeNumber);
}

export interface AutoPipCheckInput {
  enabled: boolean;
  isPlaying: boolean;
  ended: boolean;
  alreadyHandled: boolean;
}

export function shouldAutoEnterPipOnLeave(input: AutoPipCheckInput): boolean {
  if (!input.enabled || input.alreadyHandled || input.ended) return false;
  return Boolean(input.isPlaying);
}

export interface InlinePipHandoff {
  shouldClosePip: boolean;
  restoreTime: number | null;
  resumePlaying: boolean;
}

export function resolveInlinePipHandoff(
  session:
    | Pick<PipSessionState, 'media' | 'episodes' | 'episodeIndex' | 'currentTime' | 'playing'>
    | null
    | undefined,
  targetMediaId: string,
  targetEpisodeNumber: number,
): InlinePipHandoff {
  if (!session) {
    return { shouldClosePip: false, restoreTime: null, resumePlaying: false };
  }
  if (shouldRestorePipPlayback(session, targetMediaId, targetEpisodeNumber)) {
    return {
      shouldClosePip: true,
      restoreTime: session.currentTime > 0.5 ? session.currentTime : null,
      resumePlaying: Boolean(session.playing),
    };
  }
  return { shouldClosePip: true, restoreTime: null, resumePlaying: false };
}


