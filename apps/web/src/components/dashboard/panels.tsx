"use client";

import { cn } from "@ecolens/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { CloudOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useFieldWrites } from "@/components/field/use-field-writes";
import { INCIDENT_STATUS, incidentRef } from "@/components/incidents/config";
import { ALERT_STATUS, LENS_LABEL } from "@/components/map/config";
import { ModeBadge } from "@/components/map/provenance";
import { useCanCallApi } from "@/components/shell/use-me";
import { ago, formatDate } from "@/lib/format";
import { orpc } from "@/utils/orpc";

import {
  BarList,
  hours,
  Panel,
  PanelEmpty,
  PanelSkeleton,
  PartsBar,
  percent,
  Stat,
} from "./widgets";

type Lens = "water" | "forest_land" | "air";

// --- Success measures (brief section 9) ------------------------------------

const PERIODS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
  { days: null, label: "Pilot to date" },
] as const;

export function MeasuresPanel() {
  const [days, setDays] = useState<30 | 90 | 365 | null>(90);
  const query = useQuery({
    ...orpc.dashboard.measures.queryOptions({ input: { days } }),
    enabled: useCanCallApi(),
  });
  const m = query.data;

  return (
    <section className="border">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-medium">Earlier, trusted action</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            The pilot's success measures. Medians, so one slow case doesn't hide the typical one.
          </p>
        </div>
        <fieldset className="flex border">
          <legend className="sr-only">Period</legend>
          {PERIODS.map((p) => (
            <button
              key={p.label}
              type="button"
              aria-pressed={days === p.days}
              onClick={() => setDays(p.days)}
              className={cn(
                "h-7 border-r px-2.5 text-xs outline-none last:border-r-0 focus-visible:ring-1",
                days === p.days
                  ? "bg-muted font-medium"
                  : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              {p.label}
            </button>
          ))}
        </fieldset>
      </header>
      <div className="space-y-4 p-4">
        {!m ? (
          <PanelSkeleton rows={4} />
        ) : (
          <>
            {m.simulated && (
              <p className="text-xs">
                <ModeBadge mode="simulated" className="mr-1.5" />
                Includes prepared demonstration data; these figures describe the demo, not the
                field.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Stat
                label="Detection latency"
                value={hours(m.detection.medianHours)}
                detail={`Observed → flagged, ${m.detection.alerts} alerts`}
              />
              <Stat
                label="Time to decision"
                value={hours(m.validation.medianHoursToDecision)}
                detail="Flagged → human decision"
              />
              <Stat
                label="False-alert rate"
                value={percent(m.validation.falseAlertRate)}
                detail={`${m.validation.rejected} rejected of ${m.validation.confirmed + m.validation.rejected + m.validation.unresolved} decided`}
              />
              <Stat
                label="Response speed"
                value={hours(m.response.medianHoursToAction)}
                detail={`Validated → first action; ${m.response.withAction} of ${m.response.incidents} incidents have one`}
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium">Validation quality</p>
                <PartsBar
                  label="Alerts by review outcome"
                  parts={[
                    {
                      label: "Confirmed",
                      value: m.validation.confirmed,
                      color: ALERT_STATUS.confirmed.color,
                    },
                    {
                      label: "Rejected",
                      value: m.validation.rejected,
                      color: ALERT_STATUS.rejected.color,
                    },
                    {
                      label: "Unresolved",
                      value: m.validation.unresolved,
                      color: ALERT_STATUS.unresolved.color,
                    },
                    {
                      label: "Awaiting decision",
                      value: m.validation.pending,
                      color: ALERT_STATUS.new.color,
                    },
                  ]}
                />
              </div>
              <MonthlyAlerts monthly={m.monthly} />
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Stat
                label="Coverage"
                value={`${m.coverage.covered}/${m.coverage.sites}`}
                detail="Priority sites with data in the last 30 days"
              />
              <Stat
                label="Adoption"
                value={m.adoption.activeUsers}
                detail={`people active · ${m.adoption.actions} recorded actions`}
              />
              <Stat
                label="Completed cases"
                value={m.response.closed}
                detail={`closed · ${m.adoption.fieldReports} field reports · ${m.adoption.reports} reports`}
              />
              <Stat
                label="Decision usefulness"
                value={
                  m.usefulness.answers ? percent(m.usefulness.useful / m.usefulness.answers) : "—"
                }
                detail={
                  m.usefulness.answers
                    ? `found useful, ${m.usefulness.answers} answers`
                    : "No feedback yet. Readers can rate each report."
                }
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function MonthlyAlerts({
  monthly,
}: {
  monthly: { month: string; flagged: number; rejected: number; decided: number }[];
}) {
  const max = Math.max(1, ...monthly.map((m) => m.flagged));
  const month = new Intl.DateTimeFormat(undefined, { month: "short" });
  return (
    <div>
      <p className="mb-2 text-xs font-medium">Alerts flagged per month</p>
      {monthly.length === 0 ? (
        <PanelEmpty>No alerts in the last 12 months.</PanelEmpty>
      ) : (
        <div
          className="flex h-20 items-end gap-1.5"
          role="img"
          aria-label="Alerts flagged per month"
        >
          {monthly.map((m) => (
            <div
              key={m.month}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${m.month}: ${m.flagged} flagged, ${m.rejected} rejected after review`}
            >
              <span className="text-muted-foreground text-[10px] tabular-nums">{m.flagged}</span>
              <span
                className="bg-foreground/70 w-full max-w-8 rounded-t-[2px]"
                style={{ height: `${Math.max(2, (m.flagged / max) * 48)}px` }}
              />
              <span className="text-muted-foreground text-[10px]">
                {month.format(new Date(`${m.month}-01T12:00:00`))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Alerts ---------------------------------------------------------------

export function AlertsPanel({ lens, title }: { lens?: Lens; title?: string }) {
  const query = useQuery({
    ...orpc.dashboard.alerts.queryOptions({ input: { lens } }),
    enabled: useCanCallApi(),
  });
  const a = query.data;
  const open = a
    ? (a.byStatus.new ?? 0) + (a.byStatus.in_review ?? 0) + (a.byStatus.unresolved ?? 0)
    : 0;
  const lensParam = lens ? `&lens=${lens}` : "";

  return (
    <Panel
      title={title ?? "Alerts"}
      description="Where alerts are in the review. An alert is a prompt for review, not proof."
      href={`/alerts?view=open${lensParam}`}
      linkLabel="Queue"
    >
      {!a ? (
        <PanelSkeleton />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Need a decision"
              value={open}
              href={`/alerts?view=open${lensParam}`}
              tone={open ? "attention" : undefined}
            />
            <Stat
              label="Field checks open"
              value={a.checks.open}
              detail={a.checks.overdue ? `${a.checks.overdue} overdue` : undefined}
            />
          </div>
          <BarList
            items={(["new", "in_review", "unresolved", "confirmed", "rejected"] as const).map(
              (s) => ({
                label: ALERT_STATUS[s].label,
                value: a.byStatus[s] ?? 0,
                dot: ALERT_STATUS[s].color,
                href: `/alerts?view=${s === "confirmed" ? "confirmed" : s === "rejected" ? "rejected" : "open"}${lensParam}`,
              }),
            )}
          />
        </div>
      )}
    </Panel>
  );
}

/** The undecided queue by confidence and age (analyst). */
export function WaitingPanel() {
  const query = useQuery({
    ...orpc.dashboard.alerts.queryOptions({ input: {} }),
    enabled: useCanCallApi(),
  });
  const a = query.data;
  const cols = [
    ["d1", "< 1 day"],
    ["d3", "1–3 days"],
    ["d7", "3–7 days"],
    ["older", "> 7 days"],
  ] as const;
  return (
    <Panel
      title="Waiting for a decision"
      description="Undecided alerts by confidence and how long they've waited."
      href="/alerts?view=open&sort=confidence"
      linkLabel="Queue"
    >
      {!a ? (
        <PanelSkeleton />
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="pb-2 text-left font-normal">Confidence</th>
              {cols.map(([, l]) => (
                <th key={l} className="pb-2 text-right font-normal">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {a.waiting.map((w) => (
              <tr key={w.confidence} className="border-t">
                <td className="py-2 capitalize">
                  <Link
                    href={`/alerts?view=open&confidence=${w.confidence}`}
                    className="hover:underline"
                  >
                    {w.confidence}
                  </Link>
                </td>
                {cols.map(([k]) => (
                  <td
                    key={k}
                    className={cn(
                      "py-2 text-right tabular-nums",
                      w[k] === 0 && "text-muted-foreground",
                      k === "older" && w[k] > 0 && "font-medium text-amber-700 dark:text-amber-300",
                    )}
                  >
                    {w[k]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

export function BasinsPanel() {
  const query = useQuery({
    ...orpc.dashboard.alerts.queryOptions({ input: {} }),
    enabled: useCanCallApi(),
  });
  return (
    <Panel title="By basin" description="Undecided alerts per basin." href="/map" linkLabel="Map">
      {!query.data ? (
        <PanelSkeleton />
      ) : (
        <BarList
          items={query.data.byBasin.map((b) => ({
            label: b.basin === "Other" ? "Outside the pilot basins" : `${b.basin} basin`,
            value: b.open,
            title: `${b.open} undecided, ${b.confirmed} confirmed, ${b.total} in all`,
            href:
              b.basin === "Other"
                ? undefined
                : `/alerts?view=open&basin=${encodeURIComponent(b.basin)}`,
          }))}
        />
      )}
    </Panel>
  );
}

// --- Incidents ------------------------------------------------------------

export function IncidentsPanel({
  mine = false,
  lens,
  title,
  description,
}: {
  mine?: boolean;
  lens?: Lens;
  title?: string;
  description?: string;
}) {
  const query = useQuery({
    ...orpc.dashboard.incidents.queryOptions({ input: { mine, lens } }),
    enabled: useCanCallApi(),
  });
  const d = query.data;
  const active = d
    ? (d.byStatus.open ?? 0) +
      (d.byStatus.assigned ?? 0) +
      (d.byStatus.in_progress ?? 0) +
      (d.byStatus.action_recorded ?? 0)
    : 0;
  const overdue = d?.attention.filter((a) => a.overdue).length ?? 0;

  return (
    <Panel
      title={title ?? "Incidents"}
      description={
        description ??
        (d?.scope
          ? `Cases ${d.scope} leads or has been asked to act on.`
          : "Confirmed alerts routed for a response.")
      }
      href="/incidents"
      linkLabel="Register"
    >
      {!d ? (
        <PanelSkeleton />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Active" value={active} href="/incidents?view=active" />
            <Stat label="Overdue" value={overdue} tone={overdue ? "attention" : undefined} />
            <Stat label="Closed" value={d.byStatus.closed ?? 0} href="/incidents?view=closed" />
          </div>
          {d.attention.length > 0 ? (
            <ul className="divide-y border-y text-xs">
              {d.attention.map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/incidents?view=all&incident=${i.id}`}
                    className="hover:bg-muted/50 flex items-center gap-2 py-2"
                  >
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rotate-45"
                      style={{
                        backgroundColor:
                          INCIDENT_STATUS[i.status as keyof typeof INCIDENT_STATUS]?.color,
                      }}
                    />
                    <span className="text-muted-foreground font-mono text-[11px]">
                      {incidentRef(i.number)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{i.title}</span>
                    <span
                      className={cn(
                        "shrink-0",
                        i.overdue ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
                      )}
                    >
                      {i.overdue
                        ? `Overdue ${formatDate(i.dueAt as string)}`
                        : INCIDENT_STATUS[i.status as keyof typeof INCIDENT_STATUS]?.label}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <PanelEmpty>No active incidents.</PanelEmpty>
          )}
          {!mine && d.byInstitution.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium">Active cases by lead institution</p>
              <BarList
                items={d.byInstitution.map((b) => ({
                  label: b.institution,
                  value: b.open + b.withResponders + b.actionRecorded,
                  title: `${b.open} awaiting assignment, ${b.withResponders} with responders, ${b.actionRecorded} action recorded, ${b.closed} closed`,
                }))}
              />
            </div>
          )}
          {d.recentlyClosed.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium">Recently closed</p>
              <ul className="space-y-1 text-xs">
                {d.recentlyClosed.map((c) => (
                  <li key={c.id}>
                    <Link href={`/incidents?view=all&incident=${c.id}`} className="hover:underline">
                      <span className="text-muted-foreground font-mono text-[11px]">
                        {incidentRef(c.number)}
                      </span>{" "}
                      {c.title}
                    </Link>{" "}
                    <span className="text-muted-foreground">· {ago(c.closedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

// --- Use case 3: concessions and protected areas ---------------------------

const RELATION = {
  inside: "Inside a mining concession",
  near: "Within 1 km of a concession",
  outside: "Away from any concession",
  protected: "In a forest reserve or protected area",
} as const;

export function ConcessionsPanel() {
  const query = useQuery({
    ...orpc.dashboard.concessions.queryOptions(),
    enabled: useCanCallApi(),
  });
  const d = query.data;
  return (
    <Panel
      title="Activity compared with concessions"
      description="Land and water alerts (not rejected) by where they fall. Boundaries are illustrative in the prototype, not the legal cadastre."
      href="/map?layers=concessions,reserves,alerts"
      linkLabel="Map"
    >
      {!d ? (
        <PanelSkeleton rows={4} />
      ) : (
        <div className="space-y-3">
          <BarList
            items={d.relations.map((r) => ({
              label: RELATION[r.relation],
              value: r.open + r.confirmed,
              title: `${r.open} undecided, ${r.confirmed} confirmed`,
            }))}
          />
          <p className="text-muted-foreground text-xs">
            Compared against {d.boundaries.concessions} concessions and {d.boundaries.protected}{" "}
            reserves or protected areas. Activity inside a concession can still be unlicensed, and
            activity outside one is not proof of illegality.
          </p>
        </div>
      )}
    </Panel>
  );
}

// --- Rivers ---------------------------------------------------------------

export function RiversPanel() {
  const query = useQuery({ ...orpc.dashboard.rivers.queryOptions(), enabled: useCanCallApi() });
  return (
    <Panel
      title="River reaches"
      description="Water alerts assigned to the nearest reach within 2 km."
      href="/alerts?view=open&lens=water"
      linkLabel="Water alerts"
    >
      {!query.data ? (
        <PanelSkeleton rows={4} />
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="pb-2 text-left font-normal">Reach</th>
              <th className="pb-2 text-right font-normal">Undecided</th>
              <th className="pb-2 text-right font-normal">Confirmed</th>
              <th className="hidden pb-2 text-right font-normal sm:table-cell">Latest</th>
            </tr>
          </thead>
          <tbody>
            {query.data.map((r) => (
              <tr key={`${r.basin}-${r.reach}`} className="border-t">
                <td className="py-1.5">
                  {r.reach}
                  <span className="text-muted-foreground"> · {r.basin}</span>
                </td>
                <td
                  className={cn(
                    "py-1.5 text-right tabular-nums",
                    r.open && "font-medium text-amber-700 dark:text-amber-300",
                  )}
                >
                  {r.open}
                </td>
                <td className="py-1.5 text-right tabular-nums">{r.confirmed}</td>
                <td className="text-muted-foreground hidden py-1.5 text-right sm:table-cell">
                  {r.latest ? ago(r.latest) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

// --- Scientific assurance: rules ------------------------------------------

export function RulesPanel() {
  const query = useQuery({ ...orpc.dashboard.rules.queryOptions(), enabled: useCanCallApi() });
  return (
    <Panel
      title="Rules under review"
      description="How each agreed rule's alerts were decided. A high rejection rate is a reason to revisit its threshold."
    >
      {!query.data ? (
        <PanelSkeleton rows={4} />
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="pb-2 text-left font-normal">Rule</th>
              <th className="pb-2 text-right font-normal">Alerts</th>
              <th className="pb-2 text-right font-normal">Rejected</th>
              <th className="hidden pb-2 text-right font-normal sm:table-cell">Reviewed</th>
            </tr>
          </thead>
          <tbody>
            {query.data.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-1.5">
                  {r.name}{" "}
                  <span className="text-muted-foreground">
                    v{r.version} · {LENS_LABEL[r.lens as Lens]}
                  </span>
                </td>
                <td className="py-1.5 text-right tabular-nums">{r.alerts}</td>
                <td
                  className={cn(
                    "py-1.5 text-right tabular-nums",
                    r.falseAlertRate !== null &&
                      r.falseAlertRate >= 0.5 &&
                      r.decided >= 2 &&
                      "font-medium text-amber-700 dark:text-amber-300",
                  )}
                  title={`${r.decided} decided`}
                >
                  {percent(r.falseAlertRate)}
                </td>
                <td className="text-muted-foreground hidden py-1.5 text-right sm:table-cell">
                  {r.reviewedAt ? formatDate(r.reviewedAt) : "Not reviewed"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

// --- Data sources ---------------------------------------------------------

export function SourcesPanel() {
  const query = useQuery({ ...orpc.dashboard.sources.queryOptions(), enabled: useCanCallApi() });
  return (
    <Panel
      title="Data sources"
      description="Each source's steward, how it's produced and its latest reading."
    >
      {!query.data ? (
        <PanelSkeleton rows={5} />
      ) : (
        <ul className="divide-y text-xs">
          {query.data.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="font-medium">{s.name}</p>
                <p className="text-muted-foreground">
                  {s.steward ?? "Ecolens platform team"}
                  {s.updateFrequency && ` · ${s.updateFrequency}`}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <ModeBadge mode={s.mode} />
                <p className="text-muted-foreground mt-1">
                  {s.latest ? `Latest ${ago(s.latest)}` : "Reference layer"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// --- Audit ----------------------------------------------------------------

const ACTION: Record<string, string> = {
  "alert.detect": "Alert flagged",
  "alert.start_review": "Review started",
  "alert.validate": "Alert decided",
  "alert.request_verification": "Field check requested",
  "field_report.submit": "Field report submitted",
  "incident.open": "Incident opened",
  "incident.assign": "Incident assigned",
  "incident.acknowledge": "Incident acknowledged",
  "incident.record_action": "Action recorded",
  "incident.close": "Incident closed",
  "report.generate": "Report generated",
  "report.publish": "Report approved",
};

export function ActivityPanel() {
  const query = useQuery({ ...orpc.dashboard.activity.queryOptions(), enabled: useCanCallApi() });
  return (
    <Panel title="Recent activity" description="The latest entries in the audit trail.">
      {!query.data ? (
        <PanelSkeleton rows={5} />
      ) : (
        <ol className="space-y-2 border-l pl-3 text-xs">
          {query.data.map((e) => (
            <li key={e.id}>
              <p>
                <span className="font-medium">{ACTION[e.action] ?? e.action}</span>
                {e.toStatus && (
                  <span className="text-muted-foreground">
                    {" "}
                    → {e.toStatus.replaceAll("_", " ")}
                  </span>
                )}
              </p>
              <p className="text-muted-foreground">
                {e.role}
                {e.institution && `, ${e.institution}`} · {ago(e.occurredAt)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

// --- Field ----------------------------------------------------------------

export function FieldPanel() {
  const query = useQuery({
    ...orpc.fieldReports.requests.queryOptions(),
    enabled: useCanCallApi(),
  });
  const writes = useFieldWrites();
  const waiting = writes.queued.length;
  const overdue =
    query.data?.filter((r) => r.dueAt && new Date(r.dueAt).getTime() < Date.now()).length ?? 0;

  return (
    <Panel
      title="Your field work"
      description="Checks asked of your team, and reports on this phone."
      href="/field-reports"
      linkLabel="Field reports"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label="Checks to do"
            value={query.data ? query.data.length : "—"}
            detail={overdue ? `${overdue} overdue` : undefined}
            href="/field-reports?tab=checks"
            tone={overdue ? "attention" : undefined}
          />
          <Stat
            label="On this phone"
            value={waiting}
            detail={
              waiting ? (
                <span className="inline-flex items-center gap-1">
                  <CloudOff className="size-3" /> waiting to sync
                </span>
              ) : (
                "All sent"
              )
            }
            href="/field-reports?tab=mine"
          />
        </div>
        {query.data && query.data.length > 0 && (
          <ul className="divide-y border-y text-xs">
            {query.data.slice(0, 4).map((r) => (
              <li key={r.id}>
                <Link
                  href={`/field-reports?new=true&alert=${r.alertId}`}
                  className="hover:bg-muted/50 flex items-center gap-2 py-2"
                >
                  <span className="min-w-0 flex-1 truncate">{r.alertTitle}</span>
                  <span className="text-muted-foreground shrink-0">
                    {r.dueAt ? `Due ${formatDate(r.dueAt)}` : LENS_LABEL[r.lens]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/field-reports?new=true"
          className="bg-primary text-primary-foreground hover:bg-primary/80 flex h-10 items-center justify-center text-sm font-medium"
        >
          New field report
        </Link>
      </div>
    </Panel>
  );
}
