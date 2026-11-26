export const DEFAULT_DOCUMENT_TITLE = 'ShizuTv — Watch. Read. Track.';
export const BRAND_TITLE_PREFIX = 'ShizuTv';

export interface MediaDocumentTitleInput {
  mediaTitle?: string | null;
  episodeNumber?: number | null;
  chapterNumber?: number | null;
}

const STATIC_ROUTE_LABELS: Array<{ match: (path: string) => boolean; label: string }> = [
  { match: (p) => p === '/' || p === '/home', label: 'Home' },
  { match: (p) => p.startsWith('/discover'), label: 'Discover' },
  { match: (p) => p.startsWith('/library'), label: 'Library' },
  { match: (p) => p.startsWith('/downloads'), label: 'Downloads' },
  { match: (p) => p.startsWith('/calendar'), label: 'Calendar' },
  { match: (p) => p.startsWith('/continue/manga'), label: 'Continue Reading' },
  { match: (p) => p.startsWith('/continue'), label: 'Continue Watching' },
  { match: (p) => p.startsWith('/watch-together'), label: 'Watch Together' },
  { match: (p) => p.startsWith('/community'), label: 'Community' },
  { match: (p) => p === '/settings', label: 'Settings' },
  { match: (p) => p === '/settings/theme', label: 'Theme Settings' },
  { match: (p) => p === '/settings/ui', label: 'UI Settings' },
  { match: (p) => p === '/settings/home', label: 'Home Sections' },
  { match: (p) => p === '/settings/tracking', label: 'Tracking Settings' },
  { match: (p) => p === '/settings/extensions', label: 'Extensions' },
  { match: (p) => p === '/settings/player', label: 'Player Settings' },
  { match: (p) => p === '/settings/reader', label: 'Reader Settings' },
  { match: (p) => p === '/settings/content', label: 'Content Settings' },
  { match: (p) => p === '/settings/security', label: 'Security Settings' },
  { match: (p) => p === '/settings/backup', label: 'Backup & Restore' },
  { match: (p) => p === '/settings/discord', label: 'Discord RPC' },
  { match: (p) => p === '/settings/logs', label: 'System Logs' },
  { match: (p) => p === '/settings/diagnostics', label: 'Episode Diagnostics' },
  { match: (p) => p === '/settings/backend', label: 'Backend Server' },
  { match: (p) => p === '/settings/about', label: 'About ShizuTv' },
  { match: (p) => p.startsWith('/settings'), label: 'Settings' },
];

export function formatDocumentTitle(pageLabel?: string | null): string {
  const clean = pageLabel?.trim();
  if (!clean) return DEFAULT_DOCUMENT_TITLE;
  return `${BRAND_TITLE_PREFIX} — ${clean}`;
}

export function formatMediaDocumentTitle(input: MediaDocumentTitleInput): string {
  const cleanTitle = input.mediaTitle?.trim();
  if (!cleanTitle) return DEFAULT_DOCUMENT_TITLE;

  if (typeof input.episodeNumber === 'number' && Number.isFinite(input.episodeNumber) && input.episodeNumber > 0) {
    return `${BRAND_TITLE_PREFIX} — EP ${input.episodeNumber} · ${cleanTitle}`;
  }

  if (typeof input.chapterNumber === 'number' && Number.isFinite(input.chapterNumber) && input.chapterNumber > 0) {
    return `${BRAND_TITLE_PREFIX} — Ch. ${input.chapterNumber} · ${cleanTitle}`;
  }

  return `${BRAND_TITLE_PREFIX} — ${cleanTitle}`;
}

export function resolveRouteDocumentTitle(pathname: string): string | null {
  const normalized = pathname.trim().toLowerCase() || '/';
  // Media & live Watch Together room routes manage their own dynamic document title once loaded
  if (
    normalized.startsWith('/details/') ||
    normalized.startsWith('/genre/') ||
    normalized.startsWith('/reader') ||
    normalized.startsWith('/watch-together/')
  ) {
    return null;
  }

  const matched = STATIC_ROUTE_LABELS.find((entry) => entry.match(normalized));
  return formatDocumentTitle(matched?.label ?? null);
}
