import { GlobePanel } from "@/components/auth/globe-panel";
import { Wordmark } from "@/components/auth/wordmark";
import { ConnectionStatus } from "@/components/connection-status";

// Split screen: the flow on the left, the pilot-area globe on the right.
// On phones the globe becomes a short band above the form.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh grid-cols-[minmax(0,1fr)] grid-rows-[minmax(14rem,34svh)_1fr] lg:h-svh lg:grid-cols-[minmax(26rem,1fr)_minmax(0,1.25fr)] lg:grid-rows-1">
      <main className="order-2 flex flex-col px-4 py-6 sm:px-8 lg:order-1 lg:overflow-y-auto lg:px-12 lg:py-8">
        <div className="flex items-center justify-between">
          <Wordmark className="invisible lg:visible" />
          <ConnectionStatus />
        </div>
        <div className="flex flex-1 items-center py-10">
          <div className="mx-auto w-full max-w-sm">{children}</div>
        </div>
        <footer className="text-muted-foreground mx-auto w-full max-w-sm text-[11px] leading-relaxed">
          Ecolens prototype. Access is limited to pilot partner institutions; data is labelled where
          it is simulated.
        </footer>
      </main>
      <div className="order-1 grid lg:order-2">
        <GlobePanel />
      </div>
    </div>
  );
}
