import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANILIST_AUTHORIZE_URL,
  buildAniListAuthorizeUrl,
  computeTokenExpiryIso,
  extractAniListCodeFromInput,
  extractAniListTokenFromInput,
  isAniListTokenExpired,
  isTrustedOAuthMessageOrigin,
  normalizeBaseAppUrl,
  parseOAuthPopupMessage,
  parseStoredAniListSession,
  resolveAniListRedirectUri,
  serializeAniListSession,
} from './anilistOAuth';

test('resolveAniListRedirectUri prefers valid APP_URL over fallback and normalizes trailing slashes', () => {
  assert.equal(
    resolveAniListRedirectUri('https://ais-dev-demo.asia-northeast1.run.app/', 'http://localhost:3000'),
    'https://ais-dev-demo.asia-northeast1.run.app/auth/callback',
  );
  assert.equal(
    resolveAniListRedirectUri('', 'https://ais-pre-demo.run.app/some/path'),
    'https://ais-pre-demo.run.app/auth/callback',
  );
  assert.equal(
    resolveAniListRedirectUri(undefined, undefined),
    'http://localhost:3000/auth/callback',
  );
  assert.equal(normalizeBaseAppUrl('javascript:alert(1)'), null);
});

test('buildAniListAuthorizeUrl constructs valid authorization code and implicit URLs', () => {
  const codeUrl = buildAniListAuthorizeUrl({
    clientId: '26630',
    redirectUri: 'https://ais-dev-demo.run.app/auth/callback',
    state: 'csrf-state-123',
    responseType: 'code',
  });
  const parsed = new URL(codeUrl);
  assert.equal(`${parsed.origin}${parsed.pathname}`, ANILIST_AUTHORIZE_URL);
  assert.equal(parsed.searchParams.get('client_id'), '26630');
  assert.equal(parsed.searchParams.get('redirect_uri'), 'https://ais-dev-demo.run.app/auth/callback');
  assert.equal(parsed.searchParams.get('response_type'), 'code');
  assert.equal(parsed.searchParams.get('state'), 'csrf-state-123');

  const tokenUrl = buildAniListAuthorizeUrl({
    clientId: '26630',
    redirectUri: 'http://localhost:3000/auth/callback',
    state: 'csrf-state-456',
    responseType: 'token',
  });
  assert.equal(new URL(tokenUrl).searchParams.get('response_type'), 'token');
  assert.throws(
    () =>
      buildAniListAuthorizeUrl({
        clientId: '   ',
        redirectUri: 'http://localhost:3000/auth/callback',
        state: 'abc',
      }),
    /client_id/,
  );
});

test('isTrustedOAuthMessageOrigin validates .run.app, localhost, and matching currentOrigin', () => {
  assert.equal(
    isTrustedOAuthMessageOrigin('https://ais-dev-test.asia-northeast1.run.app'),
    true,
  );
  assert.equal(isTrustedOAuthMessageOrigin('http://localhost:3000'), true);
  assert.equal(isTrustedOAuthMessageOrigin('http://127.0.0.1:3000'), true);
  assert.equal(
    isTrustedOAuthMessageOrigin('https://custom.example.com', 'https://custom.example.com'),
    true,
  );
  assert.equal(isTrustedOAuthMessageOrigin('https://evil.example.com'), false);
  assert.equal(isTrustedOAuthMessageOrigin('null'), false);
});

test('parseOAuthPopupMessage parses success and error payloads strictly', () => {
  assert.deepEqual(
    parseOAuthPopupMessage({
      type: 'ANILIST_OAUTH_SUCCESS',
      accessToken: ' tok_abc ',
      expiresIn: 31536000,
      state: 'st1',
    }),
    {
      type: 'ANILIST_OAUTH_SUCCESS',
      accessToken: 'tok_abc',
      expiresIn: 31536000,
      state: 'st1',
    },
  );
  assert.equal(
    parseOAuthPopupMessage({ type: 'ANILIST_OAUTH_SUCCESS', accessToken: '  ' }),
    null,
  );
  assert.deepEqual(
    parseOAuthPopupMessage({
      type: 'ANILIST_OAUTH_ERROR',
      error: 'access_denied',
      errorDescription: 'User rejected access',
      state: 'st2',
    }),
    {
      type: 'ANILIST_OAUTH_ERROR',
      error: 'access_denied',
      errorDescription: 'User rejected access',
      state: 'st2',
    },
  );
  assert.equal(parseOAuthPopupMessage({ type: 'UNRELATED' }), null);
});

test('session serialization and expiration handle valid, expired, and corrupted records cleanly', () => {
  const now = 1_700_000_000_000;
  const session = serializeAniListSession({ accessToken: 'jwt-token-1', expiresIn: 3600 }, now);
  assert.equal(session.accessToken, 'jwt-token-1');
  assert.equal(session.tokenType, 'Bearer');
  assert.equal(session.expiresAt, computeTokenExpiryIso(3600, now));
  assert.equal(isAniListTokenExpired(session.expiresAt, now + 1000), false);
  assert.equal(isAniListTokenExpired(session.expiresAt, now + 3_590_000), true);

  const raw = JSON.stringify(session);
  assert.deepEqual(parseStoredAniListSession(raw, now + 1000), session);
  assert.equal(parseStoredAniListSession(raw, now + 4_000_000), null);
  assert.equal(parseStoredAniListSession('{broken json', now), null);
});

test('extractAniListTokenFromInput extracts Bearer tokens from full redirect URLs, hashes, and raw JWT strings', () => {
  assert.deepEqual(extractAniListTokenFromInput('  eyJabc.def.ghi  '), {
    accessToken: 'eyJabc.def.ghi',
    expiresIn: null,
  });

  assert.deepEqual(
    extractAniListTokenFromInput(
      'https://anilist.co/#access_token=eyJtok&token_type=Bearer&expires_in=31536000',
    ),
    {
      accessToken: 'eyJtok',
      expiresIn: 31536000,
    },
  );

  assert.deepEqual(
    extractAniListTokenFromInput(
      'https://anilist.co/api/v2/oauth/pin#access_token=eyJpin&expires_in=3600',
    ),
    {
      accessToken: 'eyJpin',
      expiresIn: 3600,
    },
  );

  assert.deepEqual(extractAniListTokenFromInput('#access_token=eyJfrag'), {
    accessToken: 'eyJfrag',
    expiresIn: null,
  });

  assert.equal(extractAniListTokenFromInput('https://anilist.co/home'), null);
  assert.equal(extractAniListTokenFromInput('   '), null);
});

test('extractAniListCodeFromInput parses authorization code callback URLs', () => {
  assert.deepEqual(
    extractAniListCodeFromInput(
      'https://ais-dev-demo.asia-northeast1.run.app/auth/callback?code=authcode_123&state=xyz',
    ),
    {
      code: 'authcode_123',
      redirectUri: 'https://ais-dev-demo.asia-northeast1.run.app/auth/callback',
    },
  );

  assert.deepEqual(extractAniListCodeFromInput('?code=raw_code_9&state=abc'), {
    code: 'raw_code_9',
    redirectUri: null,
  });

  assert.equal(extractAniListCodeFromInput('eyJabc.def.ghi'), null);
});
