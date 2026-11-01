import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

import { appName, appUrl, gitConfig } from "./shared";

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
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
      {appName}
      <span className="text-fd-muted-foreground font-normal">help</span>
    </span>
  );
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: <Logo />, url: "/" },
    links: [
      { text: "Open Ecolens", url: appUrl, external: true },
      { text: "How alerts are reviewed", url: `${appUrl}/how-alerts-work`, external: true },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
