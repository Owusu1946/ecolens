"use client";

import { useOrganizationList } from "@clerk/nextjs";
import { parseClerkRole, ROLE_LABELS } from "@ecolens/api/auth/roles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@ecolens/ui/components/dropdown-menu";
import { Skeleton } from "@ecolens/ui/components/skeleton";
import { cn } from "@ecolens/ui/lib/utils";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useOnline } from "@/hooks/use-network";
import { getQueryClient } from "@/utils/orpc";

import { useMe } from "./use-me";

// The institution a user acts for decides their role, dashboard and data.
// Switching needs a connection (Clerk issues a new session token).
export function InstitutionSwitcher({ className }: { className?: string }) {
  const me = useMe();
  const online = useOnline();
  const router = useRouter();
  const { isLoaded, userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: true },
  });
  const [switching, setSwitching] = useState(false);

  const memberships = userMemberships.data ?? [];
  const current = me.data;
  const canSwitch = online && isLoaded && memberships.length > 1;

  async function choose(orgId: string) {
    if (orgId === current?.orgId) return;
    setSwitching(true);
    try {
      await setActive?.({ organization: orgId });
      // Everything cached belongs to the previous institution's view.
      await getQueryClient().resetQueries();
      router.replace("/dashboard");
    } finally {
      setSwitching(false);
    }
  }

  const body = current ? (
    <span className="min-w-0 flex-1 text-left">
      <span className="block truncate text-xs font-medium">
        {current.institution?.name ?? "Unknown institution"}
      </span>
      <span className="text-muted-foreground block truncate text-[11px]">{current.roleLabel}</span>
    </span>
  ) : (
    <span className="flex-1 space-y-1">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-2.5 w-20" />
    </span>
  );

  if (!canSwitch) {
    return (
      <div className={cn("flex items-center gap-2 px-2 py-1.5", className)}>
        <Building2 className="text-muted-foreground size-4 shrink-0" />
        {body}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={switching}
        className={cn(
          "hover:bg-muted flex w-full items-center gap-2 px-2 py-1.5 outline-none focus-visible:ring-1 disabled:opacity-60",
          className,
        )}
      >
        <Building2 className="text-muted-foreground size-4 shrink-0" />
        {body}
        <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Act for</DropdownMenuLabel>
          {memberships.map((m) => {
            const role = parseClerkRole(m.role);
            return (
              <DropdownMenuItem key={m.id} onClick={() => void choose(m.organization.id)}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{m.organization.name}</span>
                  <span className="text-muted-foreground block text-[11px]">
                    {role ? ROLE_LABELS[role] : "No Ecolens role"}
                  </span>
                </span>
                {m.organization.id === current?.orgId && <Check className="size-3.5" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
