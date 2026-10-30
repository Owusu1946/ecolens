// Bindings available on `env` from "cloudflare:workers".
// Keep in sync with apps/server/.env.schema and wrangler.jsonc.

export type CloudflareEnv = {
  HYPERDRIVE: Hyperdrive;
  PHOTOS: R2Bucket;
  TILES: R2Bucket;
  REPORTS: R2Bucket;
  CACHE: KVNamespace;
  INGEST_QUEUE: Queue;
  CORS_ORIGIN: string;
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  BROWSER_RENDERING_TOKEN?: string;
};

declare global {
  type Env = CloudflareEnv;
}

declare module "cloudflare:workers" {
  namespace Cloudflare {
    export interface Env extends CloudflareEnv {}
  }
}
