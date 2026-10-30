"use client";

import { Button } from "@ecolens/ui/components/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@ecolens/ui/components/empty";
import { Skeleton } from "@ecolens/ui/components/skeleton";
import { cn } from "@ecolens/ui/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CloudOff } from "lucide-react";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

import { CONFIDENCE, LENS_LABEL } from "@/components/map/config";
import { ModeBadge } from "@/components/map/provenance";
import { PageHeader } from "@/components/shell/page";
import { useCanCallApi } from "@/components/shell/use-me";
import { FilterSelect } from "@/components/shell/workflow";
import { ago, formatDateTime } from "@/lib/format";
import { orpc } from "@/utils/orpc";

import { AlertDetail } from "./alert-detail";
import { StatusBadge } from "./status-badge";
import { type AlertListItem, type AlertStatus, alertRef, useAlertWrites } from "./use-alert-writes";

// The alert queue (Interpret → Validate). Grouped by where an alert is in the
// review, not by how alarming it looks (principle 2). The whole view is in the
// URL, so a queue or a single alert can be shared.

const VIEWS = {
  open: { label: "Needs a decision", statuses: ["new", "in_review", "unresolved"] },
  confirmed: { label: "Confirmed", statuses: ["confirmed"] },
  rejected: { label: "Rejected", statuses: ["rejected"] },
  all: { label: "All", statuses: [] },
} as const satisfies Record<string, { label: string; statuses: readonly AlertStatus[] }>;
type View = keyof typeof VIEWS;
const VIEW_KEYS = Object.keys(VIEWS) as View[];

const LENSES = ["water", "forest_land", "air"] as const;
const CONFIDENCES = ["high", "medium", "low"] as const;
const SORTS = {
  newest: "Newest first",
  oldest: "Oldest first",
  confidence: "Highest confidence",
} as const;
const PAGE_SIZE = 50;

const queueParsers = {
  view: parseAsStringLiteral(VIEW_KEYS).withDefault("open"),
  lens: parseAsStringLiteral(LENSES),
  confidence: parseAsStringLiteral(CONFIDENCES),
  basin: parseAsString,
  sort: parseAsStringLiteral(Object.keys(SORTS) as (keyof typeof SORTS)[]).withDefault("newest"),
  page: parseAsInteger.withDefault(0),
  alert: parseAsString,
};

export function AlertQueue() {
  const [state, setState] = useQueryStates(queueParsers, { history: "replace" });
  const canCall = useCanCallApi();
  const writes = useAlertWrites();

  const input = {
    status: [...VIEWS[state.view].statuses],
    lens: state.lens ?? undefined,
    confidence: state.confidence ?? undefined,
    basin: state.basin ?? undefined,
    sort: state.sort,
    page: state.page,
    pageSize: PAGE_SIZE,
  };
  const query = useQuery({
    ...orpc.alerts.list.queryOptions({ input }),
    enabled: canCall,
    placeholderData: keepPreviousData,
  });
  const data = query.data;

  // Filters reset paging; opening an alert keeps the queue as it was.
  const filter = (next: Partial<typeof state>) => void setState({ ...next, page: 0 });
  const open = (id: string | null) => void setState({ alert: id }, { history: "push" });

  const counts = data?.counts;
  const viewCount = (v: View) =>
    counts &&
    (VIEWS[v].statuses.length
      ? VIEWS[v].statuses.reduce((n, s) => n + counts[s], 0)
      : Object.values(counts).reduce((n, c) => n + c, 0));

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
      <div className={cn("min-w-0", state.alert && "hidden lg:block")}>
        <PageHeader
          title="Alerts"
          stage="Validate"
          description="Potential changes flagged by agreed rules. An alert is a prompt for review, not proof of wrongdoing."
        >
          {data?.items.some((a) => a.isSimulated) && <ModeBadge mode="simulated" />}
        </PageHeader>

        <div className="space-y-3 border-b px-4 py-3 sm:px-6 lg:px-8">
          <div
            role="tablist"
            aria-label="Review state"
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
              label="Lens"
              value={state.lens}
              onChange={(lens) => filter({ lens })}
              options={LENSES.map((l) => [l, LENS_LABEL[l]])}
              all="All lenses"
            />
            <FilterSelect
              label="Confidence"
              value={state.confidence}
              onChange={(confidence) => filter({ confidence })}
              options={CONFIDENCES.map((c) => [c, CONFIDENCE[c].label])}
              all="Any confidence"
            />
            <FilterSelect
              label="Basin"
              value={state.basin}
              onChange={(basin) => filter({ basin })}
              options={(data?.basins ?? (state.basin ? [state.basin] : [])).map((b) => [
                b,
                `${b} basin`,
              ])}
              all="All basins"
            />
            <FilterSelect
              label="Sort"
              value={state.sort}
              onChange={(sort) => filter({ sort: sort ?? "newest" })}
              options={Object.entries(SORTS) as [keyof typeof SORTS, string][]}
            />
          </div>
        </div>

        {!data ? (
          query.isError || !canCall ? (
            <Empty className="m-4 border border-dashed sm:m-8">
              <EmptyHeader>
                <EmptyTitle>No saved alerts on this device</EmptyTitle>
                <EmptyDescription>The queue will load when you're back online.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-px">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          )
        ) : data.items.length === 0 ? (
          <Empty className="m-4 border border-dashed sm:m-8">
            <EmptyHeader>
              <EmptyTitle>
                {state.view === "open" ? "Nothing waiting for a decision" : "No alerts match"}
              </EmptyTitle>
              <EmptyDescription>
                {state.lens || state.confidence || state.basin
                  ? "Try removing a filter."
                  : "New alerts appear here when an agreed rule flags a change."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <ul
              className={cn("divide-y transition-opacity", query.isPlaceholderData && "opacity-60")}
            >
              {data.items.map((a) => (
                <Row
                  key={a.id}
                  alert={a}
                  pendingStatus={writes.pending(a.id).status}
                  selected={state.alert === a.id}
                  onOpen={() => open(a.id)}
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

      {state.alert ? (
        <aside
          aria-label="Alert detail"
          className="lg:sticky lg:top-0 lg:h-[calc(100svh-3.5rem)] lg:overflow-y-auto lg:border-l"
        >
          <AlertDetail key={state.alert} id={state.alert} onClose={() => open(null)} />
        </aside>
      ) : (
        <aside className="text-muted-foreground hidden h-[calc(100svh-3.5rem)] place-items-center border-l p-8 text-center text-xs lg:sticky lg:top-0 lg:grid">
          Select an alert to see its evidence and record a decision.
        </aside>
      )}
    </div>
  );
}

function Row({
  alert,
  pendingStatus,
  selected,
  onOpen,
}: {
  alert: AlertListItem;
  pendingStatus: AlertStatus | null;
  selected: boolean;
  onOpen: () => void;
}) {
  const place = [alert.siteName, alert.basin && `${alert.basin} basin`].filter(Boolean).join(", ");
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
            <p className="text-muted-foreground font-mono text-[11px]">{alertRef(alert.number)}</p>
            <p className="mt-0.5 text-sm font-medium text-pretty">{alert.title}</p>
          </div>
          <span className="text-muted-foreground shrink-0" title={formatDateTime(alert.detectedAt)}>
            {ago(alert.detectedAt)}
          </span>
        </div>
        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusBadge status={pendingStatus ?? alert.status} />
          {pendingStatus && (
            <span className="inline-flex items-center gap-1">
              <CloudOff className="size-3" /> Not synced yet
            </span>
          )}
          <span>{CONFIDENCE[alert.confidence].label}</span>
          <span aria-hidden>·</span>
          <span>{LENS_LABEL[alert.lens]}</span>
          {place && (
            <>
              <span aria-hidden>·</span>
              <span>{place}</span>
            </>
          )}
          {alert.isSimulated && <ModeBadge mode="simulated" />}
        </div>
      </button>
    </li>
  );
}
