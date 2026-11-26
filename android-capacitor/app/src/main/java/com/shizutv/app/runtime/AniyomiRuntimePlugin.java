package com.shizutv.app.runtime;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Phase 2 — Android Batch 1 Capacitor Plugin Skeleton.
 *
 * Exposes ONLY safe APK staging, inspection, listing, verification status, and removal.
 * Bytecode / DEX execution is intentionally NOT implemented in this batch.
 */
@CapacitorPlugin(name = "AniyomiRuntime")
public class AniyomiRuntimePlugin extends Plugin {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private ExtensionApkManager apkManager;

    @Override
    public void load() {
        super.load();
        apkManager = new ExtensionApkManager(getContext());
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
    }

    private synchronized ExtensionApkManager getApkManager() {
        if (apkManager == null) {
            apkManager = new ExtensionApkManager(getContext());
        }
        return apkManager;
    }

    @PluginMethod
    public void inspectApkMetadata(PluginCall call) {
        String filePath = call.getString("filePath");
        String packageName = call.getString("packageName");
        executor.execute(() -> {
            try {
                JSONObject info = getApkManager().inspectApkMetadata(filePath, packageName);
                call.resolve(toJsObject(info));
            } catch (ExtensionApkManager.StageException e) {
                rejectStageException(call, e);
            } catch (Exception e) {
                call.reject("Unexpected inspection error: " + e.getMessage(), "INSPECT_FAILED", e);
            }
        });
    }

    @PluginMethod
    public void downloadAndStageApk(PluginCall call) {
        String url = call.getString("url");
        String expectedPackageName = call.getString("expectedPackageName");
        String expectedSha256 = call.getString("expectedSha256");
        boolean allowSigningCertChange = Boolean.TRUE.equals(
            call.getBoolean("allowSigningCertChange", false)
        );

        executor.execute(() -> {
            try {
                JSONObject staged = getApkManager().downloadAndStageApk(
                    url,
                    expectedPackageName,
                    expectedSha256,
                    allowSigningCertChange
                );
                call.resolve(toJsObject(staged));
            } catch (ExtensionApkManager.StageException e) {
                rejectStageException(call, e);
            } catch (Exception e) {
                call.reject("Unexpected staging error: " + e.getMessage(), "STAGING_FAILED", e);
            }
        });
    }

    @PluginMethod
    public void listStagedExtensions(PluginCall call) {
        executor.execute(() -> {
            try {
                List<JSONObject> items = getApkManager().listStagedExtensions();
                JSArray arr = new JSArray();
                for (JSONObject item : items) {
                    arr.put(toJsObject(item));
                }
                JSObject res = new JSObject();
                res.put("items", arr);
                res.put("codeExecutionEnabled", false);
                call.resolve(res);
            } catch (ExtensionApkManager.StageException e) {
                rejectStageException(call, e);
            } catch (Exception e) {
                call.reject("Failed listing staged extensions: " + e.getMessage(), "LIST_FAILED", e);
            }
        });
    }

    @PluginMethod
    public void removeStagedExtension(PluginCall call) {
        String packageName = call.getString("packageName");
        executor.execute(() -> {
            try {
                boolean removed = getApkManager().removeStagedExtension(packageName);
                JSObject res = new JSObject();
                res.put("packageName", packageName);
                res.put("removed", removed);
                call.resolve(res);
            } catch (ExtensionApkManager.StageException e) {
                rejectStageException(call, e);
            } catch (Exception e) {
                call.reject("Failed removing staged extension: " + e.getMessage(), "REMOVE_FAILED", e);
            }
        });
    }

    @PluginMethod
    public void getVerificationStatus(PluginCall call) {
        String packageName = call.getString("packageName");
        executor.execute(() -> {
            try {
                JSONObject status = getApkManager().getVerificationStatus(packageName);
                call.resolve(toJsObject(status));
            } catch (ExtensionApkManager.StageException e) {
                rejectStageException(call, e);
            } catch (Exception e) {
                call.reject("Failed checking verification status: " + e.getMessage(), "STATUS_FAILED", e);
            }
        });
    }

    private static void rejectStageException(PluginCall call, ExtensionApkManager.StageException e) {
        JSObject data = e.getDetails() != null ? toJsObjectSafe(e.getDetails()) : null;
        if (data != null) {
            call.reject(e.getMessage(), e.getCode(), e, data);
        } else {
            call.reject(e.getMessage(), e.getCode(), e);
        }
    }

    private static JSObject toJsObject(JSONObject json) throws JSONException {
        return JSObject.fromJSONObject(json);
    }

    private static JSObject toJsObjectSafe(JSONObject json) {
        try {
            return JSObject.fromJSONObject(json);
        } catch (JSONException ignored) {
            return null;
        }
    }
}
