import { DocsLayout } from "@/components/ai/layout";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

export default function Layout({ children }: LayoutProps<"/docs">) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      aiEnabled={!!process.env.OPENROUTER_API_KEY}
      {...baseOptions()}
    >
      {children}
    </DocsLayout>
  );
}
