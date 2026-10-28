import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { relations } from "./relations";

// In Workers, pass env.HYPERDRIVE.connectionString and create one instance per
// request; call `db.$client.end()` when the request is done.
// In Node scripts (seeds, tooling), pass DATABASE_URL.
export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString, max: 5 });
  return drizzle({ client: pool, relations });
}

export type Database = ReturnType<typeof createDb>;
