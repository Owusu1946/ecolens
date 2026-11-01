import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  type InferToolOutput,
  stepCountIs,
  streamText,
  tool,
  toUIMessageStream,
} from "ai";
import { Document, type DocumentData } from "flexsearch";
import { z } from "zod";

import { source } from "@/lib/source";

import type { ChatUIMessage, SearchTool } from "../../../components/ai/search";

interface CustomDocument extends DocumentData {
  url: string;
  title: string;
  description: string;
  content: string;
}
const searchServer = createSearchServer();

async function createSearchServer() {
  const search = new Document<CustomDocument>({
    document: {
      id: "url",
      index: ["title", "description", "content"],
      store: true,
    },
  });

  const docs = await chunkedAll(
    source.getPages().map(async (page) => {
      if (!("getText" in page.data)) return null;

      return {
        title: page.data.title,
        description: page.data.description,
        url: page.url,
        content: await page.data.getText("processed"),
      } as CustomDocument;
    }),
  );

  for (const doc of docs) {
    if (doc) search.add(doc);
  }

  return search;
}

async function chunkedAll<O>(promises: Promise<O>[]): Promise<O[]> {
  const SIZE = 50;
  const out: O[] = [];
  for (let i = 0; i < promises.length; i += SIZE) {
    out.push(...(await Promise.all(promises.slice(i, i + SIZE))));
  }
  return out;
}

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Ask AI answers questions about using Ecolens from these docs only. It has
// no access to Ecolens data (alerts, locations, field reports, people), and
// its rules follow the brief's principles: an alert is never proof of
// wrongdoing, people decide, sensitive locations are protected.
const systemPrompt = [
  "You are the help assistant for Ecolens, an environmental intelligence platform used by Ghanaian institutions (EPA, Minerals Commission, Water Resources Commission, district assemblies) in the Western Region pilot.",
  "You answer questions about how to use Ecolens, using only these docs. Use the `search` tool before answering, and cite the pages you used as markdown links with their `url`.",
  'A user message may begin with [Client Context], the page they are reading. For questions about "this page", search its title.',
  "If the docs don't answer the question, say so plainly and suggest who to ask (their Ecolens administrator). Do not guess or invent features, buttons or steps.",
  "You have no access to Ecolens data. Never discuss, guess or speculate about specific alerts, sites, locations, operators, companies, people or cases. If asked, explain that you only help with how to use Ecolens.",
  "Never describe an alert, a confirmed alert or an incident as proof that any person or company did something wrong. An alert is a prompt for review; confirmation means a change was verified by people, not that anyone is responsible.",
  "Do not give legal, regulatory or enforcement rulings. Decisions belong to the responsible institution and its officers.",
  "If a user shares names, phone numbers, exact coordinates or other personal or sensitive details, do not repeat them, and remind them not to share such details here.",
  "Use plain, short English suitable for officials and field staff who are not technical. Prefer numbered steps for how-to answers.",
].join("\n");

export async function POST(req: Request, _ctx: RouteContext<"/api/chat">) {
  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json({ error: "Ask AI isn't set up on this site." }, { status: 503 });
  }
  const reqJson = await req.json();

  const result = streamText({
    model: openrouter.chat(process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-5.5"),
    stopWhen: stepCountIs(5),
    tools: {
      search: searchTool,
    },
    instructions: systemPrompt,
    messages: await convertToModelMessages<ChatUIMessage>(reqJson.messages ?? [], {
      convertDataPart(part) {
        if (part.type === "data-client")
          return {
            type: "text",
            text: `[Client Context: ${JSON.stringify(part.data)}]`,
          };
      },
    }),
    toolChoice: "auto",
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}

const searchTool = tool({
  description: "Search the docs content and return raw JSON results.",
  inputSchema: z.object({
    query: z.string(),
    limit: z.number().int().min(1).max(100).default(10),
  }),
  async execute({ query, limit }): Promise<InferToolOutput<SearchTool>> {
    const search = await searchServer;
    return await search.searchAsync(query, { limit, merge: true, enrich: true });
  },
}) satisfies SearchTool;
