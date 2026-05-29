# Copilot Instructions

## What this app does

Cache invalidation proxy between [nav-enonicxp](https://github.com/navikt/nav-enonicxp) (CMS) and [nav-enonicxp-frontend](https://github.com/navikt/nav-enonicxp-frontend) (Next.js).

When content is published in Enonic XP, this proxy:
1. Deduplicates the event (XP cluster sends the same event from every node)
2. Deletes affected keys from Valkey (shared page cache)
3. Fans out invalidation calls to all live frontend pods (local in-memory cache)

## Critical architecture decisions

**Single replica / singleton** — The app holds an in-memory registry of frontend pod IPs. It MUST run as a single replica (`replicas.min: 1, max: 1`). Do not scale horizontally without replacing the in-memory registry with shared state.

**Heartbeat-based pod discovery** — Frontend pods call `GET /liveness?address=<pod-ip>&redisPrefixes=<prefixes>` every few seconds. Pods not seen within 10s are considered stale and removed. This is NOT the Nais liveness probe — it's application-level service discovery.

**Event deduplication** — `eventStatus` map in `invalidate-paths.js` deduplicates by `eventid` header with a 10s TTL. This prevents the same publish event from being processed multiple times when multiple XP nodes fire it.

## Two invalidation modes

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/revalidator-proxy` | POST | Invalidate specific paths. Body: `{ paths: string[] }`. Deduplicates by eventid. |
| `/revalidator-proxy/wipe-all` | GET | Nuclear option — flushes entire Valkey DB and tells all pods to wipe local cache. No dedup. |

Both update the cache key (UUID + timestamp) before forwarding.

## Auth

Simple shared secret via `SERVICE_SECRET` env var, checked in the `secret` request header. Not TokenX/Azure AD — callers are internal services in the same namespace with accessPolicy.

## Fan-out to pods

`callClients()` in `clients.js` iterates all registered pod IPs and calls them on port 3000 (the frontend app port). Calls are fire-and-forget (no await, errors logged).

## Valkey

Used for the **frontend's** page cache (not this app's state). Keys are `{prefix}:{path}` where prefixes come from pod registration. The proxy deletes keys on invalidation so the frontend refetches from XP on next request.

## Logging

All logs use **pino** structured JSON format:

```json
{"level":"info","time":"2026-05-29T...","msg":"Server starting","port":3002}
```

This makes logs queryable in Kibana by field (e.g., `eventid=abc123`). Health checks (`/internal/isAlive`, `/internal/isReady`) are excluded from request logs to reduce noise.

Set `LOG_LEVEL` env var for runtime control (`debug`, `info`, `warn`, `error`, `fatal`). Default is `info`.

```bash
corepack enable        # activates pnpm via packageManager field
cp .env-template .env  # SERVICE_SECRET=dummyToken, NO_VALKEY=true
pnpm dev               # nodemon with dotenv
```

Set `NO_VALKEY=true` to skip Valkey connection locally.

## Package manager

pnpm (version pinned in `package.json` `packageManager` field). Use `corepack enable` — do not install pnpm globally.
