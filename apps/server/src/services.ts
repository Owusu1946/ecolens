import { type Database, createDb } from "@ecolens/db";

import { ENV } from "./env.server";

// One pool per request: Workers can't share I/O objects across requests.
// Hyperdrive keeps the real connections to Neon warm, so this is cheap.
export function getDb(): Database {
  return createDb(ENV.HYPERDRIVE.connectionString);
}
