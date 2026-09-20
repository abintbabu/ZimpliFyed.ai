import { breadcrumbLd, jsonLd, toolLd } from "@/lib/site";

/** WebApplication + BreadcrumbList JSON-LD for a free tool page under /tools. */
export function ToolSchema({ name, path, description }: { name: string; path: string; description: string }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={jsonLd([
        toolLd({ name, path, description }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Free tools", path: "/tools" },
          { name, path },
        ]),
      ])}
    />
  );
}
