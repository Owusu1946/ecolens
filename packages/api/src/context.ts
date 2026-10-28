import type { SessionAuthObject } from "@clerk/backend";
import type { Database } from "@ecolens/db";

export type Context = {
  auth: Pick<SessionAuthObject, "userId" | "orgId" | "orgRole"> | null;
  db: Database;
};
