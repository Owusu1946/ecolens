import { cn } from "@ecolens/ui/lib/utils";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-sm font-semibold tracking-tight",
        className,
      )}
    >
      <svg aria-hidden viewBox="0 0 20 20" className="size-5">
        <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeOpacity=".5" />
        <ellipse
          cx="10"
          cy="10"
          rx="3.6"
          ry="8.5"
          fill="none"
          stroke="currentColor"
          strokeOpacity=".5"
        />
        <circle cx="12.6" cy="11.4" r="2.2" fill="#f59e0b" />
      </svg>
      Ecolens
    </span>
  );
}
