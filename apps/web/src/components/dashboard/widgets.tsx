"use client";

import { Skeleton } from "@ecolens/ui/components/skeleton";
import { cn } from "@ecolens/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

// Building blocks for the role dashboards. Numbers are text first; bars are
// one hue and always labelled, so nothing depends on colour alone.

export function Panel({
  title,
  description,
  href,
  linkLabel,
  className,
  children,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col border", className)}>
      <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{title}</h2>
          {description && (
            <p className="text-muted-foreground mt-0.5 text-xs text-pretty">{description}</p>
          )}
        </div>
        {href && (
          <Link
            href={href as Route}
            className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 text-xs"
          >
            {linkLabel ?? "Open"} <ArrowRight className="size-3" />
          </Link>
        )}
      </header>
      <div className="flex-1 p-4">{children}</div>
    </section>
  );
}

export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
    </div>
  );
}

export function PanelEmpty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground text-xs text-pretty">{children}</p>;
}

/** A headline number with what it measures and its base. */
export function Stat({
  label,
  value,
  detail,
  href,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  href?: string;
  tone?: "attention";
}) {
  const body = (
    <>
      <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-medium tabular-nums",
          tone === "attention" && "text-amber-700 dark:text-amber-300",
        )}
      >
        {value}
      </p>
      {detail && <p className="text-muted-foreground mt-0.5 text-xs text-pretty">{detail}</p>}
    </>
  );
  return href ? (
    <Link
      href={href as Route}
      className="hover:bg-muted/50 block border p-3 outline-none focus-visible:ring-1"
    >
      {body}
    </Link>
  ) : (
    <div className="border p-3">{body}</div>
  );
}

/** Labelled horizontal bars of one measure, longest first as given. */
export function BarList({
  items,
  format = (n) => String(n),
}: {
  items: { label: React.ReactNode; value: number; href?: string; dot?: string; title?: string }[];
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-1.5 text-xs">
      {items.map((item, n) => {
        const row = (
          <>
            <span className="flex min-w-0 items-center gap-1.5">
              {item.dot && (
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.dot }}
                />
              )}
              <span className="truncate">{item.label}</span>
            </span>
            <span className="bg-muted relative h-2 overflow-hidden" aria-hidden>
              <span
                className="bg-foreground/70 absolute inset-y-0 left-0 rounded-r-[2px]"
                style={{ width: `${(item.value / max) * 100}%` }}
              />
            </span>
            <span className="text-right tabular-nums">{format(item.value)}</span>
          </>
        );
        const cls =
          "grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-3 py-0.5 sm:grid-cols-[minmax(0,12rem)_1fr_3rem]";
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: labels may repeat
          <li key={n} title={item.title}>
            {item.href ? (
              <Link href={item.href as Route} className={cn(cls, "hover:bg-muted/50 -mx-1 px-1")}>
                {row}
              </Link>
            ) : (
              <div className={cls}>{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Parts of a whole as one segmented bar with a labelled legend. */
export function PartsBar({
  parts,
  label,
}: {
  parts: { label: string; value: number; color: string }[];
  label: string;
}) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  return (
    <div className="space-y-2 text-xs">
      <div role="img" aria-label={label} className="flex h-2.5 gap-[2px] overflow-hidden">
        {total === 0 ? (
          <span className="bg-muted flex-1" />
        ) : (
          parts
            .filter((p) => p.value > 0)
            .map((p) => (
              <span
                key={p.label}
                title={`${p.label}: ${p.value}`}
                style={{ flexGrow: p.value, backgroundColor: p.color }}
              />
            ))
        )}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {parts.map((p) => (
          <li key={p.label} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span className="text-muted-foreground">{p.label}</span>
            <span className="tabular-nums">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const hours = (h: number | null) =>
  h === null ? "—" : h < 48 ? `${Math.max(0, Math.round(h))} h` : `${Math.round(h / 24)} d`;
export const percent = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);
