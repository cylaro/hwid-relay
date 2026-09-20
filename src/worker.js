import { matchRoute, buildUpstreamUrl, identityHeaders, filterResponseHeaders, validateEnv } from './core.js';

function healthResponse(env) {
  const { ok, missing } = validateEnv(env);
  const body = JSON.stringify(
    ok
      ? { status: 'ok', hint: 'subscription URL: <worker>/SECRET_PREFIX/s/<token>' }
      : { status: 'misconfigured', missing },
  );
  return new Response(body, { status: ok ? 200 : 500, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = matchRoute(url.pathname, env);
    if (request.method !== 'GET' || route.route === 'not-found') return new Response('Not Found', { status: 404 });
    if (route.route === 'health') return healthResponse(env);

    const { ok, missing } = validateEnv(env);
    if (!ok) return new Response(`Configuration error: missing ${missing[0]}`, { status: 500 });

    const upstream = await fetch(buildUpstreamUrl(env, route.tokenPath), {
      headers: identityHeaders(env),
      redirect: 'follow',
    });
    return new Response(upstream.body, { status: upstream.status, headers: filterResponseHeaders(upstream.headers) });
  },
};
