import { createFileRoute } from "@tanstack/react-router";
import { siteConfig } from "~/config/site";
import { generatePageHead } from "@raypx/seo";

export const Route = createFileRoute("/_home")({
  component: HomePage,
  head: () => generatePageHead(siteConfig),
});

function HomePage() {
  return (
    <main id="main-content" className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">Welcome</h1>
      <p className="mt-4 text-muted-foreground">
        Start building your application here.
      </p>
    </main>
  );
}
