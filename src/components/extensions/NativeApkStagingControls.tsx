import React from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Download,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import type {
  NativeExtensionStagingState,
  NativeSigningCertChangeDetails,
  SourceInfo,
} from '../../types/media';
import {
  formatShortFingerprint,
  getNativeVerificationBadgeMeta,
  isSupportedAniyomiLibVersion,
} from '../../utils/nativeExtensionManager';
import {
  EXT_FROSTED_ACTIVE_BUBBLE,
  EXT_FROSTED_ICON_BTN,
  EXT_FROSTED_SHEET,
} from './ExtensionsUiPrimitives';

function getToneClasses(tone: 'muted' | 'emerald' | 'amber' | 'red'): string {
  switch (tone) {
    case 'emerald':
      return 'bg-emerald-500/14 border-emerald-500/32 text-emerald-700 dark:text-emerald-300';
    case 'amber':
      return 'bg-amber-500/14 border-amber-500/32 text-amber-700 dark:text-amber-300';
    case 'red':
      return 'bg-red-500/14 border-red-500/32 text-red-700 dark:text-red-300';
    case 'muted':
    default:
      return 'bg-[var(--sx-on-surface)]/8 dark:bg-white/10 border-white/25 dark:border-white/12 text-[var(--sx-on-surface-muted)]';
  }
}

function getSafeOriginLabel(rawUrl?: string): string {
  if (!rawUrl) return 'Unavailable';
  try {
    return new URL(rawUrl).origin;
  } catch {
    return rawUrl;
  }
}

interface NativeApkCardStripProps {
  source: SourceInfo;
  staged?: NativeExtensionStagingState;
  busy?: boolean;
  error?: string | null;
  onRequestStage: (source: SourceInfo) => void;
  onRemoveStaged: (pkg: string) => void;
}

export const NativeApkCardStrip: React.FC<NativeApkCardStripProps> = ({
  source,
  staged,
  busy = false,
  error,
  onRequestStage,
  onRemoveStaged,
}) => {
  const pkg = source.pkg?.trim() || staged?.packageName || '';
  const hasApkUrl = Boolean(source.apkUrl && pkg);
  const badge = getNativeVerificationBadgeMeta(staged);
  const libVersion = staged?.libVersion || source.libVersion || '';
  const libOk = libVersion
    ? staged?.staged
      ? staged.libCompatible
      : isSupportedAniyomiLibVersion(libVersion, source.version)
    : false;
  const hasUpdate = Boolean(
    staged?.staged &&
      typeof source.versionCode === 'number' &&
      source.versionCode > staged.versionCode &&
      hasApkUrl,
  );

  return (
    <div
      data-testid={`native-apk-strip-${source.id}`}
      onClick={(e) => e.stopPropagation()}
      className="mt-2 p-2.5 rounded-xl bg-sky-500/8 dark:bg-sky-500/10 border border-sky-500/22 space-y-2 text-[11px]"
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span
            data-testid={`native-verification-badge-${source.id}`}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-extrabold ${getToneClasses(
              badge.tone,
            )}`}
          >
            <ShieldCheck className="w-3 h-3 shrink-0" />
            <span>{badge.label}</span>
          </span>

          {libVersion && (
            <span
              className={`px-2 py-0.5 rounded-md border text-[10px] font-extrabold ${
                libOk
                  ? 'bg-emerald-500/12 border-emerald-500/25 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-500/14 border-amber-500/30 text-amber-700 dark:text-amber-300'
              }`}
            >
              lib {libVersion} {libOk ? '· Compatible' : '· Unsupported'}
            </span>
          )}

          {staged?.staged && staged.readOnlyLocked && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-white/25 dark:border-white/12 bg-[var(--sx-on-surface)]/8 dark:bg-white/10 text-[10px] font-extrabold">
              <Lock className="w-2.5 h-2.5" />
              <span>Read-Only Locked</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {(!staged?.staged || hasUpdate) && hasApkUrl && (
            <button
              type="button"
              data-testid={`native-stage-btn-${source.id}`}
              disabled={busy}
              onClick={() => onRequestStage(source)}
              className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[10px] font-extrabold transition-all disabled:opacity-50 ${EXT_FROSTED_ACTIVE_BUBBLE} text-[var(--sx-primary)]`}
            >
              <Download className="w-3 h-3" />
              <span>{busy ? 'Staging...' : hasUpdate ? 'Update APK' : 'Stage APK'}</span>
            </button>
          )}

          {staged?.staged && pkg && (
            <button
              type="button"
              data-testid={`native-remove-apk-btn-${source.id}`}
              disabled={busy}
              onClick={() => onRemoveStaged(pkg)}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[10px] font-extrabold bg-red-500/14 border border-red-500/28 text-red-700 dark:text-red-300 hover:bg-red-500/22 disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" />
              <span>Remove APK</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[10px] font-mono-tabular text-[var(--sx-on-surface-muted)]">
        <span className="truncate">{pkg || 'Package ID unavailable'}</span>
        <span>
          {staged?.staged
            ? `Staged v${staged.versionName || source.version} (#${staged.versionCode}) · Cert ${formatShortFingerprint(staged.signingCertSha256)}`
            : `Code #${source.versionCode ?? '?'} · No APK staged yet`}
        </span>
      </div>

      {error && (
        <div
          data-testid={`native-apk-error-${source.id}`}
          className="px-2 py-1 rounded-lg bg-red-500/12 border border-red-500/25 text-[10px] font-semibold text-red-700 dark:text-red-300"
        >
          {error}
        </div>
      )}
    </div>
  );
};

interface NativeExtensionSecurityConsentDialogProps {
  source: SourceInfo;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const NativeExtensionSecurityConsentDialog: React.FC<
  NativeExtensionSecurityConsentDialogProps
> = ({ source, busy = false, onCancel, onConfirm }) => {
  const libVersion = source.libVersion || 'Unknown';
  const libOk = isSupportedAniyomiLibVersion(source.libVersion, source.version);
  const modal = (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md p-0 sm:p-4 sx-backdrop-enter"
      onClick={() => !busy && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-label="Third-Party Extension Security Consent"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full sm:max-w-md ${EXT_FROSTED_SHEET} rounded-t-3xl sm:rounded-3xl p-5 space-y-4 sx-sheet-enter`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-2xl bg-sky-500/15 border border-sky-500/30 text-sky-600 dark:text-sky-300 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold">
                Stage Third-Party Extension APK?
              </h3>
              <p className="text-[11px] text-[var(--sx-on-surface-muted)]">
                Third-party repository binary verification notice
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            aria-label="Close security consent dialog"
            className={`w-8 h-8 rounded-full ${EXT_FROSTED_ICON_BTN} flex items-center justify-center`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 rounded-2xl bg-[var(--sx-on-surface)]/5 dark:bg-white/[0.06] border border-white/30 dark:border-white/10 space-y-1.5 text-[11px] font-mono-tabular">
          <div className="flex items-center justify-between gap-2">
            <span className="font-sans font-bold text-[var(--sx-on-surface-muted)]">Extension</span>
            <span className="font-sans font-extrabold truncate">{source.name}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-sans font-bold text-[var(--sx-on-surface-muted)]">Package ID</span>
            <span className="truncate">{source.pkg}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-sans font-bold text-[var(--sx-on-surface-muted)]">HTTPS Source</span>
            <span className="truncate">{getSafeOriginLabel(source.apkUrl)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-sans font-bold text-[var(--sx-on-surface-muted)]">Version</span>
            <span>
              v{source.version}
              {source.versionCode ? ` (#${source.versionCode})` : ''}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-sans font-bold text-[var(--sx-on-surface-muted)]">Lib Version</span>
            <span className={libOk ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'}>
              {libVersion} ({libOk ? 'Compatible' : 'Unsupported'})
            </span>
          </div>
        </div>

        <div className="space-y-2 text-xs text-[var(--sx-on-surface-muted)] leading-relaxed">
          <p>
            This third-party APK is downloaded over HTTPS into app-private read-only storage and inspected with Android PackageManager.
          </p>
          <p>
            <strong className="text-[var(--sx-on-surface)]">Integrity vs Authenticity:</strong>{' '}
            {source.apkSha256
              ? 'SHA-256 will be verified against the repository manifest checksum and the signing certificate will be pinned on first use (TOFU).'
              : 'No manifest checksum was provided; SHA-256 verifies local file integrity only, while the APK signing certificate is pinned on first use (TOFU).'}
          </p>
          <p className="px-2.5 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/25 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
            Phase 2 Batch 1 does NOT load or execute APK/DEX bytecode. Staging prepares verified files only.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className={`px-4 h-9 rounded-full ${EXT_FROSTED_ICON_BTN} text-xs font-bold`}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="native-consent-confirm-btn"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-full bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-extrabold disabled:opacity-55"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{busy ? 'Downloading & Verifying...' : 'Approve & Stage APK'}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal;
};

interface NativeSigningCertMismatchModalProps {
  details: NativeSigningCertChangeDetails;
  busy?: boolean;
  onCancel: () => void;
  onApproveReplace: () => void;
}

export const NativeSigningCertMismatchModal: React.FC<
  NativeSigningCertMismatchModalProps
> = ({ details, busy = false, onCancel, onApproveReplace }) => {
  const modal = (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-md p-0 sm:p-4 sx-backdrop-enter"
      onClick={() => !busy && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-label="Signing Certificate Changed Warning"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full sm:max-w-md ${EXT_FROSTED_SHEET} rounded-t-3xl sm:rounded-3xl p-5 space-y-4 sx-sheet-enter`}
      >
        <div className="flex items-start gap-2.5">
          <span className="w-9 h-9 rounded-2xl bg-red-500/16 border border-red-500/32 text-red-600 dark:text-red-300 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </span>
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-red-600 dark:text-red-300">
              Signing Certificate Changed
            </h3>
            <p className="text-[11px] text-[var(--sx-on-surface-muted)]">
              {details.packageName}
            </p>
          </div>
        </div>

        <p className="text-xs text-[var(--sx-on-surface-muted)] leading-relaxed">
          The incoming APK is signed with a different certificate than the previously pinned release. This can indicate a publisher key rotation or an untrusted tampered binary.
        </p>

        <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/25 space-y-2 text-[10px] font-mono-tabular break-all">
          <div>
            <div className="font-sans font-extrabold uppercase text-[var(--sx-on-surface-muted)]">
              Pinned Certificate SHA-256
            </div>
            <div>{details.previousCertSha256}</div>
          </div>
          <div>
            <div className="font-sans font-extrabold uppercase text-red-600 dark:text-red-300">
              Incoming Certificate SHA-256
            </div>
            <div>{details.newCertSha256}</div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className={`px-4 h-9 rounded-full ${EXT_FROSTED_ICON_BTN} text-xs font-bold`}
          >
            Keep Previous Pin
          </button>
          <button
            type="button"
            data-testid="native-cert-replace-btn"
            disabled={busy}
            onClick={onApproveReplace}
            className="px-4 h-9 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold disabled:opacity-55"
          >
            {busy ? 'Updating...' : 'Trust New Certificate & Stage'}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal;
};
