"use client";

import { ChevronDown } from "lucide-react";

// Fictional demo people seeded by `pnpm db:seed` (see README). Shown only on
// Clerk development instances, where the test code 424242 signs them in.
const DEMO_ACCOUNTS = [
  { label: "Platform admin", detail: "Ecolens Platform Team", email: "ecolens.admin" },
  { label: "Leadership", detail: "Pilot Steering Group", email: "ecolens.leadership" },
  { label: "Regulator", detail: "EPA Western Region", email: "ecolens.epa.regulator" },
  { label: "Analyst / Reviewer", detail: "EPA Western Region", email: "ecolens.epa.analyst" },
  { label: "Field officer", detail: "EPA Western Region", email: "ecolens.epa.field" },
  { label: "Data steward", detail: "EPA Western Region", email: "ecolens.epa.steward" },
  { label: "Regulator", detail: "Minerals Commission", email: "ecolens.mincom.regulator" },
  { label: "Regulator", detail: "Water Resources Commission", email: "ecolens.wrc.regulator" },
  { label: "Responder", detail: "Prestea-Huni Valley MA", email: "ecolens.phvma.responder" },
  { label: "Responder", detail: "Tarkwa-Nsuaem MA", email: "ecolens.tnma.responder" },
  {
    label: "Viewer",
    detail: "Western Regional Coordinating Council",
    email: "ecolens.wrcc.viewer",
  },
  {
    label: "Independent evaluator",
    detail: "Independent Evaluation Team",
    email: "ecolens.evaluator",
  },
].map((a) => ({ ...a, email: `${a.email}+clerk_test@example.com` }));

export const isDevelopmentInstance =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") ?? false;

// Clerk test mode: on development instances, addresses containing
// "+clerk_test" receive no email and always verify with this code.
export const TEST_CODE = "424242";

export function isTestEmail(email: string) {
  return isDevelopmentInstance && email.includes("+clerk_test");
}

export function DemoAccounts({ onPick }: { onPick: (email: string) => void }) {
  if (!isDevelopmentInstance) return null;

  return (
    <details className="group border-border mt-8 border border-dashed">
      <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs">
        Demo accounts (development)
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-border border-t px-3 pt-2 pb-3">
        <p className="text-muted-foreground mb-2 text-[11px]">
          Fictional people. Pick one, then enter the test code{" "}
          <span className="text-foreground font-mono">{TEST_CODE}</span>.
        </p>
        <ul className="-mx-1 max-h-56 overflow-y-auto">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email}>
              <button
                type="button"
                onClick={() => onPick(account.email)}
                className="hover:bg-muted focus-visible:bg-muted flex w-full items-baseline justify-between gap-3 px-1 py-1.5 text-left text-xs outline-none"
              >
                <span className="font-medium">{account.label}</span>
                <span className="text-muted-foreground truncate text-[11px]">{account.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
