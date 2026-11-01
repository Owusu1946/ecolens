import { createGetUrl } from "fumadocs-core/source";

export const appName = "Ecolens";
// The Ecolens app, for "open this screen" links from the guides.
export const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://ecolensgh.vercel.app").replace(
  /\/$/,
  "",
);
export const docsRoute = "/docs";
export const docsImageRoute = "/og/docs";
export const docsContentRoute = "/llms.mdx/docs";

export const gitConfig = {
  user: "Owusu1946",
  repo: "ecolens",
  branch: "main",
};

const getContentUrl = createGetUrl(docsContentRoute);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, "content.md"];

  return { segments, url: getContentUrl(segments, page.locale) };
}

const getImageUrl = createGetUrl(docsImageRoute);

export function getPageImageUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, "image.png"];

  return { segments, url: getImageUrl(segments, page.locale) };
}
