import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: RouteComponent,
  beforeLoad: async () => {
    throw redirect({ to: "/docs" });
  },
});

function RouteComponent() {
  return <div>Hello "/"!</div>;
}
