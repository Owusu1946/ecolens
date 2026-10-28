# Ecolens — Technical Stack (Approved 2026-10-28)

Goal: one of the fastest, smoothest web apps in Ghana. Every choice below serves the product brief (`docs/project-brief.md`) and the performance bar.

## Topology

```
Browser (PWA, service worker, IndexedDB offline queue)
  ├── Web app ............ Vercel (Next.js 16), functions in fra1
  ├── API ................ Cloudflare Workers (Hono + oRPC) — served from the Accra edge
  │     ├── Hyperdrive ──► Neon Postgres + PostGIS (eu-central-1, Frankfurt)
  │     ├── KV ........... hot read caches (boundaries, dashboard aggregates, flags)
  │     ├── R2 ........... photos, PMTiles, COGs, generated PDFs
  │     ├── Queues ....... ingestion fan-out
  │     ├── Cron ......... scheduled ingestion of live sources
  │     └── Browser Rendering ... HTML → PDF reports
  ├── Realtime ........... Durable Objects (WebSocket hibernation), one per channel
  └── Tiles/imagery ...... R2 + Cloudflare CDN (PMTiles basemap, EOX, NASA GIBS)
```

Rule: **the web app never talks to the database directly.** All data goes through the Workers API so caching, authorization and audit logging live in one place.

## Decisions

| Area | Choice | Why |
|---|---|---|
| Web hosting | **Vercel**, function region `fra1` | Full Next.js feature support, preview deploys for demos, simplest DX. Heavy, latency-sensitive traffic (API, tiles, realtime) stays on Cloudflare's Accra edge. |
| API | **Hono + oRPC on Cloudflare Workers** | Edge-served from Accra; end-to-end types with the web app. |
| API versioning | **URL prefix per version:** `/v1/rpc/*` (typed RPC for the web app), `/v1/*` (REST via OpenAPI), docs at `/v1`, spec at `/v1/spec.json` | Each version is its own router in `packages/api/src/routers/<version>/`. Additive changes (new procedures, new optional fields) stay in the current version; breaking changes go into a new version. Retired versions get `Deprecation`/`Sunset` headers before removal. |
| Database | **Neon Postgres + PostGIS**, region **eu-central-1** (move from us-east-2) | Spatial queries (within concession, distance to river, per-basin aggregates). Frankfurt is the closest Neon region to Ghana. |
| DB connection | **Cloudflare Hyperdrive** | Pooled connections and query caching from Workers. |
| ORM | **Drizzle** (PostGIS geometry types) | Already in the scaffold; typed schema and migrations. |
| Maps | **MapLibre GL JS v5** (globe + mercator in one engine) | Instant 3D globe ↔ 2D switching without losing view, layers or selection. Light enough for mid-range Android. |
| Data layers | **deck.gl** (interleaved with MapLibre) | GPU rendering for heatmaps, many alert points, turbidity-coloured river segments. |
| Terrain | Open DEM tiles (Terrarium/Mapzen) | 3D terrain and hillshade. |
| Basemap | **Protomaps PMTiles on R2** | Self-hosted vector tiles: no API key, no per-view billing, edge-cached. |
| Imagery | **EOX Sentinel-2 cloudless**, **NASA GIBS** (true colour, AOD, thermal) | Free, tiled, global. |
| Cesium | **Not in the core.** Optional, lazy-loaded "3D site inspection" view later if needed. | About 3 MB and heavy on mobile; MapLibre covers globe and 2D. |
| Realtime | **Cloudflare Durable Objects** with WebSocket hibernation | Same network as the API: write → broadcast in milliseconds. No extra vendor. Ably is the fallback. |
| Caching | SW (Serwist) → CF CDN → KV → Hyperdrive → TanStack Query (invalidated by realtime events) | Multiple layers instead of Redis. Upstash Redis only if a concrete need appears. |
| Ingestion | Workers **Cron Triggers + Queues** | NASA FIRMS (thermal), OpenAQ (PM2.5), GFW RADD (forest loss), NASA GIBS (AOD). |
| Heavy geoprocessing | **Google Earth Engine** via a scheduled Python job (e.g. GitHub Actions) | Sentinel-2 turbidity and land change → results to R2 and Postgres. |
| Seeded data | Postgres seed scripts | Realistic Western Region / Pra / Ankobra data, **always labelled simulated**. |
| Offline field reporting | **Serwist** + **IndexedDB** queue + Background Sync | Works with no connectivity; submits when back online. |
| Photos | Compressed on device → **presigned upload to R2** | Fast uploads; the API never proxies large bodies. |
| Reports | **Cloudflare Browser Rendering** (HTML → PDF), stored in R2 | PDF matches the web report exactly, including a map snapshot; archived for audit. |
| Frontend | React 19 + React Compiler, App Router, RSC for shells | |
| Data fetching | **TanStack Query + oRPC** | Typed and cached; refreshed by realtime events. |
| State | **Zustand** (shared map state across globe/2D), **nuqs** (URL state) | Shareable views, back-button friendly. |
| UI | **Tailwind v4 + shadcn/ui** (`packages/ui`), **Motion** | |
| Tables | **TanStack Table** + virtualization | Large alert queues stay smooth. |
| Charts | **uPlot** (time series), shadcn charts / Recharts (dashboards) | |
| Auth & roles | **Clerk Organizations**: org = institution, role = job | Eight role dashboards (see brief section 11). Permissions enforced in oRPC middleware; every status change is audited. |
| Observability | evlog, Workers Logs, Sentry, real-user Web Vitals | |

## Offline-first (whole app, not only field reporting)

Networks in Ghana can be slow, intermittent or expensive. The app must stay usable without connectivity and degrade gracefully on poor connections.

| Concern | Approach |
|---|---|
| App shell | **Serwist** precaches the app shell, routes, fonts, map style and sprites. The app opens instantly with no network. |
| Read data | **TanStack Query persisted to IndexedDB.** Alerts, incidents, dashboards and boundaries last seen are shown immediately and refreshed in the background (stale-while-revalidate). |
| Writes | **Outbox pattern.** Every mutation (field report, validate, escalate, assign, record action) is saved locally first, shown optimistically, and replayed in order when back online (Background Sync, plus a retry on reconnect and on app focus). Each write carries a client-generated ID, so replays are idempotent. |
| Conflicts | **Server-authoritative**, versioned status transitions. If a replayed transition is no longer valid (e.g. someone else already closed the alert), the user sees a clear notice instead of silent data loss. |
| Map offline | **Downloadable region packs:** a Western Region PMTiles extract (basemap + boundaries + rivers) stored on the device. Imagery tiles viewed recently are cached with an LRU cap. |
| Realtime | WebSocket auto-reconnect with backoff, and **catch-up on reconnect** (fetch events since the last seen cursor) so nothing is missed while offline. |
| Photos | Stored in IndexedDB until uploaded; compressed on device; resumable upload with retry. |
| Low-bandwidth mode | Auto-detected (Network Information API, slow-request heuristics) and user toggle: lower-resolution imagery, fewer live layers, no autoplay or animation-heavy extras. |
| UX | Always-visible connection status, a "pending sync" count, per-item sync state (saved locally / syncing / synced / failed), and timestamps that show how fresh cached data is. |
| Payloads | Small, paginated, compressed (Brotli) responses; vector tiles over raster where possible; delta queries ("changed since"). |

A dedicated local-first sync engine (e.g. PowerSync or ElectricSQL) is **not** in the core. TanStack Query persistence plus the outbox covers our needs with less complexity; revisit only if offline editing grows beyond the workflow actions above.

## Performance budget

- First-load JS under **150 KB** gzipped on non-map routes; map code split and loaded on demand.
- Interaction to Next Paint (INP) under **200 ms** on a mid-range Android phone.
- Globe ↔ 2D switch under **100 ms**, with no reload of layers.
- Repeat visits served from the service worker; **every screen opens offline** with last-known data.
- Usable on a throttled "Slow 3G" profile; no action blocks on the network.
- Realtime update visible to other users in under **1 s** end to end.

## Pending setup

- [x] Move the Neon database to eu-central-1 and enable PostGIS (project `Ecolens EU`, `summer-dawn-92620450`, Postgres 18, PostGIS 3.6), done 2026-10-28
- [x] Switch `packages/db` from neon-http to a TCP driver (`pg`) through the `HYPERDRIVE` binding; verified locally against PostGIS 3.6, done 2026-10-28
- [x] Create the Hyperdrive config `ecolens-db` (`eb30370c5d834056b1b10aaae393d3da`, Neon direct endpoint) and bind it as `HYPERDRIVE` in `apps/server/wrangler.jsonc`, done 2026-10-28
- [x] Create R2 buckets (`ecolens-photos`, `ecolens-tiles`, `ecolens-reports`, WEUR), KV `ecolens-cache`, Queues `ecolens-ingest` + `ecolens-ingest-dlq`, and bind them in `apps/server/wrangler.jsonc` (queue producer only), done 2026-10-28
- [ ] Add the ingest queue consumer (with the DLQ) alongside the Worker's `queue()` handler
- [ ] Add the realtime Durable Object binding and migration alongside the Durable Object class
- [ ] Create the Vercel project (root `apps/web`, region fra1); set `NEXT_PUBLIC_SERVER_URL` and the Clerk keys
- [ ] Set the production `CORS_ORIGIN` on the Worker to the Vercel domain
