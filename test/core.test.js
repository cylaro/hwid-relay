import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildUpstreamUrl,
  filterResponseHeaders,
  identityHeaders,
  matchRoute,
  validateEnv,
} from '../src/core.js';

const ENV = {
  PANEL_BASE: 'https://panel.example.com/sub',
  HWID: 'UE42LJXu4DbiCaBv',
  USER_AGENT: 'Happ/1.16.0 (iOS 18.3; iPhone 14 Pro)',
  SECRET_PREFIX: 'my-secret-1',
  DEVICE_OS: 'iOS',
  VER_OS: '18.3',
  DEVICE_MODEL: 'iPhone 14 Pro',
};

test('validateEnv accepts a complete configuration', () => {
  assert.equal(validateEnv(ENV).ok, true);
});

test('validateEnv reports every missing or invalid setting without leaking values', () => {
  const result = validateEnv({ PANEL_BASE: 'http://insecure', HWID: 'short', USER_AGENT: '', SECRET_PREFIX: 'x' });
  assert.equal(result.ok, false);
  assert.equal(result.missing.length, 4);
  for (const entry of result.missing) assert.ok(!entry.includes('insecure'));
});

test('matchRoute resolves health and subscription paths behind the secret prefix', () => {
  assert.deepEqual(matchRoute('/my-secret-1/health', ENV), { route: 'health' });
  assert.deepEqual(matchRoute('/my-secret-1/s/token-uuid', ENV), { route: 'subscription', tokenPath: 'token-uuid' });
  assert.deepEqual(matchRoute('/my-secret-1/s/a/b/c', ENV), { route: 'subscription', tokenPath: 'a/b/c' });
});

test('matchRoute rejects wrong prefixes, empty tokens and oversized paths', () => {
  assert.equal(matchRoute('/wrong/s/token', ENV).route, 'not-found');
  assert.equal(matchRoute('/my-secret-1/s/', ENV).route, 'not-found');
  assert.equal(matchRoute('/my-secret-1/other', ENV).route, 'not-found');
  assert.equal(matchRoute(`/${'a'.repeat(3000)}`, ENV).route, 'not-found');
});

test('buildUpstreamUrl joins the panel base with the token path', () => {
  assert.equal(buildUpstreamUrl(ENV, 'token-uuid'), 'https://panel.example.com/sub/token-uuid');
  assert.equal(buildUpstreamUrl({ PANEL_BASE: 'https://panel.example.com/sub/' }, '/x'), 'https://panel.example.com/sub/x');
});

test('identityHeaders always sends x-hwid and user-agent, optional fields only when set', () => {
  const full = identityHeaders(ENV);
  assert.equal(full['x-hwid'], 'UE42LJXu4DbiCaBv');
  assert.equal(full['x-device-os'], 'iOS');
  assert.equal(full['x-ver-os'], '18.3');
  assert.equal(full['x-device-model'], 'iPhone 14 Pro');
  const minimal = identityHeaders({ HWID: ENV.HWID, USER_AGENT: ENV.USER_AGENT });
  assert.deepEqual(Object.keys(minimal).sort(), ['user-agent', 'x-hwid']);
});

test('response header filter keeps panel metadata and drops everything else', () => {
  const upstream = new Headers({
    'content-type': 'text/plain',
    'subscription-userinfo': 'upload=0; download=1; total=2',
    'x-hwid-active': 'true',
    'set-cookie': 'session=secret',
    'server': 'nginx',
  });
  const filtered = filterResponseHeaders(upstream);
  assert.equal(filtered.get('subscription-userinfo'), 'upload=0; download=1; total=2');
  assert.equal(filtered.get('x-hwid-active'), 'true');
  assert.equal(filtered.get('set-cookie'), null);
  assert.equal(filtered.get('server'), null);
  assert.equal(filtered.get('cache-control'), 'no-store');
});
