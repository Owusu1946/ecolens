"use client";

import { ROLE_LABELS, ROLES } from "@ecolens/api/auth/roles";
import { Button } from "@ecolens/ui/components/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@ecolens/ui/components/empty";
import { Input } from "@ecolens/ui/components/input";
import { Skeleton } from "@ecolens/ui/components/skeleton";
import { cn } from "@ecolens/ui/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shell/page";
import { useCanCallApi } from "@/components/shell/use-me";
import { FilterSelect } from "@/components/shell/workflow";
import { useOnline } from "@/hooks/use-network";
import { formatDateTime } from "@/lib/format";
import { client, orpc } from "@/utils/orpc";

// Principle 5: every status change with who (role and institution), when and
// why. Read-only, and append-only in the database itself. Evaluators can export
// it to assess detection performance and response speed independently.

const ENTITIES = {
  alert: "Alerts",
  incident: "Incidents",
  field_report: "Field reports",
  report: "Reports",
  institution: "Membership",
} as const;
type Entity = keyof typeof ENTITIES;

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
  "member.invite": "Member invited",
  "member.revoke_invitation": "Invitation withdrawn",
  "member.set_role": "Role changed",
  "member.remove": "Access removed",
};

const PAGE_SIZE = 50;
const parsers = {
  entity: parseAsStringLiteral(Object.keys(ENTITIES) as Entity[]),
  role: parseAsStringLiteral(ROLES),
  from: parseAsString,
  to: parseAsString,
  page: parseAsInteger.withDefault(0),
};

const LINK: Partial<Record<Entity, (id: string) => string>> = {
  alert: (id) => `/alerts?view=all&alert=${id}`,
  incident: (id) => `/incidents?view=all&incident=${id}`,
  field_report: (id) => `/field-reports?tab=all&report=${id}`,
  report: (id) => `/reports?report=${id}`,
};

export function AuditScreen() {
  const [state, setState] = useQueryStates(parsers, { history: "replace" });
  const online = useOnline();
  const [exporting, setExporting] = useState(false);
  const input = {
    entityType: state.entity ?? undefined,
    actorRole: state.role ?? undefined,
    from: state.from ?? undefined,
    to: state.to ?? undefined,
  };
  const query = useQuery({
    ...orpc.audit.list.queryOptions({ input: { ...input, page: state.page, pageSize: PAGE_SIZE } }),
    enabled: useCanCallApi(),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const filter = (next: Partial<typeof state>) => void setState({ ...next, page: 0 });

  // Up to 5,000 events in the current filter, as CSV.
  async function exportCsv() {
    setExporting(true);
    try {
      const rows: NonNullable<typeof data>["items"] = [];
      for (let page = 0; page < 25; page++) {
        const res = await client.audit.list({ ...input, page, pageSize: 200 });
        rows.push(...res.items);
        if (!res.hasMore) break;
      }
      const cell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
      const csv = [
        [
          "occurred_at",
          "action",
          "entity_type",
          "entity_id",
          "from_status",
          "to_status",
          "role",
          "institution",
          "reason",
          "data",
        ],
        ...rows.map((r) => [
          r.occurredAt,
          r.action,
          r.entityType,
          r.entityId,
          r.fromStatus,
          r.toStatus,
          r.actor ?? r.roleLabel,
          r.institution,
          r.reason,
          r.data ? JSON.stringify(r.data) : "",
        ]),
      ]
        .map((line) => line.map(cell).join(","))
        .join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `ecolens-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't export the audit trail.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Every status change across the workflow, with who, when and why. It can't be edited or deleted; corrections are new entries."
      >
        <Button variant="outline" disabled={!online || exporting} onClick={() => void exportCsv()}>
          {exporting ? <Loader2 className="animate-spin" /> : <Download />} Export CSV
        </Button>
      </PageHeader>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-6 lg:px-8">
        <FilterSelect
          label="Record"
          value={state.entity}
          onChange={(entity) => filter({ entity })}
          options={(Object.keys(ENTITIES) as Entity[]).map((e) => [e, ENTITIES[e]])}
          all="All records"
        />
        <FilterSelect
          label="Role"
          value={state.role}
          onChange={(role) => filter({ role })}
          options={ROLES.map((r) => [r, ROLE_LABELS[r]])}
          all="All roles"
        />
        <label
          htmlFor="audit-from"
          className="text-muted-foreground inline-flex items-center gap-1.5 text-xs"
        >
          From
          <Input
            id="audit-from"
            type="date"
            value={state.from ?? ""}
            onChange={(e) => filter({ from: e.target.value || null })}
            className="h-7 w-36"
          />
        </label>
        <label
          htmlFor="audit-to"
          className="text-muted-foreground inline-flex items-center gap-1.5 text-xs"
        >
          To
          <Input
            id="audit-to"
            type="date"
            value={state.to ?? ""}
            onChange={(e) => filter({ to: e.target.value || null })}
            className="h-7 w-36"
          />
        </label>
      </div>

      {!data ? (
        query.isError ? (
          <Empty className="m-4 border border-dashed sm:m-8">
            <EmptyHeader>
              <EmptyTitle>Audit trail not saved on this device</EmptyTitle>
              <EmptyDescription>It will load when you're back online.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-px">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )
      ) : data.items.length === 0 ? (
        <Empty className="m-4 border border-dashed sm:m-8">
          <EmptyHeader>
            <EmptyTitle>No entries match</EmptyTitle>
            <EmptyDescription>Try a wider date range or remove a filter.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <ol className={cn("divide-y", query.isPlaceholderData && "opacity-60")}>
            {data.items.map((e) => {
              const href = LINK[e.entityType as Entity]?.(e.entityId);
              return (
                <li
                  key={e.id}
                  className="grid gap-1 px-4 py-3 text-xs sm:grid-cols-[11rem_1fr] sm:px-6 lg:px-8"
                >
                  <time className="text-muted-foreground tabular-nums" dateTime={e.occurredAt}>
                    {formatDateTime(e.occurredAt)}
                  </time>
                  <div className="min-w-0 space-y-0.5">
                    <p>
                      {href ? (
                        <Link href={href as Route} className="font-medium hover:underline">
                          {ACTION[e.action] ?? e.action}
                        </Link>
                      ) : (
                        <span className="font-medium">{ACTION[e.action] ?? e.action}</span>
                      )}
                      {e.toStatus && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {e.fromStatus ? `${e.fromStatus.replaceAll("_", " ")} → ` : ""}
                          {e.toStatus.replaceAll("_", " ")}
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground">
                      {e.actor ?? e.roleLabel}
                      {!e.actor && e.institution && `, ${e.institution}`}
                    </p>
                    {e.reason && <p className="text-pretty whitespace-pre-line">{e.reason}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
          <footer className="text-muted-foreground flex items-center justify-between px-4 py-3 text-xs sm:px-6 lg:px-8">
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
        </>
      )}
    </>
  );
}
