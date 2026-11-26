import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKEND_URL_STORAGE_KEY,
  BackendConnectionError,
  BackendNotConfiguredError,
  classifyClientBackendFetchError,
  clearRuntimeBackendUrl,
  getEffectiveBackendConfig,
  getEnvBackendUrl,
  getRuntimeBackendUrl,
  isCapacitorNativeEnvironment,
  NonJsonResponseError,
  parseJsonResponseSafely,
  resolveApiUrl,
  resolveWsUrl,
  rewriteApiAssetUrl,
  rewriteMangaPagesUrls,
  rewriteVideoStreamUrls,
  setRuntimeBackendUrl,
  testBackendConnection,
  tryResolveApiUrl,
  validateAndNormalizeBackendUrl,
} from './backendConfig.ts';

function withMockBrowserEnv(
  fn: (storageMap: Map<string, string>, events: string[]) => void | Promise<void>,
  options?: {
    origin?: string;
    protocol?: string;
    host?: string;
    isNativeAndroid?: boolean;
  },
) {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalCapacitor = (globalThis as { Capacitor?: unknown }).Capacitor;
  const storageMap = new Map<string, string>();
  const events: string[] = [];

  (globalThis as { window?: unknown }).window = {
    location: {
      origin: options?.origin ?? 'https://localhost',
      protocol: options?.protocol ?? 'https:',
      host: options?.host ?? 'localhost',
    },
    localStorage: {
      getItem: (k: string) => storageMap.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storageMap.set(k, v);
      },
      removeItem: (k: string) => {
        storageMap.delete(k);
      },
    },
    dispatchEvent: (evt: { type?: string }) => {
      if (evt?.type) events.push(evt.type);
      return true;
    },
  };

  if (options?.isNativeAndroid) {
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      Plugins: {},
    };
  }

  return Promise.resolve(fn(storageMap, events)).finally(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
    if (originalCapacitor === undefined) {
      delete (globalThis as { Capacitor?: unknown }).Capacitor;
    } else {
      (globalThis as { Capacitor?: unknown }).Capacitor = originalCapacitor;
    }
  });
}

test('validateAndNormalizeBackendUrl strips trailing slashes and /api and rejects self-origins & unsafe URLs', () => {
  assert.deepEqual(validateAndNormalizeBackendUrl('https://api.shizutv.example///'), {
    ok: true,
    url: 'https://api.shizutv.example',
  });
  assert.deepEqual(validateAndNormalizeBackendUrl('https://api.shizutv.example/subpath/api/'), {
    ok: true,
    url: 'https://api.shizutv.example/subpath',
  });
  assert.deepEqual(validateAndNormalizeBackendUrl('http://10.0.2.2:3000/'), {
    ok: true,
    url: 'http://10.0.2.2:3000',
  });

  // Reject Capacitor Android WebView origins & invalid inputs
  for (const invalid of [
    '',
    '   ',
    'not-a-url',
    'ftp://files.example.com',
    'javascript:alert(1)',
    'https://user:pass@api.example.com',
    'https://localhost',
    'http://localhost',
    'capacitor://localhost',
    'ionic://localhost',
  ]) {
    const res = validateAndNormalizeBackendUrl(invalid);
    assert.equal(res.ok, false, `Expected ${JSON.stringify(invalid)} to fail validation`);
  }
});

test('resolveApiUrl and resolveWsUrl preserve web relative behavior when unset and require config on Capacitor native', () => {
  // Web unconfigured -> relative /api/* and location-derived WS
  assert.equal(resolveApiUrl('/api/stream/resolve', { isNative: false }), '/api/stream/resolve');
  assert.equal(
    resolveWsUrl('/ws/watch-party', {
      isNative: false,
      locationLike: { protocol: 'https:', host: 'shizutv.app' },
    }),
    'wss://shizutv.app/ws/watch-party',
  );

  // Android native unconfigured -> never silently falls back to https://localhost or /api/*
  assert.throws(
    () =>
      resolveApiUrl('/api/stream/resolve', {
        isNative: true,
        runtimeBaseUrl: null,
        envBaseUrl: null,
      }),
    BackendNotConfiguredError,
  );
  assert.throws(
    () =>
      resolveWsUrl('/ws/watch-party', {
        isNative: true,
        runtimeBaseUrl: null,
        envBaseUrl: null,
      }),
    BackendNotConfiguredError,
  );
  assert.equal(
    tryResolveApiUrl('/api/stream/resolve', {
      isNative: true,
      runtimeBaseUrl: null,
      envBaseUrl: null,
    }),
    null,
  );

  // Build env VITE_API_BASE_URL vs runtime override precedence
  const envOnlyCfg = getEffectiveBackendConfig({
    isNative: true,
    runtimeBaseUrl: null,
    envBaseUrl: 'https://env-backend.example/api',
  });
  assert.equal(envOnlyCfg.baseUrl, 'https://env-backend.example');
  assert.equal(envOnlyCfg.source, 'env');
  assert.equal(
    resolveApiUrl('/api/extensions/fetch-repo', {
      isNative: true,
      runtimeBaseUrl: null,
      envBaseUrl: 'https://env-backend.example',
    }),
    'https://env-backend.example/api/extensions/fetch-repo',
  );

  const runtimeOverridesEnv = getEffectiveBackendConfig({
    isNative: true,
    runtimeBaseUrl: 'https://custom-runtime.example/',
    envBaseUrl: 'https://env-backend.example',
  });
  assert.equal(runtimeOverridesEnv.baseUrl, 'https://custom-runtime.example');
  assert.equal(runtimeOverridesEnv.source, 'runtime');
  assert.equal(
    resolveWsUrl('/ws/watch-party', {
      isNative: true,
      runtimeBaseUrl: 'https://custom-runtime.example',
      envBaseUrl: 'https://env-backend.example',
    }),
    'wss://custom-runtime.example/ws/watch-party',
  );
  assert.equal(getEnvBackendUrl('capacitor://localhost'), null);
});

test('runtime storage persistence and Capacitor detection work end-to-end in native shell', async () => {
  await withMockBrowserEnv(
    (storageMap, events) => {
      assert.equal(isCapacitorNativeEnvironment(), true);
      assert.equal(getRuntimeBackendUrl(), null);

      const saved = setRuntimeBackendUrl('https://android-api.example/api/');
      assert.equal(saved, 'https://android-api.example');
      assert.equal(storageMap.get(BACKEND_URL_STORAGE_KEY), 'https://android-api.example');
      assert.equal(getRuntimeBackendUrl(), 'https://android-api.example');
      assert.equal(resolveApiUrl('/api/health'), 'https://android-api.example/api/health');

      clearRuntimeBackendUrl();
      assert.equal(getRuntimeBackendUrl(), null);
      assert.throws(() => resolveApiUrl('/api/health'), BackendNotConfiguredError);
      assert.equal(events.length, 2);
    },
    { isNativeAndroid: true, origin: 'https://localhost', protocol: 'https:', host: 'localhost' },
  );
});

test('rewriteVideoStreamUrls and rewriteMangaPagesUrls prefix relative /api proxy URLs while preserving CDN URLs', () => {
  const opts = { isNative: true, runtimeBaseUrl: 'https://api.shizutv.example' };
  const stream = rewriteVideoStreamUrls(
    {
      url: '/api/stream/proxy?url=hls',
      quality: '1080p',
      isHls: true,
      serverName: 'HD-1',
      mirrors: [
        { name: 'Mirror A', url: '/api/stream/proxy?url=m1', quality: '1080p', isHls: true },
        { name: 'Mirror B', url: 'https://cdn.external.example/video.m3u8', quality: '720p', isHls: true },
      ],
      subtitles: [
        { url: '/api/stream/proxy?url=sub-en', lang: 'en', label: 'English' },
      ],
    },
    opts,
  );

  assert.equal(stream.url, 'https://api.shizutv.example/api/stream/proxy?url=hls');
  assert.equal(stream.mirrors?.[0].url, 'https://api.shizutv.example/api/stream/proxy?url=m1');
  assert.equal(stream.mirrors?.[1].url, 'https://cdn.external.example/video.m3u8');
  assert.equal(stream.subtitles?.[0].url, 'https://api.shizutv.example/api/stream/proxy?url=sub-en');

  assert.deepEqual(
    rewriteMangaPagesUrls(
      ['/api/stream/proxy?url=page1', 'https://img.example.org/p2.jpg'],
      opts,
    ),
    ['https://api.shizutv.example/api/stream/proxy?url=page1', 'https://img.example.org/p2.jpg'],
  );
  assert.equal(rewriteApiAssetUrl('/api/stream/proxy?url=1', { isNative: false }), '/api/stream/proxy?url=1');
});

test('parseJsonResponseSafely detects HTML SPA fallback on HTTP 200 and non-JSON payloads cleanly', async () => {
  const html200 = new Response('<!doctype html><html><body>SPA</body></html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
  await assert.rejects(
    () => parseJsonResponseSafely(html200, 'stream resolution'),
    (err: unknown) =>
      err instanceof NonJsonResponseError &&
      err.status === 200 &&
      /Received HTML instead of JSON/i.test(err.message),
  );

  const plainText = new Response('not json', {
    status: 502,
    headers: { 'Content-Type': 'text/plain' },
  });
  await assert.rejects(
    () => parseJsonResponseSafely(plainText, 'diagnostics'),
    (err: unknown) =>
      err instanceof NonJsonResponseError && /Expected JSON from backend/i.test(err.message),
  );

  const validJson = new Response(JSON.stringify({ ok: true, count: 4 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
  const parsed = await parseJsonResponseSafely<{ ok: boolean; count: number }>(validJson, 'test');
  assert.deepEqual(parsed, { ok: true, count: 4 });
});

test('testBackendConnection verifies /api/health JSON payload and reports HTML/network errors clearly', async () => {
  const okResult = await testBackendConnection('https://api.shizutv.example/api', async (input) => {
    assert.equal(input, 'https://api.shizutv.example/api/health');
    return new Response(
      JSON.stringify({ ok: true, service: 'shizutv-backend', version: '2.1.8' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });
  assert.equal(okResult.ok, true);
  assert.equal(okResult.normalizedUrl, 'https://api.shizutv.example');
  assert.equal(okResult.service, 'shizutv-backend');

  const htmlResult = await testBackendConnection('https://wrong-frontend.example', async () => {
    return new Response('<!doctype html><html></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  });
  assert.equal(htmlResult.ok, false);
  assert.match(htmlResult.message, /Received HTML instead of JSON/i);

  const invalidInputResult = await testBackendConnection('https://localhost');
  assert.equal(invalidInputResult.ok, false);
  assert.match(invalidInputResult.message, /Android WebView origin/i);
});

test('classifyClientBackendFetchError replaces raw Failed to fetch with clear Web CORS/origin vs Capacitor/timeout diagnostics', () => {
  const crossOriginWebErr = classifyClientBackendFetchError(
    new TypeError('Failed to fetch'),
    'stream resolution (ShizuTv Stream (Inbuilt))',
    {
      targetUrl: 'https://backend.example.com',
      isNative: false,
      currentOrigin: 'https://ais-dev-example.asia-northeast1.run.app',
    },
  );
  assert.ok(crossOriginWebErr instanceof BackendConnectionError);
  assert.equal(crossOriginWebErr.isTimeout, false);
  assert.match(crossOriginWebErr.message, /https:\/\/ais-dev-example\.asia-northeast1\.run\.app/);
  assert.match(crossOriginWebErr.message, /allows CORS requests/i);

  const nativeCapErr = classifyClientBackendFetchError(
    new TypeError('Failed to fetch'),
    'backend health check',
    {
      targetUrl: 'https://backend.example.com',
      isNative: true,
      currentOrigin: 'https://localhost',
    },
  );
  assert.ok(nativeCapErr instanceof BackendConnectionError);
  assert.match(nativeCapErr.message, /allows Capacitor CORS origins/i);

  const timeoutErr = classifyClientBackendFetchError(
    Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }),
    'extension diagnostics (ShizuTv Stream (Inbuilt))',
    {
      targetUrl: 'https://backend.example.com',
      isNative: false,
    },
  );
  assert.ok(timeoutErr instanceof BackendConnectionError);
  assert.equal(timeoutErr.isTimeout, true);
  assert.match(timeoutErr.message, /Request timed out/i);
});
