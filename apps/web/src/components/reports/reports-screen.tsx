"use client";

import { Button } from "@ecolens/ui/components/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@ecolens/ui/components/empty";
import { Skeleton } from "@ecolens/ui/components/skeleton";
import { cn } from "@ecolens/ui/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, ChevronRight, CloudOff, FileText } from "lucide-react";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

import { ModeBadge } from "@/components/map/provenance";
import { PageHeader } from "@/components/shell/page";
import { useCanCallApi } from "@/components/shell/use-me";
import { ago, formatDateTime } from "@/lib/format";
import { orpc } from "@/utils/orpc";

import { ReportViewer } from "./report-viewer";
import { REPORT_KIND, type ReportListItem, useReportWrites } from "./use-report-writes";

// Report: the archive of generated reports. Each is frozen at generation, so
// the list is also the record of what each institution was told and when.

const PAGE_SIZE = 50;
const FILTERS = { all: "All", approved: "Approved for circulation", drafts: "Not yet approved" };
const parsers = {
  show: parseAsStringLiteral(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).withDefault("all"),
  page: parseAsInteger.withDefault(0),
  report: parseAsString,
};

export function ReportsScreen() {
  const [state, setState] = useQueryStates(parsers, { history: "replace" });
  const writes = useReportWrites();
  const query = useQuery({
    ...orpc.reports.list.queryOptions({
      input: {
        published: state.show === "all" ? undefined : state.show === "approved",
        page: state.page,
        pageSize: PAGE_SIZE,
      },
    }),
    enabled: useCanCallApi(),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const open = (id: string | null) => void setState({ report: id }, { history: "push" });
  const queued = state.page === 0 ? writes.queued : [];

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className={cn("min-w-0 lg:border-r", state.report && "hidden lg:block")}>
        <PageHeader
          title="Reports"
          stage="Report"
          description="One-page assessment records: evidence, confidence, validation, responsible institution and action taken."
        />
        <div
          role="tablist"
          aria-label="Approval"
          className="flex gap-1 overflow-x-auto border-b px-3 py-3 sm:px-5"
        >
          {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={state.show === k}
              onClick={() => void setState({ show: k, page: 0 })}
              className={cn(
                "hover:bg-muted inline-flex h-7 shrink-0 items-center px-2.5 text-xs outline-none focus-visible:ring-1",
                state.show === k ? "bg-muted font-medium" : "text-muted-foreground",
              )}
            >
              {FILTERS[k]}
            </button>
          ))}
        </div>

        {queued.length > 0 && (
          <ul className="divide-y border-b">
            {queued.map((q) => (
              <li key={q.id} className="px-4 py-3 text-xs sm:px-6">
                <p className="font-medium">{q.label}</p>
                <p
                  className={cn(
                    "mt-0.5 inline-flex items-center gap-1",
                    q.status === "failed" ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  <CloudOff className="size-3" />
                  {q.status === "failed"
                    ? `Not generated: ${q.error}`
                    : "Generated when this syncs"}
                </p>
              </li>
            ))}
          </ul>
        )}

        {!data ? (
          query.isError ? (
            <Empty className="m-4 border border-dashed">
              <EmptyHeader>
                <EmptyTitle>No saved reports on this device</EmptyTitle>
                <EmptyDescription>They will load when you're back online.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-px">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          )
        ) : data.items.length === 0 ? (
          <Empty className="m-4 border border-dashed">
            <EmptyHeader>
              <EmptyTitle>No reports yet</EmptyTitle>
              <EmptyDescription>
                Generate one from an incident or an alert. It records the case as it stands at that
                moment.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <ul className={cn("divide-y", query.isPlaceholderData && "opacity-60")}>
              {data.items.map((r) => (
                <Row
                  key={r.id}
                  report={r}
                  selected={state.report === r.id}
                  onOpen={() => open(r.id)}
                />
              ))}
            </ul>
            {(state.page > 0 || data.hasMore) && (
              <footer className="text-muted-foreground flex items-center justify-between px-4 py-3 text-xs sm:px-6">
                <span>
                  {state.page * PAGE_SIZE + 1}–{state.page * PAGE_SIZE + data.items.length} of{" "}
                  {data.total}
                </span>
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
              </footer>
            )}
          </>
        )}
      </div>

      {state.report ? (
        <section
          aria-label="Report"
          className="lg:sticky lg:top-0 lg:h-[calc(100svh-3.5rem)] lg:overflow-y-auto"
        >
          <ReportViewer key={state.report} id={state.report} onClose={() => open(null)} />
        </section>
      ) : (
        <div className="text-muted-foreground hidden h-[calc(100svh-3.5rem)] place-items-center p-8 text-center text-xs lg:sticky lg:top-0 lg:grid">
          <span className="grid justify-items-center gap-2">
            <FileText className="size-5" />
            Select a report to read, print or download it.
          </span>
        </div>
      )}
    </div>
  );
}

function Row({
  report,
  selected,
  onOpen,
}: {
  report: ReportListItem;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected || undefined}
        className={cn(
          "hover:bg-muted/50 block w-full px-4 py-3 text-left text-xs outline-none focus-visible:ring-1 focus-visible:ring-inset sm:px-6",
          selected && "bg-muted",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-muted-foreground font-mono text-[11px]">
            {report.ref} · {REPORT_KIND[report.kind]}
          </p>
          <span
            className="text-muted-foreground shrink-0"
            title={formatDateTime(report.generatedAt)}
          >
            {ago(report.generatedAt)}
          </span>
        </div>
        <p className="mt-0.5 text-sm font-medium text-pretty">{report.title}</p>
        <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {report.generatedBy && <span>By {report.generatedBy}</span>}
          {report.isPublished && (
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-3" /> Approved
            </span>
          )}
          {report.isSensitive && <span className="text-destructive">Sensitive</span>}
          {report.isSimulated && <ModeBadge mode="simulated" />}
        </div>
      </button>
    </li>
  );
}
