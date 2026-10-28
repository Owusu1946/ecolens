import { bigint, index, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { pgTable } from "./table";

// Every status change (validate, escalate, assign, act, close, publish) is
// recorded with who, when and why (principle 5). Append-only: a database trigger
// rejects UPDATE and DELETE on this table.
export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    actorUserId: text().notNull(),
    actorOrgId: text().notNull(),
    actorRole: text().notNull(),
    // e.g. "alert.validate", "incident.assign"
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: uuid().notNull(),
    fromStatus: text(),
    toStatus: text(),
    reason: text(),
    entityVersion: bigint({ mode: "number" }),
    // Id generated on the device for each offline write; a replay with the same
    // id is recognised and not applied twice.
    clientMutationId: uuid().unique(),
    data: jsonb(),
  },
  (t) => [index().on(t.entityType, t.entityId, t.occurredAt), index().on(t.occurredAt)],
);
