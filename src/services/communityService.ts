import { CommunityCategory, CommunityLinkedAnime, CommunityPost } from '../utils/community';
import { getOrCreateWatchPartyClientId } from '../utils/watchParty';
import { parseJsonResponseSafely, resolveApiUrl } from '../utils/backendConfig';

export async function fetchCommunityPosts(): Promise<CommunityPost[]> {
  const clientId = getOrCreateWatchPartyClientId();
  const res = await fetch(
    resolveApiUrl(`/api/community/posts?clientId=${encodeURIComponent(clientId)}`),
  );
  const data = await parseJsonResponseSafely<{ posts?: CommunityPost[]; message?: string }>(
    res,
    'community posts',
  );
  if (!res.ok) {
    throw new Error(data.message || 'Failed to load community posts');
  }
  return Array.isArray(data.posts) ? data.posts : [];
}

export async function createCommunityPost(input: {
  category: CommunityCategory;
  title: string;
  body: string;
  linkedAnime: CommunityLinkedAnime[];
  authorName: string;
  authorAvatar?: string;
}): Promise<CommunityPost> {
  const clientId = getOrCreateWatchPartyClientId();
  const res = await fetch(resolveApiUrl('/api/community/posts'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...input,
      clientId,
    }),
  });
  const data = await parseJsonResponseSafely<{ post?: CommunityPost; message?: string }>(
    res,
    'publish community post',
  );
  if (!res.ok || !data.post) {
    throw new Error(data.message || 'Could not publish post');
  }
  return data.post;
}

export async function voteCommunityPost(postId: string, vote: -1 | 0 | 1): Promise<CommunityPost> {
  const clientId = getOrCreateWatchPartyClientId();
  const res = await fetch(
    resolveApiUrl(`/api/community/posts/${encodeURIComponent(postId)}/vote`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, vote }),
    },
  );
  const data = await parseJsonResponseSafely<{ post?: CommunityPost; message?: string }>(
    res,
    'community vote',
  );
  if (!res.ok || !data.post) {
    throw new Error(data.message || 'Vote failed');
  }
  return data.post;
}

export async function recordCommunityPostView(postId: string): Promise<CommunityPost | null> {
  try {
    const clientId = getOrCreateWatchPartyClientId();
    const res = await fetch(
      resolveApiUrl(`/api/community/posts/${encodeURIComponent(postId)}/view`),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      },
    );
    if (!res.ok) return null;
    const data = await parseJsonResponseSafely<{ post?: CommunityPost }>(
      res,
      'community post view',
    );
    return data.post ?? null;
  } catch {
    return null;
  }
}

export async function addCommunityComment(input: {
  postId: string;
  body: string;
  authorName: string;
  authorAvatar?: string;
}): Promise<CommunityPost> {
  const clientId = getOrCreateWatchPartyClientId();
  const res = await fetch(
    resolveApiUrl(`/api/community/posts/${encodeURIComponent(input.postId)}/comments`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        body: input.body,
        authorName: input.authorName,
        authorAvatar: input.authorAvatar,
      }),
    },
  );
  const data = await parseJsonResponseSafely<{ post?: CommunityPost; message?: string }>(
    res,
    'community comment',
  );
  if (!res.ok || !data.post) {
    throw new Error(data.message || 'Could not post comment');
  }
  return data.post;
}

export async function deleteCommunityPost(postId: string): Promise<void> {
  const clientId = getOrCreateWatchPartyClientId();
  const res = await fetch(
    resolveApiUrl(
      `/api/community/posts/${encodeURIComponent(postId)}?clientId=${encodeURIComponent(clientId)}`,
    ),
    { method: 'DELETE' },
  );
  if (!res.ok) {
    const data = await parseJsonResponseSafely<{ message?: string }>(
      res,
      'delete community post',
    ).catch(() => ({ message: undefined }));
    throw new Error(data.message || 'Could not delete post');
  }
}
