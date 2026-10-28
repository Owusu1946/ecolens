"use client";

import { useSyncExternalStore } from "react";

// Connection awareness for the offline-first UI (docs/stack.md, "Offline-first").

type NetworkInformation = EventTarget & { saveData?: boolean; effectiveType?: string };
const connection = () =>
  typeof navigator === "undefined"
    ? undefined
    : (navigator as Navigator & { connection?: NetworkInformation }).connection;

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Whether the browser reports a network connection. Assumes online during SSR. */
export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeLite(onChange: () => void) {
  const motion = window.matchMedia(REDUCED_MOTION);
  motion.addEventListener("change", onChange);
  connection()?.addEventListener("change", onChange);
  return () => {
    motion.removeEventListener("change", onChange);
    connection()?.removeEventListener("change", onChange);
  };
}

function getLite() {
  const c = connection();
  return (
    window.matchMedia(REDUCED_MOTION).matches ||
    !!c?.saveData ||
    c?.effectiveType === "2g" ||
    c?.effectiveType === "slow-2g"
  );
}

/**
 * Low-bandwidth / reduced-motion mode: true when the user prefers reduced
 * motion, has Data Saver on, or is on a 2G-class connection. Screens use it to
 * drop autoplaying animation and heavy extras.
 */
export function useLiteMode() {
  return useSyncExternalStore(subscribeLite, getLite, () => false);
}
