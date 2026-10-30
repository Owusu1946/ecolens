"use client";

import { buttonVariants } from "@ecolens/ui/components/button";
import { Skeleton } from "@ecolens/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { CloudOff, ImageOff, ListChecks, MapPin } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { alertRef } from "@/components/alerts/use-alert-writes";
import { ModeBadge } from "@/components/map/provenance";
import { useCanCallApi, useMe } from "@/components/shell/use-me";
import { CloseBar, Section } from "@/components/shell/workflow";
import { formatDateTime } from "@/lib/format";
import { orpc } from "@/utils/orpc";

import { ASSESSMENT, type Assessment, activityLabel, type FieldReport } from "./config";
import { useFieldWrites } from "./use-field-writes";

// Observe (field): one report as submitted, with its photos and where it was
// recorded. Exact coordinates are only ever served to cleared roles.

export function ReportDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useQuery({
    ...orpc.fieldReports.get.queryOptions({ input: { id } }),
    enabled: useCanCallApi(),
  });
  const writes = useFieldWrites();
  const queued = writes.queued.find((i) => i.id === id);

  if (query.data) return <Loaded report={query.data} onClose={onClose} />;

  return (
    <div className="space-y-3 p-4 text-xs">
      <CloseBar label="Field report" back="Field reports" onClose={onClose} />
      {queued ? (
        <div className="space-y-2">
          <h2 className="text-base font-medium">{queued.label}</h2>
          <p className="text-pretty whitespace-pre-line">{String(queued.input.observation)}</p>
          <p className="text-muted-foreground inline-flex items-center gap-1">
            <CloudOff className="size-3" />
            {queued.status === "failed"
              ? `Not sent: ${queued.error}`
              : "Saved on this device. It will be sent when there's a connection."}
          </p>
        </div>
      ) : query.isError ? (
        <p className="text-muted-foreground text-sm">
          {query.error.message === "Field report not found."
            ? "This report isn't available to you, or no longer exists."
            : "This report hasn't been saved on this device yet. It will load when you're back online."}
        </p>
      ) : (
        <>
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-24 w-full" />
        </>
      )}
    </div>
  );
}

function Loaded({ report, onClose }: { report: FieldReport; onClose: () => void }) {
  const me = useMe();
  const writes = useFieldWrites();
  const waiting = writes.photosWaiting(report.id).length;
  const place = [
    report.site?.name,
    report.site?.basin && `${report.site.basin} basin`,
    report.site?.district,
  ]
    .filter(Boolean)
    .join(", ");
  const delayH =
    (new Date(report.receivedAt).getTime() - new Date(report.clientCreatedAt).getTime()) /
    3_600_000;

  const facts: [string, string][] = [
    ["Recorded", formatDateTime(report.clientCreatedAt)],
    // Reports are often written without signal and synced hours later.
    [
      "Received",
      `${formatDateTime(report.receivedAt)}${delayH >= 1 ? ` (${Math.round(delayH)} h later)` : ""}`,
    ],
    ["By", report.institution ?? "Field team"],
    [
      "Location",
      `${report.lat.toFixed(5)}, ${report.lng.toFixed(5)}${report.gpsAccuracyM != null ? ` ±${Math.round(report.gpsAccuracyM)} m` : ""}`,
    ],
    ...(place ? [["Site", place] as [string, string]] : []),
  ];

  return (
    <article className="space-y-6 p-4 text-xs sm:p-5">
      <CloseBar label="Field report" back="Field reports" onClose={onClose} />
      <header className="space-y-2">
        <h2 className="text-base font-medium">
          {report.alert ? `Field check of ${alertRef(report.alert.number)}` : "Field observation"}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {report.assessment && (
            <span className="border px-1.5 py-0.5">
              {ASSESSMENT[report.assessment as Assessment].label}
            </span>
          )}
          {report.isSimulated && <ModeBadge mode="simulated" />}
          {waiting > 0 && (
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <CloudOff className="size-3" /> {waiting} photo{waiting === 1 ? "" : "s"} waiting to
              upload
            </span>
          )}
        </div>
      </header>

      <p className="text-sm text-pretty whitespace-pre-line">{report.observation}</p>

      {report.activityTypes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {report.activityTypes.map((a) => (
            <span key={a} className="border px-1.5 py-0.5">
              {activityLabel(a)}
            </span>
          ))}
        </div>
      )}

      {report.photos.length > 0 && (
        <Section title={`Photos (${report.photos.length})`}>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {report.photos.map((p, i) => (
              <Photo key={p.id} id={p.id} uploaded={p.uploaded} n={i + 1} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Details">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-pretty">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/map?lng=${report.lng}&lat=${report.lat}&z=14${report.alert ? `&alert=${report.alert.id}` : ""}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <MapPin /> View on map
          </Link>
          {report.alert && me.data?.permissions.includes("alert:read") && (
            <Link
              href={`/alerts?view=all&alert=${report.alert.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ListChecks /> Open {alertRef(report.alert.number)}
            </Link>
          )}
        </div>
      </Section>

      <p className="text-muted-foreground border-l-2 pl-2.5 leading-relaxed text-pretty">
        A field report is one person's observation at one moment. It informs the review of an alert;
        it is not on its own proof of wrongdoing.
      </p>
    </article>
  );
}

function Photo({ id, uploaded, n }: { id: string; uploaded: boolean; n: number }) {
  const query = useQuery({
    ...orpc.fieldReports.photo.queryOptions({ input: { id } }),
    enabled: useCanCallApi() && uploaded,
    staleTime: Number.POSITIVE_INFINITY,
    meta: { persist: false },
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!query.data) return;
    const u = URL.createObjectURL(query.data);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [query.data]);

  if (!uploaded || query.isError) {
    return (
      <div className="text-muted-foreground grid aspect-[4/3] place-items-center border text-center text-[11px]">
        <span className="grid justify-items-center gap-1 p-2">
          <ImageOff className="size-4" />
          {uploaded ? "Couldn't load this photo" : "Not uploaded yet"}
        </span>
      </div>
    );
  }
  if (!url) return <Skeleton className="aspect-[4/3] w-full" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden border">
      {/* biome-ignore lint/performance/noImgElement: blob URL from the API */}
      <img src={url} alt={`Site view ${n}`} className="aspect-[4/3] w-full object-cover" />
    </a>
  );
}
