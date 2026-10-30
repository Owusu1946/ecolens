import type { Metadata } from "next";
import Link from "next/link";

import { Wordmark } from "@/components/auth/wordmark";

export const metadata: Metadata = {
  title: "How alerts are reviewed · Ecolens",
  description:
    "How Ecolens flags possible environmental changes, how people review them before anyone acts, and what is recorded.",
};

// Public explainer (brief section 11, "How alerts are reviewed"): the concept
// note asks that the review of alerts be documented, to address institutional
// and community mistrust. It describes the process only. It shows no
// monitoring sites, alerts, people or locations (principle 6), and it is
// static, so it opens offline once visited.

const STEPS = [
  {
    stage: "Observe",
    title: "Readings are gathered",
    body: "Ecolens brings together satellite imagery, river and air readings, records from partner institutions, and observations from field officers, all linked to a place and a time. Every reading keeps its source, the institution responsible for it, and its known limits.",
  },
  {
    stage: "Analyse",
    title: "Agreed rules look for unusual change",
    body: "Rules agreed with partner scientists compare new readings with what is normal for that place, for example a sharp rise in river turbidity or repeated heat detections near a river. Each rule is written down, versioned and reviewed. When a rule is met, Ecolens raises an alert with a confidence level: low, medium or high.",
  },
  {
    stage: "Interpret",
    title: "The evidence is laid out",
    body: "Each alert shows what was seen, where and when, the readings behind it, how confident the rule is, and what the data cannot tell. A satellite cannot tell a mining pit from a farm clearing, and haze or rain can affect river readings.",
  },
  {
    stage: "Validate",
    title: "A person decides",
    body: "A trained reviewer at a partner institution examines the evidence and, where needed, asks a field team to check on the ground. The reviewer records a decision (confirmed, rejected or unresolved), a confidence level and the reason. Nothing moves forward without this human decision.",
  },
  {
    stage: "Escalate",
    title: "Confirmed changes go to the responsible institution",
    body: "Only a confirmed alert can become an incident. It is routed to the institution responsible for that area or issue, which records what it did, including a decision not to act, and closes the case with a summary.",
  },
  {
    stage: "Report",
    title: "The record is filed",
    body: "A one-page report records the evidence, confidence, the decision, the responsible institution and the action taken, as they stood on the day. Filed reports are never changed afterwards.",
  },
];

const PRINCIPLES = [
  {
    title: "An alert is not an accusation",
    body: "An alert is a prompt to look more closely, never proof of wrongdoing. Even a confirmed change only means the change was verified, not that any person or company is responsible.",
  },
  {
    title: "People decide, not the software",
    body: "No alert becomes an incident, and no institution is asked to act, without a named reviewer's recorded decision.",
  },
  {
    title: "Every step is on the record",
    body: "Each decision, assignment and action is recorded with the role and institution of the person who made it, the time and the reason. The record can't be edited or deleted; corrections are added as new entries.",
  },
  {
    title: "Uncertainty is shown, not hidden",
    body: "Confidence is shown as low, medium or high, never as false precision. Every reading carries its source and its limits, and demonstration data is labelled as such.",
  },
  {
    title: "Sensitive places and people are protected",
    body: "Exact locations of field visits, communities and investigations are visible only to people whose role requires them. Access is by invitation from partner institutions, and each person sees only what their job needs.",
  },
  {
    title: "Institutions keep authority over their data",
    body: "Each dataset stays with the institution that produces it, and every screen and report says where the data came from.",
  },
];

export default function HowAlertsWorkPage() {
  return (
    <div className="bg-background min-h-svh">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Wordmark />
          <Link href="/sign-in" className="text-muted-foreground hover:text-foreground text-xs">
            Partner sign-in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
          Western Region pilot · Pra and Ankobra basins
        </p>
        <h1 className="mt-2 text-2xl font-medium tracking-tight text-balance sm:text-3xl">
          How Ecolens alerts are raised and reviewed
        </h1>
        <p className="text-muted-foreground mt-4 max-w-2xl text-base text-pretty">
          Ecolens is designed to help Ghana's environmental institutions notice unusual changes in
          rivers, forests and air sooner, check them carefully, and record what was done. It
          supports their scientific and regulatory judgement; it does not replace it.
        </p>

        <section aria-labelledby="steps" className="mt-12">
          <h2 id="steps" className="text-lg font-medium">
            From a reading to a filed record
          </h2>
          <ol className="mt-6 space-y-0 border-l">
            {STEPS.map((s, i) => (
              <li key={s.stage} className="relative pb-8 pl-6 last:pb-0">
                <span
                  aria-hidden
                  className="bg-background absolute top-0.5 -left-[9px] grid size-[17px] place-items-center border text-[10px] font-medium tabular-nums"
                >
                  {i + 1}
                </span>
                <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                  {s.stage}
                </p>
                <h3 className="mt-0.5 text-sm font-medium">{s.title}</h3>
                <p className="text-muted-foreground mt-1 text-sm text-pretty">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="principles" className="mt-14">
          <h2 id="principles" className="text-lg font-medium">
            The commitments behind it
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="border p-4">
                <h3 className="text-sm font-medium">{p.title}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm text-pretty">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="status" className="mt-14 border-t pt-8">
          <h2 id="status" className="text-lg font-medium">
            Where this stands
          </h2>
          <p className="text-muted-foreground mt-2 text-sm text-pretty">
            Ecolens is a prototype. The institutions proposed as pilot partners include the
            Environmental Protection Authority, the Minerals Commission, the Water Resources
            Commission and district assemblies in the Western Region. Much of the data in the
            prototype is prepared for demonstration and is labelled as such. Thresholds still need
            scientific validation with partners. Rules for publishing information and a channel for
            community feedback are being agreed with the pilot's steering group.
          </p>
        </section>
      </main>

      <footer className="border-t">
        <p className="text-muted-foreground mx-auto max-w-3xl px-4 py-6 text-[11px] sm:px-6">
          This page describes the review process only. It does not show monitoring sites, alerts or
          locations.
        </p>
      </footer>
    </div>
  );
}
