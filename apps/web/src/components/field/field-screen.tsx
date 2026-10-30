"use client";

import { Button, buttonVariants } from "@ecolens/ui/components/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@ecolens/ui/components/empty";
import { Skeleton } from "@ecolens/ui/components/skeleton";
import { cn } from "@ecolens/ui/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CloudOff, Crosshair, MapPin, Plus } from "lucide-react";
import Link from "next/link";
import {
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import { useState } from "react";
import { toast } from "sonner";

import { alertRef } from "@/components/alerts/use-alert-writes";
import { LENS_LABEL } from "@/components/map/config";
import { ModeBadge } from "@/components/map/provenance";
import { PageHeader } from "@/components/shell/page";
import { useCanCallApi, useMe } from "@/components/shell/use-me";
import { useOnline } from "@/hooks/use-network";
import { ago, formatDate, formatDateTime } from "@/lib/format";
import { orpc } from "@/utils/orpc";

import {
  ASSESSMENT,
  type Assessment,
  activityLabel,
  distanceKm,
  type FieldReportListItem,
  formatKm,
  type VerificationRequest,
} from "./config";
import { ReportDetail } from "./report-detail";
import { ReportForm } from "./report-form";
import { useFieldWrites } from "./use-field-writes";

// Observe (field) and Validate ← field confirmation. Field officers see the
// checks asked of their institution, nearest first when the phone's location
// is known, and file reports with or without signal. Reviewers see every
// report they are cleared for.

const PAGE_SIZE = 30;
const parsers = {
  tab: parseAsStringLiteral(["checks", "mine", "all"] as const),
  new: parseAsBoolean.withDefault(false),
  alert: parseAsString,
  report: parseAsString,
  page: parseAsInteger.withDefault(0),
};

export function FieldScreen() {
  const [state, setState] = useQueryStates(parsers, { history: "replace" });
  const me = useMe();
  const canCall = useCanCallApi();
  const writes = useFieldWrites();
  const online = useOnline();

  const permissions = me.data?.permissions ?? [];
  const canCreate = permissions.includes("field_report:create");
  const tab = state.tab ?? (canCreate ? "checks" : "all");

  const openReport = (id: string | null) =>
    void setState({ report: id, new: false }, { history: "push" });
  const startReport = (alertId: string | null) =>
    void setState({ new: true, alert: alertId, report: null }, { history: "push" });
  const closeForm = () => void setState({ new: false, alert: null }, { history: "push" });

  if (state.new && canCreate) {
    return (
      <NewReport
        alertId={state.alert}
        onCancel={closeForm}
        onSaved={async (draft, photos) => {
          const id = await writes.submit(draft, photos);
          toast.success("Report saved on this device", {
            description: online
              ? "Sending now."
              : "It will be sent, with its photos, when there's a connection.",
          });
          void setState(
            { new: false, alert: null, tab: "mine", report: id },
            { history: "replace" },
          );
        }}
      />
    );
  }

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
      <div className={cn("min-w-0", state.report && "hidden lg:block")}>
        <PageHeader
          title="Field reports"
          stage="Observe"
          description="GPS-tagged observations and photos from the field, used to confirm or reject alerts."
        >
          {canCreate && (
            <Button size="lg" onClick={() => startReport(null)}>
              <Plus /> New report
            </Button>
          )}
        </PageHeader>

        <div
          role="tablist"
          aria-label="Field reports"
          className="flex gap-1 overflow-x-auto border-b px-3 py-3 sm:px-5 lg:px-7"
        >
          {(
            [
              canCreate && ["checks", "To check"],
              canCreate && ["mine", "My reports"],
              ["all", "All reports"],
            ].filter(Boolean) as [typeof tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => void setState({ tab: key, page: 0 })}
              className={cn(
                "hover:bg-muted inline-flex h-8 shrink-0 items-center gap-1.5 px-3 text-xs outline-none focus-visible:ring-1",
                tab === key ? "bg-muted font-medium" : "text-muted-foreground",
              )}
            >
              {label}
              {key === "mine" && writes.queued.length > 0 && (
                <span className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-300">
                  <CloudOff className="size-3" />
                  {writes.queued.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "checks" ? (
          <Checks enabled={canCall} onReport={startReport} />
        ) : (
          <Reports
            mine={tab === "mine"}
            page={state.page}
            onPage={(page) => void setState({ page })}
            selected={state.report}
            onOpen={openReport}
          />
        )}
      </div>

      {state.report ? (
        <aside
          aria-label="Field report"
          className="lg:sticky lg:top-0 lg:h-[calc(100svh-3.5rem)] lg:overflow-y-auto lg:border-l"
        >
          <ReportDetail key={state.report} id={state.report} onClose={() => openReport(null)} />
        </aside>
      ) : (
        <aside className="text-muted-foreground hidden h-[calc(100svh-3.5rem)] place-items-center border-l p-8 text-center text-xs lg:sticky lg:top-0 lg:grid">
          Select a report to see its photos and where it was recorded.
        </aside>
      )}
    </div>
  );
}

function NewReport({
  alertId,
  onCancel,
  onSaved,
}: {
  alertId: string | null;
  onCancel: () => void;
  onSaved: Parameters<typeof ReportForm>[0]["onSubmit"];
}) {
  const canCall = useCanCallApi();
  // The alert comes from the saved checks list, or the alert itself, so it works offline.
  const checks = useQuery({ ...orpc.fieldReports.requests.queryOptions(), enabled: canCall });
  const fromCheck = checks.data?.find((r) => r.alertId === alertId);
  const alert = useQuery({
    ...orpc.alerts.get.queryOptions({ input: { id: alertId ?? "" } }),
    enabled: canCall && !!alertId && !fromCheck,
  });
  const linked = alertId
    ? fromCheck
      ? { id: alertId, ref: alertRef(fromCheck.alertNumber), title: fromCheck.alertTitle }
      : alert.data
        ? { id: alertId, ref: alertRef(alert.data.number), title: alert.data.title }
        : { id: alertId, ref: "the alert", title: "Linked alert" }
    : null;

  return (
    <div>
      <PageHeader
        title="New field report"
        stage="Observe"
        description="Saved on this phone first, so it works without signal."
      />
      <div className="mx-auto max-w-xl px-4 py-5 sm:px-6">
        <ReportForm alert={linked} onSubmit={onSaved} onCancel={onCancel} />
      </div>
    </div>
  );
}

type Here = { lng: number; lat: number } | null;

function Checks({ enabled, onReport }: { enabled: boolean; onReport: (alertId: string) => void }) {
  const query = useQuery({ ...orpc.fieldReports.requests.queryOptions(), enabled });
  const writes = useFieldWrites();
  const [here, setHere] = useState<Here>(null);
  const [locating, setLocating] = useState(false);

  function locate() {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setHere({ lng: p.coords.longitude, lat: p.coords.latitude });
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast.error("Couldn't get your location to sort by distance.");
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 30_000 },
    );
  }

  if (!query.data) {
    return query.isError || !enabled ? (
      <Empty className="m-4 border border-dashed sm:m-8">
        <EmptyHeader>
          <EmptyTitle>No saved checks on this device</EmptyTitle>
          <EmptyDescription>They will load when you're back online.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    ) : (
      <div className="space-y-px">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  // A check already answered from this device stays listed until it syncs.
  const answered = new Set(writes.queued.map((i) => i.input.alertId as string | undefined));
  const rows = query.data
    .map((r) => ({ ...r, km: here ? distanceKm(here, r) : null }))
    .sort((a, b) => (a.km !== null && b.km !== null ? a.km - b.km : 0));

  if (rows.length === 0) {
    return (
      <Empty className="m-4 border border-dashed sm:m-8">
        <EmptyHeader>
          <EmptyTitle>No checks asked of your team</EmptyTitle>
          <EmptyDescription>
            When an analyst asks for a field check of an alert, it appears here. You can still file
            a report on anything you see.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <div className="text-muted-foreground flex items-center justify-between gap-2 px-4 py-2 text-xs sm:px-6 lg:px-8">
        <span>
          {rows.length} open check{rows.length === 1 ? "" : "s"}
          {here ? ", nearest first" : ", due soonest first"}
        </span>
        {!here && (
          <Button variant="ghost" size="sm" onClick={locate} disabled={locating}>
            <Crosshair /> {locating ? "Locating…" : "Sort by distance"}
          </Button>
        )}
      </div>
      <ul className="divide-y border-t">
        {rows.map((r) => (
          <CheckRow
            key={r.id}
            check={r}
            km={r.km}
            answered={answered.has(r.alertId)}
            onReport={() => onReport(r.alertId)}
          />
        ))}
      </ul>
    </>
  );
}

function CheckRow({
  check,
  km,
  answered,
  onReport,
}: {
  check: VerificationRequest;
  km: number | null;
  answered: boolean;
  onReport: () => void;
}) {
  const overdue = check.dueAt && new Date(check.dueAt).getTime() < Date.now();
  const place = [check.siteName, check.basin && `${check.basin} basin`].filter(Boolean).join(", ");
  return (
    <li className="space-y-2 px-4 py-4 text-xs sm:px-6 lg:px-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground font-mono text-[11px]">
            {alertRef(check.alertNumber)}
          </p>
          <p className="mt-0.5 text-sm font-medium text-pretty">{check.alertTitle}</p>
        </div>
        {km !== null && <span className="shrink-0 font-medium tabular-nums">{formatKm(km)}</span>}
      </div>
      <p className="text-pretty">{check.instructions}</p>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{LENS_LABEL[check.lens]}</span>
        {place && (
          <>
            <span aria-hidden>·</span>
            <span>{place}</span>
          </>
        )}
        <span aria-hidden>·</span>
        <span>
          Asked {ago(check.requestedAt)}
          {check.requestedBy && ` by ${check.requestedBy}`}
        </span>
        {check.dueAt && (
          <span className={cn(overdue && "text-amber-700 dark:text-amber-300")}>
            · {overdue ? "Overdue since" : "Due"} {formatDate(check.dueAt)}
          </span>
        )}
        {check.isSimulated && <ModeBadge mode="simulated" />}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {answered ? (
          <span className="text-muted-foreground inline-flex h-9 items-center gap-1">
            <CloudOff className="size-3" /> Report saved on this device
          </span>
        ) : (
          <Button size="lg" onClick={onReport}>
            Report on this
          </Button>
        )}
        <Link
          href={`/map?alert=${check.alertId}`}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          <MapPin /> Map
        </Link>
      </div>
    </li>
  );
}

function Reports({
  mine,
  page,
  onPage,
  selected,
  onOpen,
}: {
  mine: boolean;
  page: number;
  onPage: (page: number) => void;
  selected: string | null;
  onOpen: (id: string) => void;
}) {
  const writes = useFieldWrites();
  const query = useQuery({
    ...orpc.fieldReports.list.queryOptions({ input: { mine, page, pageSize: PAGE_SIZE } }),
    enabled: useCanCallApi(),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const local = mine && page === 0 ? writes.queued : [];

  return (
    <>
      {local.length > 0 && (
        <ul className="divide-y border-b">
          {local.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                className={cn(
                  "hover:bg-muted/50 block w-full px-4 py-3 text-left text-xs sm:px-6 lg:px-8",
                  selected === item.id && "bg-muted",
                )}
              >
                <p className="font-medium">{item.label}</p>
                <p className="mt-0.5 line-clamp-2 text-pretty">{String(item.input.observation)}</p>
                <p
                  className={cn(
                    "mt-1 inline-flex items-center gap-1",
                    item.status === "failed" ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  <CloudOff className="size-3" />
                  {item.status === "failed"
                    ? `Not sent: ${item.error}`
                    : item.status === "syncing"
                      ? "Sending…"
                      : `Saved on this device · ${formatDateTime(item.createdAt)}`}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!data ? (
        query.isError ? (
          <Empty className="m-4 border border-dashed sm:m-8">
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
      ) : data.items.length === 0 && local.length === 0 ? (
        <Empty className="m-4 border border-dashed sm:m-8">
          <EmptyHeader>
            <EmptyTitle>
              {mine ? "You haven't filed a report yet" : "No field reports yet"}
            </EmptyTitle>
            <EmptyDescription>
              Reports place people and activity at exact locations, so only roles cleared for
              sensitive locations see them.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <ul className={cn("divide-y", query.isPlaceholderData && "opacity-60")}>
            {data.items.map((r) => (
              <ReportRow
                key={r.id}
                report={r}
                selected={selected === r.id}
                photosWaiting={writes.photosWaiting(r.id).length}
                onOpen={() => onOpen(r.id)}
              />
            ))}
          </ul>
          {(page > 0 || data.hasMore) && (
            <footer className="text-muted-foreground flex items-center justify-between px-4 py-3 text-xs sm:px-6 lg:px-8">
              <span>
                {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + data.items.length} of {data.total}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Previous page"
                  disabled={page === 0}
                  onClick={() => onPage(page - 1)}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Next page"
                  disabled={!data.hasMore}
                  onClick={() => onPage(page + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            </footer>
          )}
        </>
      )}
    </>
  );
}

function ReportRow({
  report,
  selected,
  photosWaiting,
  onOpen,
}: {
  report: FieldReportListItem;
  selected: boolean;
  photosWaiting: number;
  onOpen: () => void;
}) {
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
          <p className="text-muted-foreground font-mono text-[11px]">
            {report.alertNumber ? `Check of ${alertRef(report.alertNumber)}` : "Observation"}
            {report.institution && ` · ${report.institution}`}
          </p>
          <span className="text-muted-foreground shrink-0">{ago(report.clientCreatedAt)}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-pretty">{report.observation}</p>
        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {report.assessment && (
            <span className="border px-1.5 py-0.5">
              {ASSESSMENT[report.assessment as Assessment].label}
            </span>
          )}
          {report.activityTypes.slice(0, 3).map((a) => (
            <span key={a}>{activityLabel(a)}</span>
          ))}
          {report.photoCount > 0 && (
            <span>
              · {report.photoCount} photo{report.photoCount === 1 ? "" : "s"}
            </span>
          )}
          {photosWaiting > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
              <CloudOff className="size-3" /> {photosWaiting} to upload
            </span>
          )}
          {report.isSimulated && <ModeBadge mode="simulated" />}
        </div>
      </button>
    </li>
  );
}
