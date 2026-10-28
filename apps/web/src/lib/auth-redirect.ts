export const AFTER_SIGN_IN = "/dashboard";
export const SIGN_IN = "/sign-in";

/**
 * Where to go after signing in. Clerk passes the page a user was bounced from
 * as `redirect_url`; only same-origin destinations are honoured, so the sign-in
 * page cannot be used as an open redirect.
 */
export function afterSignInPath(redirectUrl: string | null | undefined): string {
  if (!redirectUrl) return AFTER_SIGN_IN;
  try {
    const url = new URL(redirectUrl, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname.startsWith(SIGN_IN)) {
      return AFTER_SIGN_IN;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return AFTER_SIGN_IN;
  }
}

/** Route for a pending session task, carrying the final destination along. */
export function taskPath(task: string, destination: string) {
  return `${SIGN_IN}/tasks/${task}?redirect_url=${encodeURIComponent(destination)}`;
}
