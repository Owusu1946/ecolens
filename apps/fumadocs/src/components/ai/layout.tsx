"use client";
import { type DocsLayoutProps, DocsLayout as Layout } from "fumadocs-ui/layouts/docs";

import { AIChat, AIChatPanel, AIChatTrigger, useAIChat } from "./search";

// Ask AI is shown only when the site has an OpenRouter key.
export function DocsLayout({ aiEnabled, ...props }: DocsLayoutProps & { aiEnabled: boolean }) {
  if (!aiEnabled) return <Layout {...props} />;
  return (
    <AIChat>
      <ChatLayout {...props} />
      <AIChatTrigger />
    </AIChat>
  );
}

function ChatLayout(props: DocsLayoutProps) {
  const { open, setOpen } = useAIChat();

  return <Layout {...props} aiChat={{ open, onOpenChange: setOpen, panel: <AIChatPanel /> }} />;
}
