import type { Database } from "@ecolens/db";
import {
  alerts,
  auditEvents,
  institutions,
  sites,
  validations,
} from "@ecolens/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, asc, count, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { z } from "zod";

import { hasPermission } from "../../auth/roles";
import { type Actor, authorizedProcedure } from "../../index";

// Interpret and Validate (brief section 4). The queue lists alerts with their
// review state; the detail carries the full evidence trail; a validation is a
// human decision with a required reason (principle 1), recorded in the
// append-only audit trail (principle 5). Writes are idempotent on
// `clientMutationId` and checked against the alert's version, so a decision
// replayed from an offline device never overwrites someone else's.

const STATUSES = ["new", "in_review", "confirmed", "rejected", "unresolved"] as const;
type Status = (typeof STATUSES)[number];
const LENSES = ["water", "forest_land", "air"] as const;
const CONFIDENCES = ["low", "medium", "high"] as const;

// Statuses a decision can still be made from. Confirmed and rejected are final;
// an unresolved alert can be decided later when more evidence arrives.
const DECIDABLE: readonly Status[] = ["new", "in_review", "unresolved"];

const confidenceRank = sql`case ${alerts.confidence} when 'high' then 3 when 'medium' then 2 else 1 end`;

function visibleTo(actor: Actor): SQL | undefined {
  return hasPermission(actor.role, "sensitive_location:read")
    ? undefined
    : eq(alerts.isSensitive, false);
}

// Decisions record the Clerk organization; show the institution's name.
async function institutionNames(db: Pick<Database, "select">, orgIds: string[]) {
  if (orgIds.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ clerkOrgId: institutions.clerkOrgId, name: institutions.name })
    .from(institutions)
    .where(inArray(institutions.clerkOrgId, [...new Set(orgIds)]));
  return new Map(rows.map((r) => [r.clerkOrgId ?? "", r.name]));
}

const mutation = { clientMutationId: z.uuid() };

export const alertsRouter = {
  // The alert queue.
  list: authorizedProcedure("alert:read")
    .input(
      z.object({
        status: z.array(z.enum(STATUSES)).optional(),
        lens: z.enum(LENSES).optional(),
        confidence: z.enum(CONFIDENCES).optional(),
        basin: z.string().max(80).optional(),
        sort: z.enum(["newest", "oldest", "confidence"]).default("newest"),
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(100).default(50),
      }),
    )
    .handler(async ({ input, context: { db, actor } }) => {
      const base = visibleTo(actor);
      const filters = and(
        base,
        input.status?.length ? inArray(alerts.status, input.status) : undefined,
        input.lens ? eq(alerts.lens, input.lens) : undefined,
        input.confidence ? eq(alerts.confidence, input.confidence) : undefined,
        input.basin ? eq(sites.basin, input.basin) : undefined,
      );
      const order =
        input.sort === "oldest"
          ? [asc(alerts.detectedAt)]
          : input.sort === "confidence"
            ? [desc(confidenceRank), desc(alerts.detectedAt)]
            : [desc(alerts.detectedAt)];

      const [rows, totals, byStatus, basins] = await Promise.all([
        db
          .select({
            id: alerts.id,
            number: alerts.number,
            lens: alerts.lens,
            indicator: alerts.indicator,
            title: alerts.title,
            confidence: alerts.confidence,
            status: alerts.status,
            firstObservedAt: alerts.firstObservedAt,
            detectedAt: alerts.detectedAt,
            validatedAt: alerts.validatedAt,
            isSimulated: alerts.isSimulated,
            siteName: sites.name,
            basin: sites.basin,
          })
          .from(alerts)
          .leftJoin(sites, eq(sites.id, alerts.siteId))
          .where(filters)
          .orderBy(...order)
          .limit(input.pageSize + 1)
          .offset(input.page * input.pageSize),
        db
          .select({ n: count() })
          .from(alerts)
          .leftJoin(sites, eq(sites.id, alerts.siteId))
          .where(filters),
        db.select({ status: alerts.status, n: count() }).from(alerts).where(base).groupBy(alerts.status),
        db
          .selectDistinct({ basin: sites.basin })
          .from(alerts)
          .innerJoin(sites, eq(sites.id, alerts.siteId))
          .where(base),
      ]);

      return {
        items: rows.slice(0, input.pageSize).map((r) => ({
          ...r,
          firstObservedAt: r.firstObservedAt.toISOString(),
          detectedAt: r.detectedAt.toISOString(),
          validatedAt: r.validatedAt?.toISOString() ?? null,
        })),
        hasMore: rows.length > input.pageSize,
        total: totals[0]?.n ?? 0,
        counts: Object.fromEntries(
          STATUSES.map((s) => [s, byStatus.find((b) => b.status === s)?.n ?? 0]),
        ) as Record<Status, number>,
        basins: basins.flatMap((b) => (b.basin ? [b.basin] : [])).sort(),
      };
    }),

  // One alert with everything it rests on.
  get: authorizedProcedure("alert:read")
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ input, context: { db, actor } }) => {
      const alert = await db.query.alerts.findFirst({
        where: hasPermission(actor.role, "sensitive_location:read")
          ? { id: input.id }
          : { id: input.id, isSensitive: false },
        with: {
          site: { columns: { name: true, basin: true, district: true, isSimulated: true } },
          rule: {
            columns: {
              key: true,
              name: true,
              version: true,
              description: true,
              params: true,
              reviewedAt: true,
            },
          },
          evidence: {
            orderBy: { addedAt: "asc" },
            columns: { id: true, kind: true, caption: true, addedAt: true },
            with: {
              observation: {
                columns: {
                  indicator: true,
                  value: true,
                  unit: true,
                  observedAt: true,
                  confidence: true,
                  qualityNote: true,
                  isSimulated: true,
                },
                with: {
                  source: {
                    columns: { key: true, name: true, kind: true, mode: true, knownLimitations: true },
                    with: { steward: { columns: { name: true } } },
                  },
                },
              },
              fieldReport: {
                columns: {
                  observation: true,
                  assessment: true,
                  activityTypes: true,
                  gpsAccuracyM: true,
                  clientCreatedAt: true,
                  authorOrgId: true,
                  isSimulated: true,
                },
              },
            },
          },
          validations: {
            orderBy: { decidedAt: "desc" },
            columns: {
              id: true,
              outcome: true,
              rationale: true,
              confidence: true,
              decidedByOrgId: true,
              decidedByRole: true,
              decidedAt: true,
            },
          },
          incident: { columns: { id: true, number: true, status: true } },
        },
      });
      // Missing and withheld look the same, so a sensitive alert's existence isn't revealed.
      if (!alert) throw new ORPCError("NOT_FOUND", { message: "Alert not found." });

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
            .where(and(eq(auditEvents.entityType, "alert"), eq(auditEvents.entityId, alert.id)))
            .orderBy(asc(auditEvents.occurredAt))
        : null;

      const names = await institutionNames(db, [
        ...alert.validations.map((v) => v.decidedByOrgId),
        ...alert.evidence.flatMap((e) => (e.fieldReport ? [e.fieldReport.authorOrgId] : [])),
        ...(history ?? []).map((h) => h.actorOrgId),
      ]);
      const institution = (orgId: string) => names.get(orgId) ?? null;

      const { validations: decided, evidence, location, ...rest } = alert;
      return {
        ...rest,
        location: location as unknown,
        evidence: evidence.map(({ fieldReport, ...e }) => ({
          ...e,
          fieldReport: fieldReport
            ? {
                ...fieldReport,
                authorOrgId: undefined,
                authorInstitution: institution(fieldReport.authorOrgId),
              }
            : null,
        })),
        validations: decided.map(({ decidedByOrgId, ...v }) => ({
          ...v,
          institution: institution(decidedByOrgId),
        })),
        history: history?.map(({ actorOrgId, ...h }) => ({ ...h, institution: institution(actorOrgId) })) ?? null,
        canDecide: hasPermission(actor.role, "alert:validate") && DECIDABLE.includes(alert.status),
        canStartReview: hasPermission(actor.role, "alert:triage") && alert.status === "new",
      };
    }),

  // Mark an alert as being reviewed, so colleagues can see someone has it.
  startReview: authorizedProcedure("alert:triage")
    .input(z.object({ alertId: z.uuid(), expectedVersion: z.number().int(), ...mutation }))
    .handler(({ input, context: { db, actor } }) =>
      transition(db, actor, {
        alertId: input.alertId,
        expectedVersion: input.expectedVersion,
        clientMutationId: input.clientMutationId,
        from: ["new"],
        to: "in_review",
        action: "alert.start_review",
        reason: null,
      }),
    ),

  // A human decision on an alert (principle 1). A reason is required.
  validate: authorizedProcedure("alert:validate")
    .input(
      z.object({
        alertId: z.uuid(),
        expectedVersion: z.number().int(),
        outcome: z.enum(["confirmed", "rejected", "unresolved"]),
        rationale: z.string().trim().min(10, "Give a reason of at least 10 characters.").max(4000),
        confidence: z.enum(CONFIDENCES),
        ...mutation,
      }),
    )
    .handler(({ input, context: { db, actor } }) =>
      transition(db, actor, {
        alertId: input.alertId,
        expectedVersion: input.expectedVersion,
        clientMutationId: input.clientMutationId,
        from: DECIDABLE,
        to: input.outcome,
        action: "alert.validate",
        reason: input.rationale,
        validation: { outcome: input.outcome, confidence: input.confidence },
      }),
    ),
};

type Transition = {
  alertId: string;
  expectedVersion: number;
  clientMutationId: string;
  from: readonly Status[];
  to: Status;
  action: string;
  reason: string | null;
  validation?: { outcome: "confirmed" | "rejected" | "unresolved"; confidence: (typeof CONFIDENCES)[number] };
};

// One audited, versioned status change. Runs in a transaction holding a row
// lock on the alert, so concurrent decisions are serialised.
async function transition(db: Database, actor: Actor, t: Transition) {
  return db.transaction(async (tx) => {
    // A replay of a write that already went through: report the current state.
    const [replayed] = await tx
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.clientMutationId, t.clientMutationId));

    const [alert] = await tx
      .select({
        status: alerts.status,
        version: alerts.version,
        isSensitive: alerts.isSensitive,
      })
      .from(alerts)
      .where(eq(alerts.id, t.alertId))
      .for("update");

    if (!alert || (alert.isSensitive && !hasPermission(actor.role, "sensitive_location:read"))) {
      throw new ORPCError("NOT_FOUND", { message: "Alert not found." });
    }
    if (replayed) return { status: alert.status, version: alert.version, replayed: true };

    if (!t.from.includes(alert.status) || alert.version !== t.expectedVersion) {
      const [latest] = await tx
        .select({
          action: auditEvents.action,
          toStatus: auditEvents.toStatus,
          actorRole: auditEvents.actorRole,
          actorOrgId: auditEvents.actorOrgId,
          occurredAt: auditEvents.occurredAt,
        })
        .from(auditEvents)
        .where(and(eq(auditEvents.entityType, "alert"), eq(auditEvents.entityId, t.alertId)))
        .orderBy(desc(auditEvents.occurredAt))
        .limit(1);
      const by = latest ? (await institutionNames(tx, [latest.actorOrgId])).get(latest.actorOrgId) : null;
      throw new ORPCError("CONFLICT", {
        message: `This alert changed before your update arrived: it is now "${alert.status.replace("_", " ")}"${
          by ? `, set by ${by}` : ""
        }. Review it again before deciding.`,
        data: { status: alert.status, version: alert.version, at: latest?.occurredAt.toISOString() ?? null },
      });
    }

    const now = new Date();
    const version = alert.version + 1;
    await tx
      .update(alerts)
      .set({
        status: t.to,
        version,
        updatedAt: now,
        ...(t.validation ? { validatedAt: now } : {}),
      })
      .where(eq(alerts.id, t.alertId));

    if (t.validation) {
      await tx.insert(validations).values({
        // The device-generated id, so the validation row is idempotent too.
        id: t.clientMutationId,
        alertId: t.alertId,
        outcome: t.validation.outcome,
        rationale: t.reason ?? "",
        confidence: t.validation.confidence,
        decidedByUserId: actor.userId,
        decidedByOrgId: actor.orgId,
        decidedByRole: actor.role,
        decidedAt: now,
      });
    }

    await tx.insert(auditEvents).values({
      occurredAt: now,
      actorUserId: actor.userId,
      actorOrgId: actor.orgId,
      actorRole: actor.role,
      action: t.action,
      entityType: "alert",
      entityId: t.alertId,
      fromStatus: alert.status,
      toStatus: t.to,
      reason: t.reason,
      entityVersion: version,
      clientMutationId: t.clientMutationId,
      data: t.validation ? { confidence: t.validation.confidence } : null,
    });

    return { status: t.to, version, replayed: false };
  });
}
