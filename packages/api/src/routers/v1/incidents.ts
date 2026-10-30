import type { Database } from "@ecolens/db";
import {
  alerts,
  auditEvents,
  incidentActions,
  incidentAssignments,
  incidents,
  institutions,
  sites,
} from "@ecolens/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, asc, count, desc, eq, exists, inArray, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";

import { hasPermission } from "../../auth/roles";
import { type Actor, authorizedProcedure } from "../../index";
import { institutionNames, mutation } from "./shared";

// Escalate (brief section 4): a confirmed alert becomes an incident led by a
// responsible institution, which assigns action, records what was done (or a
// decision not to act) and closes it with a summary. Only a confirmed alert
// can be escalated, so no incident exists without human validation
// (principle 1). Every change is versioned and audited (principle 5), and
// writes are idempotent on `clientMutationId` like the alert workflow.

const STATUSES = ["open", "assigned", "in_progress", "action_recorded", "closed"] as const;
type Status = (typeof STATUSES)[number];
const SEVERITIES = ["low", "medium", "high"] as const;
const ACTION_KINDS = [
  "site_inspection",
  "sampling",
  "enforcement_notice",
  "suspension",
  "arrest_or_seizure",
  "remediation",
  "public_notice",
  "referral",
  "decision_not_to_act",
  "other",
] as const;

// Institutions that can lead or act on an incident (not the platform team,
// steering group, researchers, communities or data providers).
const RESPONDING_KINDS = [
  "epa",
  "minerals_commission",
  "water_resources_commission",
  "regional_council",
  "district_assembly",
] as const;

const OPEN: readonly Status[] = ["open", "assigned", "in_progress", "action_recorded"];
const reason = (min = 10) =>
  z.string().trim().min(min, `Give at least ${min} characters.`).max(4000);
const severityRank = sql`case ${incidents.severity} when 'high' then 3 when 'medium' then 2 else 1 end`;

async function institutionOf(db: Pick<Database, "select">, orgId: string) {
  const [row] = await db
    .select({ id: institutions.id })
    .from(institutions)
    .where(eq(institutions.clerkOrgId, orgId));
  return row?.id ?? null;
}

// Responders work on their own institution's cases only (least privilege,
// principle 6): the incidents it leads or has been assigned.
function involves(institutionId: string | null): SQL {
  if (!institutionId) return sql`false`;
  return or(
    eq(incidents.responsibleInstitutionId, institutionId),
    exists(
      sql`(select 1 from ${incidentAssignments} where ${incidentAssignments.incidentId} = ${incidents.id} and ${incidentAssignments.institutionId} = ${institutionId})`,
    ),
  ) as SQL;
}

async function visibleTo(db: Pick<Database, "select">, actor: Actor) {
  return and(
    hasPermission(actor.role, "sensitive_location:read")
      ? undefined
      : eq(incidents.isSensitive, false),
    actor.role === "responder" ? involves(await institutionOf(db, actor.orgId)) : undefined,
  );
}

export const incidentsRouter = {
  // The incident register.
  list: authorizedProcedure("incident:read")
    .input(
      z.object({
        status: z.array(z.enum(STATUSES)).optional(),
        severity: z.enum(SEVERITIES).optional(),
        institutionId: z.uuid().optional(),
        sort: z.enum(["newest", "oldest", "severity", "updated"]).default("updated"),
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(100).default(50),
      }),
    )
    .handler(async ({ input, context: { db, actor } }) => {
      const base = await visibleTo(db, actor);
      const filters = and(
        base,
        input.status?.length ? inArray(incidents.status, input.status) : undefined,
        input.severity ? eq(incidents.severity, input.severity) : undefined,
        input.institutionId ? involves(input.institutionId) : undefined,
      );
      const order =
        input.sort === "oldest"
          ? [asc(incidents.openedAt)]
          : input.sort === "newest"
            ? [desc(incidents.openedAt)]
            : input.sort === "severity"
              ? [desc(severityRank), desc(incidents.updatedAt)]
              : [desc(incidents.updatedAt)];

      const [rows, totals, byStatus] = await Promise.all([
        db
          .select({
            id: incidents.id,
            number: incidents.number,
            title: incidents.title,
            severity: incidents.severity,
            status: incidents.status,
            openedAt: incidents.openedAt,
            updatedAt: incidents.updatedAt,
            closedAt: incidents.closedAt,
            responsible: institutions.shortName,
            alertNumber: alerts.number,
            lens: alerts.lens,
            isSimulated: alerts.isSimulated,
            siteName: sites.name,
            basin: sites.basin,
          })
          .from(incidents)
          .innerJoin(alerts, eq(alerts.id, incidents.alertId))
          .leftJoin(sites, eq(sites.id, alerts.siteId))
          .leftJoin(institutions, eq(institutions.id, incidents.responsibleInstitutionId))
          .where(filters)
          .orderBy(...order)
          .limit(input.pageSize + 1)
          .offset(input.page * input.pageSize),
        db.select({ n: count() }).from(incidents).where(filters),
        db
          .select({ status: incidents.status, n: count() })
          .from(incidents)
          .where(base)
          .groupBy(incidents.status),
      ]);

      const items = rows.slice(0, input.pageSize);
      // The latest due date per incident, to show what is overdue.
      const due = items.length
        ? await db
            .selectDistinctOn([incidentAssignments.incidentId], {
              incidentId: incidentAssignments.incidentId,
              dueAt: incidentAssignments.dueAt,
            })
            .from(incidentAssignments)
            .where(
              inArray(
                incidentAssignments.incidentId,
                items.map((i) => i.id),
              ),
            )
            .orderBy(incidentAssignments.incidentId, desc(incidentAssignments.assignedAt))
        : [];

      return {
        items: items.map((r) => ({
          ...r,
          openedAt: r.openedAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          closedAt: r.closedAt?.toISOString() ?? null,
          dueAt: due.find((d) => d.incidentId === r.id)?.dueAt?.toISOString() ?? null,
        })),
        hasMore: rows.length > input.pageSize,
        total: totals[0]?.n ?? 0,
        counts: Object.fromEntries(
          STATUSES.map((s) => [s, byStatus.find((b) => b.status === s)?.n ?? 0]),
        ) as Record<Status, number>,
      };
    }),

  // One incident with its alert, assignments, actions and audit trail.
  get: authorizedProcedure("incident:read")
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ input, context: { db, actor } }) => {
      const [visible] = await db
        .select({ id: incidents.id })
        .from(incidents)
        .where(and(eq(incidents.id, input.id), await visibleTo(db, actor)));
      // Missing and withheld look the same.
      if (!visible) throw new ORPCError("NOT_FOUND", { message: "Incident not found." });

      const incident = await db.query.incidents.findFirst({
        where: { id: input.id },
        with: {
          alert: {
            columns: {
              id: true,
              number: true,
              title: true,
              summary: true,
              lens: true,
              confidence: true,
              status: true,
              limitations: true,
              firstObservedAt: true,
              detectedAt: true,
              validatedAt: true,
              isSimulated: true,
            },
            with: { site: { columns: { name: true, basin: true, district: true } } },
          },
          responsibleInstitution: { columns: { id: true, name: true, shortName: true } },
          assignments: {
            orderBy: { assignedAt: "asc" },
            columns: {
              id: true,
              instructions: true,
              dueAt: true,
              assignedByOrgId: true,
              assignedAt: true,
            },
            with: { institution: { columns: { id: true, name: true, shortName: true } } },
          },
          actions: {
            orderBy: { takenAt: "asc" },
            columns: {
              id: true,
              kind: true,
              description: true,
              takenAt: true,
              recordedByOrgId: true,
              recordedAt: true,
            },
          },
        },
      });
      if (!incident) throw new ORPCError("NOT_FOUND", { message: "Incident not found." });

      const history = hasPermission(actor.role, "audit:read")
        ? await db
            .select({
              id: auditEvents.id,
              occurredAt: auditEvents.occurredAt,
              action: auditEvents.action,
              actorOrgId: auditEvents.actorOrgId,
              actorRole: auditEvents.actorRole,
              fromStatus: auditEvents.fromStatus,
              toStatus: auditEvents.toStatus,
              reason: auditEvents.reason,
            })
            .from(auditEvents)
            .where(
              and(eq(auditEvents.entityType, "incident"), eq(auditEvents.entityId, incident.id)),
            )
            .orderBy(asc(auditEvents.occurredAt))
        : null;

      const names = await institutionNames(db, [
        incident.openedByOrgId,
        ...incident.assignments.map((a) => a.assignedByOrgId),
        ...incident.actions.map((a) => a.recordedByOrgId),
        ...(history ?? []).map((h) => h.actorOrgId),
      ]);
      const institution = (orgId: string) => names.get(orgId) ?? null;

      const mine = await institutionOf(db, actor.orgId);
      const involved =
        actor.role === "admin" ||
        (!!mine &&
          (incident.responsibleInstitution?.id === mine ||
            incident.assignments.some((a) => a.institution.id === mine)));
      const open = OPEN.includes(incident.status);

      const { openedByUserId: _u, openedByOrgId, assignments, actions, ...rest } = incident;
      return {
        ...rest,
        openedBy: institution(openedByOrgId),
        assignments: assignments.map(({ assignedByOrgId, ...a }) => ({
          ...a,
          assignedBy: institution(assignedByOrgId),
        })),
        actions: actions.map(({ recordedByOrgId, ...a }) => ({
          ...a,
          recordedBy: institution(recordedByOrgId),
        })),
        history:
          history?.map(({ actorOrgId, ...h }) => ({
            ...h,
            institution: institution(actorOrgId),
          })) ?? null,
        canAssign: hasPermission(actor.role, "incident:assign") && open,
        canAcknowledge:
          hasPermission(actor.role, "incident:act") && involved && incident.status === "assigned",
        canAct:
          hasPermission(actor.role, "incident:act") &&
          involved &&
          ["assigned", "in_progress", "action_recorded"].includes(incident.status),
        canClose:
          hasPermission(actor.role, "incident:close") && incident.status === "action_recorded",
      };
    }),

  // Institutions an incident can be led by or assigned to.
  institutions: authorizedProcedure("incident:read").handler(async ({ context: { db } }) =>
    db
      .select({ id: institutions.id, name: institutions.name, shortName: institutions.shortName })
      .from(institutions)
      .where(inArray(institutions.kind, [...RESPONDING_KINDS]))
      .orderBy(asc(institutions.name)),
  ),

  // Open an incident from a confirmed alert. The device-generated mutation id
  // becomes the incident id, so the client can show it before it syncs.
  escalate: authorizedProcedure("incident:escalate")
    .input(
      z.object({
        alertId: z.uuid(),
        title: z.string().trim().min(5).max(200),
        severity: z.enum(SEVERITIES),
        responsibleInstitutionId: z.uuid(),
        reason: reason(),
        ...mutation,
      }),
    )
    .handler(({ input, context: { db, actor } }) =>
      db.transaction(async (tx) => {
        const [alert] = await tx
          .select({ status: alerts.status, isSensitive: alerts.isSensitive })
          .from(alerts)
          .where(eq(alerts.id, input.alertId))
          .for("update");
        if (
          !alert ||
          (alert.isSensitive && !hasPermission(actor.role, "sensitive_location:read"))
        ) {
          throw new ORPCError("NOT_FOUND", { message: "Alert not found." });
        }

        const [existing] = await tx
          .select({ id: incidents.id, number: incidents.number, version: incidents.version })
          .from(incidents)
          .where(eq(incidents.alertId, input.alertId));
        if (existing?.id === input.clientMutationId) {
          return {
            id: existing.id,
            number: existing.number,
            version: existing.version,
            replayed: true,
          };
        }
        if (existing) {
          throw new ORPCError("CONFLICT", {
            message: `This alert was already escalated as INC-${String(existing.number).padStart(4, "0")}.`,
            data: { incidentId: existing.id },
          });
        }
        if (alert.status !== "confirmed") {
          throw new ORPCError("CONFLICT", {
            message: `Only a confirmed alert can be escalated; this one is "${alert.status.replace("_", " ")}".`,
          });
        }

        const [lead] = await tx
          .select({ shortName: institutions.shortName, kind: institutions.kind })
          .from(institutions)
          .where(eq(institutions.id, input.responsibleInstitutionId));
        if (!lead || !(RESPONDING_KINDS as readonly string[]).includes(lead.kind)) {
          throw new ORPCError("BAD_REQUEST", {
            message: "Choose an institution that can respond.",
          });
        }

        const now = new Date();
        const [created] = await tx
          .insert(incidents)
          .values({
            id: input.clientMutationId,
            alertId: input.alertId,
            title: input.title,
            severity: input.severity,
            status: "open",
            responsibleInstitutionId: input.responsibleInstitutionId,
            openedByUserId: actor.userId,
            openedByOrgId: actor.orgId,
            openedAt: now,
            isSensitive: alert.isSensitive,
            updatedAt: now,
          })
          .returning({ id: incidents.id, number: incidents.number });
        if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR");

        await tx.insert(auditEvents).values({
          occurredAt: now,
          actorUserId: actor.userId,
          actorOrgId: actor.orgId,
          actorRole: actor.role,
          action: "incident.open",
          entityType: "incident",
          entityId: created.id,
          fromStatus: null,
          toStatus: "open",
          reason: input.reason,
          entityVersion: 1,
          clientMutationId: input.clientMutationId,
          data: { alertId: input.alertId, responsible: lead.shortName, severity: input.severity },
        });
        return { id: created.id, number: created.number, version: 1, replayed: false };
      }),
    ),

  // Ask an institution to act, with instructions and an optional due date.
  assign: authorizedProcedure("incident:assign")
    .input(
      z.object({
        incidentId: z.uuid(),
        expectedVersion: z.number().int(),
        institutionId: z.uuid(),
        instructions: reason(),
        dueAt: z.iso.datetime({ offset: true }).optional(),
        ...mutation,
      }),
    )
    .handler(({ input, context: { db, actor } }) =>
      transition(db, actor, input, {
        from: OPEN,
        to: "assigned",
        action: "incident.assign",
        reason: input.instructions,
        async apply(tx, now) {
          const [to] = await tx
            .select({ shortName: institutions.shortName, kind: institutions.kind })
            .from(institutions)
            .where(eq(institutions.id, input.institutionId));
          if (!to || !(RESPONDING_KINDS as readonly string[]).includes(to.kind)) {
            throw new ORPCError("BAD_REQUEST", {
              message: "Choose an institution that can respond.",
            });
          }
          await tx.insert(incidentAssignments).values({
            id: input.clientMutationId,
            incidentId: input.incidentId,
            institutionId: input.institutionId,
            instructions: input.instructions,
            dueAt: input.dueAt ? new Date(input.dueAt) : null,
            assignedByUserId: actor.userId,
            assignedByOrgId: actor.orgId,
            assignedAt: now,
          });
          return { data: { institution: to.shortName, dueAt: input.dueAt ?? null } };
        },
      }),
    ),

  // The assigned institution confirms it has received the case.
  acknowledge: authorizedProcedure("incident:act")
    .input(z.object({ incidentId: z.uuid(), expectedVersion: z.number().int(), ...mutation }))
    .handler(({ input, context: { db, actor } }) =>
      transition(db, actor, input, {
        from: ["assigned"],
        to: "in_progress",
        action: "incident.acknowledge",
        reason: null,
        involvedOnly: true,
      }),
    ),

  // What was done, or a recorded decision not to act (MEL: response speed).
  recordAction: authorizedProcedure("incident:act")
    .input(
      z.object({
        incidentId: z.uuid(),
        expectedVersion: z.number().int(),
        kind: z.enum(ACTION_KINDS),
        description: reason(),
        takenAt: z.iso.datetime({ offset: true }),
        ...mutation,
      }),
    )
    .handler(({ input, context: { db, actor } }) =>
      transition(db, actor, input, {
        from: ["assigned", "in_progress", "action_recorded"],
        to: "action_recorded",
        action: "incident.record_action",
        reason: input.description,
        involvedOnly: true,
        async apply(tx, now) {
          const takenAt = new Date(input.takenAt);
          // A little leeway for device clocks.
          if (takenAt.getTime() > now.getTime() + 10 * 60_000) {
            throw new ORPCError("BAD_REQUEST", { message: "The action date is in the future." });
          }
          await tx.insert(incidentActions).values({
            id: input.clientMutationId,
            incidentId: input.incidentId,
            kind: input.kind,
            description: input.description,
            takenAt,
            recordedByUserId: actor.userId,
            recordedByOrgId: actor.orgId,
            recordedAt: now,
          });
          return { data: { kind: input.kind } };
        },
      }),
    ),

  // Close with a summary of the outcome. Needs at least one recorded action
  // (which may be a decision not to act), so every closed case has a response.
  close: authorizedProcedure("incident:close")
    .input(
      z.object({
        incidentId: z.uuid(),
        expectedVersion: z.number().int(),
        summary: reason(),
        ...mutation,
      }),
    )
    .handler(({ input, context: { db, actor } }) =>
      transition(db, actor, input, {
        from: ["action_recorded"],
        to: "closed",
        action: "incident.close",
        reason: input.summary,
        apply: async (_tx, now) => ({ set: { closedAt: now, closureSummary: input.summary } }),
      }),
    ),
};

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

type Change = {
  from: readonly Status[];
  to: Status;
  action: string;
  reason: string | null;
  /** Only the lead or an assigned institution may make this change. */
  involvedOnly?: boolean;
  apply?: (
    tx: Tx,
    now: Date,
  ) => Promise<{ set?: Partial<typeof incidents.$inferInsert>; data?: Record<string, unknown> }>;
};

// One audited, versioned status change, serialised by a row lock.
async function transition(
  db: Database,
  actor: Actor,
  input: { incidentId: string; expectedVersion: number; clientMutationId: string },
  change: Change,
) {
  return db.transaction(async (tx) => {
    const [replayed] = await tx
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.clientMutationId, input.clientMutationId));

    const [incident] = await tx
      .select({
        status: incidents.status,
        version: incidents.version,
        isSensitive: incidents.isSensitive,
        responsibleInstitutionId: incidents.responsibleInstitutionId,
      })
      .from(incidents)
      .where(and(eq(incidents.id, input.incidentId), await visibleTo(tx, actor)))
      .for("update");
    if (!incident) throw new ORPCError("NOT_FOUND", { message: "Incident not found." });
    if (replayed) return { status: incident.status, version: incident.version, replayed: true };

    if (change.involvedOnly && actor.role !== "admin") {
      const mine = await institutionOf(tx, actor.orgId);
      const [assigned] = mine
        ? await tx
            .select({ id: incidentAssignments.id })
            .from(incidentAssignments)
            .where(
              and(
                eq(incidentAssignments.incidentId, input.incidentId),
                eq(incidentAssignments.institutionId, mine),
              ),
            )
            .limit(1)
        : [];
      if (!mine || (incident.responsibleInstitutionId !== mine && !assigned)) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only the lead institution or one assigned to this incident can do this.",
        });
      }
    }

    const current = incident.status.replaceAll("_", " ");
    if (incident.version === input.expectedVersion && !change.from.includes(incident.status)) {
      throw new ORPCError("CONFLICT", {
        message: `This can't be done while the incident is "${current}".`,
        data: { status: incident.status, version: incident.version },
      });
    }
    if (incident.version !== input.expectedVersion) {
      const [latest] = await tx
        .select({ actorOrgId: auditEvents.actorOrgId, occurredAt: auditEvents.occurredAt })
        .from(auditEvents)
        .where(
          and(eq(auditEvents.entityType, "incident"), eq(auditEvents.entityId, input.incidentId)),
        )
        .orderBy(desc(auditEvents.occurredAt))
        .limit(1);
      const by = latest
        ? (await institutionNames(tx, [latest.actorOrgId])).get(latest.actorOrgId)
        : null;
      throw new ORPCError("CONFLICT", {
        message: `This incident changed before your update arrived: it is now "${current}"${
          by ? `, updated by ${by}` : ""
        }. Review it again before continuing.`,
        data: { status: incident.status, version: incident.version },
      });
    }

    const now = new Date();
    const version = incident.version + 1;
    const extra = (await change.apply?.(tx, now)) ?? {};
    await tx
      .update(incidents)
      .set({ ...extra.set, status: change.to, version, updatedAt: now })
      .where(eq(incidents.id, input.incidentId));

    await tx.insert(auditEvents).values({
      occurredAt: now,
      actorUserId: actor.userId,
      actorOrgId: actor.orgId,
      actorRole: actor.role,
      action: change.action,
      entityType: "incident",
      entityId: input.incidentId,
      fromStatus: incident.status,
      toStatus: change.to,
      reason: change.reason,
      entityVersion: version,
      clientMutationId: input.clientMutationId,
      data: extra.data ?? null,
    });

    return { status: change.to, version, replayed: false };
  });
}
