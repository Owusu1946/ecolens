import { WifiOff } from "lucide-react";
import type { Metadata } from "next";

import { Wordmark } from "@/components/auth/wordmark";

export const metadata: Metadata = { title: "Offline · Ecolens" };

// Served by the service worker when a page that was never opened on this
// device is requested without a connection. Precached at install.
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center px-4 py-10">
      <Wordmark />
      <WifiOff className="text-muted-foreground mt-10 size-5" />
      <h1 className="mt-3 text-xl font-medium tracking-tight">
        This page isn't on this device yet
      </h1>
      <p className="text-muted-foreground mt-2 text-sm text-pretty">
        You're offline, and this page hasn't been opened here before. Pages you've already visited
        work offline with the data last saved on this device.
      </p>
      {/* Plain anchors: a full navigation lets the service worker answer from its cache. */}
      <a
        href="/dashboard"
        className="bg-primary text-primary-foreground hover:bg-primary/80 mt-6 inline-flex h-10 items-center justify-center text-sm font-medium"
      >
        Go to your overview
      </a>
    </main>
  );
}
