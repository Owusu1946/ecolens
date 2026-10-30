import type { Database } from "@ecolens/db";
import { auditEvents, feedback, institutions } from "@ecolens/db/schema/index";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { hasPermission, ROLE_LABELS, type Role } from "../../auth/roles";
import { type Actor, authorizedProcedure, memberProcedure } from "../../index";
import { institutionNames } from "./shared";

// The role dashboards (brief section 11) and the pilot's success measures
// (brief section 9: earlier, trusted action). Each procedure is one widget, so
// every dashboard is composed of the same audited numbers. Counts include only
// what the caller may see; sensitive locations appear in aggregate at most.

type Row = Record<string, unknown>;
async function rows<T extends Row>(db: Database, query: ReturnType<typeof sql>) {
  const result = await db.execute(query);
  // One statement per call; node-postgres returns a single result.
  return ((Array.isArray(result) ? result[0]?.rows : result.rows) ?? []) as T[];
}
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const int = (v: unknown) => Number(v ?? 0);

const sensitiveClause = (actor: Actor, alias = "a") =>
  hasPermission(actor.role, "sensitive_location:read")
    ? sql``
    : sql.raw(`and not ${alias}.is_sensitive`);

async function institutionOf(db: Database, orgId: string) {
  const [row] = await db
    .select({ id: institutions.id, name: institutions.name })
    .from(institutions)
    .where(eq(institutions.clerkOrgId, orgId));
  return row ?? null;
}

const period = z.object({
  days: z.union([z.literal(30), z.literal(90), z.literal(365)]).nullable(),
});
const since = (days: number | null) =>
  days ? sql`now() - make_interval(days => ${days})` : sql`'-infinity'::timestamptz`;

export const dashboardRouter = {
  // Success measures. Medians, so one slow case doesn't hide the typical one.
  measures: authorizedProcedure("metrics:read")
    .input(period)
    .handler(async ({ input, context: { db } }) => {
      const from = since(input.days);
      const [alertsRow] = await rows(
        db,
        sql`select
          count(*) as flagged,
          percentile_cont(0.5) within group (order by extract(epoch from detected_at - first_observed_at) / 3600) as detection_h,
          percentile_cont(0.5) within group (order by extract(epoch from validated_at - detected_at) / 3600)
            filter (where validated_at is not null) as validation_h,
          count(*) filter (where status = 'confirmed') as confirmed,
          count(*) filter (where status = 'rejected') as rejected,
          count(*) filter (where status = 'unresolved') as unresolved,
          count(*) filter (where status in ('new', 'in_review')) as pending,
          count(*) filter (where is_simulated) as simulated
        from alerts where detected_at >= ${from}`,
      );
      const [incidentsRow] = await rows(
        db,
        sql`select
          count(*) as opened,
          count(*) filter (where fa.first_action is not null) as with_action,
          count(*) filter (where i.status = 'closed') as closed,
          count(*) filter (where fa.not_to_act) as decided_not_to_act,
          percentile_cont(0.5) within group (order by extract(epoch from fa.first_action - a.validated_at) / 3600)
            filter (where fa.first_action is not null and a.validated_at is not null) as response_h
        from incidents i
        join alerts a on a.id = i.alert_id
        left join lateral (
          select min(taken_at) as first_action, bool_or(kind = 'decision_not_to_act') as not_to_act
          from incident_actions where incident_id = i.id
        ) fa on true
        where i.opened_at >= ${from}`,
      );
      const [coverageRow] = await rows(
        db,
        sql`select count(*) as sites,
          count(*) filter (where exists (
            select 1 from observations o where o.site_id = s.id and o.observed_at >= now() - interval '30 days'
          )) as covered
        from sites s`,
      );
      const [adoptionRow] = await rows(
        db,
        sql`select
          count(distinct actor_user_id) filter (where actor_user_id not like 'system:%') as active_users,
          count(*) filter (where actor_user_id not like 'system:%') as actions,
          count(*) filter (where action = 'field_report.submit') as field_reports,
          count(*) filter (where action = 'report.generate') as reports
        from audit_events where occurred_at >= greatest(${from}, now() - interval '365 days')`,
      );
      const [usefulRow] = await rows(
        db,
        sql`select count(*) as answers, count(*) filter (where useful) as useful
        from feedback where created_at >= ${from}`,
      );
      const monthly = await rows(
        db,
        sql`select to_char(date_trunc('month', detected_at), 'YYYY-MM') as month,
          count(*) as flagged,
          count(*) filter (where status = 'rejected') as rejected,
          count(*) filter (where status in ('confirmed', 'rejected', 'unresolved')) as decided
        from alerts where detected_at >= now() - interval '12 months'
        group by 1 order by 1`,
      );

      const decided =
        int(alertsRow?.confirmed) + int(alertsRow?.rejected) + int(alertsRow?.unresolved);
      return {
        days: input.days,
        detection: { medianHours: num(alertsRow?.detection_h), alerts: int(alertsRow?.flagged) },
        validation: {
          confirmed: int(alertsRow?.confirmed),
          rejected: int(alertsRow?.rejected),
          unresolved: int(alertsRow?.unresolved),
          pending: int(alertsRow?.pending),
          medianHoursToDecision: num(alertsRow?.validation_h),
          // MEL false-alert rate: share rejected after review.
          falseAlertRate: decided ? int(alertsRow?.rejected) / decided : null,
        },
        response: {
          incidents: int(incidentsRow?.opened),
          withAction: int(incidentsRow?.with_action),
          decidedNotToAct: int(incidentsRow?.decided_not_to_act),
          closed: int(incidentsRow?.closed),
          medianHoursToAction: num(incidentsRow?.response_h),
        },
        coverage: { sites: int(coverageRow?.sites), covered: int(coverageRow?.covered) },
        adoption: {
          activeUsers: int(adoptionRow?.active_users),
          actions: int(adoptionRow?.actions),
          fieldReports: int(adoptionRow?.field_reports),
          reports: int(adoptionRow?.reports),
        },
        usefulness: { answers: int(usefulRow?.answers), useful: int(usefulRow?.useful) },
        monthly: monthly.map((m) => ({
          month: String(m.month),
          flagged: int(m.flagged),
          rejected: int(m.rejected),
          decided: int(m.decided),
        })),
        simulated: int(alertsRow?.simulated) > 0,
      };
    }),

  // Where alerts are in the review, and how long the undecided ones have waited.
  alerts: authorizedProcedure("alert:read")
    .input(z.object({ lens: z.enum(["water", "forest_land", "air"]).optional() }))
    .handler(async ({ input, context: { db, actor } }) => {
      const lens = input.lens ? sql`and a.lens = ${input.lens}` : sql``;
      const hidden = sensitiveClause(actor);
      const byStatus = await rows(
        db,
        sql`select a.status, count(*) as n from alerts a where true ${lens} ${hidden} group by 1`,
      );
      const waiting = await rows(
        db,
        sql`select a.confidence,
          count(*) filter (where now() - a.detected_at < interval '1 day') as d1,
          count(*) filter (where now() - a.detected_at between interval '1 day' and interval '3 days') as d3,
          count(*) filter (where now() - a.detected_at between interval '3 days' and interval '7 days') as d7,
          count(*) filter (where now() - a.detected_at > interval '7 days') as older
        from alerts a where a.status in ('new', 'in_review', 'unresolved') ${lens} ${hidden}
        group by 1`,
      );
      const byBasin = await rows(
        db,
        sql`select coalesce(s.basin, 'Other') as basin,
          count(*) filter (where a.status in ('new', 'in_review', 'unresolved')) as open,
          count(*) filter (where a.status = 'confirmed') as confirmed,
          count(*) as total
        from alerts a left join sites s on s.id = a.site_id
        where true ${lens} ${hidden} group by 1 order by total desc`,
      );
      const [checks] = await rows(
        db,
        sql`select count(*) filter (where v.status = 'open') as open,
          count(*) filter (where v.status = 'open' and v.due_at < now()) as overdue
        from verification_requests v join alerts a on a.id = v.alert_id where true ${lens} ${hidden}`,
      );
      return {
        byStatus: Object.fromEntries(byStatus.map((r) => [String(r.status), int(r.n)])) as Record<
          "new" | "in_review" | "confirmed" | "rejected" | "unresolved",
          number
        >,
        waiting: (["high", "medium", "low"] as const).map((c) => {
          const r = waiting.find((w) => w.confidence === c);
          return {
            confidence: c,
            d1: int(r?.d1),
            d3: int(r?.d3),
            d7: int(r?.d7),
            older: int(r?.older),
          };
        }),
        byBasin: byBasin.map((r) => ({
          basin: String(r.basin),
          open: int(r.open),
          confirmed: int(r.confirmed),
          total: int(r.total),
        })),
        checks: { open: int(checks?.open), overdue: int(checks?.overdue) },
      };
    }),

  // Where responses stand, by lead institution. `mine` limits to cases the
  // caller's institution leads or is assigned to.
  incidents: authorizedProcedure("incident:read")
    .input(
      z.object({
        mine: z.boolean().default(false),
        lens: z.enum(["water", "forest_land", "air"]).optional(),
      }),
    )
    .handler(async ({ input, context: { db, actor } }) => {
      const me = await institutionOf(db, actor.orgId);
      const scoped = input.mine || actor.role === "responder";
      const mine = scoped
        ? me
          ? sql`and (i.responsible_institution_id = ${me.id} or exists (
              select 1 from incident_assignments x where x.incident_id = i.id and x.institution_id = ${me.id}))`
          : sql`and false`
        : sql``;
      const lens = input.lens ? sql`and a.lens = ${input.lens}` : sql``;
      const hidden = hasPermission(actor.role, "sensitive_location:read")
        ? sql``
        : sql`and not i.is_sensitive`;
      const base = sql`from incidents i join alerts a on a.id = i.alert_id
        left join institutions inst on inst.id = i.responsible_institution_id
        left join lateral (
          select due_at from incident_assignments x where x.incident_id = i.id order by assigned_at desc limit 1
        ) due on true
        where true ${mine} ${lens} ${hidden}`;
      const byStatus = await rows(db, sql`select i.status, count(*) as n ${base} group by 1`);
      const byInstitution = await rows(
        db,
        sql`select coalesce(inst.short_name, '—') as institution,
          count(*) filter (where i.status = 'open') as open,
          count(*) filter (where i.status in ('assigned', 'in_progress')) as with_responders,
          count(*) filter (where i.status = 'action_recorded') as action_recorded,
          count(*) filter (where i.status = 'closed') as closed
        ${base} group by 1 order by count(*) desc`,
      );
      const attention = await rows(
        db,
        sql`select i.id, i.number, i.title, i.status, i.severity, due.due_at, i.updated_at,
          coalesce(inst.short_name, '—') as lead
        ${base} and i.status <> 'closed'
        order by (due.due_at < now() and i.status in ('assigned', 'in_progress')) desc nulls last,
          due.due_at asc nulls last, i.updated_at desc
        limit 6`,
      );
      const closed = await rows(
        db,
        sql`select i.id, i.number, i.title, i.closed_at ${base} and i.status = 'closed'
        order by i.closed_at desc limit 4`,
      );
      return {
        scope: scoped ? (me?.name ?? null) : null,
        byStatus: Object.fromEntries(byStatus.map((r) => [String(r.status), int(r.n)])) as Record<
          "open" | "assigned" | "in_progress" | "action_recorded" | "closed",
          number
        >,
        byInstitution: byInstitution.map((r) => ({
          institution: String(r.institution),
          open: int(r.open),
          withResponders: int(r.with_responders),
          actionRecorded: int(r.action_recorded),
          closed: int(r.closed),
        })),
        attention: attention.map((r) => ({
          id: String(r.id),
          number: int(r.number),
          title: String(r.title),
          status: String(r.status),
          severity: String(r.severity),
          lead: String(r.lead),
          dueAt: r.due_at ? new Date(r.due_at as string).toISOString() : null,
          overdue:
            !!r.due_at &&
            ["assigned", "in_progress"].includes(String(r.status)) &&
            new Date(r.due_at as string).getTime() < Date.now(),
        })),
        recentlyClosed: closed.map((r) => ({
          id: String(r.id),
          number: int(r.number),
          title: String(r.title),
          closedAt: new Date(r.closed_at as string).toISOString(),
        })),
      };
    }),

  // Use case 3: suspected activity compared with mining concessions and
  // protected areas. Boundaries are illustrative in the prototype.
  concessions: authorizedProcedure("alert:read").handler(async ({ context: { db, actor } }) => {
    const hidden = sensitiveClause(actor);
    const boundaryHidden = hasPermission(actor.role, "sensitive_location:read")
      ? sql``
      : sql`and not b.is_sensitive`;
    const result = await rows(
      db,
      sql`select a.status,
        case
          when exists (select 1 from boundaries b where b.kind in ('protected_area', 'forest_reserve')
            and st_intersects(b.area, a.location) ${boundaryHidden}) then 'protected'
          when exists (select 1 from boundaries b where b.kind = 'mining_concession'
            and st_intersects(b.area, a.location) ${boundaryHidden}) then 'inside'
          when exists (select 1 from boundaries b where b.kind = 'mining_concession'
            and st_dwithin(b.area::geography, a.location::geography, 1000) ${boundaryHidden}) then 'near'
          else 'outside'
        end as relation,
        count(*) as n
      from alerts a where a.lens in ('forest_land', 'water') and a.status <> 'rejected' ${hidden}
      group by 1, 2`,
    );
    const [b] = await rows(
      db,
      sql`select count(*) filter (where kind = 'mining_concession') as concessions,
        count(*) filter (where kind in ('protected_area', 'forest_reserve')) as protected
      from boundaries b where true ${boundaryHidden}`,
    );
    const relations = ["inside", "near", "outside", "protected"] as const;
    return {
      relations: relations.map((relation) => ({
        relation,
        open: result
          .filter(
            (r) =>
              r.relation === relation &&
              ["new", "in_review", "unresolved"].includes(String(r.status)),
          )
          .reduce((n, r) => n + int(r.n), 0),
        confirmed: result
          .filter((r) => r.relation === relation && r.status === "confirmed")
          .reduce((n, r) => n + int(r.n), 0),
      })),
      boundaries: { concessions: int(b?.concessions), protected: int(b?.protected) },
    };
  }),

  // Water alerts by river reach (the nearest reach within 2 km).
  rivers: authorizedProcedure("alert:read").handler(async ({ context: { db, actor } }) => {
    const hidden = sensitiveClause(actor);
    const result = await rows(
      db,
      sql`select r.river, r.basin, coalesce(r.name, r.river) as reach,
        count(a.id) filter (where a.status in ('new', 'in_review', 'unresolved')) as open,
        count(a.id) filter (where a.status = 'confirmed') as confirmed,
        max(a.detected_at) as latest
      from river_reaches r
      left join lateral (
        select a.id, a.status, a.detected_at from alerts a
        where a.lens = 'water' ${hidden}
          and st_dwithin(r.course::geography, a.location::geography, 2000)
          and r.id = (select r2.id from river_reaches r2
            order by r2.course <-> a.location limit 1)
      ) a on true
      group by r.id, r.river, r.basin, r.name
      order by open desc, confirmed desc, r.basin, reach`,
    );
    return result.map((r) => ({
      river: String(r.river),
      basin: String(r.basin),
      reach: String(r.reach),
      open: int(r.open),
      confirmed: int(r.confirmed),
      latest: r.latest ? new Date(r.latest as string).toISOString() : null,
    }));
  }),

  // Scientific assurance: how each agreed rule's alerts were decided.
  rules: authorizedProcedure("alert:read").handler(async ({ context: { db } }) => {
    const result = await rows(
      db,
      sql`select r.id, r.name, r.version, r.lens, r.is_active, r.reviewed_at,
        count(a.id) as alerts,
        count(a.id) filter (where a.status = 'confirmed') as confirmed,
        count(a.id) filter (where a.status = 'rejected') as rejected,
        count(a.id) filter (where a.status = 'unresolved') as unresolved
      from anomaly_rules r left join alerts a on a.rule_id = r.id
      group by r.id order by alerts desc, r.name`,
    );
    return result.map((r) => {
      const decided = int(r.confirmed) + int(r.rejected) + int(r.unresolved);
      return {
        id: String(r.id),
        name: String(r.name),
        version: int(r.version),
        lens: String(r.lens),
        isActive: !!r.is_active,
        reviewedAt: r.reviewed_at ? new Date(r.reviewed_at as string).toISOString() : null,
        alerts: int(r.alerts),
        decided,
        falseAlertRate: decided ? int(r.rejected) / decided : null,
      };
    });
  }),

  // Data sources and how fresh their latest reading is (principles 3 and 9).
  sources: authorizedProcedure("alert:read").handler(async ({ context: { db } }) => {
    const result = await rows(
      db,
      sql`select d.id, d.name, d.kind, d.mode, d.update_frequency, i.name as steward,
        max(o.observed_at) as latest, count(o.id) filter (where o.observed_at >= now() - interval '30 days') as recent
      from data_sources d
      left join institutions i on i.id = d.steward_institution_id
      left join observations o on o.source_id = d.id
      group by d.id, i.name order by d.mode, d.name`,
    );
    return result.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      kind: String(r.kind),
      mode: String(r.mode) as "live" | "prepared" | "simulated",
      updateFrequency: r.update_frequency ? String(r.update_frequency) : null,
      steward: r.steward ? String(r.steward) : null,
      latest: r.latest ? new Date(r.latest as string).toISOString() : null,
      recent: int(r.recent),
    }));
  }),

  // The latest audited changes across the workflow.
  activity: authorizedProcedure("audit:read").handler(async ({ context: { db } }) => {
    const events = await db
      .select({
        id: auditEvents.id,
        occurredAt: auditEvents.occurredAt,
        action: auditEvents.action,
        entityType: auditEvents.entityType,
        entityId: auditEvents.entityId,
        actorOrgId: auditEvents.actorOrgId,
        actorRole: auditEvents.actorRole,
        toStatus: auditEvents.toStatus,
      })
      .from(auditEvents)
      .orderBy(desc(auditEvents.occurredAt))
      .limit(12);
    const names = await institutionNames(
      db,
      events.map((e) => e.actorOrgId),
    );
    return events.map(({ actorOrgId, actorRole, occurredAt, ...e }) => ({
      ...e,
      occurredAt: occurredAt.toISOString(),
      institution: names.get(actorOrgId) ?? null,
      role: ROLE_LABELS[actorRole as Role] ?? actorRole,
    }));
  }),

  // Decision usefulness: "was this useful?" on a report or alert.
  feedback: memberProcedure
    .input(
      z.object({
        targetType: z.enum(["report", "alert"]),
        targetId: z.uuid(),
        useful: z.boolean(),
        comment: z.string().trim().max(2000).optional(),
        clientMutationId: z.uuid(),
      }),
    )
    .handler(async ({ input, context: { db, actor } }) => {
      await db
        .insert(feedback)
        .values({
          targetType: input.targetType,
          targetId: input.targetId,
          useful: input.useful,
          comment: input.comment || null,
          userId: actor.userId,
          orgId: actor.orgId,
          role: actor.role,
        })
        .onConflictDoUpdate({
          target: [feedback.targetType, feedback.targetId, feedback.userId],
          set: { useful: input.useful, comment: input.comment || null, createdAt: new Date() },
        });
      return { saved: true };
    }),

  // The caller's own answer, to show it back.
  myFeedback: memberProcedure
    .input(z.object({ targetType: z.enum(["report", "alert"]), targetId: z.uuid() }))
    .handler(async ({ input, context: { db, actor } }) => {
      const [row] = await db
        .select({ useful: feedback.useful, comment: feedback.comment })
        .from(feedback)
        .where(
          sql`${feedback.targetType} = ${input.targetType} and ${feedback.targetId} = ${input.targetId} and ${feedback.userId} = ${actor.userId}`,
        );
      return row ?? null;
    }),
};
