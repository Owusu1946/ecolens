import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { geometry } from "../geo";
import { confidence, lens } from "./enums";
import { dataSources, sites } from "./reference";
import { pgTable } from "./table";

// Observe: time-stamped readings linked to a location (brief section 4).
export const observations = pgTable(
  "observations",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    sourceId: uuid()
      .notNull()
      .references(() => dataSources.id),
    siteId: uuid().references(() => sites.id),
    lens: lens().notNull(),
    indicator: text().notNull(),
    value: doublePrecision(),
    unit: text(),
    observedAt: timestamp({ withTimezone: true }).notNull(),
    ingestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    location: geometry("Geometry").notNull(),
    confidence: confidence(),
    qualityNote: text(),
    // Identifier at the source, so re-running ingestion never duplicates rows.
    externalId: text(),
    raw: jsonb(),
    isSimulated: boolean().notNull().default(false),
  },
  (t) => [
    unique().on(t.sourceId, t.externalId),
    index().on(t.siteId, t.indicator, t.observedAt),
    index().on(t.observedAt),
    index().using("gist", t.location),
  ],
);
