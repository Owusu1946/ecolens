"use client";

import { Button } from "@ecolens/ui/components/button";
import { cn } from "@ecolens/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { toast } from "sonner";

import { SourcesPanel } from "@/components/dashboard/panels";
import { Panel, PanelSkeleton, Stat } from "@/components/dashboard/widgets";
import { PageHeader } from "@/components/shell/page";
import { useCanCallApi, useMe } from "@/components/shell/use-me";
import { useOnline } from "@/hooks/use-network";
import { ago } from "@/lib/format";
import { client, orpc } from "@/utils/orpc";

import { Members } from "./members";

const TABS = { members: "Members", sources: "Data sources" } as const;

export function AdminScreen() {
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(Object.keys(TABS) as (keyof typeof TABS)[]).withDefault("members"),
  );
  return (
    <>
      <PageHeader
        title="Administration"
        description="Who has access to Ecolens, as what, and the health of each data source. Every change here is recorded in the audit trail."
      />
      <div
        role="tablist"
        aria-label="Administration"
        className="flex gap-1 border-b px-3 py-3 sm:px-5 lg:px-7"
      >
        {(Object.keys(TABS) as (keyof typeof TABS)[]).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => void setTab(k)}
            className={cn(
              "hover:bg-muted inline-flex h-8 items-center px-3 text-xs outline-none focus-visible:ring-1",
              tab === k ? "bg-muted font-medium" : "text-muted-foreground",
            )}
          >
            {TABS[k]}
          </button>
        ))}
      </div>
      <div className="max-w-4xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        {tab === "members" ? (
          <Members />
        ) : (
          <>
            <LiveFeedPanel />
            <SourcesPanel />
          </>
        )}
      </div>
    </>
  );
}

/** The live FIRMS feed: whether it's switched on, its latest data, and a manual run. */
export function LiveFeedPanel() {
  const me = useMe();
  const online = useOnline();
  const queryClient = useQueryClient();
  const canManage = me.data?.permissions.includes("data_source:manage") ?? false;
  const status = useQuery({
    ...orpc.ingest.status.queryOptions(),
    enabled: useCanCallApi() && canManage,
  });
  const run = useMutation({
    mutationFn: () => client.ingest.runFirms(),
    onSuccess: (r) => {
      toast.success(
        `Fetched ${r.fetched} detections, ${r.stored} new. ${r.opened} alert${r.opened === 1 ? "" : "s"} opened, ${r.extended} extended.`,
      );
      void queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(e.message),
  });
  if (!canManage) return null;
  const f = status.data?.firms;

  return (
    <Panel
      title="Live thermal feed (NASA FIRMS)"
      description="Fetched hourly; the rule “Thermal anomaly near a river” runs on each fetch."
    >
      {!f ? (
        <PanelSkeleton />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Status" value={f.configured ? "On" : "Off"} />
            <Stat label="Detections stored" value={f.detections} />
            <Stat
              label="Last fetched"
              value={f.lastIngested ? ago(f.lastIngested) : "—"}
              detail={f.latestDetection ? `Latest pass ${ago(f.latestDetection)}` : undefined}
            />
          </div>
          {f.configured ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!online || run.isPending}
              onClick={() => run.mutate()}
            >
              {run.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Fetch now
            </Button>
          ) : (
            <p className="text-muted-foreground text-xs text-pretty">
              Switched off until a free NASA FIRMS MAP_KEY is set on the API (
              <code>FIRMS_MAP_KEY</code>). Until then thermal alerts come from prepared data only.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
