/**
 * Pure relay logic — no Cloudflare-specific APIs, unit-testable in Node.
 */

const RESPONSE_HEADER_ALLOWLIST = [
  'content-type',
  'subscription-userinfo',
  'profile-title',
  'profile-update-interval',
  'profile-web-page-url',
  'support-url',
  'x-hwid-active',
  'x-hwid-not-supported',
  'x-hwid-max-devices-reached',
  'x-hwid-limit',
];

const HWID_PATTERN = /^[A-Za-z0-9=-]{10,64}$/;

/** Check worker configuration. Returns { ok, missing } without leaking values. */
export function validateEnv(env) {
  const missing = [];
  const base = String(env?.PANEL_BASE || '');
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?(\/[^\s]*)?$/i.test(base)) missing.push('PANEL_BASE (https URL of the panel subscription endpoint)');
  if (!HWID_PATTERN.test(String(env?.HWID || ''))) missing.push('HWID (10-64 chars: A-Z a-z 0-9 = -)');
  if (!env?.USER_AGENT) missing.push('USER_AGENT');
  if (!env?.SECRET_PREFIX || !/^\/?[A-Za-z0-9_-]{8,}$/.test(String(env?.SECRET_PREFIX))) missing.push('SECRET_PREFIX (8+ chars: A-Z a-z 0-9 _ -)');
  return { ok: missing.length === 0, missing };
}

/** Identity headers presented to the panel. */
export function identityHeaders(env) {
  const headers = {
    'x-hwid': env.HWID,
    'user-agent': env.USER_AGENT,
  };
  if (env.DEVICE_OS) headers['x-device-os'] = env.DEVICE_OS;
  if (env.VER_OS) headers['x-ver-os'] = env.VER_OS;
  if (env.DEVICE_MODEL) headers['x-device-model'] = env.DEVICE_MODEL;
  return headers;
}

function normalizedPrefix(env) {
  return '/' + String(env?.SECRET_PREFIX || '').replace(/^\/+|\/+$/g, '');
}

/**
 * Route a request path:
 *   /<prefix>/health        -> { route: 'health' }
 *   /<prefix>/s/<token...>  -> { route: 'subscription', tokenPath }
 *   anything else           -> { route: 'not-found' }
 */
export function matchRoute(pathname, env) {
  const prefix = normalizedPrefix(env);
  if (prefix === '/' || pathname.length > 2048) return { route: 'not-found' };
  if (pathname === `${prefix}/health`) return { route: 'health' };
  const subscriptionPrefix = `${prefix}/s/`;
  if (pathname.startsWith(subscriptionPrefix) && pathname.length > subscriptionPrefix.length) {
    const tokenPath = pathname.slice(subscriptionPrefix.length).replace(/^\/+/, '');
    if (tokenPath && !/[\s?]/.test(tokenPath)) return { route: 'subscription', tokenPath };
  }
  return { route: 'not-found' };
}

/** Upstream subscription URL for a relayed token path. */
export function buildUpstreamUrl(env, tokenPath) {
  const base = String(env.PANEL_BASE).replace(/\/+$/, '');
  return `${base}/${String(tokenPath).replace(/^\/+/, '')}`;
}

/**
 * Copy only panel-relevant response headers (traffic quota, profile metadata,
 * HWID feedback). Everything else — including set-cookie — is dropped.
 */
export function filterResponseHeaders(upstreamHeaders) {
  const headers = new Headers();
  for (const name of RESPONSE_HEADER_ALLOWLIST) {
    const value = upstreamHeaders.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('cache-control', 'no-store');
  return headers;
}
