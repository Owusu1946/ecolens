"use client";

import { Button } from "@ecolens/ui/components/button";
import { Label } from "@ecolens/ui/components/label";
import { Textarea } from "@ecolens/ui/components/textarea";
import { cn } from "@ecolens/ui/lib/utils";
import { Camera, Crosshair, Loader2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { ACTIVITY, type Activity, ASSESSMENT, type Assessment } from "./config";
import { type PreparedPhoto, preparePhoto } from "./photos";
import type { DraftReport } from "./use-field-writes";

// Observe (field): a report recorded on a phone, with or without signal. GPS
// works offline; the best reading taken while the form is open is kept.

const MAX_PHOTOS = 6;
const MIN_TEXT = 10;
// Readings worse than this are flagged; they still save.
const POOR_ACCURACY_M = 50;

type Fix = { lng: number; lat: number; accuracy: number };
type GpsState =
  | { kind: "waiting" }
  | { kind: "fix"; fix: Fix }
  | { kind: "error"; message: string };

function useBestPosition() {
  const [state, setState] = useState<GpsState>({ kind: "waiting" });
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` restarts the watch.
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setState({ kind: "error", message: "This device can't report its location." });
      return;
    }
    let best: Fix | null = null;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const fix = {
          lng: p.coords.longitude,
          lat: p.coords.latitude,
          accuracy: p.coords.accuracy,
        };
        if (!best || fix.accuracy <= best.accuracy) {
          best = fix;
          setState({ kind: "fix", fix });
        }
      },
      (e) =>
        !best &&
        setState({
          kind: "error",
          message:
            e.code === e.PERMISSION_DENIED
              ? "Location access is blocked. Allow it for Ecolens in your browser settings."
              : "Couldn't get a GPS fix. Move into the open and try again.",
        }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 60_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [attempt]);

  return {
    state,
    retry: () => {
      setState({ kind: "waiting" });
      setAttempt((n) => n + 1);
    },
  };
}

export function ReportForm({
  alert,
  onSubmit,
  onCancel,
}: {
  alert: { id: string; ref: string; title: string } | null;
  onSubmit: (draft: DraftReport, photos: PreparedPhoto[]) => Promise<void>;
  onCancel: () => void;
}) {
  const gps = useBestPosition();
  const [observation, setObservation] = useState("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [processing, setProcessing] = useState(0);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textId = useId();

  // Release previews when the form goes away.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(
    () => () => {
      for (const p of photosRef.current) URL.revokeObjectURL(p.preview);
    },
    [],
  );

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setPhotoError(null);
    const room = MAX_PHOTOS - photos.length;
    const chosen = [...files].slice(0, room);
    if (files.length > room) setPhotoError(`Up to ${MAX_PHOTOS} photos per report.`);
    setProcessing((n) => n + chosen.length);
    for (const file of chosen) {
      try {
        const photo = await preparePhoto(file);
        setPhotos((ps) => [...ps, photo]);
      } catch (e) {
        setPhotoError(e instanceof Error ? e.message : "Couldn't add that photo.");
      } finally {
        setProcessing((n) => n - 1);
      }
    }
  }

  function removePhoto(id: string) {
    setPhotos((ps) => {
      const p = ps.find((x) => x.id === id);
      if (p) URL.revokeObjectURL(p.preview);
      return ps.filter((x) => x.id !== id);
    });
  }

  const fix = gps.state.kind === "fix" ? gps.state.fix : null;
  const missing = [
    !fix && "a GPS location",
    observation.trim().length < MIN_TEXT && `what you saw (at least ${MIN_TEXT} characters)`,
    alert && !assessment && "whether it supports the alert",
    processing > 0 && "a moment for the photos to finish",
  ].filter(Boolean);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (missing.length || !fix || saving) return;
    setSaving(true);
    try {
      await onSubmit(
        {
          alertId: alert?.id,
          alertRef: alert?.ref,
          location: { lng: fix.lng, lat: fix.lat },
          gpsAccuracyM: Math.round(fix.accuracy),
          observation: observation.trim(),
          activityTypes: activities,
          assessment: assessment ?? undefined,
        },
        photos,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6 text-xs">
      {alert && (
        <div className="border p-3">
          <p className="text-muted-foreground font-mono text-[11px]">Checking {alert.ref}</p>
          <p className="mt-0.5 text-sm font-medium text-pretty">{alert.title}</p>
        </div>
      )}

      <section aria-labelledby="gps-label" className="space-y-2">
        <h2 id="gps-label" className="text-xs font-medium">
          Location
        </h2>
        <div
          className={cn(
            "flex items-center gap-2.5 border p-3",
            gps.state.kind === "error" && "border-destructive/40",
          )}
          aria-live="polite"
        >
          {gps.state.kind === "waiting" ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>Getting a GPS fix… This works without signal.</span>
            </>
          ) : gps.state.kind === "error" ? (
            <>
              <span className="text-destructive flex-1">{gps.state.message}</span>
              <Button type="button" size="sm" variant="outline" onClick={gps.retry}>
                Try again
              </Button>
            </>
          ) : (
            <>
              <Crosshair className="size-4 shrink-0" />
              <span className="flex-1 tabular-nums">
                {gps.state.fix.lat.toFixed(5)}, {gps.state.fix.lng.toFixed(5)}
                <span
                  className={cn(
                    "ml-2",
                    gps.state.fix.accuracy > POOR_ACCURACY_M
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-muted-foreground",
                  )}
                >
                  ±{Math.round(gps.state.fix.accuracy)} m
                  {gps.state.fix.accuracy > POOR_ACCURACY_M && " · low accuracy, still improving"}
                </span>
              </span>
            </>
          )}
        </div>
        <p className="text-muted-foreground text-[11px]">
          The exact location is shown only to roles cleared for sensitive locations.
        </p>
      </section>

      {alert && (
        <fieldset>
          <legend className="text-xs font-medium">Does what you saw support the alert?</legend>
          <div className="mt-2 grid gap-1.5">
            {(Object.keys(ASSESSMENT) as Assessment[]).map((a) => (
              <label
                key={a}
                className={cn(
                  "hover:bg-muted/60 flex cursor-pointer items-start gap-2.5 border p-3",
                  assessment === a && "border-foreground/40 bg-muted/60",
                )}
              >
                <input
                  type="radio"
                  name="assessment"
                  checked={assessment === a}
                  onChange={() => setAssessment(a)}
                  className="accent-foreground mt-0.5"
                />
                <span>
                  <span className="font-medium">{ASSESSMENT[a].label}</span>
                  <span className="text-muted-foreground mt-0.5 block">{ASSESSMENT[a].hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div>
        <Label htmlFor={textId} className="text-xs">
          What did you see?
        </Label>
        <Textarea
          id={textId}
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          maxLength={4000}
          rows={5}
          aria-invalid={tried && observation.trim().length < MIN_TEXT}
          placeholder="Describe the site: water colour, machinery, clearing, people present, anything that explains the change."
          className="mt-1.5 min-h-28 text-sm md:text-xs"
        />
        <p className="text-muted-foreground mt-1 text-[11px]">
          Describe what you observed, not who is responsible.
        </p>
      </div>

      <fieldset>
        <legend className="text-xs font-medium">What was present (optional)</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(Object.keys(ACTIVITY) as Activity[]).map((a) => {
            const on = activities.includes(a);
            return (
              <button
                key={a}
                type="button"
                aria-pressed={on}
                onClick={() => setActivities((xs) => (on ? xs.filter((x) => x !== a) : [...xs, a]))}
                className={cn(
                  "h-9 border px-3 text-xs outline-none focus-visible:ring-1",
                  on ? "bg-foreground text-background border-foreground" : "hover:bg-muted",
                )}
              >
                {ACTIVITY[a]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <section aria-labelledby="photos-label" className="space-y-2">
        <h2 id="photos-label" className="text-xs font-medium">
          Photos{" "}
          <span className="text-muted-foreground font-normal">
            ({photos.length}/{MAX_PHOTOS})
          </span>
        </h2>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {photos.map((p, i) => (
            <div key={p.id} className="relative aspect-square overflow-hidden border">
              {/* biome-ignore lint/performance/noImgElement: local object URL preview */}
              <img src={p.preview} alt={`Site view ${i + 1}`} className="size-full object-cover" />
              <button
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => removePhoto(p.id)}
                className="bg-background/90 absolute top-1 right-1 grid size-7 place-items-center border"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          {Array.from({ length: processing }, (_, i) => (
            <div key={`p${i}`} className="bg-muted grid aspect-square place-items-center border">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ))}
          {photos.length + processing < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="hover:bg-muted text-muted-foreground grid aspect-square place-items-center border border-dashed outline-none focus-visible:ring-1"
            >
              <span className="grid justify-items-center gap-1">
                <Camera className="size-5" />
                Add photo
              </span>
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={(e) => {
            void addPhotos(e.target.files);
            e.target.value = "";
          }}
        />
        {photoError && <p className="text-destructive">{photoError}</p>}
        <p className="text-muted-foreground text-[11px]">
          Photos are resized on this phone and sent when there's a connection.
        </p>
      </section>

      {tried && missing.length > 0 && (
        <p role="alert" className="text-destructive">
          Still needed: {missing.join(", ")}.
        </p>
      )}

      <div className="bg-background sticky bottom-0 -mx-4 flex gap-2 border-t px-4 py-3 sm:static sm:mx-0 sm:justify-end sm:border-0 sm:p-0">
        <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="lg" className="flex-1 sm:flex-none" disabled={saving}>
          Save report
        </Button>
      </div>
    </form>
  );
}
