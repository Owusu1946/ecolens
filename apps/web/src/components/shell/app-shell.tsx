"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ecolens/ui/components/dropdown-menu";
import { Skeleton } from "@ecolens/ui/components/skeleton";
import { cn } from "@ecolens/ui/lib/utils";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Wordmark } from "@/components/auth/wordmark";
import { type NavItem, navFor } from "@/lib/navigation";

import { InstitutionSwitcher } from "./institution-switcher";
import { OfflineData } from "./offline-data";
import { SyncStatus } from "./sync-status";
import { useMe } from "./use-me";
import { UserMenu } from "./user-menu";

const TAB_LIMIT = 5;

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <OfflineData>
      <Shell>{children}</Shell>
    </OfflineData>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const pathname = usePathname();
  const items = me.data ? navFor(me.data.permissions) : null;
  const isActive = (item: NavItem) =>
    pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <div className="grid h-svh grid-cols-[minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border hidden min-h-0 flex-col border-r lg:flex">
        <div className="flex h-14 items-center px-4">
          <Link href="/dashboard" className="outline-none focus-visible:ring-1">
            <Wordmark />
          </Link>
        </div>
        <InstitutionSwitcher className="mx-2" />
        <nav aria-label="Main" className="mt-4 flex-1 space-y-px overflow-y-auto px-2">
          {items
            ? items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(item) ? "page" : undefined}
                  className={cn(
                    "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-8 items-center gap-2.5 px-2 text-xs outline-none focus-visible:ring-1",
                    isActive(item) &&
                      "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.stage && (
                    <span className="text-muted-foreground/70 text-[10px] font-normal">
                      {item.stage}
                    </span>
                  )}
                </Link>
              ))
            : Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="my-1 h-6" />)}
        </nav>
        <p className="text-muted-foreground border-sidebar-border border-t p-4 text-[11px] leading-relaxed">
          Prototype. Simulated data is labelled wherever it appears.
        </p>
      </aside>

      <div className="flex min-h-0 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <Link href="/dashboard" className="outline-none focus-visible:ring-1 lg:hidden">
            <Wordmark />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <SyncStatus />
            <UserMenu />
          </div>
        </header>
        <InstitutionSwitcher className="border-b lg:hidden" />
        <main className="min-h-0 flex-1 overflow-y-auto pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          {children}
        </main>
      </div>

      {items && <TabBar items={items} isActive={isActive} />}
    </div>
  );
}

// Phone navigation: the first few sections as tabs, the rest under "More".
function TabBar({ items, isActive }: { items: NavItem[]; isActive: (i: NavItem) => boolean }) {
  const router = useRouter();
  const overflow = items.length > TAB_LIMIT;
  const tabs = overflow ? items.slice(0, TAB_LIMIT - 1) : items;
  const more = overflow ? items.slice(TAB_LIMIT - 1) : [];

  const tabClass = (active: boolean) =>
    cn(
      "focus-visible:bg-muted flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] outline-none",
      active ? "text-foreground font-medium" : "text-muted-foreground",
    );

  return (
    <nav
      aria-label="Main"
      className="bg-background fixed inset-x-0 bottom-0 z-20 flex h-[calc(3.5rem+env(safe-area-inset-bottom))] border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {tabs.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(item) ? "page" : undefined}
          className={tabClass(isActive(item))}
        >
          <item.icon className="size-5" />
          {item.short}
        </Link>
      ))}
      {more.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger className={tabClass(more.some(isActive))}>
            <MoreHorizontal className="size-5" />
            More
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-48">
            {more.map((item) => (
              <DropdownMenuItem key={item.href} onClick={() => router.push(item.href)}>
                <item.icon /> {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  );
}
