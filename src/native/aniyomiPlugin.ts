import { Capacitor, registerPlugin } from '@capacitor/core';
import type {
  NativeApkInspectResult,
  NativeExtensionStagingState,
} from '../types/media';
import {
  isAndroidNativePlatform,
  normalizeNativeStagedRecord,
  validateAndroidPackageName,
  validateExtensionApkDownloadUrl,
} from '../utils/nativeExtensionManager';

export interface AniyomiRuntimePlugin {
  inspectApkMetadata(options: {
    filePath?: string;
    packageName?: string;
  }): Promise<Record<string, unknown>>;
  downloadAndStageApk(options: {
    url: string;
    expectedPackageName?: string;
    expectedSha256?: string;
    allowSigningCertChange?: boolean;
  }): Promise<Record<string, unknown>>;
  listStagedExtensions(): Promise<{
    items: Array<Record<string, unknown>>;
    codeExecutionEnabled?: boolean;
  }>;
  removeStagedExtension(options: {
    packageName: string;
  }): Promise<{ packageName: string; removed: boolean }>;
  getVerificationStatus(options: {
    packageName: string;
  }): Promise<Record<string, unknown>>;
}

const AniyomiRuntime = registerPlugin<AniyomiRuntimePlugin>('AniyomiRuntime');

export function isAndroidNativeBridgeAvailable(): boolean {
  return isAndroidNativePlatform(Capacitor);
}

function assertAndroidNativeBridge(): void {
  if (!isAndroidNativeBridgeAvailable()) {
    throw new Error(
      'Aniyomi native APK staging is only available in the ShizuTv Android Capacitor app.',
    );
  }
}

export async function listStagedAniyomiExtensions(): Promise<NativeExtensionStagingState[]> {
  if (!isAndroidNativeBridgeAvailable()) return [];
  const res = await AniyomiRuntime.listStagedExtensions();
  const items = Array.isArray(res?.items) ? res.items : [];
  return items
    .map((item) => normalizeNativeStagedRecord(item))
    .filter((item) => Boolean(item.packageName));
}

export async function downloadAndStageAniyomiApk(params: {
  url: string;
  expectedPackageName: string;
  expectedSha256?: string;
  allowSigningCertChange?: boolean;
}): Promise<NativeExtensionStagingState> {
  assertAndroidNativeBridge();
  const validUrl = validateExtensionApkDownloadUrl(params.url);
  const validPkg = validateAndroidPackageName(params.expectedPackageName);
  const cleanSha =
    typeof params.expectedSha256 === 'string' && params.expectedSha256.trim()
      ? params.expectedSha256.trim().toLowerCase()
      : undefined;

  const res = await AniyomiRuntime.downloadAndStageApk({
    url: validUrl,
    expectedPackageName: validPkg,
    ...(cleanSha ? { expectedSha256: cleanSha } : {}),
    allowSigningCertChange: Boolean(params.allowSigningCertChange),
  });
  return normalizeNativeStagedRecord(res);
}

export async function removeStagedAniyomiExtension(packageName: string): Promise<boolean> {
  assertAndroidNativeBridge();
  const validPkg = validateAndroidPackageName(packageName);
  const res = await AniyomiRuntime.removeStagedExtension({ packageName: validPkg });
  return res?.removed === true;
}

export async function inspectStagedAniyomiApk(params: {
  packageName?: string;
  filePath?: string;
}): Promise<NativeApkInspectResult> {
  assertAndroidNativeBridge();
  const validPkg = params.packageName
    ? validateAndroidPackageName(params.packageName)
    : undefined;
  const raw = await AniyomiRuntime.inspectApkMetadata({
    ...(validPkg ? { packageName: validPkg } : {}),
    ...(params.filePath ? { filePath: params.filePath } : {}),
  });
  return {
    packageName: typeof raw.packageName === 'string' ? raw.packageName : '',
    versionName: typeof raw.versionName === 'string' ? raw.versionName : '',
    versionCode:
      typeof raw.versionCode === 'number' && Number.isFinite(raw.versionCode)
        ? Math.trunc(raw.versionCode)
        : 0,
    libVersion: typeof raw.libVersion === 'string' ? raw.libVersion : '',
    libCompatible: raw.libCompatible === true,
    extensionClass: typeof raw.extensionClass === 'string' ? raw.extensionClass : '',
    isNsfw: raw.isNsfw === true,
    hasAniyomiFeature: raw.hasAniyomiFeature === true,
    signingCertSha256:
      typeof raw.signingCertSha256 === 'string' ? raw.signingCertSha256 : '',
    apkSha256: typeof raw.apkSha256 === 'string' ? raw.apkSha256 : '',
    apkSizeBytes:
      typeof raw.apkSizeBytes === 'number' && Number.isFinite(raw.apkSizeBytes)
        ? Math.trunc(raw.apkSizeBytes)
        : 0,
    readOnlyLocked: raw.readOnlyLocked === true,
    codeExecutionEnabled: false,
  };
}

export async function getStagedAniyomiStatus(
  packageName: string,
): Promise<NativeExtensionStagingState> {
  assertAndroidNativeBridge();
  const validPkg = validateAndroidPackageName(packageName);
  const raw = await AniyomiRuntime.getVerificationStatus({ packageName: validPkg });
  return normalizeNativeStagedRecord(raw);
}
