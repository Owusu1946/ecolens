"use client";

import { HandleSSOCallback } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import { afterSignInPath, SIGN_IN, taskPath } from "@/lib/auth-redirect";

// Return leg of Microsoft/Google sign-in. Unknown accounts are not signed up:
// pilot access is by invitation, so they go back to sign-in with an explanation.
export default function SsoCallbackPage() {
  const router = useRouter();
  const go = (url: string) => {
    if (url.startsWith("http")) window.location.href = url;
    else router.replace(url as Route);
  };

  return (
    <div className="text-muted-foreground flex items-center gap-2 text-sm">
      <Loader2 className="size-4 animate-spin" />
      Finishing sign-in…
      <HandleSSOCallback
        navigateToApp={({ session, decorateUrl }) => {
          const dest = afterSignInPath(
            new URLSearchParams(window.location.search).get("redirect_url"),
          );
          go(decorateUrl(session.currentTask ? taskPath(session.currentTask.key, dest) : dest));
        }}
        navigateToSignIn={() => go(SIGN_IN)}
        navigateToSignUp={() => go(`${SIGN_IN}?error=no_account`)}
      />
    </div>
  );
}
