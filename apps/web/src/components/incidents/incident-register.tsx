"use client";

import { Button } from "@ecolens/ui/components/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@ecolens/ui/components/empty";
import { Skeleton } from "@ecolens/ui/components/skeleton";
import { cn } from "@ecolens/ui/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CloudOff } from "lucide-react";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

import { alertRef } from "@/components/alerts/use-alert-writes";
import { LENS_LABEL } from "@/components/map/config";
import { ModeBadge } from "@/components/map/provenance";
import { PageHeader } from "@/components/shell/page";
import { useCanCallApi, useMe } from "@/components/shell/use-me";
import { FilterSelect } from "@/components/shell/workflow";
import { ago, formatDate, formatDateTime } from "@/lib/format";
import { orpc } from "@/utils/orpc";

import {
  type IncidentListItem,
  type IncidentStatus,
  incidentRef,
  isOverdue,
  SEVERITY,
  type Severity,
} from "./config";
import { IncidentDetail, IncidentStatusBadge } from "./incident-detail";
import { useIncidentWrites } from "./use-incident-writes";

// Escalate: the register of incidents, grouped by where the response stands.
// The whole view and the open incident are in the URL, so they can be shared.

const VIEWS = {
  active: { label: "Active", statuses: ["open", "assigned", "in_progress", "action_recorded"] },
  open: { label: "Awaiting assignment", statuses: ["open"] },
  closed: { label: "Closed", statuses: ["closed"] },
  all: { label: "All", statuses: [] },
} as const satisfies Record<string, { label: string; statuses: readonly IncidentStatus[] }>;
type View = keyof typeof VIEWS;
const VIEW_KEYS = Object.keys(VIEWS) as View[];

const SEVERITIES = ["high", "medium", "low"] as const;
const SORTS = {
  updated: "Recently updated",
  newest: "Newest first",
  oldest: "Oldest first",
  severity: "Highest severity",
} as const;
const PAGE_SIZE = 50;

const registerParsers = {
  view: parseAsStringLiteral(VIEW_KEYS).withDefault("active"),
  severity: parseAsStringLiteral(SEVERITIES),
  institution: parseAsString,
  sort: parseAsStringLiteral(Object.keys(SORTS) as (keyof typeof SORTS)[]).withDefault("updated"),
  page: parseAsInteger.withDefault(0),
  incident: parseAsString,
};

export function IncidentRegister() {
  const [state, setState] = useQueryStates(registerParsers, { history: "replace" });
  const canCall = useCanCallApi();
  const me = useMe();
  const writes = useIncidentWrites();

  const query = useQuery({
    ...orpc.incidents.list.queryOptions({
      input: {
        status: [...VIEWS[state.view].statuses],
        severity: state.severity ?? undefined,
        institutionId: state.institution ?? undefined,
        sort: state.sort,
        page: state.page,
        pageSize: PAGE_SIZE,
      },
    }),
    enabled: canCall,
    placeholderData: keepPreviousData,
  });
  const institutions = useQuery({
    ...orpc.incidents.institutions.queryOptions(),
    enabled: canCall,
  });
  const data = query.data;

  const filter = (next: Partial<typeof state>) => void setState({ ...next, page: 0 });
  const open = (id: string | null) => void setState({ incident: id }, { history: "push" });

  const counts = data?.counts;
  const viewCount = (v: View) =>
    counts &&
    (VIEWS[v].statuses.length
      ? VIEWS[v].statuses.reduce((n, s) => n + counts[s], 0)
      : Object.values(counts).reduce((n, c) => n + c, 0));

  const responder = me.data?.role === "responder";

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
      <div className={cn("min-w-0", state.incident && "hidden lg:block")}>
        <PageHeader
          title="Incidents"
          stage="Escalate"
          description={
            responder
              ? "Cases your institution leads or has been asked to act on."
              : "Confirmed alerts routed to a responsible institution, with the action taken."
          }
        >
          {data?.items.some((i) => i.isSimulated) && <ModeBadge mode="simulated" />}
        </PageHeader>

        <div className="space-y-3 border-b px-4 py-3 sm:px-6 lg:px-8">
          <div
            role="tablist"
            aria-label="Response state"
            className="-mx-1 flex gap-1 overflow-x-auto"
          >
            {VIEW_KEYS.map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={state.view === v}
                onClick={() => filter({ view: v })}
                className={cn(
                  "hover:bg-muted inline-flex h-7 shrink-0 items-center gap-1.5 px-2.5 text-xs outline-none focus-visible:ring-1",
                  state.view === v ? "bg-muted font-medium" : "text-muted-foreground",
                )}
              >
                {VIEWS[v].label}
                {viewCount(v) !== undefined && (
                  <span className="text-muted-foreground tabular-nums">{viewCount(v)}</span>
                )}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterSelect
              label="Severity"
              value={state.severity}
              onChange={(severity) => filter({ severity })}
              options={SEVERITIES.map((s) => [s, SEVERITY[s].label])}
              all="Any severity"
            />
            {!responder && (
              <FilterSelect
                label="Institution"
                value={state.institution}
                onChange={(institution) => filter({ institution })}
                options={(institutions.data ?? []).map((i) => [i.id, i.shortName])}
                all="All institutions"
              />
            )}
            <FilterSelect
              label="Sort"
              value={state.sort}
              onChange={(sort) => filter({ sort: sort ?? "updated" })}
              options={Object.entries(SORTS) as [keyof typeof SORTS, string][]}
            />
          </div>
        </div>

        {!data ? (
          query.isError || !canCall ? (
            <Empty className="m-4 border border-dashed sm:m-8">
              <EmptyHeader>
                <EmptyTitle>No saved incidents on this device</EmptyTitle>
                <EmptyDescription>The register will load when you're back online.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-px">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          )
        ) : data.items.length === 0 ? (
          <Empty className="m-4 border border-dashed sm:m-8">
            <EmptyHeader>
              <EmptyTitle>
                {state.view === "active" ? "No active incidents" : "No incidents match"}
              </EmptyTitle>
              <EmptyDescription>
                {state.severity || state.institution
                  ? "Try removing a filter."
                  : "An incident is opened when a confirmed alert is escalated."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <ul
              className={cn("divide-y transition-opacity", query.isPlaceholderData && "opacity-60")}
            >
              {data.items.map((i) => (
                <Row
                  key={i.id}
                  incident={i}
                  pendingStatus={writes.pending(i.id).status}
                  selected={state.incident === i.id}
                  onOpen={() => open(i.id)}
                />
              ))}
            </ul>
            <footer className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs sm:px-6 lg:px-8">
              <span>
                {state.page * PAGE_SIZE + 1}–{state.page * PAGE_SIZE + data.items.length} of{" "}
                {data.total}
                {query.dataUpdatedAt > 0 && ` · updated ${formatDateTime(query.dataUpdatedAt)}`}
              </span>
              {(state.page > 0 || data.hasMore) && (
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Previous page"
                    disabled={state.page === 0}
                    onClick={() => void setState({ page: state.page - 1 })}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Next page"
                    disabled={!data.hasMore}
                    onClick={() => void setState({ page: state.page + 1 })}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              )}
            </footer>
          </>
        )}
      </div>

      {state.incident ? (
        <aside
          aria-label="Incident detail"
          className="lg:sticky lg:top-0 lg:h-[calc(100svh-3.5rem)] lg:overflow-y-auto lg:border-l"
        >
          <IncidentDetail key={state.incident} id={state.incident} onClose={() => open(null)} />
        </aside>
      ) : (
        <aside className="text-muted-foreground hidden h-[calc(100svh-3.5rem)] place-items-center border-l p-8 text-center text-xs lg:sticky lg:top-0 lg:grid">
          Select an incident to see the response and record what was done.
        </aside>
      )}
    </div>
  );
}

function Row({
  incident,
  pendingStatus,
  selected,
  onOpen,
}: {
  incident: IncidentListItem;
  pendingStatus: IncidentStatus | null;
  selected: boolean;
  onOpen: () => void;
}) {
  const status = pendingStatus ?? incident.status;
  const place = [incident.siteName, incident.basin && `${incident.basin} basin`]
    .filter(Boolean)
    .join(", ");
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected || undefined}
        className={cn(
          "hover:bg-muted/50 block w-full px-4 py-3 text-left text-xs outline-none focus-visible:ring-1 focus-visible:ring-inset sm:px-6 lg:px-8",
          selected && "bg-muted",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-muted-foreground font-mono text-[11px]">
              {incidentRef(incident.number)} · from {alertRef(incident.alertNumber)}
            </p>
            <p className="mt-0.5 text-sm font-medium text-pretty">{incident.title}</p>
          </div>
          <span
            className="text-muted-foreground shrink-0"
            title={`Updated ${formatDateTime(incident.updatedAt)}`}
          >
            {ago(incident.updatedAt)}
          </span>
        </div>
        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <IncidentStatusBadge status={status} />
          {pendingStatus && (
            <span className="inline-flex items-center gap-1">
              <CloudOff className="size-3" /> Not synced yet
            </span>
          )}
          {isOverdue({ status, dueAt: incident.dueAt }) && incident.dueAt && (
            <span className="text-amber-700 dark:text-amber-300">
              Overdue since {formatDate(incident.dueAt)}
            </span>
          )}
          <span>{SEVERITY[incident.severity as Severity].label}</span>
          {incident.responsible && (
            <>
              <span aria-hidden>·</span>
              <span>Led by {incident.responsible}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span>{LENS_LABEL[incident.lens]}</span>
          {place && (
            <>
              <span aria-hidden>·</span>
              <span>{place}</span>
            </>
          )}
          {incident.isSimulated && <ModeBadge mode="simulated" />}
        </div>
      </button>
    </li>
  );
}
