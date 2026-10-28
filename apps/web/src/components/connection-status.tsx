"use client";

import { cn } from "@ecolens/ui/lib/utils";

import { useOnline } from "@/hooks/use-network";

export function ConnectionStatus({ className }: { className?: string }) {
  const online = useOnline();

  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        online ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", online ? "bg-emerald-500" : "bg-amber-500")}
      />
      {online ? "Online" : "Offline"}
    </span>
  );
}
