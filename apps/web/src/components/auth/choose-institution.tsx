"use client";

import { useAuth, useClerk, useOrganizationList } from "@clerk/nextjs";
import { parseClerkRole, ROLE_LABELS } from "@ecolens/api/auth/roles";
import { Button } from "@ecolens/ui/components/button";
import { Skeleton } from "@ecolens/ui/components/skeleton";
import { ArrowRight, Building2, Loader2 } from "lucide-react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { afterSignInPath, SIGN_IN, taskPath } from "@/lib/auth-redirect";

// Clerk's "choose-organization" session task. An organization is an
// institution, and the membership's role decides the user's dashboard, so a
// session is only usable once one is active. Users cannot create institutions
// here: memberships are granted by an administrator (brief principle 6).

export function ChooseInstitution() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { isLoaded, userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: true },
  });
  const clerk = useClerk();
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const autoPicked = useRef(false);

  const memberships = userMemberships.data ?? [];

  async function choose(orgId: string) {
    setPending(orgId);
    setFailed(false);
    try {
      await setActive?.({
        organization: orgId,
        navigate: ({ session, decorateUrl }) => {
          const dest = afterSignInPath(params.get("redirect_url"));
          const url = decorateUrl(
            session.currentTask ? taskPath(session.currentTask.key, dest) : dest,
          );
          if (url.startsWith("http")) window.location.href = url;
          else router.replace(url as Route);
        },
      });
    } catch {
      setPending(null);
      setFailed(true);
    }
  }

  useEffect(() => {
    if (authLoaded && !isSignedIn) router.replace(SIGN_IN as Route);
  }, [authLoaded, isSignedIn, router]);

  // One institution: nothing to choose, carry straight on.
  useEffect(() => {
    if (!isLoaded || userMemberships.isLoading || userMemberships.hasNextPage) return;
    const only = memberships.length === 1 ? memberships[0] : undefined;
    if (only && !autoPicked.current) {
      autoPicked.current = true;
      void choose(only.organization.id);
    }
  });

  const loading = !isLoaded || userMemberships.isLoading;
  const single = memberships.length === 1 && !userMemberships.hasNextPage;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
      <div className="mb-8">
        <h1 className="text-2xl font-medium tracking-tight">
          {single ? "Opening your workspace" : "Choose your institution"}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm text-pretty">
          {single
            ? "Your dashboard is set by your institution and role."
            : "You belong to more than one institution. Your dashboard and permissions follow the one you choose; you can switch later."}
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : memberships.length === 0 ? (
        <div className="border-border border border-dashed p-4 text-sm">
          <p className="font-medium">Your account isn't linked to an institution yet</p>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            Ecolens access is granted per institution. Ask your institution's Ecolens administrator
            to add you, then sign in again.
          </p>
        </div>
      ) : (
        <ul className="divide-border border-border divide-y border">
          {memberships.map((m) => {
            const role = parseClerkRole(m.role);
            const busy = pending === m.organization.id;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => void choose(m.organization.id)}
                  className="hover:bg-muted focus-visible:bg-muted group flex w-full items-center gap-3 px-4 py-3 text-left outline-none disabled:cursor-default disabled:opacity-60 data-[busy=true]:opacity-100"
                  data-busy={busy}
                >
                  <Building2 className="text-muted-foreground size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {m.organization.name}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {role ? ROLE_LABELS[role] : "No Ecolens role assigned"}
                    </span>
                  </span>
                  {busy ? (
                    <Loader2 className="text-muted-foreground size-4 animate-spin" />
                  ) : (
                    <ArrowRight className="text-muted-foreground size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {userMemberships.hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => userMemberships.fetchNext?.()}
        >
          Show more
        </Button>
      )}
      {failed && (
        <p role="alert" className="text-destructive mt-4 text-xs">
          Couldn't open that institution. Check your connection and try again.
        </p>
      )}

      <button
        type="button"
        onClick={() => void clerk.signOut({ redirectUrl: SIGN_IN })}
        className="text-muted-foreground hover:text-foreground mt-8 text-xs"
      >
        Sign out
      </button>
    </div>
  );
}
