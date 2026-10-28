/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from "serwist";

// The Ecolens service worker (docs/stack.md, "Offline-first"). It makes the
// app shell, pages already visited and their assets open with no connection.
// Map imagery the user has looked at is kept (bounded) so the map works offline
// where they have been. Data is not cached here: the API and Clerk calls always go to the network,
// and last-known data comes from the per-user query cache in IndexedDB, which
// is cleared on sign-out.

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Basemap tiles (EOX). MapLibre fetches them with fetch(), so this must come
    // before the network-only rule below. About 10 KB a tile: 2,000 is ~20 MB.
    {
      matcher: ({ url }) => url.hostname === "tiles.maps.eox.at",
      handler: new CacheFirst({
        cacheName: "map-tiles",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 2000,
            maxAgeSeconds: 60 * 60 * 24 * 30,
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    // Cross-origin data requests (the Workers API, Clerk's frontend API) carry
    // credentials and per-user responses; never keep copies of them. Their
    // scripts, styles, fonts and images fall through to the cached defaults.
    {
      matcher: ({ sameOrigin, request }) => !sameOrigin && request.destination === "",
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
