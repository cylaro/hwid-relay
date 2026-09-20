# hwid-relay

[![Tests](https://github.com/cylaro/hwid-relay/actions/workflows/test.yml/badge.svg)](https://github.com/cylaro/hwid-relay/actions/workflows/test.yml)
[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cylaro/hwid-relay)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Use many devices with a single HWID on panels with a device limit (Remnawave and compatible).**

A self-hosted Cloudflare Worker relay. Your apps subscribe to the worker; the worker fetches the real subscription with one fixed device identity (`x-hwid`, `User-Agent`, `x-device-os`, `x-ver-os`, `x-device-model`). The panel sees exactly **one device**, no matter how many phones, PCs or TVs you connect.

Works with stock apps — Happ, v2RayTun, Streisand, Karing and anything else that loads a subscription by URL. No app modifications, no manual HWID fields.

[README на русском](README.ru.md)

## Why

Panels such as [Remnawave](https://docs.rw/features/hwid-device-limit) count unique `x-hwid` header values per user. Every app instance generates its own value, so ten phones become ten devices and hit the limit. The header is produced by the client, and stock apps do not let you change it — so change **where the apps connect** instead:

```
Phone 1 (Happ) ─┐
Phone 2 (Happ) ─┤   https://your-worker.workers.dev/<secret>/s/<token>
Phone N      ─┘            │
                           ▼  fixed identity: one x-hwid, one User-Agent
                  Cloudflare Worker (yours)
                           │
                           ▼
                  Panel  ──>  sees exactly ONE device
```

## Setup (5 minutes, free)

1. **Deploy** — press the button above (or `npx wrangler deploy`), sign in to Cloudflare. The free plan is enough (100,000 requests/day).
2. **Configure** — Worker → Settings → Variables and Secrets:

   | Variable | Example | Required |
   |---|---|---|
   | `PANEL_BASE` | `https://panel-provider.com/sub` | yes (https, no token) |
   | `HWID` | `UE42LJXu4DbiCaBv` | yes (10–64 chars `A-Z a-z 0-9 = -`) |
   | `USER_AGENT` | `Happ/1.16.0 (iOS 18.3; iPhone 14 Pro)` | yes |
   | `SECRET_PREFIX` | `my-secret-1` | yes (8+ chars, random) |
   | `DEVICE_OS` / `VER_OS` / `DEVICE_MODEL` | `iOS` / `18.3` / `iPhone 14 Pro` | optional |

3. **Verify** — open `https://your-worker.workers.dev/<SECRET_PREFIX>/health` → `{"status":"ok"}`.
4. **Connect devices** — add `https://your-worker.workers.dev/<SECRET_PREFIX>/s/<your-subscription-token>` in each app. Every device now counts as one.

Before deploying, you can verify the identity against your panel with the [happ-decryptor](https://github.com/cylaro/happ-decryptor) Request tab: send the panel URL with the same headers and check that content arrives and `x-hwid-max-devices-reached` is not set.

## How it works

The worker is a dumb, safe pipe: it accepts only `GET /<secret>/s/<token>`, replaces the identity headers with your fixed values, and forwards the response from the single configured `PANEL_BASE`. It cannot be tricked into fetching arbitrary URLs (no client-controlled upstream), drops cookies and internal headers from the response, and forwards only what apps need: content type, `subscription-userinfo` (traffic quota), profile metadata and the `x-hwid-*` feedback headers.

The subscription token stays in the app link; the panel endpoint address never leaves your worker configuration.

## Honest limitations

- The panel sees one device whose requests come from Cloudflare IP ranges with a high request frequency. A provider can notice this in server logs; using it against your plan's terms is your decision.
- If the provider blocks datacenter IPs, the relay will fail — this is the main non-guarantee, and it depends entirely on your provider.
- If the provider changes the panel URL or your token, update `PANEL_BASE` or the device links.
- One worker = one panel + one identity. Multi-panel setups need multiple deployments.

## Development

```bash
npm test        # unit tests for routing, headers and response filtering
npx wrangler dev  # run the worker locally
```

## License

[MIT](LICENSE)
