import { Link } from "@tanstack/react-router";
import { useHealthCheck } from "@raypx/hooks/health";
import { Button, ConnectionStatus } from "@raypx/ui";
import { ThemeSelect } from "./components/theme";

export function App() {
  const { status, retry } = useHealthCheck();
  return (
    <main className="mx-auto max-w-3xl space-y-12 px-6 py-16 sm:py-24">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight">Raypx</h1>
          <p className="text-muted-foreground">Project ready, start building from here.</p>
        </div>
        <ThemeSelect />
      </header>
      <section aria-labelledby="connection-heading" className="space-y-4 border-t pt-8">
        <h2 id="connection-heading" className="text-xl font-semibold">
          Service Connection
        </h2>
        <ConnectionStatus status={status} />
        <Button disabled={status === "loading"} onClick={retry}>
          Retry Connection
        </Button>
      </section>
      <nav aria-label="Resources" className="border-t pt-8">
        <Button variant="outline" asChild>
          <Link to="/components">Explore components</Link>
        </Button>
      </nav>
    </main>
  );
}
