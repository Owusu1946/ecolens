import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { geometry } from "../geo";
import {
  alertStatus,
  confidence,
  evidenceKind,
  fieldAssessment,
  incidentActionKind,
  incidentStatus,
  lens,
  severity,
  validationOutcome,
  verificationStatus,
} from "./enums";
import { observations } from "./observations";
import { anomalyRules, institutions, sites } from "./reference";
import { pgTable } from "./table";

// Ids are UUIDv7. Rows created on a device (field reports, photos, actions) are
// given their id on the device, so replaying the offline outbox is idempotent.
const id = () => uuid().primaryKey().default(sql`uuidv7()`);
const ts = () => timestamp({ withTimezone: true });

// --- Analyse / Interpret ----------------------------------------------------

export const alerts = pgTable(
  "alerts",
  {
    id: id(),
    // Human-friendly sequence for references such as "ALT-0042".
    number: integer().generatedAlwaysAsIdentity().notNull().unique(),
    lens: lens().notNull(),
    indicator: text().notNull(),
    title: text().notNull(),
    summary: text().notNull(),
    ruleId: uuid().references(() => anomalyRules.id),
    siteId: uuid().references(() => sites.id),
    location: geometry("Geometry").notNull(),
    confidence: confidence().notNull(),
    status: alertStatus().notNull().default("new"),
    // Provenance shown with every alert (principle 3).
    coverage: text().notNull(),
    limitations: text().notNull(),
    // MEL: detection latency = detectedAt - firstObservedAt.
    firstObservedAt: ts().notNull(),
    detectedAt: ts().notNull().defaultNow(),
    validatedAt: ts(),
    isSensitive: boolean().notNull().default(false),
    isSimulated: boolean().notNull().default(false),
    // Optimistic concurrency for status transitions replayed from offline clients.
    version: integer().notNull().default(1),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index().on(t.status, t.detectedAt),
    index().on(t.siteId),
    index().using("gist", t.location),
  ],
);

// The evidence trail behind an alert: observations, field reports, imagery, documents.
export const alertEvidence = pgTable(
  "alert_evidence",
  {
    id: id(),
    alertId: uuid()
      .notNull()
      .references(() => alerts.id, { onDelete: "cascade" }),
    kind: evidenceKind().notNull(),
    observationId: uuid().references(() => observations.id),
    fieldReportId: uuid().references(() => fieldReports.id),
    // R2 object key for imagery snapshots and documents.
    objectKey: text(),
    caption: text(),
    addedByUserId: text(),
    addedAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.alertId)],
);

// --- Validate ---------------------------------------------------------------

// A human decision on an alert (principle 1). Rationale is required.
export const validations = pgTable(
  "validations",
  {
    id: id(),
    alertId: uuid()
      .notNull()
      .references(() => alerts.id),
    outcome: validationOutcome().notNull(),
    rationale: text().notNull(),
    confidence: confidence().notNull(),
    decidedByUserId: text().notNull(),
    decidedByOrgId: text().notNull(),
    decidedByRole: text().notNull(),
    decidedAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.alertId, t.decidedAt)],
);

// Validate ← field confirmation: an analyst or regulator asks an institution's
// field team to check an alert on the ground. Fulfilled by the field report
// that answers it; withdrawn if the alert is decided without a visit.
export const verificationRequests = pgTable(
  "verification_requests",
  {
    id: id(),
    alertId: uuid()
      .notNull()
      .references(() => alerts.id),
    institutionId: uuid()
      .notNull()
      .references(() => institutions.id),
    instructions: text().notNull(),
    dueAt: ts(),
    status: verificationStatus().notNull().default("open"),
    requestedByUserId: text().notNull(),
    requestedByOrgId: text().notNull(),
    requestedAt: ts().notNull().defaultNow(),
    fulfilledByReportId: uuid().references(() => fieldReports.id),
    closedAt: ts(),
  },
  (t) => [index().on(t.institutionId, t.status), index().on(t.alertId)],
);

// Observe (field): GPS-tagged observations from authorised field officers
// (use case 4). Captured offline; clientCreatedAt is when it was recorded on the
// device, receivedAt when it reached the server.
export const fieldReports = pgTable(
  "field_reports",
  {
    id: id(),
    alertId: uuid().references(() => alerts.id),
    siteId: uuid().references(() => sites.id),
    authorUserId: text().notNull(),
    authorOrgId: text().notNull(),
    location: geometry("Point").notNull(),
    gpsAccuracyM: doublePrecision(),
    observation: text().notNull(),
    activityTypes: text().array().notNull().default(sql`'{}'::text[]`),
    assessment: fieldAssessment(),
    clientCreatedAt: ts().notNull(),
    receivedAt: ts().notNull().defaultNow(),
    isSensitive: boolean().notNull().default(true),
    isSimulated: boolean().notNull().default(false),
  },
  (t) => [index().on(t.alertId), index().on(t.clientCreatedAt), index().using("gist", t.location)],
);

export const fieldReportPhotos = pgTable(
  "field_report_photos",
  {
    id: id(),
    fieldReportId: uuid()
      .notNull()
      .references(() => fieldReports.id, { onDelete: "cascade" }),
    objectKey: text().notNull().unique(),
    contentType: text().notNull(),
    bytes: bigint({ mode: "number" }),
    width: integer(),
    height: integer(),
    takenAt: ts(),
    location: geometry("Point"),
    // Null until the presigned upload to R2 is confirmed.
    uploadedAt: ts(),
  },
  (t) => [index().on(t.fieldReportId)],
);

// --- Escalate ---------------------------------------------------------------

// A validated (confirmed) alert routed to a responsible institution.
export const incidents = pgTable(
  "incidents",
  {
    id: id(),
    number: integer().generatedAlwaysAsIdentity().notNull().unique(),
    alertId: uuid()
      .notNull()
      .unique()
      .references(() => alerts.id),
    title: text().notNull(),
    severity: severity().notNull(),
    status: incidentStatus().notNull().default("open"),
    responsibleInstitutionId: uuid().references(() => institutions.id),
    openedByUserId: text().notNull(),
    openedByOrgId: text().notNull(),
    openedAt: ts().notNull().defaultNow(),
    closedAt: ts(),
    closureSummary: text(),
    isSensitive: boolean().notNull().default(false),
    version: integer().notNull().default(1),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index().on(t.status, t.openedAt),
    index().on(t.responsibleInstitutionId),
    check(
      "incidents_closure_has_summary",
      sql`${t.status} <> 'closed' OR (${t.closedAt} IS NOT NULL AND ${t.closureSummary} IS NOT NULL)`,
    ),
  ],
);

// Assignment history: which institution was asked to act, by whom, and when.
export const incidentAssignments = pgTable(
  "incident_assignments",
  {
    id: id(),
    incidentId: uuid()
      .notNull()
      .references(() => incidents.id),
    institutionId: uuid()
      .notNull()
      .references(() => institutions.id),
    instructions: text(),
    dueAt: ts(),
    assignedByUserId: text().notNull(),
    assignedByOrgId: text().notNull(),
    assignedAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.incidentId, t.assignedAt)],
);

// What was done, including a recorded decision not to act (MEL: response speed).
export const incidentActions = pgTable(
  "incident_actions",
  {
    id: id(),
    incidentId: uuid()
      .notNull()
      .references(() => incidents.id),
    kind: incidentActionKind().notNull(),
    description: text().notNull(),
    takenAt: ts().notNull(),
    recordedByUserId: text().notNull(),
    recordedByOrgId: text().notNull(),
    recordedAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.incidentId, t.takenAt)],
);
