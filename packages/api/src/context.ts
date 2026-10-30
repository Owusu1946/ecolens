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

/** Institution membership, held by Clerk Organizations (org = institution). */
export type Directory = {
  members(
    orgId: string,
  ): Promise<
    { userId: string; name: string | null; email: string | null; role: string; joinedAt: string }[]
  >;
  invitations(
    orgId: string,
  ): Promise<{ id: string; email: string; role: string; createdAt: string }[]>;
  invite(
    orgId: string,
    email: string,
    role: string,
    inviterUserId: string,
  ): Promise<{ id: string }>;
  revokeInvitation(orgId: string, invitationId: string, requestingUserId: string): Promise<void>;
  setRole(orgId: string, userId: string, role: string): Promise<void>;
  remove(orgId: string, userId: string): Promise<void>;
};

export type Context = {
  auth: Pick<SessionAuthObject, "userId" | "orgId" | "orgRole"> | null;
  db: Database;
  /** Field-report photos (R2 `ecolens-photos`). */
  photos: ObjectStore | null;
  /** Generated reports, HTML and PDF (R2 `ecolens-reports`). */
  reports: ObjectStore | null;
  /** Members and invitations; null when not available (e.g. tests). */
  directory: Directory | null;
  /** NASA FIRMS MAP_KEY for live thermal detections; null when not configured. */
  firmsMapKey: string | null;
  /** HTML → PDF (Cloudflare Browser Rendering); null when not configured. */
  renderPdf: ((html: string) => Promise<ArrayBuffer>) | null;
};
