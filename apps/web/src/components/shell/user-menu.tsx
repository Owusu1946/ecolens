"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ecolens/ui/components/dropdown-menu";
import { cn } from "@ecolens/ui/lib/utils";
import { LogOut } from "lucide-react";
import { useTheme } from "next-themes";

import { useOnline } from "@/hooks/use-network";
import { SIGN_IN } from "@/lib/auth-redirect";
import { outbox, useOutbox } from "@/lib/offline/outbox";
import { deleteSavedQueries } from "@/lib/offline/query-cache";
import { getQueryClient } from "@/utils/orpc";

import { useDataUser } from "./offline-data";

export function UserMenu({ className }: { className?: string }) {
  const { user } = useUser();
  const clerk = useClerk();
  const { theme, setTheme } = useTheme();
  const online = useOnline();
  const userId = useDataUser();
  const unsynced = useOutbox(userId).length;

  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Signed in";
  const initials =
    [user?.firstName, user?.lastName]
      .filter(Boolean)
      .map((s) => s?.[0])
      .join("")
      .toUpperCase() || "·";

  // Signing out removes this user's saved data from the device (shared phones
  // and office PCs are common), including any changes still waiting to sync.
  async function signOut() {
    if (userId) {
      await outbox.discardUser(userId);
      await deleteSavedQueries();
    }
    getQueryClient().clear();
    await clerk.signOut({ redirectUrl: SIGN_IN });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account"
        className={cn(
          "bg-muted text-foreground hover:bg-muted/70 flex size-8 shrink-0 items-center justify-center text-xs font-medium outline-none focus-visible:ring-1",
          className,
        )}
      >
        {initials}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="text-foreground block truncate text-xs font-medium">{name}</span>
            {user?.primaryEmailAddress && user.fullName && (
              <span className="block truncate">{user.primaryEmailAddress.emailAddress}</span>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme ?? "system"}
            onValueChange={(v) => setTheme(String(v))}
          >
            <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {unsynced > 0 ? (
          <DropdownMenuGroup>
            <p className="text-muted-foreground px-2 py-1.5 text-xs leading-relaxed">
              {unsynced} {unsynced === 1 ? "change hasn't" : "changes haven't"} synced yet.
              {online
                ? " They'll be sent in a moment."
                : " Reconnect to send them before signing out."}
            </p>
            <DropdownMenuItem variant="destructive" onClick={() => void signOut()}>
              <LogOut /> Sign out and discard {unsynced === 1 ? "it" : "them"}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        ) : (
          <DropdownMenuItem disabled={!online} onClick={() => void signOut()}>
            <LogOut /> {online ? "Sign out" : "Sign out (needs a connection)"}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
