import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { geometry } from "../geo";
import { boundaryKind, dataMode, institutionKind, lens, sourceKind } from "./enums";
import { pgTable } from "./table";

const id = () => uuid().primaryKey().default(sql`uuidv7()`);
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

// An institution is a Clerk organization (org = institution, role = job).
export const institutions = pgTable("institutions", {
  id: id(),
  clerkOrgId: text().unique(),
  name: text().notNull(),
  shortName: text().notNull(),
  kind: institutionKind().notNull(),
  createdAt: createdAt(),
});

// Provenance for every layer and observation (principles 3, 9, 11): who owns the
// data, how it is produced, and what it cannot tell you.
export const dataSources = pgTable("data_sources", {
  id: id(),
  key: text().notNull().unique(),
  name: text().notNull(),
  kind: sourceKind().notNull(),
  mode: dataMode().notNull(),
  stewardInstitutionId: uuid().references(() => institutions.id),
  description: text().notNull(),
  methodology: text(),
  knownLimitations: text().notNull(),
  spatialResolution: text(),
  updateFrequency: text(),
  licence: text(),
  url: text(),
  createdAt: createdAt(),
});

// Monitoring locations, e.g. a river reach on the Ankobra or a forest reserve edge.
export const sites = pgTable(
  "sites",
  {
    id: id(),
    name: text().notNull(),
    lens: lens().notNull(),
    basin: text(),
    district: text(),
    description: text(),
    location: geometry("Point").notNull(),
    isSensitive: boolean().notNull().default(false),
    isSimulated: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index().using("gist", t.location)],
);

// Areas to compare suspected activity against (use case 3): basins, mining
// concessions, protected areas, forest reserves, districts.
export const boundaries = pgTable(
  "boundaries",
  {
    id: id(),
    kind: boundaryKind().notNull(),
    name: text().notNull(),
    reference: text(),
    holder: text(),
    legalStatus: text(),
    sourceId: uuid()
      .notNull()
      .references(() => dataSources.id),
    validFrom: date(),
    validTo: date(),
    area: geometry("MultiPolygon").notNull(),
    isSensitive: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index().using("gist", t.area), index().on(t.kind)],
);

export const riverReaches = pgTable(
  "river_reaches",
  {
    id: id(),
    river: text().notNull(),
    basin: text().notNull(),
    name: text(),
    course: geometry("LineString").notNull(),
    sourceId: uuid()
      .notNull()
      .references(() => dataSources.id),
    createdAt: createdAt(),
  },
  (t) => [index().using("gist", t.course)],
);

// The agreed anomaly rules that turn observations into alerts. Thresholds are
// scientific judgements (section 8, "Scientific assurance"), so each rule records
// who reviewed it and is versioned rather than edited in place.
export const anomalyRules = pgTable(
  "anomaly_rules",
  {
    id: id(),
    key: text().notNull(),
    version: integer().notNull().default(1),
    lens: lens().notNull(),
    indicator: text().notNull(),
    name: text().notNull(),
    description: text().notNull(),
    params: jsonb().notNull(),
    isActive: boolean().notNull().default(true),
    reviewedByUserId: text(),
    reviewedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.key, t.version)],
);
