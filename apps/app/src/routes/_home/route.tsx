import { createFileRoute } from "@tanstack/react-router";
import { siteConfig } from "~/config/site";

export const Route = createFileRoute("/_home")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: siteConfig.title },
      { name: "description", content: siteConfig.description },
      { property: "og:title", content: siteConfig.title },
      { property: "og:description", content: siteConfig.description },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: siteConfig.title },
      { name: "twitter:description", content: siteConfig.description },
    ],
  }),
});

function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">Welcome</h1>
      <p className="mt-4 text-muted-foreground">
        Start building your application here.
      </p>
    </div>
  );
}
