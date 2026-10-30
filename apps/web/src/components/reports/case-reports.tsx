"use client";

import { Button } from "@ecolens/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CloudOff, FileText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useCanCallApi, useMe } from "@/components/shell/use-me";
import { Section } from "@/components/shell/workflow";
import { useOnline } from "@/hooks/use-network";
import { formatDateTime } from "@/lib/format";
import { orpc } from "@/utils/orpc";

import { useReportWrites } from "./use-report-writes";

/** Reports filed on an incident or alert, and the button to generate one. */
export function CaseReports({
  target,
  caseRef,
  generateLabel,
}: {
  target: { incidentId: string } | { alertId: string };
  caseRef: string;
  generateLabel: string;
}) {
  const me = useMe();
  const router = useRouter();
  const online = useOnline();
  const writes = useReportWrites();
  const permissions = me.data?.permissions ?? [];
  const canRead = permissions.includes("report:read");
  const canGenerate = permissions.includes("report:generate");
  const query = useQuery({
    ...orpc.reports.list.queryOptions({ input: { ...target, pageSize: 10 } }),
    enabled: useCanCallApi() && canRead,
  });
  const queued = writes.generating(target);
  const reports = query.data?.items ?? [];

  if (!canRead && !canGenerate) return null;
  if (!canGenerate && reports.length === 0) return null;

  async function generate() {
    const id = await writes.generate(target, caseRef);
    toast.success(`Report on ${caseRef} requested`, {
      description: online
        ? "It records the case as it stands now."
        : "It will be generated when you're back online.",
      action: id
        ? { label: "Open", onClick: () => router.push(`/reports?report=${id}`) }
        : undefined,
    });
  }

  return (
    <Section title="Reports">
      <div className="space-y-2">
        {reports.map((r) => (
          <Link
            key={r.id}
            href={`/reports?report=${r.id}`}
            className="hover:bg-muted/50 flex items-center gap-2 border p-2.5"
          >
            <FileText className="text-muted-foreground size-3.5" />
            <span className="flex-1">Generated {formatDateTime(r.generatedAt)}</span>
            {r.isPublished && (
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-3" /> Approved
              </span>
            )}
          </Link>
        ))}
        {queued && (
          <p
            className={
              queued.status === "failed"
                ? "text-destructive"
                : "text-muted-foreground inline-flex items-center gap-1"
            }
          >
            <CloudOff className="mr-1 inline size-3" />
            {queued.status === "failed"
              ? `Report not generated: ${queued.error}`
              : "Report requested on this device"}
          </p>
        )}
        {canGenerate && (!queued || queued.status === "failed") && (
          <Button variant="outline" size="sm" onClick={() => void generate()}>
            <FileText /> {generateLabel}
          </Button>
        )}
      </div>
    </Section>
  );
}
