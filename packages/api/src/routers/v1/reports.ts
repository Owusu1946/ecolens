import type { Database } from "@ecolens/db";
import { alerts, auditEvents, incidents, reports } from "@ecolens/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { z } from "zod";

import { hasPermission, ROLE_LABELS, type Role } from "../../auth/roles";
import type { Context } from "../../context";
import { type Actor, authorizedProcedure } from "../../index";
import { type ReportSnapshot, renderReport } from "../../reports/template";
import { institutionNames, mutation } from "./shared";

// Report (brief section 4): the one-page assessment record of use case 5 —
// evidence, confidence, validation status, responsible institution and action
// taken. A report freezes the record as it stands when generated; the HTML and
// PDF are archived in R2 and never regenerated. Publishing approves a report
// for circulation to partner institutions; nothing is published publicly
// until publication rules are agreed (brief section 12).

const ref = (prefix: "ALT" | "INC", n: number) => `${prefix}-${String(n).padStart(4, "0")}`;
const hoursBetween = (a: Date | null | undefined, b: Date | null | undefined) =>
  a && b ? (b.getTime() - a.getTime()) / 3_600_000 : null;
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

function visibleTo(actor: Actor): SQL | undefined {
  return hasPermission(actor.role, "sensitive_location:read")
    ? undefined
    : eq(reports.isSensitive, false);
}

async function buildSnapshot(
  db: Database,
  actor: Actor,
  target: { alertId: string; incidentId: string | null },
  generatedAt: Date,
): Promise<ReportSnapshot> {
  const alert = await db.query.alerts.findFirst({
    where: { id: target.alertId },
    with: {
      site: { columns: { name: true, basin: true, district: true } },
      rule: { columns: { name: true, version: true, description: true } },
      evidence: {
        orderBy: { addedAt: "asc" },
        with: {
          observation: {
            with: {
              source: {
                columns: { name: true, mode: true, knownLimitations: true },
                with: { steward: { columns: { name: true } } },
              },
            },
          },
          fieldReport: { with: { photos: { columns: { id: true } } } },
        },
      },
      validations: { orderBy: { decidedAt: "desc" } },
    },
  });
  if (!alert) throw new ORPCError("NOT_FOUND", { message: "Alert not found." });

  const incident = target.incidentId
    ? await db.query.incidents.findFirst({
        where: { id: target.incidentId },
        with: {
          responsibleInstitution: { columns: { name: true } },
          assignments: {
            orderBy: { assignedAt: "asc" },
            with: { institution: { columns: { name: true } } },
          },
          actions: { orderBy: { takenAt: "asc" } },
        },
      })
    : null;

  const names = await institutionNames(db, [
    actor.orgId,
    ...alert.validations.map((v) => v.decidedByOrgId),
    ...alert.evidence.flatMap((e) => (e.fieldReport ? [e.fieldReport.authorOrgId] : [])),
    ...(incident
      ? [incident.openedByOrgId, ...incident.actions.map((x) => x.recordedByOrgId)]
      : []),
  ]);
  const name = (orgId: string) => names.get(orgId) ?? null;
  const roleLabel = (r: string) => ROLE_LABELS[r as Role] ?? r;

  const firstAction = incident?.actions[0]?.takenAt;
  const place = [
    alert.site?.name,
    alert.site?.basin && `${alert.site.basin} basin`,
    alert.site?.district,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    version: 1,
    kind: incident ? "incident_assessment" : "alert_summary",
    ref: incident ? ref("INC", incident.number) : ref("ALT", alert.number),
    title: incident?.title ?? alert.title,
    generatedAt: generatedAt.toISOString(),
    generatedBy: { institution: name(actor.orgId), role: roleLabel(actor.role) },
    isSimulated: alert.isSimulated,
    isSensitive: alert.isSensitive,
    alert: {
      ref: ref("ALT", alert.number),
      title: alert.title,
      summary: alert.summary,
      lens: alert.lens,
      indicator: alert.indicator,
      confidence: alert.confidence,
      status: alert.status,
      firstObservedAt: alert.firstObservedAt.toISOString(),
      detectedAt: alert.detectedAt.toISOString(),
      validatedAt: iso(alert.validatedAt),
      coverage: alert.coverage,
      limitations: alert.limitations,
      place: place || null,
      rule: alert.rule,
      geometry: alert.location as ReportSnapshot["alert"]["geometry"],
    },
    evidence: alert.evidence.flatMap((e): ReportSnapshot["evidence"] => {
      const o = e.observation;
      if (o) {
        return [
          {
            label: `${indicatorLabel(o.indicator, o.unit ?? "")}: ${o.value}${o.unit ? ` ${o.unit}` : ""}${e.caption ? ` — ${e.caption}` : ""}`,
            observedAt: o.observedAt.toISOString(),
            source: o.source.name,
            steward: o.source.steward?.name ?? null,
            mode: o.source.mode,
            confidence: o.confidence,
            limitations: o.source.knownLimitations,
          },
        ];
      }
      if (e.fieldReport) return [];
      return [
        {
          label: e.caption ?? e.kind.replaceAll("_", " "),
          // Imagery and documents carry their date in the caption.
          observedAt: null,
          source: null,
          steward: null,
          mode: null,
          confidence: null,
          limitations: null,
        },
      ];
    }),
    // Field reports without their coordinates or photos: the report may be
    // read by roles that are not cleared for exact field locations.
    fieldChecks: alert.evidence.flatMap((e) =>
      e.fieldReport
        ? [
            {
              institution: name(e.fieldReport.authorOrgId),
              recordedAt: e.fieldReport.clientCreatedAt.toISOString(),
              assessment: e.fieldReport.assessment,
              observation: e.fieldReport.observation,
              activities: e.fieldReport.activityTypes,
              photos: e.fieldReport.photos.length,
            },
          ]
        : [],
    ),
    decisions: alert.validations.map((v) => ({
      outcome: v.outcome,
      confidence: v.confidence,
      rationale: v.rationale,
      institution: name(v.decidedByOrgId),
      role: roleLabel(v.decidedByRole),
      decidedAt: v.decidedAt.toISOString(),
    })),
    incident: incident
      ? {
          ref: ref("INC", incident.number),
          title: incident.title,
          severity: incident.severity,
          status: incident.status,
          lead: incident.responsibleInstitution?.name ?? null,
          openedAt: incident.openedAt.toISOString(),
          openedBy: name(incident.openedByOrgId),
          assignments: incident.assignments.map((x) => ({
            institution: x.institution.name,
            instructions: x.instructions,
            assignedAt: x.assignedAt.toISOString(),
            dueAt: iso(x.dueAt),
          })),
          actions: incident.actions.map((x) => ({
            kind: x.kind,
            description: x.description,
            takenAt: x.takenAt.toISOString(),
            recordedBy: name(x.recordedByOrgId),
          })),
          closedAt: iso(incident.closedAt),
          closureSummary: incident.closureSummary,
        }
      : null,
    measures: {
      detectionLatencyH: hoursBetween(alert.firstObservedAt, alert.detectedAt),
      timeToValidationH: hoursBetween(alert.detectedAt, alert.validatedAt),
      timeToFirstActionH: hoursBetween(alert.validatedAt, firstAction),
    },
  };
}

// "turbidity_ntu" with unit "NTU (est.)" → "Turbidity".
function indicatorLabel(indicator: string, unit: string) {
  const words = indicator.split("_");
  if (words.length > 1 && unit.toLowerCase().startsWith(words.at(-1) ?? "")) words.pop();
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const htmlKey = (id: string) => `reports/${id}.html`;
const pdfKey = (id: string) => `reports/${id}.pdf`;

/** Render and archive the PDF; failures leave the report without one. */
async function makePdf(ctx: Context, id: string, html: string) {
  if (!ctx.renderPdf || !ctx.reports) return false;
  try {
    const pdf = await ctx.renderPdf(html);
    await ctx.reports.put(pdfKey(id), pdf, { httpMetadata: { contentType: "application/pdf" } });
    await ctx.db
      .update(reports)
      .set({ objectKey: pdfKey(id) })
      .where(eq(reports.id, id));
    return true;
  } catch (error) {
    console.error("report pdf", id, error);
    return false;
  }
}

async function findVisible(db: Database, actor: Actor, id: string) {
  const [row] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.id, id), visibleTo(actor)));
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Report not found." });
  return row;
}

export const reportsRouter = {
  list: authorizedProcedure("report:read")
    .input(
      z.object({
        incidentId: z.uuid().optional(),
        alertId: z.uuid().optional(),
        published: z.boolean().optional(),
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(100).default(50),
      }),
    )
    .handler(async ({ input, context: { db, actor } }) => {
      const filters = and(
        visibleTo(actor),
        input.incidentId ? eq(reports.incidentId, input.incidentId) : undefined,
        input.alertId ? eq(reports.alertId, input.alertId) : undefined,
        input.published === undefined ? undefined : eq(reports.isPublished, input.published),
      );
      const [rows, totals] = await Promise.all([
        db
          .select({
            id: reports.id,
            kind: reports.kind,
            title: reports.title,
            alertId: reports.alertId,
            incidentId: reports.incidentId,
            snapshot: reports.snapshot,
            generatedAt: reports.generatedAt,
            generatedByOrgId: reports.generatedByOrgId,
            isPublished: reports.isPublished,
            publishedAt: reports.publishedAt,
            objectKey: reports.objectKey,
            isSimulated: reports.isSimulated,
            isSensitive: reports.isSensitive,
          })
          .from(reports)
          .where(filters)
          .orderBy(desc(reports.generatedAt))
          .limit(input.pageSize + 1)
          .offset(input.page * input.pageSize),
        db.select({ n: count() }).from(reports).where(filters),
      ]);
      const items = rows.slice(0, input.pageSize);
      const names = await institutionNames(
        db,
        items.map((r) => r.generatedByOrgId),
      );
      return {
        items: items.map(({ snapshot, objectKey, generatedByOrgId, ...r }) => {
          const s = snapshot as ReportSnapshot | null;
          return {
            ...r,
            ref: s?.ref ?? null,
            status: s ? (s.incident?.status ?? s.alert.status) : null,
            generatedAt: r.generatedAt.toISOString(),
            publishedAt: iso(r.publishedAt),
            generatedBy: names.get(generatedByOrgId) ?? null,
            hasPdf: !!objectKey,
          };
        }),
        hasMore: rows.length > input.pageSize,
        total: totals[0]?.n ?? 0,
      };
    }),

  // A report with its archived HTML, exactly as filed.
  get: authorizedProcedure("report:read")
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ input, context }) => {
      const { db, actor } = context;
      const row = await findVisible(db, actor, input.id);
      const snapshot = row.snapshot as ReportSnapshot;
      const stored = row.htmlKey ? await context.reports?.get(row.htmlKey) : null;
      const html = stored
        ? new TextDecoder().decode(await stored.arrayBuffer())
        : renderReport(snapshot);
      const names = await institutionNames(db, [row.generatedByOrgId]);
      return {
        id: row.id,
        kind: row.kind,
        title: row.title,
        ref: snapshot.ref,
        alertId: row.alertId,
        incidentId: row.incidentId,
        generatedAt: row.generatedAt.toISOString(),
        generatedBy: names.get(row.generatedByOrgId) ?? null,
        isPublished: row.isPublished,
        publishedAt: iso(row.publishedAt),
        isSimulated: row.isSimulated,
        isSensitive: row.isSensitive,
        hasPdf: !!row.objectKey,
        canMakePdf: !!context.renderPdf,
        canPublish:
          hasPermission(actor.role, "report:publish") && !row.isPublished && !row.isSensitive,
        html,
      };
    }),

  // The archived PDF, made on first request if it wasn't at generation.
  pdf: authorizedProcedure("report:read")
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ input, context }) => {
      const row = await findVisible(context.db, context.actor, input.id);
      let key = row.objectKey;
      if (!key) {
        const stored = row.htmlKey ? await context.reports?.get(row.htmlKey) : null;
        const html = stored
          ? new TextDecoder().decode(await stored.arrayBuffer())
          : renderReport(row.snapshot as ReportSnapshot);
        if (!(await makePdf(context, row.id, html))) {
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "PDFs aren't available yet. Use Print to save the report as a PDF.",
          });
        }
        key = pdfKey(row.id);
      }
      const object = await context.reports?.get(key);
      if (!object) throw new ORPCError("NOT_FOUND", { message: "PDF not found." });
      const s = row.snapshot as ReportSnapshot;
      return new File([await object.arrayBuffer()], `${s.ref}-ecolens-report.pdf`, {
        type: "application/pdf",
      });
    }),

  // Freeze the current record into a report. The device id becomes the report id.
  generate: authorizedProcedure("report:generate")
    .input(
      z
        .object({ incidentId: z.uuid().optional(), alertId: z.uuid().optional(), ...mutation })
        .refine((v) => !!v.incidentId !== !!v.alertId, {
          message: "Choose either an incident or an alert.",
        }),
    )
    .handler(async ({ input, context }) => {
      const { db, actor } = context;
      const id = input.clientMutationId;
      const [existing] = await db
        .select({ id: reports.id })
        .from(reports)
        .where(eq(reports.id, id));
      if (existing) return { id, replayed: true };

      let target: { alertId: string; incidentId: string | null };
      if (input.incidentId) {
        const [inc] = await db
          .select({ alertId: incidents.alertId, isSensitive: incidents.isSensitive })
          .from(incidents)
          .where(eq(incidents.id, input.incidentId));
        if (!inc || (inc.isSensitive && !hasPermission(actor.role, "sensitive_location:read"))) {
          throw new ORPCError("NOT_FOUND", { message: "Incident not found." });
        }
        target = { alertId: inc.alertId, incidentId: input.incidentId };
      } else {
        const [al] = await db
          .select({ isSensitive: alerts.isSensitive })
          .from(alerts)
          .where(eq(alerts.id, input.alertId as string));
        if (!al || (al.isSensitive && !hasPermission(actor.role, "sensitive_location:read"))) {
          throw new ORPCError("NOT_FOUND", { message: "Alert not found." });
        }
        target = { alertId: input.alertId as string, incidentId: null };
      }

      const now = new Date();
      const snapshot = await buildSnapshot(db, actor, target, now);
      const html = renderReport(snapshot);
      if (context.reports) {
        await context.reports.put(
          htmlKey(id),
          new TextEncoder().encode(html).buffer as ArrayBuffer,
          {
            httpMetadata: { contentType: "text/html; charset=utf-8" },
          },
        );
      }

      await db.transaction(async (tx) => {
        await tx.insert(reports).values({
          id,
          kind: snapshot.kind,
          title: snapshot.title,
          alertId: target.alertId,
          incidentId: target.incidentId,
          snapshot,
          htmlKey: context.reports ? htmlKey(id) : null,
          generatedByUserId: actor.userId,
          generatedByOrgId: actor.orgId,
          generatedAt: now,
          isSensitive: snapshot.isSensitive,
          isSimulated: snapshot.isSimulated,
        });
        await tx.insert(auditEvents).values({
          occurredAt: now,
          actorUserId: actor.userId,
          actorOrgId: actor.orgId,
          actorRole: actor.role,
          action: "report.generate",
          entityType: "report",
          entityId: id,
          clientMutationId: id,
          data: { ref: snapshot.ref, kind: snapshot.kind },
        });
      });

      const pdf = await makePdf(context, id, html);
      return { id, replayed: false, pdf };
    }),

  // Approve a report for circulation to partner institutions. Not public.
  publish: authorizedProcedure("report:publish")
    .input(
      z.object({
        id: z.uuid(),
        note: z.string().trim().min(10, "Say why it can be circulated.").max(2000),
        ...mutation,
      }),
    )
    .handler(({ input, context: { db, actor } }) =>
      db.transaction(async (tx) => {
        const [replayed] = await tx
          .select({ id: auditEvents.id })
          .from(auditEvents)
          .where(eq(auditEvents.clientMutationId, input.clientMutationId));
        const row = await findVisible(tx as unknown as Database, actor, input.id);
        if (replayed) return { published: row.isPublished, replayed: true };
        if (row.isSensitive) {
          throw new ORPCError("FORBIDDEN", {
            message: "Reports on sensitive locations can't be approved for circulation.",
          });
        }
        if (row.isPublished) {
          throw new ORPCError("CONFLICT", { message: "This report has already been approved." });
        }
        const now = new Date();
        await tx
          .update(reports)
          .set({ isPublished: true, publishedByUserId: actor.userId, publishedAt: now })
          .where(eq(reports.id, input.id));
        await tx.insert(auditEvents).values({
          occurredAt: now,
          actorUserId: actor.userId,
          actorOrgId: actor.orgId,
          actorRole: actor.role,
          action: "report.publish",
          entityType: "report",
          entityId: input.id,
          reason: input.note,
          clientMutationId: input.clientMutationId,
        });
        return { published: true, replayed: false };
      }),
    ),
};
