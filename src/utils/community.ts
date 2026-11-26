export type CommunityCategory =
  | 'announcements'
  | 'general'
  | 'feedback'
  | 'features'
  | 'help';

export type CommunityLabel = 'resolved' | 'planned' | 'duplicate' | 'bug';

export type CommunitySort = 'hot' | 'new' | 'top';

export interface CommunityLinkedAnime {
  id: string | number;
  title: string;
  cover?: string | null;
}

export interface CommunityComment {
  id: string;
  authorName: string;
  authorAvatar?: string | null;
  authorIsMod?: boolean;
  body: string;
  createdAt: number;
}

export interface CommunityPost {
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
  linkedAnime: CommunityLinkedAnime[];
  score: number;
  userVote?: -1 | 0 | 1;
  comments: CommunityComment[];
  views: number;
  createdAt: number;
}

export interface CommunityRule {
  title: string;
  description: string;
}

export const COMMUNITY_CATEGORIES: Array<{
  id: CommunityCategory;
  label: string;
  chipLabel: string;
  userSelectable: boolean;
}> = [
  { id: 'announcements', label: 'Announcements', chipLabel: 'ANNOUNCEMENTS', userSelectable: false },
  { id: 'general', label: 'General', chipLabel: 'GENERAL', userSelectable: true },
  { id: 'feedback', label: 'Feedback & Bugs', chipLabel: 'FEEDBACK & BUGS', userSelectable: true },
  { id: 'features', label: 'Feature Requests', chipLabel: 'FEATURE REQUESTS', userSelectable: true },
  { id: 'help', label: 'Help & Support', chipLabel: 'HELP & SUPPORT', userSelectable: true },
];

export const COMMUNITY_LABELS: Array<{ id: CommunityLabel; label: string }> = [
  { id: 'resolved', label: 'Resolved' },
  { id: 'planned', label: 'Planned' },
  { id: 'duplicate', label: 'Duplicate' },
  { id: 'bug', label: 'Bug' },
];

export const COMMUNITY_RULES: CommunityRule[] = [
  {
    title: 'Be respectful.',
    description: 'Debate ideas, not people. No harassment, slurs or hate speech.',
  },
  {
    title: 'Stay on topic.',
    description: 'Anime, manga and ShizuTv. Post in the board that fits.',
  },
  {
    title: 'Search before posting.',
    description: 'Duplicates may be locked or labelled Duplicate.',
  },
  {
    title: 'No spam or self-promotion.',
    description: 'No ads, referral links or reposting the same thing.',
  },
  {
    title: 'Go easy on spoilers.',
    description: 'Keep them out of post titles, and give a heads-up before big plot points from recent episodes.',
  },
  {
    title: 'Make reports useful.',
    description: 'For bugs, say which anime, episode, server and device.',
  },
  {
    title: 'Keep it safe.',
    description: "No NSFW content and no one's personal info.",
  },
  {
    title: 'Mods have the final say.',
    description: 'Rule-breaking posts may be removed; repeat offenders may be banned.',
  },
];

export function formatRelativeTimeAgo(timestampMs: number, nowMs = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (diffSec < 60) return 'just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function getCategoryMeta(category: CommunityCategory) {
  return (
    COMMUNITY_CATEGORIES.find((c) => c.id === category) ?? {
      id: category,
      label: 'General',
      chipLabel: 'GENERAL',
      userSelectable: true,
    }
  );
}

export function computeCommunityHotScore(post: CommunityPost, nowMs = Date.now()): number {
  const ageHours = Math.max(0.5, (nowMs - post.createdAt) / 3_600_000);
  const engagement = post.score * 2 + post.comments.length * 1.5 + post.views * 0.02;
  return (engagement + 1) / Math.pow(ageHours + 2, 1.15);
}

export interface CommunityFilterOptions {
  category: CommunityCategory | 'all';
  label: CommunityLabel | 'any';
  sort: CommunitySort;
  search: string;
}

export function filterAndSortCommunityPosts(
  posts: CommunityPost[],
  opts: CommunityFilterOptions,
  nowMs = Date.now(),
): CommunityPost[] {
  const q = opts.search.trim().toLowerCase();
  const filtered = posts.filter((post) => {
    if (opts.category !== 'all' && post.category !== opts.category) return false;
    if (opts.label !== 'any' && post.label !== opts.label) return false;
    if (q) {
      const hay = [
        post.title,
        post.body,
        post.authorName,
        ...post.linkedAnime.map((a) => a.title),
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    const aPinned = a.pinned ? 1 : 0;
    const bPinned = b.pinned ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;

    if (opts.sort === 'new') {
      return b.createdAt - a.createdAt;
    }
    if (opts.sort === 'top') {
      if (b.score !== a.score) return b.score - a.score;
      return b.createdAt - a.createdAt;
    }
    return computeCommunityHotScore(b, nowMs) - computeCommunityHotScore(a, nowMs);
  });
}

export interface CommunityDraftInput {
  category: CommunityCategory | '';
  title: string;
  body: string;
  linkedAnime: CommunityLinkedAnime[];
}

export function validateCommunityPostDraft(draft: CommunityDraftInput): string | null {
  if (!draft.category) return 'Please choose a category.';
  const title = draft.title.trim();
  if (title.length < 3) return 'Title must be at least 3 characters.';
  if (title.length > 120) return 'Title must be 120 characters or less.';
  const body = draft.body.trim();
  if (body.length < 5) return 'Please write a little more detail in the body.';
  if (draft.linkedAnime.length > 3) return 'You can link at most 3 anime.';
  return null;
}

export type InlineBodyToken =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'spoiler'; text: string };

export type BodyBlock =
  | { kind: 'paragraph'; tokens: InlineBodyToken[] }
  | { kind: 'quote'; tokens: InlineBodyToken[] };

export function parseInlineCommunityTokens(input: string): InlineBodyToken[] {
  const tokens: InlineBodyToken[] = [];
  const pattern = /(\*\*[^*]+\*\*|\|\|[^|]+\|\|)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ kind: 'text', text: input.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith('**') && raw.endsWith('**')) {
      tokens.push({ kind: 'bold', text: raw.slice(2, -2) });
    } else if (raw.startsWith('||') && raw.endsWith('||')) {
      tokens.push({ kind: 'spoiler', text: raw.slice(2, -2) });
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < input.length) {
    tokens.push({ kind: 'text', text: input.slice(lastIndex) });
  }
  return tokens;
}

export function parseCommunityBodyBlocks(body: string): BodyBlock[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, idx, arr) => line.length > 0 || (idx > 0 && idx < arr.length - 1))
    .map((line) => {
      if (line.trimStart().startsWith('>')) {
        const cleaned = line.trimStart().replace(/^>\s?/, '');
        return { kind: 'quote', tokens: parseInlineCommunityTokens(cleaned) };
      }
      return { kind: 'paragraph', tokens: parseInlineCommunityTokens(line) };
    });
}
