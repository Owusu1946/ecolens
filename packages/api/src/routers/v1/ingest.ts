import { dataSources, observations } from "@ecolens/db/schema/index";
import { ORPCError } from "@orpc/server";
import { count, eq, max } from "drizzle-orm";

import { authorizedProcedure } from "../../index";
import { runFirms } from "../../ingest/firms";

// Observe: live ingestion status and an on-demand run for data stewards and
// administrators. The same run happens hourly from the Worker's cron.
export const ingestRouter = {
  status: authorizedProcedure("data_source:manage").handler(
    async ({ context: { db, firmsMapKey } }) => {
      const [row] = await db
        .select({
          latest: max(observations.observedAt),
          ingested: max(observations.ingestedAt),
          n: count(observations.id),
        })
        .from(observations)
        .innerJoin(dataSources, eq(dataSources.id, observations.sourceId))
        .where(eq(dataSources.key, "nasa-firms-viirs-nrt"));
      return {
        firms: {
          configured: !!firmsMapKey,
          detections: row?.n ?? 0,
          latestDetection: row?.latest?.toISOString() ?? null,
          lastIngested: row?.ingested?.toISOString() ?? null,
        },
      };
    },
  ),

  runFirms: authorizedProcedure("data_source:manage").handler(
    async ({ context: { db, firmsMapKey } }) => {
      if (!firmsMapKey) {
        throw new ORPCError("PRECONDITION_FAILED", {
          message:
            "FIRMS isn't configured. Set FIRMS_MAP_KEY on the API to switch on live thermal data.",
        });
      }
      return runFirms(db, firmsMapKey);
    },
  ),
};
