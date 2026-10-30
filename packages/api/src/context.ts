import type { SessionAuthObject } from "@clerk/backend";
import type { Database } from "@ecolens/db";

/**
 * Object storage as the API needs it: the subset of an R2 bucket binding it
 * uses, so the package stays runtime-agnostic and tests can pass a fake.
 */
export type ObjectStore = {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | Blob,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<{
    arrayBuffer(): Promise<ArrayBuffer>;
    httpMetadata?: { contentType?: string };
  } | null>;
};

export type Context = {
  auth: Pick<SessionAuthObject, "userId" | "orgId" | "orgRole"> | null;
  db: Database;
  /** Field-report photos (R2 `ecolens-photos`). */
  photos: ObjectStore | null;
  /** Generated reports, HTML and PDF (R2 `ecolens-reports`). */
  reports: ObjectStore | null;
  /** NASA FIRMS MAP_KEY for live thermal detections; null when not configured. */
  firmsMapKey: string | null;
  /** HTML → PDF (Cloudflare Browser Rendering); null when not configured. */
  renderPdf: ((html: string) => Promise<ArrayBuffer>) | null;
};
