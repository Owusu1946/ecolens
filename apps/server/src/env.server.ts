/// <reference types="@cloudflare/workers-types" />
/// <reference path="../cloudflare-env.d.ts" />
// For Cloudflare Workers, env is accessed via cloudflare:workers module
// Types are defined in cloudflare-env.d.ts; values come from .env locally (wrangler dev)
export { env as ENV } from "cloudflare:workers";
