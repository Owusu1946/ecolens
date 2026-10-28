import { randomUUID } from "node:crypto";

import { createSerwistRoute } from "@serwist/turbopack";

// Builds and serves the service worker at /serwist/sw.js. The offline page is
// precached under a revision that changes every deploy.
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: "src/sw/sw.ts",
    additionalPrecacheEntries: [{ url: "/offline", revision }],
    useNativeEsbuild: true,
  },
);
