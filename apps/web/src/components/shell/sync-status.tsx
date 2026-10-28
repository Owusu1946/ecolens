"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ecolens/ui/components/dropdown-menu";
import { cn } from "@ecolens/ui/lib/utils";
import { CloudOff, Loader2, RotateCw, Trash2 } from "lucide-react";

import { useOnline } from "@/hooks/use-network";
import { type OutboxItem, outbox, useOutbox } from "@/lib/offline/outbox";

import { useDataUser } from "./offline-data";

// Always-visible connection and sync state (brief principle 7): online or
// offline, how many changes are waiting, and anything the server rejected.

const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

export function SyncStatus({ className }: { className?: string }) {
  const online = useOnline();
  const items = useOutbox(useDataUser());
  const failed = items.filter((i) => i.status === "failed").length;
  const syncing = items.some((i) => i.status === "syncing");
  const waiting = items.length - failed;

  const tone = !online ? "offline" : failed ? "failed" : "ok";
  const label = !online
    ? waiting
      ? `Offline · ${waiting} to sync`
      : "Offline"
    : failed
      ? `${failed} couldn't sync`
      : syncing
        ? `Syncing ${waiting}…`
        : waiting
          ? `${waiting} to sync`
          : "Online";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Connection and sync: ${label}`}
        className={cn(
          "hover:bg-muted inline-flex h-7 items-center gap-1.5 border px-2 text-xs outline-none focus-visible:ring-1",
          tone === "offline" && "border-amber-500/40 text-amber-800 dark:text-amber-200",
          tone === "failed" && "border-destructive/40 text-destructive",
          tone === "ok" && "text-muted-foreground border-transparent",
          className,
        )}
      >
        {syncing && online ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              tone === "offline"
                ? "bg-amber-500"
                : tone === "failed"
                  ? "bg-destructive"
                  : "bg-emerald-500",
            )}
          />
        )}
        <span className="whitespace-nowrap">{label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{online ? "Connected" : "Working offline"}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <p className="text-muted-foreground px-2 pb-2 text-xs leading-relaxed">
          {online
            ? items.length
              ? "Changes saved on this device are sent in the order you made them."
              : "Everything you've done is synced."
            : "You can keep working. Screens show the data last saved on this device, and your changes are sent when you're back online."}
        </p>
        {items.length > 0 && <DropdownMenuSeparator />}
        {items.map((item) => (
          <OutboxRow key={item.id} item={item} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OutboxRow({ item }: { item: OutboxItem }) {
  return (
    <DropdownMenuGroup>
      <div className="px-2 py-1.5 text-xs">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">{item.label}</span>
          <span className="text-muted-foreground shrink-0">{time.format(item.createdAt)}</span>
        </div>
        <div
          className={cn(
            "mt-0.5",
            item.status === "failed" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {item.status === "failed" ? (
            (item.error ?? "Rejected by the server.")
          ) : item.status === "syncing" ? (
            "Sending…"
          ) : (
            <span className="inline-flex items-center gap-1">
              <CloudOff className="size-3" /> Saved on this device
            </span>
          )}
        </div>
      </div>
      {item.status === "failed" && (
        <>
          <DropdownMenuItem closeOnClick={false} onClick={() => void outbox.retry(item.id)}>
            <RotateCw /> Try again
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            closeOnClick={false}
            onClick={() => void outbox.discard(item.id)}
          >
            <Trash2 /> Discard this change
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuGroup>
  );
}
