"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type InferUITool, type Tool, type UIMessage } from "ai";
import type { ReactNode } from "react";

import { type AIChatClientData, AIChatProvider, AIChatSearch } from "./chat";

export { AIChatPanel, AIChatTrigger, useAIChat } from "./chat";

export type SearchTool = Tool<
  { query: string; limit: number },
  { doc?: { url: string; title: string } | null }[]
>;

export type ChatUIMessage = UIMessage<
  never,
  { client: AIChatClientData },
  { search: InferUITool<SearchTool> }
>;

const SUGGESTIONS = [
  "How do I record a decision on an alert?",
  "How do I file a field report without signal?",
  "What does “couldn't sync” mean?",
  "What is the difference between an alert and an incident?",
];

export function AIChat({ children }: { children: ReactNode }) {
  const chat = useChat<ChatUIMessage>({
    id: "search",
    throttle: 40,
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  });

  return (
    <AIChatProvider
      chat={chat}
      renderPart={renderPart}
      suggestions={SUGGESTIONS}
      description="Answers come from these help pages, and AI can make mistakes. Don't type names, phone numbers or locations: questions are processed by an external AI service."
    >
      {children}
    </AIChatProvider>
  );
}

function renderPart(part: ChatUIMessage["parts"][number], live: boolean) {
  if (part.type === "tool-search") return <AIChatSearch part={part} live={live} />;
}
