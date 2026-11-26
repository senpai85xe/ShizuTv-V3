import type {
  ExtensionRepo,
  MediaType,
  SourceInfo,
} from '../types/media.ts';

const PRIVATE_IPV4_RE =
  /^(?:10\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[0-1])\.|192\.168\.|0\.)/;

export function isSafeExternalHttpUrl(rawUrl: string): boolean {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '::1' ||
      host === '[::1]' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      PRIVATE_IPV4_RE.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function deriveRepoBaseUrl(repoUrl?: string | null): string | undefined {
  if (typeof repoUrl !== 'string') return undefined;
  const trimmed = repoUrl.trim();
  if (!isSafeExternalHttpUrl(trimmed)) return undefined;
  try {
    const parsed = new URL(trimmed);
    const segments = parsed.pathname.split('/');
    const last = segments[segments.length - 1] || '';
    if (last.toLowerCase().endsWith('.json') || last.includes('.')) {
      segments.pop();
    }
    const basePath = segments.join('/').replace(/\/+$/, '');
    return `${parsed.origin}${basePath}`;
  } catch {
    return undefined;
  }
}

export function resolveAniyomiAssetUrl(
  rawAsset: unknown,
  repoBaseUrl?: string,
  subDir?: 'apk' | 'icon',
): string | undefined {
  if (typeof rawAsset !== 'string') return undefined;
  const trimmed = rawAsset.trim();
  if (!trimmed) return undefined;
  if (isSafeExternalHttpUrl(trimmed)) return trimmed;
  if (!repoBaseUrl || !isSafeExternalHttpUrl(repoBaseUrl)) return undefined;
  const cleanRel = trimmed.replace(/^\.?\//, '').replace(/^\/+/, '');
  if (!cleanRel || cleanRel.includes('..')) return undefined;
  const cleanBase = repoBaseUrl.replace(/\/+$/, '');
  if (subDir && !cleanRel.toLowerCase().startsWith(`${subDir}/`)) {
    return `${cleanBase}/${subDir}/${cleanRel}`;
  }
  return `${cleanBase}/${cleanRel}`;
}

export function parseAniyomiVersionCode(rawCode: unknown): number | undefined {
  if (typeof rawCode === 'number' && Number.isFinite(rawCode) && rawCode > 0) {
    return Math.trunc(rawCode);
  }
  if (typeof rawCode === 'string' && /^\d+$/.test(rawCode.trim())) {
    const parsed = Number.parseInt(rawCode.trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

export function parseAniyomiLibVersion(
  rawLibVersion: unknown,
  versionStr?: string,
): string | undefined {
  if (typeof rawLibVersion === 'string' && rawLibVersion.trim()) {
    return rawLibVersion.trim().replace(/^v+/i, '');
  }
  if (typeof rawLibVersion === 'number' && Number.isFinite(rawLibVersion) && rawLibVersion > 0) {
    return String(rawLibVersion);
  }
  const cleanVer = typeof versionStr === 'string' ? versionStr.trim().replace(/^v+/i, '') : '';
  if (!cleanVer) return undefined;
  // Aniyomi extensions follow `<libVersion>.<extVersion>` e.g. `14.2`, `15.1`, `16.10`
  const aniyomiMajorMatch = cleanVer.match(/^(1\d|2\d)\.\d+/);
  if (aniyomiMajorMatch) {
    return aniyomiMajorMatch[1];
  }
  // Legacy Tachiyomi `1.x.y` versioning (e.g. `1.4.25` -> libVersion `1.4`)
  const legacyMatch = cleanVer.match(/^(1\.\d+)\.\d+/);
  if (legacyMatch) {
    return legacyMatch[1];
  }
  return undefined;
}

function slugifySourceId(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function normalizeLang(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return 'en';
  return raw.trim().toLowerCase().slice(0, 12);
}

function inferAniyomiMediaTypes(pkg: string, apk: string): MediaType[] {
  const combined = `${pkg} ${apk}`.toLowerCase();
  if (combined.includes('animeextension') || combined.includes('anime')) {
    return ['ANIME'];
  }
  if (combined.includes('novel')) {
    return [];
  }
  return ['MANGA'];
}

function inferMangayomiMediaTypes(itemType: unknown): MediaType[] {
  if (itemType === 1 || itemType === 'anime') return ['ANIME'];
  if (itemType === 2 || itemType === 'novel') return [];
  return ['MANGA'];
}

function inferCloudStreamMediaTypes(tvTypes: unknown): MediaType[] {
  if (!Array.isArray(tvTypes)) return ['ANIME'];
  const lowered = tvTypes.map((t) => String(t).toLowerCase());
  if (lowered.some((t) => t.includes('anime') || t.includes('ova'))) {
    return ['ANIME'];
  }
  return ['ANIME', 'MOVIE', 'TV'];
}

export interface ParsedExtensionRepoResult {
  format: 'aniyomi' | 'mangayomi' | 'cloudstream' | 'shizutv' | 'unknown';
  repoName: string | null;
  repoBaseUrl?: string;
  pluginListUrls: string[];
  sources: SourceInfo[];
}

export function parseExtensionRepoManifest(
  rawJson: unknown,
  options: { repoUrl: string; manager?: ExtensionRepo['manager']; fallbackName?: string },
): ParsedExtensionRepoResult {
  const sources: SourceInfo[] = [];
  const seenIds = new Set<string>();
  const pluginListUrls: string[] = [];
  const repoBaseUrl = deriveRepoBaseUrl(options.repoUrl);

  const pushSource = (src: SourceInfo) => {
    if (!src.id || !src.name || src.mediaTypes.length === 0 || seenIds.has(src.id)) return;
    seenIds.add(src.id);
    sources.push(src);
  };

  // CloudStream repo.json wrapper: { name, pluginLists: [...] }
  if (rawJson && typeof rawJson === 'object' && !Array.isArray(rawJson)) {
    const obj = rawJson as Record<string, unknown>;
    if (Array.isArray(obj.pluginLists)) {
      for (const item of obj.pluginLists) {
        if (typeof item === 'string' && isSafeExternalHttpUrl(item)) {
          pluginListUrls.push(item.trim());
        }
      }
      return {
        format: 'cloudstream',
        repoName: typeof obj.name === 'string' ? obj.name.trim() : options.fallbackName ?? null,
        ...(repoBaseUrl ? { repoBaseUrl } : {}),
        pluginListUrls,
        sources: [],
      };
    }

    // Generic wrapped list: { name, sources: [...] } or { extensions: [...] }
    const nested = Array.isArray(obj.sources)
      ? obj.sources
      : Array.isArray(obj.extensions)
        ? obj.extensions
        : null;
    if (nested) {
      const inner = parseExtensionRepoManifest(nested, options);
      return {
        ...inner,
        repoName: typeof obj.name === 'string' ? obj.name.trim() : inner.repoName,
      };
    }
  }

  if (!Array.isArray(rawJson)) {
    return {
      format: 'unknown',
      repoName: options.fallbackName ?? null,
      ...(repoBaseUrl ? { repoBaseUrl } : {}),
      pluginListUrls: [],
      sources: [],
    };
  }

  let detectedFormat: ParsedExtensionRepoResult['format'] = 'unknown';

  for (const item of rawJson) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;

    // 1. Aniyomi / Tachiyomi index.min.json entry
    if (typeof rec.pkg === 'string' || Array.isArray(rec.sources)) {
      detectedFormat = 'aniyomi';
      const pkg = typeof rec.pkg === 'string' ? rec.pkg.trim() : '';
      const apkName = typeof rec.apk === 'string' ? rec.apk.trim() : '';
      const apkUrl = resolveAniyomiAssetUrl(apkName, repoBaseUrl, 'apk');
      const version =
        typeof rec.version === 'string' && rec.version.trim() ? rec.version.trim() : '1.0.0';
      const versionCode = parseAniyomiVersionCode(rec.code ?? rec.versionCode);
      const libVersion = parseAniyomiLibVersion(rec.libVersion, version);
      const mediaTypes = inferAniyomiMediaTypes(pkg, apkName);
      const isNsfw = Number(rec.nsfw) === 1 || rec.nsfw === true;
      const defaultIconUrl =
        resolveAniyomiAssetUrl(rec.icon ?? rec.iconUrl, repoBaseUrl, 'icon') ??
        (pkg && repoBaseUrl
          ? `${repoBaseUrl}/icon/${encodeURIComponent(pkg)}.png`
          : undefined);
      const subSources = Array.isArray(rec.sources) ? rec.sources : [];

      if (subSources.length > 0) {
        for (const sub of subSources) {
          if (!sub || typeof sub !== 'object') continue;
          const s = sub as Record<string, unknown>;
          const rawName = String(s.name || rec.name || 'Extension')
            .replace(/^(?:Aniyomi|Tachiyomi):\s*/i, '')
            .trim();
          const lang = normalizeLang(s.lang ?? rec.lang);
          const subId = String(s.id || `${pkg}-${rawName}`);
          const baseUrl =
            typeof s.baseUrl === 'string' && s.baseUrl.trim() ? s.baseUrl.trim() : undefined;
          const subIconUrl =
            resolveAniyomiAssetUrl(s.icon ?? s.iconUrl, repoBaseUrl, 'icon') ??
            defaultIconUrl;
          pushSource({
            id: `ext-ay-${slugifySourceId(subId)}`,
            name: rawName,
            type: 'extension',
            mediaTypes,
            lang,
            version,
            repoUrl: options.repoUrl,
            ...(repoBaseUrl ? { repoBaseUrl } : {}),
            ...(baseUrl ? { baseUrl } : {}),
            ...(pkg ? { pkg } : {}),
            ...(apkName ? { apkName } : {}),
            ...(apkUrl ? { apkUrl } : {}),
            ...(versionCode !== undefined ? { versionCode } : {}),
            ...(libVersion ? { libVersion } : {}),
            ...(subIconUrl ? { iconUrl: subIconUrl } : {}),
            isNsfw,
            runtimeRequirement: 'android-native',
            metadataOnlyStorage: true,
            description: baseUrl
              ? `Aniyomi source · ${baseUrl.replace(/^https?:\/\//, '')}`
              : `Imported from ${pkg || 'Aniyomi repo'}`,
          });
        }
      } else {
        const rawName = String(rec.name || pkg || 'Extension')
          .replace(/^(?:Aniyomi|Tachiyomi):\s*/i, '')
          .trim();
        pushSource({
          id: `ext-ay-${slugifySourceId(pkg || rawName)}`,
          name: rawName,
          type: 'extension',
          mediaTypes,
          lang: normalizeLang(rec.lang),
          version,
          repoUrl: options.repoUrl,
          ...(repoBaseUrl ? { repoBaseUrl } : {}),
          ...(pkg ? { pkg } : {}),
          ...(apkName ? { apkName } : {}),
          ...(apkUrl ? { apkUrl } : {}),
          ...(versionCode !== undefined ? { versionCode } : {}),
          ...(libVersion ? { libVersion } : {}),
          ...(defaultIconUrl ? { iconUrl: defaultIconUrl } : {}),
          isNsfw,
          runtimeRequirement: 'android-native',
          metadataOnlyStorage: true,
          description: `Aniyomi extension · ${pkg || 'repo manifest'}`,
        });
      }
      continue;
    }

    // 2. Mangayomi index.json entry
    if (
      typeof rec.baseUrl === 'string' &&
      (typeof rec.typeSource === 'string' ||
        typeof rec.itemType !== 'undefined' ||
        typeof rec.sourceCodeUrl === 'string')
    ) {
      detectedFormat = 'mangayomi';
      const name = String(rec.name || 'Mangayomi Extension').trim();
      const baseUrl = rec.baseUrl.trim();
      const lang = normalizeLang(rec.lang);
      const version = typeof rec.version === 'string' ? rec.version : '1.0.0';
      const iconUrl = typeof rec.iconUrl === 'string' ? rec.iconUrl.trim() : undefined;
      const isNsfw = Boolean(rec.isNsfw);
      const idSlug = slugifySourceId(`${rec.id ?? ''}-${name}-${lang}`) || slugifySourceId(name);

      pushSource({
        id: `ext-my-${idSlug}`,
        name,
        type: 'extension',
        mediaTypes: inferMangayomiMediaTypes(rec.itemType),
        lang,
        version,
        repoUrl: options.repoUrl,
        ...(repoBaseUrl ? { repoBaseUrl } : {}),
        baseUrl,
        iconUrl,
        isNsfw,
        runtimeRequirement: 'unverified',
        description: `${rec.typeSource ? `${String(rec.typeSource)} · ` : ''}${baseUrl.replace(/^https?:\/\//, '')}`,
      });
      continue;
    }

    // 3. CloudStream plugins.json entry
    if (
      typeof rec.internalName === 'string' ||
      Array.isArray(rec.tvTypes) ||
      typeof rec.repositoryUrl === 'string'
    ) {
      detectedFormat = 'cloudstream';
      const name = String(rec.name || rec.internalName || 'CloudStream Plugin').trim();
      const lang = normalizeLang(rec.language ?? rec.lang);
      const version =
        typeof rec.version === 'number' || typeof rec.version === 'string'
          ? String(rec.version)
          : '1.0.0';
      const isNsfw = Array.isArray(rec.tvTypes)
        ? rec.tvTypes.some((t) => String(t).toLowerCase() === 'nsfw')
        : false;
      pushSource({
        id: `ext-cs-${slugifySourceId(`${rec.internalName || name}-${lang}`)}`,
        name,
        type: 'extension',
        mediaTypes: inferCloudStreamMediaTypes(rec.tvTypes),
        lang,
        version,
        repoUrl: options.repoUrl,
        ...(repoBaseUrl ? { repoBaseUrl } : {}),
        baseUrl: typeof rec.url === 'string' ? rec.url.trim() : undefined,
        iconUrl: typeof rec.iconUrl === 'string' ? rec.iconUrl.trim() : undefined,
        isNsfw,
        runtimeRequirement: 'unverified',
        description:
          typeof rec.description === 'string' && rec.description.trim()
            ? rec.description.trim()
            : 'CloudStream extension plugin',
      });
      continue;
    }

    // 4. Generic ShizuTv / JSON source entry
    if (typeof rec.name === 'string') {
      detectedFormat = 'shizutv';
      const name = rec.name.trim();
      const rawMediaTypes = Array.isArray(rec.mediaTypes) ? rec.mediaTypes : null;
      const mediaTypes: MediaType[] = rawMediaTypes
        ? (rawMediaTypes.filter((m): m is MediaType =>
            ['ANIME', 'MANGA', 'TV', 'MOVIE'].includes(String(m).toUpperCase()),
          ) as MediaType[])
        : ['ANIME'];
      if (rawMediaTypes && rawMediaTypes.length > 0 && mediaTypes.length === 0) {
        continue;
      }
      pushSource({
        id: `ext-custom-${slugifySourceId(String(rec.id || name))}`,
        name,
        type: 'extension',
        mediaTypes: mediaTypes.length > 0 ? mediaTypes : ['ANIME'],
        lang: normalizeLang(rec.lang ?? rec.language),
        version: typeof rec.version === 'string' ? rec.version : '1.0.0',
        repoUrl: options.repoUrl,
        ...(repoBaseUrl ? { repoBaseUrl } : {}),
        baseUrl: typeof rec.baseUrl === 'string' ? rec.baseUrl.trim() : undefined,
        runtimeRequirement: 'unverified',
        description:
          typeof rec.description === 'string' && rec.description.trim()
            ? rec.description.trim()
            : `Imported extension (${options.manager || 'custom'})`,
      });
    }
  }

  return {
    format: detectedFormat,
    repoName: options.fallbackName ?? null,
    ...(repoBaseUrl ? { repoBaseUrl } : {}),
    pluginListUrls,
    sources,
  };
}
