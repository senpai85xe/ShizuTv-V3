import type {
  NativeExtensionIntegrityModel,
  NativeExtensionStagingState,
  NativeExtensionVerificationStatus,
  NativeSigningCertChangeDetails,
} from '../types/media.ts';
import { parseAniyomiLibVersion } from './extensionRepoParser.ts';

export const SUPPORTED_ANIYOMI_LIB_MAJORS = ['14', '15', '16'] as const;

const ANDROID_PACKAGE_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/i;
const PRIVATE_IPV4_RE =
  /^(?:10\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|0\.)/;

export interface CapacitorRuntimeLike {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

export function isAndroidNativePlatform(
  runtimeOverride?: CapacitorRuntimeLike | null,
): boolean {
  const runtime =
    runtimeOverride !== undefined
      ? runtimeOverride
      : (globalThis as { Capacitor?: CapacitorRuntimeLike }).Capacitor;
  if (!runtime || typeof runtime !== 'object') return false;
  try {
    const isNative =
      typeof runtime.isNativePlatform === 'function' ? runtime.isNativePlatform() : false;
    const platform =
      typeof runtime.getPlatform === 'function' ? runtime.getPlatform() : '';
    return isNative === true && platform === 'android';
  } catch {
    return false;
  }
}

export function validateAndroidPackageName(rawPkg: unknown): string {
  if (typeof rawPkg !== 'string') {
    throw new Error('Invalid Android extension package identifier.');
  }
  const trimmed = rawPkg.trim();
  if (!trimmed || trimmed.length > 180 || !ANDROID_PACKAGE_RE.test(trimmed)) {
    throw new Error('Invalid Android extension package identifier.');
  }
  return trimmed;
}

export function validateExtensionApkDownloadUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error('Extension APK download URL is missing.');
  }
  const trimmed = rawUrl.trim();
  let decodedForCheck = trimmed;
  try {
    decodedForCheck = decodeURIComponent(trimmed);
  } catch {
    decodedForCheck = trimmed;
  }
  if (
    trimmed.includes('..') ||
    decodedForCheck.includes('..') ||
    trimmed.includes('\\') ||
    decodedForCheck.includes('\\')
  ) {
    throw new Error('Invalid path traversal segment in extension APK URL.');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Malformed extension APK download URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS extension APK URLs are permitted.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Embedded credentials in extension APK URL are not permitted.');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    PRIVATE_IPV4_RE.test(host)
  ) {
    throw new Error('Localhost and private network APK hosts are blocked.');
  }
  return parsed.toString();
}

export function isSupportedAniyomiLibVersion(
  rawLibVersion?: string | null,
  fallbackVersion?: string | null,
): boolean {
  const normalized =
    parseAniyomiLibVersion(rawLibVersion ?? undefined, fallbackVersion ?? undefined) ??
    (typeof rawLibVersion === 'string' ? rawLibVersion.trim().replace(/^v+/i, '') : '');
  if (!normalized) return false;
  return (SUPPORTED_ANIYOMI_LIB_MAJORS as readonly string[]).includes(normalized);
}

export function detectSigningCertificateChange(
  previousCertSha256?: string | null,
  incomingCertSha256?: string | null,
): {
  changed: boolean;
  firstPin: boolean;
  previousCertSha256: string | null;
  incomingCertSha256: string | null;
} {
  const prev =
    typeof previousCertSha256 === 'string' && previousCertSha256.trim()
      ? previousCertSha256.trim().toLowerCase()
      : null;
  const next =
    typeof incomingCertSha256 === 'string' && incomingCertSha256.trim()
      ? incomingCertSha256.trim().toLowerCase()
      : null;

  if (!prev) {
    return {
      changed: false,
      firstPin: Boolean(next),
      previousCertSha256: null,
      incomingCertSha256: next,
    };
  }
  if (!next) {
    return {
      changed: true,
      firstPin: false,
      previousCertSha256: prev,
      incomingCertSha256: null,
    };
  }
  return {
    changed: prev !== next,
    firstPin: false,
    previousCertSha256: prev,
    incomingCertSha256: next,
  };
}

function normalizeVerificationStatus(
  rawStatus: unknown,
  staged: boolean,
  libCompatible: boolean,
): NativeExtensionVerificationStatus {
  if (
    rawStatus === 'not_staged' ||
    rawStatus === 'staged_verified' ||
    rawStatus === 'incompatible_lib' ||
    rawStatus === 'cert_mismatch' ||
    rawStatus === 'error'
  ) {
    return rawStatus;
  }
  if (!staged) return 'not_staged';
  return libCompatible ? 'staged_verified' : 'incompatible_lib';
}

export function normalizeNativeStagedRecord(raw: unknown): NativeExtensionStagingState {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const staged = obj.staged === true;
  const packageName = typeof obj.packageName === 'string' ? obj.packageName.trim() : '';
  const versionName = typeof obj.versionName === 'string' ? obj.versionName.trim() : '';
  const versionCode =
    typeof obj.versionCode === 'number' && Number.isFinite(obj.versionCode)
      ? Math.trunc(obj.versionCode)
      : 0;
  const libVersion = typeof obj.libVersion === 'string' ? obj.libVersion.trim() : '';
  const libCompatible =
    typeof obj.libCompatible === 'boolean'
      ? obj.libCompatible
      : isSupportedAniyomiLibVersion(libVersion, versionName);
  const apkSha256 =
    typeof obj.apkSha256 === 'string' && SHA256_HEX_RE.test(obj.apkSha256.trim())
      ? obj.apkSha256.trim().toLowerCase()
      : '';
  const signingCertSha256 =
    typeof obj.signingCertSha256 === 'string' &&
    SHA256_HEX_RE.test(obj.signingCertSha256.trim())
      ? obj.signingCertSha256.trim().toLowerCase()
      : '';
  const expectedSha256Verified = obj.expectedSha256Verified === true;
  const integrityModel: NativeExtensionIntegrityModel = expectedSha256Verified
    ? 'manifest_sha256_verified'
    : 'local_integrity_tofu';

  const integrityNote =
    typeof obj.integrityNote === 'string' && obj.integrityNote.trim()
      ? obj.integrityNote.trim()
      : expectedSha256Verified
        ? 'SHA-256 matches provided manifest digest and file digest.'
        : 'SHA-256 computed locally for file integrity only (manifest digest not provided); signing certificate pinned on first use (TOFU).';

  return {
    staged,
    packageName,
    versionName,
    versionCode,
    libVersion,
    libCompatible,
    extensionClass: typeof obj.extensionClass === 'string' ? obj.extensionClass.trim() : '',
    isNsfw: obj.isNsfw === true,
    hasAniyomiFeature: obj.hasAniyomiFeature === true,
    apkSha256,
    expectedSha256Verified,
    signingCertSha256,
    trustedCertPinned: obj.trustedCertPinned === true || Boolean(signingCertSha256),
    readOnlyLocked: obj.readOnlyLocked === true,
    apkSizeBytes:
      typeof obj.apkSizeBytes === 'number' && Number.isFinite(obj.apkSizeBytes)
        ? Math.max(0, Math.trunc(obj.apkSizeBytes))
        : 0,
    stagedAt: typeof obj.stagedAt === 'string' && obj.stagedAt.trim() ? obj.stagedAt : null,
    sourceUrl: typeof obj.sourceUrl === 'string' && obj.sourceUrl.trim() ? obj.sourceUrl : null,
    codeExecutionEnabled: false,
    verificationStatus: normalizeVerificationStatus(
      obj.verificationStatus,
      staged,
      libCompatible,
    ),
    integrityModel,
    integrityNote,
    ...(typeof obj.integrityIntact === 'boolean'
      ? { integrityIntact: obj.integrityIntact }
      : {}),
    ...(typeof obj.lastError === 'string' ? { lastError: obj.lastError } : {}),
  };
}

export function formatShortFingerprint(hex?: string | null): string {
  if (typeof hex !== 'string') return 'Unavailable';
  const clean = hex.trim().toLowerCase();
  if (clean.length <= 16) return clean || 'Unavailable';
  return `${clean.slice(0, 8)}…${clean.slice(-8)}`;
}

export function getNativeVerificationBadgeMeta(
  state?: NativeExtensionStagingState | null,
): { label: string; tone: 'muted' | 'emerald' | 'amber' | 'red' } {
  if (!state || !state.staged || state.verificationStatus === 'not_staged') {
    return { label: 'Not Staged', tone: 'muted' };
  }
  switch (state.verificationStatus) {
    case 'staged_verified':
      return { label: 'Staged & Verified (No Execution)', tone: 'emerald' };
    case 'incompatible_lib':
      return { label: 'LibVersion Unsupported', tone: 'amber' };
    case 'cert_mismatch':
      return { label: 'Cert Mismatch', tone: 'red' };
    case 'error':
    default:
      return { label: 'Verification Error', tone: 'red' };
  }
}

export function extractSigningCertMismatchFromError(
  err: unknown,
): NativeSigningCertChangeDetails | null {
  if (!err || typeof err !== 'object') return null;
  const obj = err as {
    code?: unknown;
    data?: Record<string, unknown>;
    details?: Record<string, unknown>;
  };
  if (obj.code !== 'SIGNING_CERT_CHANGED') return null;
  const payload = obj.data || obj.details;
  if (!payload || typeof payload !== 'object') return null;
  const packageName = typeof payload.packageName === 'string' ? payload.packageName.trim() : '';
  const previousCertSha256 =
    typeof payload.previousCertSha256 === 'string' ? payload.previousCertSha256.trim() : '';
  const newCertSha256 =
    typeof payload.newCertSha256 === 'string' ? payload.newCertSha256.trim() : '';
  if (!packageName || !previousCertSha256 || !newCertSha256) return null;
  return { packageName, previousCertSha256, newCertSha256 };
}
