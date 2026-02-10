import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_home")({
  component: HomePage,
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
