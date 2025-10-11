import { createFileRoute } from "@tanstack/react-router";

function ConsolePage() {
  return <div>Hello "/console"!</div>;
}

export const Route = createFileRoute("/console/")({
  component: ConsolePage,
});
