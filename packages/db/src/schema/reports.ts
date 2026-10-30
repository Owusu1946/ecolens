import { sql } from "drizzle-orm";
import { boolean, date, index, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { reportKind } from "./enums";
import { pgTable } from "./table";
import { alerts, incidents } from "./workflow";

// Report: one-page intelligence/assessment reports rendered to PDF and archived
// in R2. Publication is a separate, permissioned step (principle 6).
export const reports = pgTable(
  "reports",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    kind: reportKind().notNull(),
    title: text().notNull(),
    alertId: uuid().references(() => alerts.id),
    incidentId: uuid().references(() => incidents.id),
    periodStart: date(),
    periodEnd: date(),
    // The record as it stood when the report was generated, so an archived
    // report never changes when the incident does (principle 5).
    snapshot: jsonb(),
    // R2 keys in ecolens-reports: the rendered HTML and, once made, the PDF.
    htmlKey: text(),
    objectKey: text(),
    // Same visibility as the alert it describes (principle 6).
    isSensitive: boolean().notNull().default(false),
    isSimulated: boolean().notNull().default(false),
    generatedByUserId: text().notNull(),
    generatedByOrgId: text().notNull(),
    generatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    isPublished: boolean().notNull().default(false),
    publishedByUserId: text(),
    publishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.incidentId), index().on(t.generatedAt)],
);
