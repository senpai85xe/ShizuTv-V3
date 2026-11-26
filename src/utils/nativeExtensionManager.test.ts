import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectSigningCertificateChange,
  extractSigningCertMismatchFromError,
  formatShortFingerprint,
  getNativeVerificationBadgeMeta,
  isAndroidNativePlatform,
  isSupportedAniyomiLibVersion,
  normalizeNativeStagedRecord,
  validateAndroidPackageName,
  validateExtensionApkDownloadUrl,
} from './nativeExtensionManager.ts';

describe('nativeExtensionManager — Phase 2 Android Batch 1', () => {
  it('detects Android Capacitor vs Website / iOS cleanly', () => {
    assert.equal(isAndroidNativePlatform(null), false);
    assert.equal(
      isAndroidNativePlatform({
        isNativePlatform: () => false,
        getPlatform: () => 'web',
      }),
      false,
    );
    assert.equal(
      isAndroidNativePlatform({
        isNativePlatform: () => true,
        getPlatform: () => 'ios',
      }),
      false,
    );
    assert.equal(
      isAndroidNativePlatform({
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      }),
      true,
    );
  });

  it('validates Android extension package identifiers and blocks path traversal', () => {
    assert.equal(
      validateAndroidPackageName('eu.kanade.tachiyomi.animeextension.en.hianime'),
      'eu.kanade.tachiyomi.animeextension.en.hianime',
    );
    assert.throws(() => validateAndroidPackageName(''), /Invalid Android extension package/);
    assert.throws(() => validateAndroidPackageName('../etc/passwd'), /Invalid Android extension package/);
    assert.throws(() => validateAndroidPackageName('singleword'), /Invalid Android extension package/);
    assert.throws(() => validateAndroidPackageName('com.bad pkg.name'), /Invalid Android extension package/);
  });

  it('enforces HTTPS-only extension APK URLs and blocks private/local hosts', () => {
    assert.equal(
      validateExtensionApkDownloadUrl(
        'https://raw.githubusercontent.com/yuzono/anime-repo/repo/apk/aniyomi-en.apk',
      ),
      'https://raw.githubusercontent.com/yuzono/anime-repo/repo/apk/aniyomi-en.apk',
    );
    assert.throws(
      () => validateExtensionApkDownloadUrl('http://example.com/ext.apk'),
      /Only HTTPS/,
    );
    assert.throws(
      () => validateExtensionApkDownloadUrl('https://user:pass@example.com/ext.apk'),
      /Embedded credentials/,
    );
    assert.throws(
      () => validateExtensionApkDownloadUrl('https://localhost/ext.apk'),
      /blocked/,
    );
    assert.throws(
      () => validateExtensionApkDownloadUrl('https://127.0.0.1/ext.apk'),
      /blocked/,
    );
    assert.throws(
      () => validateExtensionApkDownloadUrl('https://192.168.1.10/ext.apk'),
      /blocked/,
    );
    assert.throws(
      () => validateExtensionApkDownloadUrl('https://172.16.0.5/ext.apk'),
      /blocked/,
    );
    assert.throws(
      () => validateExtensionApkDownloadUrl('https://repo.local/ext.apk'),
      /blocked/,
    );
    assert.throws(
      () => validateExtensionApkDownloadUrl('https://example.com/apk/../secret.apk'),
      /path traversal/,
    );
  });

  it('checks compatible Aniyomi libVersion values (14, 15, 16)', () => {
    assert.equal(isSupportedAniyomiLibVersion('14'), true);
    assert.equal(isSupportedAniyomiLibVersion('15'), true);
    assert.equal(isSupportedAniyomiLibVersion('16'), true);
    assert.equal(isSupportedAniyomiLibVersion(undefined, '16.10'), true);
    assert.equal(isSupportedAniyomiLibVersion('1.4', '1.4.25'), false);
    assert.equal(isSupportedAniyomiLibVersion('17', '17.0'), false);
    assert.equal(isSupportedAniyomiLibVersion(''), false);
  });

  it('enforces Trust-On-First-Use (TOFU) signing certificate pinning across updates', () => {
    const first = detectSigningCertificateChange(null, 'ABCDEF0123456789');
    assert.deepEqual(first, {
      changed: false,
      firstPin: true,
      previousCertSha256: null,
      incomingCertSha256: 'abcdef0123456789',
    });

    const matched = detectSigningCertificateChange('abcdef0123456789', 'ABCDEF0123456789');
    assert.deepEqual(matched, {
      changed: false,
      firstPin: false,
      previousCertSha256: 'abcdef0123456789',
      incomingCertSha256: 'abcdef0123456789',
    });

    const rotated = detectSigningCertificateChange('aaaa', 'bbbb');
    assert.equal(rotated.changed, true);
    assert.equal(rotated.firstPin, false);
  });

  it('normalizes native staging records while locking codeExecutionEnabled=false and distinguishing SHA-256 trust level', () => {
    const sampleSha = 'a'.repeat(64);
    const certSha = 'b'.repeat(64);
    const localOnly = normalizeNativeStagedRecord({
      staged: true,
      packageName: 'eu.kanade.tachiyomi.animeextension.en.test',
      versionName: '16.4',
      versionCode: 4,
      libVersion: '16',
      libCompatible: true,
      apkSha256: sampleSha,
      expectedSha256Verified: false,
      signingCertSha256: certSha,
      readOnlyLocked: true,
      codeExecutionEnabled: true, // malicious/stale override must be forced false
    });

    assert.equal(localOnly.codeExecutionEnabled, false);
    assert.equal(localOnly.verificationStatus, 'staged_verified');
    assert.equal(localOnly.integrityModel, 'local_integrity_tofu');
    assert.match(localOnly.integrityNote, /file integrity only/i);
    assert.equal(getNativeVerificationBadgeMeta(localOnly).label, 'Staged & Verified (No Execution)');

    const incompatibleLib = normalizeNativeStagedRecord({
      staged: true,
      packageName: 'eu.kanade.tachiyomi.animeextension.en.old',
      versionName: '1.4.25',
      versionCode: 1,
      libVersion: '1.4',
      libCompatible: false,
      expectedSha256Verified: true,
    });
    assert.equal(incompatibleLib.verificationStatus, 'incompatible_lib');
    assert.equal(incompatibleLib.integrityModel, 'manifest_sha256_verified');
    assert.equal(getNativeVerificationBadgeMeta(incompatibleLib).label, 'LibVersion Unsupported');

    const unstaged = normalizeNativeStagedRecord({ staged: false, packageName: 'eu.kanade.x' });
    assert.equal(unstaged.verificationStatus, 'not_staged');
    assert.equal(getNativeVerificationBadgeMeta(unstaged).label, 'Not Staged');
  });

  it('extracts SIGNING_CERT_CHANGED details and formats fingerprints safely', () => {
    const parsed = extractSigningCertMismatchFromError({
      code: 'SIGNING_CERT_CHANGED',
      data: {
        packageName: 'eu.kanade.tachiyomi.animeextension.en.hianime',
        previousCertSha256: '11'.repeat(32),
        newCertSha256: '22'.repeat(32),
      },
    });
    assert.deepEqual(parsed, {
      packageName: 'eu.kanade.tachiyomi.animeextension.en.hianime',
      previousCertSha256: '11'.repeat(32),
      newCertSha256: '22'.repeat(32),
    });
    assert.equal(extractSigningCertMismatchFromError(new Error('network timeout')), null);
    assert.equal(formatShortFingerprint('1234567890abcdef1234567890abcdef'), '12345678…90abcdef');
    assert.equal(formatShortFingerprint(''), 'Unavailable');
  });
});
