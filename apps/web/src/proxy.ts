import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Everything except the sign-in flow, the offline page, the public "how alerts
// are reviewed" page and the service worker requires a signed-in member of an
// institution. Pending sessions (no institution chosen yet) count as signed
// out, so they are sent back through sign-in to finish the institution step.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/offline",
  "/how-alerts-work",
  "/serwist/(.*)",
]);

export default clerkMiddleware(
  async (auth, req) => {
    if (!isPublicRoute(req)) await auth.protect();
  },
  { signInUrl: "/sign-in" },
);

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
