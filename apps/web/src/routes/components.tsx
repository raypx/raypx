import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@raypx/ui/components/button";
import { UIShowcase } from "../components/ui-showcase";
import { ThemeSelect } from "../components/theme";

export const Route = createFileRoute("/components")({ component: ComponentsPage });

function ComponentsPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Button variant="link" className="h-auto p-0" asChild>
            <Link to="/">Back to Home</Link>
          </Button>
          <h1 className="text-3xl font-semibold tracking-tight">UI components</h1>
        </div>
        <ThemeSelect />
      </header>
      <UIShowcase />
    </main>
  );
}
