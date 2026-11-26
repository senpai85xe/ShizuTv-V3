import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildApiCorsHeaders,
  DEFAULT_CAPACITOR_ALLOWED_ORIGINS,
  getAllowedCorsOrigins,
  isAllowedCorsOrigin,
  normalizeOriginEntry,
} from './corsConfig.ts';

test('getAllowedCorsOrigins includes Capacitor origins, local dev, APP_URL, and CORS_ALLOWED_ORIGINS without wildcards', () => {
  assert.equal(normalizeOriginEntry('*'), null);
  assert.equal(normalizeOriginEntry('https://app.shizutv.example/some/path'), 'https://app.shizutv.example');

  const allowed = getAllowedCorsOrigins({
    appUrl: 'https://web.shizutv.example/',
    extraOrigins: 'https://staging.shizutv.example, http://10.0.2.2:5173, *',
    port: 3000,
  });

  for (const capOrigin of DEFAULT_CAPACITOR_ALLOWED_ORIGINS) {
    assert.equal(allowed.has(capOrigin), true, `Missing Capacitor origin ${capOrigin}`);
  }
  assert.equal(allowed.has('http://localhost:3000'), true);
  assert.equal(allowed.has('https://web.shizutv.example'), true);
  assert.equal(allowed.has('https://staging.shizutv.example'), true);
  assert.equal(allowed.has('http://10.0.2.2:5173'), true);
  assert.equal(allowed.has('*'), false);
});

test('buildApiCorsHeaders echoes allowlisted Capacitor origins with credentials and rejects untrusted origins', () => {
  const allowed = getAllowedCorsOrigins({ port: 3000 });

  assert.equal(isAllowedCorsOrigin('https://localhost', allowed), 'https://localhost');
  assert.equal(isAllowedCorsOrigin('capacitor://localhost', allowed), 'capacitor://localhost');
  assert.equal(isAllowedCorsOrigin('https://evil.example', allowed), null);

  const capHeaders = buildApiCorsHeaders('https://localhost', allowed);
  assert.equal(capHeaders['Access-Control-Allow-Origin'], 'https://localhost');
  assert.equal(capHeaders['Access-Control-Allow-Credentials'], 'true');
  assert.equal(capHeaders.Vary, 'Origin');
  assert.notEqual(capHeaders['Access-Control-Allow-Origin'], '*');

  const capSchemeHeaders = buildApiCorsHeaders('capacitor://localhost', allowed);
  assert.equal(capSchemeHeaders['Access-Control-Allow-Origin'], 'capacitor://localhost');
  assert.equal(capSchemeHeaders['Access-Control-Allow-Credentials'], 'true');

  const blockedHeaders = buildApiCorsHeaders('https://untrusted.example', allowed);
  assert.deepEqual(blockedHeaders, {});
  assert.equal(capHeaders['Access-Control-Max-Age'], '86400');
});

test('isAllowedCorsOrigin rejects unrelated *.run.app origins by default and honors explicit CORS_ALLOWED_ORIGINS, localhost, Capacitor, and same-host', () => {
  const devRunOrigin = 'https://ais-dev-mqayabnftr75vumlbgu2e6-875290452825.asia-northeast1.run.app';
  const preRunOrigin = 'https://ais-pre-mqayabnftr75vumlbgu2e6-875290452825.asia-northeast1.run.app';
  const unrelatedRunOrigin = 'https://unrelated-tenant-12345.us-central1.run.app';

  // Default policy without explicit APP_URL / CORS_ALLOWED_ORIGINS rejects all *.run.app origins
  const defaultAllowed = getAllowedCorsOrigins({ port: 3000 });
  assert.equal(isAllowedCorsOrigin(devRunOrigin, defaultAllowed), null);
  assert.equal(isAllowedCorsOrigin(preRunOrigin, defaultAllowed), null);
  assert.equal(isAllowedCorsOrigin(unrelatedRunOrigin, defaultAllowed), null);
  assert.deepEqual(buildApiCorsHeaders(unrelatedRunOrigin, defaultAllowed), {});

  // Explicit exact-origin allowlist via CORS_ALLOWED_ORIGINS
  const explicitExtraOrigins = `${devRunOrigin}, ${preRunOrigin}, https://*.com, *`;
  const configuredAllowed = getAllowedCorsOrigins({
    extraOrigins: explicitExtraOrigins,
    port: 3000,
  });

  const devHeaders = buildApiCorsHeaders(devRunOrigin, configuredAllowed, {
    extraOrigins: explicitExtraOrigins,
  });
  assert.equal(devHeaders['Access-Control-Allow-Origin'], devRunOrigin);
  assert.equal(devHeaders['Access-Control-Allow-Credentials'], 'true');

  const preHeaders = buildApiCorsHeaders(preRunOrigin, configuredAllowed, {
    extraOrigins: explicitExtraOrigins,
  });
  assert.equal(preHeaders['Access-Control-Allow-Origin'], preRunOrigin);
  assert.equal(preHeaders['Access-Control-Allow-Credentials'], 'true');

  // Unrelated *.run.app and arbitrary external origins remain strictly rejected
  assert.deepEqual(
    buildApiCorsHeaders(unrelatedRunOrigin, configuredAllowed, { extraOrigins: explicitExtraOrigins }),
    {},
  );
  assert.deepEqual(
    buildApiCorsHeaders('https://evil.example', configuredAllowed, { extraOrigins: explicitExtraOrigins }),
    {},
  );

  // HTTP downgrade spoof of an explicit origin and wildcard top-level domain patterns remain rejected
  assert.equal(
    isAllowedCorsOrigin(devRunOrigin.replace('https://', 'http://'), configuredAllowed),
    null,
  );
  assert.equal(
    isAllowedCorsOrigin('https://evil.com', configuredAllowed, { extraOrigins: 'https://*.com' }),
    null,
  );

  // Legitimate Capacitor & localhost development origins continue working
  assert.equal(isAllowedCorsOrigin('https://localhost', configuredAllowed), 'https://localhost');
  assert.equal(isAllowedCorsOrigin('capacitor://localhost', configuredAllowed), 'capacitor://localhost');
  assert.equal(isAllowedCorsOrigin('http://localhost:3000', configuredAllowed), 'http://localhost:3000');

  // Same-host request matching works behind reverse proxies
  assert.equal(
    isAllowedCorsOrigin('https://my-koyeb-app.example.org', configuredAllowed, {
      requestHost: 'my-koyeb-app.example.org',
    }),
    'https://my-koyeb-app.example.org',
  );

  // Opting into allowRunAppOrigins explicitly requires HTTPS and rejects embedded credentials
  assert.equal(
    isAllowedCorsOrigin(unrelatedRunOrigin, defaultAllowed, { allowRunAppOrigins: true }),
    unrelatedRunOrigin,
  );
  assert.equal(
    isAllowedCorsOrigin('http://fake.run.app', defaultAllowed, { allowRunAppOrigins: true }),
    null,
  );
  assert.equal(
    isAllowedCorsOrigin('https://user:pass@ais-pre.run.app', configuredAllowed, {
      allowRunAppOrigins: true,
    }),
    null,
  );
});
