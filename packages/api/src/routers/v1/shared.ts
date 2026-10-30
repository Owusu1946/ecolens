import type { Database } from "@ecolens/db";
import { institutions } from "@ecolens/db/schema/index";
import { inArray } from "drizzle-orm";
import { z } from "zod";

// Records keep the Clerk organization; screens show the institution's name.
export async function institutionNames(db: Pick<Database, "select">, orgIds: string[]) {
  if (orgIds.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ clerkOrgId: institutions.clerkOrgId, name: institutions.name })
    .from(institutions)
    .where(inArray(institutions.clerkOrgId, [...new Set(orgIds)]));
  return new Map(rows.map((r) => [r.clerkOrgId ?? "", r.name]));
}

// Every write carries the device-generated id of its outbox entry, so a replay
// is idempotent (docs/stack.md, "Offline-first").
export const mutation = { clientMutationId: z.uuid() };
