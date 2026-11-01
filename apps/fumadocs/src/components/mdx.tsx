import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Callout } from "fumadocs-ui/components/callout";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { ArrowUpRight, CloudOff, ShieldCheck } from "lucide-react";
import type { MDXComponents } from "mdx/types";
import type { ReactNode } from "react";

import { appUrl } from "@/lib/shared";

// Where a task sits in the operating model, who can do it, and whether it
// works without a connection.
function Task({
  stage,
  roles,
  offline,
  time,
}: {
  stage: string;
  roles: string;
  offline?: boolean;
  time?: string;
}) {
  const chip = "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs";
  return (
    <div className="not-prose mb-6 flex flex-wrap items-center gap-1.5">
      <span className={`${chip} font-medium tracking-wide uppercase`}>{stage}</span>
      <span className={chip}>{roles}</span>
      {offline && (
        <span className={chip}>
          <CloudOff className="size-3" /> Works offline
        </span>
      )}
      {time && <span className={`${chip} text-fd-muted-foreground`}>{time}</span>}
    </div>
  );
}

// One of the non-negotiable principles, where it applies to a task.
function Principle({ children }: { children: ReactNode }) {
  return (
    <Callout type="warn" icon={<ShieldCheck className="size-4" />} title="Principle">
      {children}
    </Callout>
  );
}

// A link to a screen in the Ecolens app.
function AppLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a
      href={`${appUrl}${to}`}
      target="_blank"
      rel="noreferrer"
      className="not-prose bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/90 my-4 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
    >
      {children} <ArrowUpRight className="size-3.5" />
    </a>
  );
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Accordion,
    Accordions,
    Step,
    Steps,
    Tab,
    Tabs,
    Task,
    Principle,
    AppLink,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
