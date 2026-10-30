import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  jsonb,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
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

// MEL "decision usefulness" (brief section 9): whether a report or alert
// helped the person who used it. One answer per person per item; a later
// answer replaces theirs.
export const feedback = pgTable(
  "feedback",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    targetType: text().notNull(),
    targetId: uuid().notNull(),
    useful: boolean().notNull(),
    comment: text(),
    userId: text().notNull(),
    orgId: text().notNull(),
    role: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.targetType, t.targetId, t.userId),
    index().on(t.targetType, t.createdAt),
    check("feedback_target_type", sql`${t.targetType} in ('report', 'alert')`),
  ],
);
