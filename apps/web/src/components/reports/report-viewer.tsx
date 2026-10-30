"use client";

import { Button } from "@ecolens/ui/components/button";
import { Skeleton } from "@ecolens/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CloudOff, Download, Loader2, Printer } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Form, Reason } from "@/components/incidents/incident-forms";
import { ModeBadge } from "@/components/map/provenance";
import { useCanCallApi } from "@/components/shell/use-me";
import { CloseBar } from "@/components/shell/workflow";
import { useOnline } from "@/hooks/use-network";
import { formatDateTime } from "@/lib/format";
import { client, orpc } from "@/utils/orpc";

import { ReportFeedback } from "./report-feedback";
import { REPORT_KIND, type Report, useReportWrites } from "./use-report-writes";

// Report: the archived report exactly as filed. The HTML is shown in a
// sandboxed frame (no scripts), printed from there, and is the same document
// the PDF is made from.

export function ReportViewer({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useQuery({
    ...orpc.reports.get.queryOptions({ input: { id } }),
    enabled: useCanCallApi(),
  });
  const writes = useReportWrites();
  const queued = writes.queued.find((i) => i.id === id);

  if (query.data) return <Loaded report={query.data} onClose={onClose} />;

  return (
    <div className="space-y-3 p-4 text-xs">
      <CloseBar label="Report" back="Reports" onClose={onClose} />
      {queued ? (
        <p className="text-muted-foreground inline-flex items-center gap-1">
          <CloudOff className="size-3" />
          {queued.status === "failed"
            ? `Not generated: ${queued.error}`
            : "Requested on this device. The report is generated when this syncs."}
        </p>
      ) : query.isError ? (
        <p className="text-muted-foreground text-sm">
          {query.error.message === "Report not found."
            ? "This report isn't available to you, or no longer exists."
            : "This report hasn't been saved on this device yet. It will load when you're back online."}
        </p>
      ) : (
        <>
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-[60vh] w-full" />
        </>
      )}
    </div>
  );
}

function Loaded({ report, onClose }: { report: Report; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const online = useOnline();
  const writes = useReportWrites();
  const [approving, setApproving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const pendingApproval = writes.publishing(report.id);
  const published = report.isPublished || (pendingApproval && pendingApproval.status !== "failed");

  async function download() {
    setDownloading(true);
    try {
      const file = await client.reports.pdf({ id: report.id });
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name || `${report.ref}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't download the PDF.", {
        action: { label: "Print instead", onClick: print },
      });
    } finally {
      setDownloading(false);
    }
  }

  function print() {
    frame.current?.contentWindow?.print();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b p-4 text-xs sm:px-5">
        <CloseBar label={report.ref} back="Reports" onClose={onClose} />
        <div className="space-y-1">
          <p className="text-muted-foreground">
            {REPORT_KIND[report.kind]} · {report.ref}
          </p>
          <h2 className="text-base font-medium text-pretty">{report.title}</h2>
          <div className="text-muted-foreground flex flex-wrap items-center gap-1.5">
            <span>
              Generated {formatDateTime(report.generatedAt)}
              {report.generatedBy && ` by ${report.generatedBy}`}
            </span>
            {report.isSimulated && <ModeBadge mode="simulated" />}
            {published && (
              <span className="inline-flex items-center gap-1 border border-emerald-500/40 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-3" />
                {report.isPublished
                  ? `Approved for circulation${report.publishedAt ? ` ${formatDateTime(report.publishedAt)}` : ""}`
                  : "Approval saved on this device"}
              </span>
            )}
            {report.isSensitive && (
              <span className="border-destructive/40 text-destructive border px-1.5 py-0.5">
                Sensitive · do not circulate
              </span>
            )}
          </div>
        </div>
        {!approving && (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void download()}
              disabled={!online || downloading || (!report.hasPdf && !report.canMakePdf)}
              title={
                !report.hasPdf && !report.canMakePdf
                  ? "PDF rendering isn't set up yet. Use Print and save as PDF."
                  : undefined
              }
            >
              {downloading ? <Loader2 className="animate-spin" /> : <Download />} PDF
            </Button>
            <Button variant="outline" onClick={print}>
              <Printer /> Print
            </Button>
            {report.canPublish && !published && !report.isSensitive && (
              <Button variant="outline" onClick={() => setApproving(true)}>
                Approve for circulation
              </Button>
            )}
          </div>
        )}
        {approving && (
          <ApproveForm
            onCancel={() => setApproving(false)}
            onSubmit={async (note) => {
              await writes.publish(report, note);
              setApproving(false);
              toast.success(`${report.ref} approved for circulation`, {
                description: online ? "Sending now." : "It will be sent when you're back online.",
              });
            }}
          />
        )}
        {!approving && <ReportFeedback reportId={report.id} reportRef={report.ref} />}
        {pendingApproval?.status === "failed" && (
          <p className="text-destructive">Approval not saved: {pendingApproval.error}</p>
        )}
      </div>
      <iframe
        ref={frame}
        title={`Report ${report.ref}`}
        srcDoc={report.html}
        // No scripts; same origin only so Print can reach the frame.
        sandbox="allow-same-origin allow-modals"
        className="min-h-[70vh] w-full flex-1 bg-white"
      />
    </div>
  );
}

function ApproveForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Form
      submitLabel="Approve"
      missing={[note.trim().length < 10 && "a note of at least 10 characters"]}
      onSubmit={() => onSubmit(note.trim())}
      onCancel={onCancel}
    >
      <p className="text-muted-foreground text-pretty">
        Approval releases the report to partner institutions signed in to Ecolens. Nothing is
        published publicly until publication rules are agreed.
      </p>
      <Reason
        label="Why it can be circulated"
        value={note}
        onChange={setNote}
        placeholder="e.g. Reviewed with the lead institution; no sensitive locations."
      />
    </Form>
  );
}
