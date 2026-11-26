package com.shizutv.app.runtime;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.FeatureInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.os.Build;
import android.os.Bundle;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Phase 2 — Android Batch 1: Safe APK downloader, verifier, read-only stager, and cleanup manager.
 *
 * Strictly NO DexClassLoader, PathClassLoader, reflection instantiation, or code execution.
 */
public final class ExtensionApkManager {

    public static final String ERROR_INVALID_URL = "INVALID_URL";
    public static final String ERROR_INVALID_PACKAGE = "INVALID_PACKAGE";
    public static final String ERROR_PATH_TRAVERSAL = "PATH_TRAVERSAL";
    public static final String ERROR_DOWNLOAD_FAILED = "DOWNLOAD_FAILED";
    public static final String ERROR_SIZE_LIMIT = "APK_TOO_LARGE";
    public static final String ERROR_SHA256_MISMATCH = "SHA256_MISMATCH";
    public static final String ERROR_INVALID_APK = "INVALID_APK";
    public static final String ERROR_PACKAGE_MISMATCH = "PACKAGE_MISMATCH";
    public static final String ERROR_NO_SIGNATURE = "MISSING_SIGNATURE";
    public static final String ERROR_SIGNING_CERT_CHANGED = "SIGNING_CERT_CHANGED";
    public static final String ERROR_STAGING_FAILED = "STAGING_FAILED";

    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 30_000;
    private static final int MAX_REDIRECTS = 5;
    private static final long MAX_APK_BYTES = 64L * 1024L * 1024L;

    private static final Pattern PACKAGE_NAME_PATTERN =
        Pattern.compile("^[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z][a-zA-Z0-9_]*)+$");
    private static final Pattern SHA256_HEX_PATTERN =
        Pattern.compile("^[0-9a-fA-F]{64}$");
    private static final Pattern ANIYOMI_LIB_MAJOR_PATTERN =
        Pattern.compile("^(1\\d|2\\d)\\.\\d+");
    private static final Pattern LEGACY_LIB_PATTERN =
        Pattern.compile("^(1\\.\\d+)\\.\\d+");

    public static final class StageException extends Exception {
        private final String code;
        private final JSONObject details;

        public StageException(String code, String message) {
            this(code, message, null, null);
        }

        public StageException(String code, String message, JSONObject details, Throwable cause) {
            super(message, cause);
            this.code = code;
            this.details = details;
        }

        public String getCode() {
            return code;
        }

        public JSONObject getDetails() {
            return details;
        }
    }

    private final Context appContext;
    private final File rootDir;
    private final File stagingDir;
    private final File packagesDir;
    private final File registryFile;
    private final Object ioLock = new Object();

    public ExtensionApkManager(Context context) {
        this.appContext = context.getApplicationContext();
        this.rootDir = new File(this.appContext.getFilesDir(), "aniyomi_extensions");
        this.stagingDir = new File(this.rootDir, "staging");
        this.packagesDir = new File(this.rootDir, "packages");
        this.registryFile = new File(this.rootDir, "registry.json");
        ensureDirectories();
    }

    private void ensureDirectories() {
        if (!rootDir.exists()) rootDir.mkdirs();
        if (!stagingDir.exists()) stagingDir.mkdirs();
        if (!packagesDir.exists()) packagesDir.mkdirs();
    }

    public static String validatePackageName(String rawPkg) throws StageException {
        if (rawPkg == null) {
            throw new StageException(ERROR_INVALID_PACKAGE, "Package name is required.");
        }
        String trimmed = rawPkg.trim();
        if (trimmed.isEmpty() || trimmed.length() > 180 || !PACKAGE_NAME_PATTERN.matcher(trimmed).matches()) {
            throw new StageException(
                ERROR_INVALID_PACKAGE,
                "Invalid Android extension package identifier."
            );
        }
        return trimmed;
    }

    public static URI validateHttpsUrl(String rawUrl) throws StageException {
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            throw new StageException(ERROR_INVALID_URL, "APK download URL is required.");
        }
        final URI uri;
        try {
            uri = URI.create(rawUrl.trim());
        } catch (IllegalArgumentException e) {
            throw new StageException(ERROR_INVALID_URL, "Malformed APK download URL.", null, e);
        }
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            throw new StageException(
                ERROR_INVALID_URL,
                "Only HTTPS extension APK download URLs are permitted."
            );
        }
        if (uri.getRawUserInfo() != null && !uri.getRawUserInfo().isEmpty()) {
            throw new StageException(
                ERROR_INVALID_URL,
                "Embedded credentials in APK download URL are not permitted."
            );
        }
        String host = uri.getHost();
        if (host == null || host.trim().isEmpty()) {
            throw new StageException(ERROR_INVALID_URL, "APK download URL is missing a valid host.");
        }
        String lowerHost = host.toLowerCase(Locale.US);
        if (
            "localhost".equals(lowerHost) ||
            "::1".equals(lowerHost) ||
            "[::1]".equals(lowerHost) ||
            lowerHost.endsWith(".local") ||
            lowerHost.endsWith(".internal") ||
            isPrivateLiteralIp(lowerHost)
        ) {
            throw new StageException(
                ERROR_INVALID_URL,
                "Localhost and private network APK hosts are blocked."
            );
        }
        return uri;
    }

    private static boolean isPrivateLiteralIp(String host) {
        return host.startsWith("10.")
            || host.startsWith("127.")
            || host.startsWith("169.254.")
            || host.startsWith("0.")
            || host.startsWith("192.168.")
            || host.matches("^172\\.(1[6-9]|2\\d|3[01])\\..*");
    }

    private static void verifyResolvedAddressesNotPrivate(String host) throws StageException {
        try {
            InetAddress[] resolved = InetAddress.getAllByName(host);
            if (resolved == null || resolved.length == 0) {
                throw new StageException(ERROR_DOWNLOAD_FAILED, "Could not resolve APK download host.");
            }
            for (InetAddress addr : resolved) {
                if (
                    addr.isAnyLocalAddress()
                        || addr.isLoopbackAddress()
                        || addr.isLinkLocalAddress()
                        || addr.isSiteLocalAddress()
                        || addr.isMulticastAddress()
                ) {
                    throw new StageException(
                        ERROR_INVALID_URL,
                        "Resolved APK host points to a private or non-routable IP address."
                    );
                }
            }
        } catch (StageException se) {
            throw se;
        } catch (IOException e) {
            throw new StageException(ERROR_DOWNLOAD_FAILED, "DNS resolution failed for APK host.", null, e);
        }
    }

    private File resolveCanonicalChild(File parent, String safeName) throws StageException {
        if (
            safeName == null
                || safeName.isEmpty()
                || safeName.contains("/")
                || safeName.contains("\\")
                || safeName.contains("..")
        ) {
            throw new StageException(ERROR_PATH_TRAVERSAL, "Invalid path segment rejected.");
        }
        try {
            String parentCanonical = parent.getCanonicalPath();
            File child = new File(parent, safeName);
            String childCanonical = child.getCanonicalPath();
            if (!childCanonical.startsWith(parentCanonical + File.separator)) {
                throw new StageException(ERROR_PATH_TRAVERSAL, "Path escapes app-private extension directory.");
            }
            return child;
        } catch (IOException e) {
            throw new StageException(ERROR_PATH_TRAVERSAL, "Failed to validate canonical extension path.", null, e);
        }
    }

    private File resolvePackageDir(String pkg) throws StageException {
        String validPkg = validatePackageName(pkg);
        return resolveCanonicalChild(packagesDir, validPkg);
    }

    public JSONObject inspectApkMetadata(String rawFilePath, String rawPackageName) throws StageException {
        synchronized (ioLock) {
            ensureDirectories();
            File targetApk;
            String expectedPkg = null;
            if (rawPackageName != null && !rawPackageName.trim().isEmpty()) {
                expectedPkg = validatePackageName(rawPackageName);
                File pkgDir = resolvePackageDir(expectedPkg);
                targetApk = resolveCanonicalChild(pkgDir, "base.apk");
            } else if (rawFilePath != null && !rawFilePath.trim().isEmpty()) {
                try {
                    File candidate = new File(rawFilePath.trim());
                    String rootCanonical = rootDir.getCanonicalPath();
                    String candidateCanonical = candidate.getCanonicalPath();
                    if (!candidateCanonical.startsWith(rootCanonical + File.separator)) {
                        throw new StageException(
                            ERROR_PATH_TRAVERSAL,
                            "APK inspection is restricted to app-private extension storage."
                        );
                    }
                    targetApk = candidate;
                } catch (IOException e) {
                    throw new StageException(ERROR_PATH_TRAVERSAL, "Unable to resolve APK path.", null, e);
                }
            } else {
                throw new StageException(ERROR_INVALID_APK, "Either packageName or staged filePath is required.");
            }

            if (!targetApk.exists() || !targetApk.isFile()) {
                throw new StageException(ERROR_INVALID_APK, "Staged APK file does not exist.");
            }

            JSONObject inspected = inspectApkFileInternal(targetApk);
            if (expectedPkg != null) {
                String actualPkg = inspected.optString("packageName", "");
                if (!expectedPkg.equals(actualPkg)) {
                    throw new StageException(
                        ERROR_PACKAGE_MISMATCH,
                        "Staged APK package does not match requested package."
                    );
                }
            }
            return inspected;
        }
    }

    public JSONObject downloadAndStageApk(
        String rawUrl,
        String expectedPackageName,
        String expectedSha256,
        boolean allowSigningCertChange
    ) throws StageException {
        URI initialUri = validateHttpsUrl(rawUrl);
        String validExpectedPkg =
            expectedPackageName != null && !expectedPackageName.trim().isEmpty()
                ? validatePackageName(expectedPackageName)
                : null;
        String cleanExpectedSha = null;
        if (expectedSha256 != null && !expectedSha256.trim().isEmpty()) {
            cleanExpectedSha = expectedSha256.trim().toLowerCase(Locale.US);
            if (!SHA256_HEX_PATTERN.matcher(cleanExpectedSha).matches()) {
                throw new StageException(ERROR_SHA256_MISMATCH, "Provided expected SHA-256 checksum is malformed.");
            }
        }

        synchronized (ioLock) {
            ensureDirectories();
            cleanupStaleTempFiles();

            File tempDownload = null;
            File stagePartFile = null;
            try {
                tempDownload = resolveCanonicalChild(stagingDir, UUID.randomUUID().toString() + ".apk.tmp");
                DownloadOutcome downloaded = downloadHttpsToTempFile(initialUri, tempDownload);

                if (cleanExpectedSha != null && !cleanExpectedSha.equalsIgnoreCase(downloaded.sha256Hex)) {
                    throw new StageException(
                        ERROR_SHA256_MISMATCH,
                        "Downloaded APK SHA-256 checksum does not match manifest checksum."
                    );
                }

                JSONObject inspected = inspectApkFileInternal(tempDownload);
                String actualPkg = validatePackageName(inspected.optString("packageName", ""));
                if (validExpectedPkg != null && !validExpectedPkg.equals(actualPkg)) {
                    throw new StageException(
                        ERROR_PACKAGE_MISMATCH,
                        "APK package name (" + actualPkg + ") does not match expected (" + validExpectedPkg + ")."
                    );
                }

                String newCertSha = inspected.optString("signingCertSha256", "");
                if (newCertSha.isEmpty()) {
                    throw new StageException(
                        ERROR_NO_SIGNATURE,
                        "APK has no readable signing certificate and cannot be staged."
                    );
                }

                JSONObject registry = readRegistry();
                JSONObject previousRecord = registry.optJSONObject(actualPkg);
                String previousCertSha = previousRecord != null
                    ? previousRecord.optString("signingCertSha256", "")
                    : "";

                if (!previousCertSha.isEmpty() && !previousCertSha.equalsIgnoreCase(newCertSha)) {
                    if (!allowSigningCertChange) {
                        JSONObject mismatchDetails = new JSONObject();
                        try {
                            mismatchDetails.put("packageName", actualPkg);
                            mismatchDetails.put("previousCertSha256", previousCertSha);
                            mismatchDetails.put("newCertSha256", newCertSha);
                        } catch (JSONException ignored) {
                            // Ignore JSON build failure
                        }
                        throw new StageException(
                            ERROR_SIGNING_CERT_CHANGED,
                            "APK signing certificate changed for " + actualPkg + ". Explicit user confirmation is required.",
                            mismatchDetails,
                            null
                        );
                    }
                }

                File pkgDir = resolvePackageDir(actualPkg);
                if (!pkgDir.exists() && !pkgDir.mkdirs()) {
                    throw new StageException(ERROR_STAGING_FAILED, "Unable to create package storage directory.");
                }

                File finalApk = resolveCanonicalChild(pkgDir, "base.apk");
                stagePartFile = resolveCanonicalChild(pkgDir, ".stage-" + UUID.randomUUID() + ".apk");

                copyFile(tempDownload, stagePartFile);
                if (!stagePartFile.setWritable(false, false) || !stagePartFile.setReadOnly()) {
                    throw new StageException(ERROR_STAGING_FAILED, "Failed to lock staged APK as read-only.");
                }

                if (finalApk.exists()) {
                    if (!finalApk.setWritable(true, true)) {
                        // Ignore; parent directory is writable so delete may still succeed
                    }
                    if (!finalApk.delete()) {
                        throw new StageException(ERROR_STAGING_FAILED, "Failed to replace previous staged APK.");
                    }
                }

                if (!stagePartFile.renameTo(finalApk)) {
                    throw new StageException(ERROR_STAGING_FAILED, "Atomic APK staging rename failed.");
                }
                finalApk.setWritable(false, false);
                finalApk.setReadOnly();

                boolean readOnlyLocked = !finalApk.canWrite();
                String libVersion = inspected.optString("libVersion", "");
                boolean libCompatible = inspected.optBoolean("libCompatible", false);

                JSONObject record = new JSONObject();
                try {
                    record.put("staged", true);
                    record.put("packageName", actualPkg);
                    record.put("versionName", inspected.optString("versionName", ""));
                    record.put("versionCode", inspected.optLong("versionCode", 0L));
                    record.put("libVersion", libVersion);
                    record.put("libCompatible", libCompatible);
                    record.put("extensionClass", inspected.optString("extensionClass", ""));
                    record.put("isNsfw", inspected.optBoolean("isNsfw", false));
                    record.put("hasAniyomiFeature", inspected.optBoolean("hasAniyomiFeature", false));
                    record.put("apkSha256", downloaded.sha256Hex);
                    record.put("expectedSha256Verified", cleanExpectedSha != null);
                    record.put("signingCertSha256", newCertSha);
                    record.put("trustedCertPinned", true);
                    record.put("readOnlyLocked", readOnlyLocked);
                    record.put("apkSizeBytes", downloaded.sizeBytes);
                    record.put("stagedAt", Instant.now().toString());
                    record.put("sourceUrl", initialUri.toString());
                    record.put("codeExecutionEnabled", false);
                    record.put(
                        "verificationStatus",
                        libCompatible ? "staged_verified" : "incompatible_lib"
                    );
                    record.put(
                        "integrityNote",
                        cleanExpectedSha != null
                            ? "SHA-256 matches provided manifest digest and file digest."
                            : "SHA-256 computed locally for file integrity only (manifest digest not provided)."
                    );
                } catch (JSONException e) {
                    throw new StageException(ERROR_STAGING_FAILED, "Failed to serialize staged APK record.", null, e);
                }

                File metadataFile = resolveCanonicalChild(pkgDir, "metadata.json");
                writeTextAtomic(metadataFile, record.toString());
                try {
                    registry.put(actualPkg, record);
                } catch (JSONException e) {
                    throw new StageException(ERROR_STAGING_FAILED, "Failed to update extension registry.", null, e);
                }
                writeTextAtomic(registryFile, registry.toString());

                return record;
            } finally {
                deleteQuietly(tempDownload);
                deleteQuietly(stagePartFile);
            }
        }
    }

    public List<JSONObject> listStagedExtensions() throws StageException {
        synchronized (ioLock) {
            ensureDirectories();
            JSONObject registry = readRegistry();
            List<JSONObject> out = new ArrayList<>();
            boolean dirty = false;

            Iterator<String> keys = registry.keys();
            List<String> staleKeys = new ArrayList<>();
            while (keys.hasNext()) {
                String pkg = keys.next();
                JSONObject item = registry.optJSONObject(pkg);
                if (item == null) {
                    staleKeys.add(pkg);
                    continue;
                }
                try {
                    File pkgDir = resolvePackageDir(pkg);
                    File apkFile = resolveCanonicalChild(pkgDir, "base.apk");
                    if (!apkFile.exists() || !apkFile.isFile()) {
                        staleKeys.add(pkg);
                        continue;
                    }
                    item.put("readOnlyLocked", !apkFile.canWrite());
                    item.put("codeExecutionEnabled", false);
                    out.add(item);
                } catch (StageException | JSONException e) {
                    staleKeys.add(pkg);
                }
            }

            if (!staleKeys.isEmpty()) {
                for (String k : staleKeys) {
                    registry.remove(k);
                    dirty = true;
                }
            }
            if (dirty) {
                writeTextAtomic(registryFile, registry.toString());
            }
            return out;
        }
    }

    public JSONObject getVerificationStatus(String rawPackageName) throws StageException {
        String validPkg = validatePackageName(rawPackageName);
        synchronized (ioLock) {
            ensureDirectories();
            JSONObject registry = readRegistry();
            JSONObject record = registry.optJSONObject(validPkg);
            if (record == null) {
                JSONObject notStaged = new JSONObject();
                try {
                    notStaged.put("staged", false);
                    notStaged.put("packageName", validPkg);
                    notStaged.put("verificationStatus", "not_staged");
                    notStaged.put("readOnlyLocked", false);
                    notStaged.put("codeExecutionEnabled", false);
                } catch (JSONException ignored) {
                    // Ignore
                }
                return notStaged;
            }

            File pkgDir = resolvePackageDir(validPkg);
            File apkFile = resolveCanonicalChild(pkgDir, "base.apk");
            if (!apkFile.exists() || !apkFile.isFile()) {
                registry.remove(validPkg);
                writeTextAtomic(registryFile, registry.toString());
                JSONObject missing = new JSONObject();
                try {
                    missing.put("staged", false);
                    missing.put("packageName", validPkg);
                    missing.put("verificationStatus", "not_staged");
                    missing.put("readOnlyLocked", false);
                    missing.put("codeExecutionEnabled", false);
                } catch (JSONException ignored) {
                    // Ignore
                }
                return missing;
            }

            try {
                String actualSha = computeFileSha256(apkFile);
                String storedSha = record.optString("apkSha256", "");
                boolean shaIntact = !storedSha.isEmpty() && storedSha.equalsIgnoreCase(actualSha);
                record.put("readOnlyLocked", !apkFile.canWrite());
                record.put("integrityIntact", shaIntact);
                record.put("codeExecutionEnabled", false);
                if (!shaIntact) {
                    record.put("verificationStatus", "error");
                    record.put("lastError", "Staged APK checksum changed unexpectedly on disk.");
                }
            } catch (IOException | JSONException e) {
                throw new StageException(ERROR_STAGING_FAILED, "Unable to verify staged APK state.", null, e);
            }
            return record;
        }
    }

    public boolean removeStagedExtension(String rawPackageName) throws StageException {
        String validPkg = validatePackageName(rawPackageName);
        synchronized (ioLock) {
            ensureDirectories();
            File pkgDir = resolvePackageDir(validPkg);
            boolean existed = pkgDir.exists();
            deleteDirectoryRecursively(pkgDir);

            JSONObject registry = readRegistry();
            if (registry.has(validPkg)) {
                registry.remove(validPkg);
                writeTextAtomic(registryFile, registry.toString());
                existed = true;
            }
            cleanupStaleTempFiles();
            return existed;
        }
    }

    private JSONObject inspectApkFileInternal(File apkFile) throws StageException {
        PackageManager pm = appContext.getPackageManager();
        int legacyFlags = PackageManager.GET_META_DATA | PackageManager.GET_CONFIGURATIONS;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            legacyFlags |= PackageManager.GET_SIGNING_CERTIFICATES;
        } else {
            @SuppressWarnings("deprecation")
            int oldSigFlag = PackageManager.GET_SIGNATURES;
            legacyFlags |= oldSigFlag;
        }

        PackageInfo pkgInfo;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pkgInfo = pm.getPackageArchiveInfo(
                apkFile.getAbsolutePath(),
                PackageManager.PackageInfoFlags.of((long) legacyFlags)
            );
        } else {
            @SuppressWarnings("deprecation")
            PackageInfo legacyInfo = pm.getPackageArchiveInfo(apkFile.getAbsolutePath(), legacyFlags);
            pkgInfo = legacyInfo;
        }

        if (pkgInfo == null || pkgInfo.packageName == null || pkgInfo.packageName.trim().isEmpty()) {
            throw new StageException(ERROR_INVALID_APK, "Downloaded file is not a valid Android APK package.");
        }

        String packageName = pkgInfo.packageName.trim();
        String versionName = pkgInfo.versionName != null ? pkgInfo.versionName.trim() : "";
        long versionCode;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            versionCode = pkgInfo.getLongVersionCode();
        } else {
            @SuppressWarnings("deprecation")
            int legacyCode = pkgInfo.versionCode;
            versionCode = legacyCode;
        }

        String signingCertSha256 = extractPrimarySignerSha256(pkgInfo);
        String apkSha256;
        try {
            apkSha256 = computeFileSha256(apkFile);
        } catch (IOException e) {
            throw new StageException(ERROR_INVALID_APK, "Unable to read APK digest.", null, e);
        }

        ApplicationInfo appInfo = pkgInfo.applicationInfo;
        Bundle meta = appInfo != null ? appInfo.metaData : null;
        String extensionClass = meta != null ? meta.getString("tachiyomi.extension.class", "") : "";
        boolean isNsfw = meta != null && meta.getInt("tachiyomi.extension.nsfw", 0) == 1;

        boolean hasAniyomiFeature = packageName.startsWith("eu.kanade.tachiyomi.animeextension.");
        if (!hasAniyomiFeature && pkgInfo.reqFeatures != null) {
            for (FeatureInfo feature : pkgInfo.reqFeatures) {
                if (feature != null && feature.name != null) {
                    if (
                        "tachiyomi.extension".equals(feature.name)
                            || "tachiyomi.animeextension".equals(feature.name)
                    ) {
                        hasAniyomiFeature = true;
                        break;
                    }
                }
            }
        }
        if (!hasAniyomiFeature && extensionClass != null && !extensionClass.isEmpty()) {
            hasAniyomiFeature = true;
        }

        String libVersion = parseLibVersionFromVersionName(versionName);
        boolean libCompatible = isSupportedLibVersion(libVersion);

        JSONObject result = new JSONObject();
        try {
            result.put("packageName", packageName);
            result.put("versionName", versionName);
            result.put("versionCode", versionCode);
            result.put("libVersion", libVersion);
            result.put("libCompatible", libCompatible);
            result.put("extensionClass", extensionClass != null ? extensionClass : "");
            result.put("isNsfw", isNsfw);
            result.put("hasAniyomiFeature", hasAniyomiFeature);
            result.put("signingCertSha256", signingCertSha256);
            result.put("apkSha256", apkSha256);
            result.put("apkSizeBytes", apkFile.length());
            result.put("readOnlyLocked", !apkFile.canWrite());
            result.put("codeExecutionEnabled", false);
        } catch (JSONException e) {
            throw new StageException(ERROR_INVALID_APK, "Failed to build APK inspection result.", null, e);
        }
        return result;
    }

    private static String extractPrimarySignerSha256(PackageInfo pkgInfo) throws StageException {
        Signature[] signatures = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            SigningInfo signingInfo = pkgInfo.signingInfo;
            if (signingInfo != null) {
                signatures = signingInfo.hasMultipleSigners()
                    ? signingInfo.getApkContentsSigners()
                    : signingInfo.getSigningCertificateHistory();
            }
        } else {
            @SuppressWarnings("deprecation")
            Signature[] legacySignatures = pkgInfo.signatures;
            signatures = legacySignatures;
        }

        if (signatures == null || signatures.length == 0 || signatures[0] == null) {
            return "";
        }
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(signatures[0].toByteArray());
            return toHexLower(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new StageException(ERROR_NO_SIGNATURE, "SHA-256 unavailable for signing certificate.", null, e);
        }
    }

    public static String parseLibVersionFromVersionName(String versionName) {
        if (versionName == null) return "";
        String clean = versionName.trim().replaceFirst("(?i)^v+", "");
        if (clean.isEmpty()) return "";
        Matcher major = ANIYOMI_LIB_MAJOR_PATTERN.matcher(clean);
        if (major.find()) {
            return major.group(1);
        }
        Matcher legacy = LEGACY_LIB_PATTERN.matcher(clean);
        if (legacy.find()) {
            return legacy.group(1);
        }
        return "";
    }

    public static boolean isSupportedLibVersion(String libVersion) {
        if (libVersion == null || libVersion.trim().isEmpty()) return false;
        String clean = libVersion.trim();
        return "14".equals(clean) || "15".equals(clean) || "16".equals(clean);
    }

    private static final class DownloadOutcome {
        final long sizeBytes;
        final String sha256Hex;

        DownloadOutcome(long sizeBytes, String sha256Hex) {
            this.sizeBytes = sizeBytes;
            this.sha256Hex = sha256Hex;
        }
    }

    private DownloadOutcome downloadHttpsToTempFile(URI initialUri, File destTemp) throws StageException {
        URI currentUri = initialUri;
        for (int hops = 0; hops <= MAX_REDIRECTS; hops++) {
            validateHttpsUrl(currentUri.toString());
            verifyResolvedAddressesNotPrivate(currentUri.getHost());

            HttpsURLConnection conn = null;
            try {
                URL url = currentUri.toURL();
                HttpURLConnection rawConn = (HttpURLConnection) url.openConnection();
                if (!(rawConn instanceof HttpsURLConnection)) {
                    throw new StageException(ERROR_INVALID_URL, "Non-HTTPS connection rejected.");
                }
                conn = (HttpsURLConnection) rawConn;
                conn.setInstanceFollowRedirects(false);
                conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
                conn.setReadTimeout(READ_TIMEOUT_MS);
                conn.setRequestMethod("GET");
                conn.setRequestProperty("User-Agent", "ShizuTv-Android/2.1");

                int status = conn.getResponseCode();
                if (status >= 300 && status < 400) {
                    String location = conn.getHeaderField("Location");
                    if (location == null || location.trim().isEmpty()) {
                        throw new StageException(ERROR_DOWNLOAD_FAILED, "Redirect missing Location header.");
                    }
                    URI resolved = currentUri.resolve(location.trim());
                    currentUri = validateHttpsUrl(resolved.toString());
                    continue;
                }

                if (status < 200 || status >= 300) {
                    throw new StageException(
                        ERROR_DOWNLOAD_FAILED,
                        "APK download failed with HTTP status " + status + "."
                    );
                }

                long contentLength = conn.getContentLengthLong();
                if (contentLength > MAX_APK_BYTES) {
                    throw new StageException(
                        ERROR_SIZE_LIMIT,
                        "APK exceeds maximum allowed size (64 MB)."
                    );
                }

                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long totalBytes = 0L;
                byte[] buffer = new byte[16 * 1024];

                try (
                    InputStream in = conn.getInputStream();
                    FileOutputStream out = new FileOutputStream(destTemp, false)
                ) {
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        totalBytes += read;
                        if (totalBytes > MAX_APK_BYTES) {
                            throw new StageException(
                                ERROR_SIZE_LIMIT,
                                "APK stream exceeded maximum allowed size (64 MB)."
                            );
                        }
                        digest.update(buffer, 0, read);
                        out.write(buffer, 0, read);
                    }
                    out.getFD().sync();
                }

                if (totalBytes <= 0) {
                    throw new StageException(ERROR_DOWNLOAD_FAILED, "Downloaded APK file is empty.");
                }

                return new DownloadOutcome(totalBytes, toHexLower(digest.digest()));
            } catch (StageException se) {
                throw se;
            } catch (NoSuchAlgorithmException | IOException e) {
                throw new StageException(
                    ERROR_DOWNLOAD_FAILED,
                    "Failed to download APK over HTTPS: " + e.getMessage(),
                    null,
                    e
                );
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        }
        throw new StageException(ERROR_DOWNLOAD_FAILED, "Too many HTTP redirects during APK download.");
    }

    private JSONObject readRegistry() {
        if (!registryFile.exists() || !registryFile.isFile()) {
            return new JSONObject();
        }
        try (FileInputStream in = new FileInputStream(registryFile)) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[4096];
            int n;
            while ((n = in.read(chunk)) != -1) {
                buf.write(chunk, 0, n);
            }
            String text = new String(buf.toByteArray(), StandardCharsets.UTF_8).trim();
            if (text.isEmpty()) return new JSONObject();
            return new JSONObject(text);
        } catch (IOException | JSONException e) {
            return new JSONObject();
        }
    }

    private void writeTextAtomic(File destFile, String content) throws StageException {
        File temp = null;
        try {
            File parent = destFile.getParentFile();
            if (parent != null && !parent.exists()) parent.mkdirs();
            temp = new File(parent, "." + destFile.getName() + "." + UUID.randomUUID() + ".tmp");
            try (FileOutputStream out = new FileOutputStream(temp, false)) {
                out.write(content.getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            }
            if (destFile.exists() && !destFile.delete()) {
                throw new StageException(ERROR_STAGING_FAILED, "Failed to rotate metadata file.");
            }
            if (!temp.renameTo(destFile)) {
                throw new StageException(ERROR_STAGING_FAILED, "Failed to finalize metadata file.");
            }
        } catch (StageException se) {
            throw se;
        } catch (IOException e) {
            throw new StageException(ERROR_STAGING_FAILED, "Failed writing extension metadata.", null, e);
        } finally {
            deleteQuietly(temp);
        }
    }

    private static void copyFile(File src, File dst) throws StageException {
        byte[] buf = new byte[16 * 1024];
        try (FileInputStream in = new FileInputStream(src); FileOutputStream out = new FileOutputStream(dst, false)) {
            int n;
            while ((n = in.read(buf)) != -1) {
                out.write(buf, 0, n);
            }
            out.getFD().sync();
        } catch (IOException e) {
            throw new StageException(ERROR_STAGING_FAILED, "Failed staging APK bytes.", null, e);
        }
    }

    private static String computeFileSha256(File file) throws IOException {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[16 * 1024];
            try (FileInputStream in = new FileInputStream(file)) {
                int n;
                while ((n = in.read(buf)) != -1) {
                    md.update(buf, 0, n);
                }
            }
            return toHexLower(md.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IOException("SHA-256 algorithm missing", e);
        }
    }

    private static String toHexLower(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format(Locale.US, "%02x", b & 0xff));
        }
        return sb.toString();
    }

    private void cleanupStaleTempFiles() {
        File[] files = stagingDir.listFiles();
        if (files == null) return;
        for (File f : files) {
            if (f != null && f.isFile()) {
                deleteQuietly(f);
            }
        }
    }

    private void deleteDirectoryRecursively(File target) {
        if (target == null || !target.exists()) return;
        File[] children = target.listFiles();
        if (children != null) {
            for (File child : children) {
                if (child.isDirectory()) {
                    deleteDirectoryRecursively(child);
                } else {
                    child.setWritable(true, true);
                    deleteQuietly(child);
                }
            }
        }
        target.setWritable(true, true);
        deleteQuietly(target);
    }

    private static void deleteQuietly(File file) {
        if (file != null && file.exists()) {
            file.setWritable(true, true);
            //noinspection ResultOfMethodCallIgnored
            file.delete();
        }
    }
}
