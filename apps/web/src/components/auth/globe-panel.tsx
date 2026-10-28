"use client";

import dynamic from "next/dynamic";

import { useLiteMode } from "@/hooks/use-network";

import { Wordmark } from "./wordmark";

// Loaded after the form so sign-in is interactive first on slow devices.
const Globe = dynamic(() => import("./globe"), { ssr: false, loading: () => null });

const STAGES = ["Observe", "Analyse", "Interpret", "Validate", "Escalate", "Report"] as const;

export function GlobePanel() {
  const lite = useLiteMode();

  return (
    <section
      aria-label="Ecolens pilot area"
      className="relative isolate flex min-h-0 flex-col overflow-hidden bg-[#08120f] text-emerald-50"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_55%_at_50%_50%,rgba(16,185,129,0.12),transparent_70%)]"
      />
      <Globe lite={lite} className="absolute inset-0" />
      {/* Keeps the caption legible over the dots. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-[#08120f] via-[#08120f]/75 to-transparent"
      />

      <header className="pointer-events-none relative flex items-center justify-between p-6 lg:p-8">
        <Wordmark className="text-emerald-50" />
        <span className="border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-emerald-50/70 backdrop-blur-sm">
          Western Region pilot
        </span>
      </header>

      <div className="pointer-events-none relative mt-auto max-w-xl p-6 pr-20 lg:p-8 lg:pr-24">
        <h2 className="text-xl font-medium tracking-tight text-balance lg:text-2xl">
          From environmental change to a trusted, usable alert.
        </h2>
        <p className="mt-2 hidden text-sm text-pretty text-emerald-50/65 sm:block">
          Satellite, sensor, agency and field evidence for the Pra and Ankobra basins, on one shared
          map, reviewed by people before anything is escalated.
        </p>
        <ol className="mt-5 hidden flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-emerald-50/55 sm:flex">
          {STAGES.map((stage, i) => (
            <li key={stage} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden>→</span>}
              {stage}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[11px] text-emerald-50/40">
          Basin outlines approximate. No monitoring or alert data is shown before sign-in.
        </p>
      </div>
    </section>
  );
}
